import {createHmac} from 'node:crypto';
import {prisma} from '../db.server';
import type {QuoteInput, calculateDemandQuote} from './demand-quote';
import {findCollectorProfileByCustomerId} from './collector-profiles.server';
import {retryQuoteApprovals} from './quote-approval.server';

export type SheetPayload = {
  requestId:string; country:QuoteInput['country']; customerId:string;
  email:string; nickname:string; title:string; sourceUrl:string; createdAt:string;
  input:QuoteInput; quote:ReturnType<typeof calculateDemandQuote>;
};

export async function syncQuoteSheet(id:string) {
  const row=await prisma.quoteDraftRequest.findUnique({where:{id}});
  if(!row?.productId||!row.sheetPayload||row.sheetStatus==='SYNCED')return row?.sheetStatus||'PENDING';
  const endpoint=process.env.QUOTE_SHEET_WEBHOOK_URL,secret=process.env.QUOTE_SHEET_SECRET;
  if(!endpoint||!secret)return 'PENDING';
  try {
    const url=new URL(endpoint);
    if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!url.pathname.endsWith('/exec'))throw new Error('Invalid sheet endpoint');
    const payload=JSON.stringify({...JSON.parse(row.sheetPayload),productId:row.productId});
    const timestamp=String(Date.now());
    const signature=createHmac('sha256',secret).update(timestamp+'.'+payload).digest('hex');
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,timestamp,signature}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok||result.ok!==true||result.requestId!==id)throw new Error('Sheet write not acknowledged');
    await prisma.quoteDraftRequest.update({where:{id},data:{sheetStatus:'SYNCED',sheetError:null,sheetSyncedAt:new Date()}});
    return 'SYNCED';
  } catch {
    await prisma.quoteDraftRequest.update({where:{id},data:{sheetStatus:'PENDING',sheetError:'국가별 견적표 기록 실패. 자동 재시도 대기.'}});
    return 'PENDING';
  }
}

let running=false;
async function recoverQuoteSheetRequests() {
  const rows=await prisma.quoteDraftRequest.findMany({where:{OR:[{productId:{not:null},sheetPayload:null},{productId:null,sheetPayload:{not:null},updatedAt:{lt:new Date(Date.now()-300000)}}]},take:20,orderBy:{updatedAt:'asc'}});
  for(const row of rows){
    try{
      const {unauthenticated}=await import('../shopify.server');
      const {admin}=await unauthenticated.admin(row.shop);
      const response=await admin.graphql('query($handle:String!,$customer:ID!){productByHandle(handle:$handle){id title request:metafield(namespace:"townwine",key:"registration_request"){value}} customer(id:$customer){email}}',{variables:{handle:row.handle,customer:'gid://shopify/Customer/'+row.customerId}});
      const data=await response.json() as {errors?:unknown[];data?:{productByHandle?:{id:string;title:string;request?:{value:string}};customer?:{email:string}}};if(data.errors?.length)throw new Error('Recovery lookup failed');
      const product=data.data?.productByHandle;
      if(!product){await prisma.quoteDraftRequest.update({where:{id:row.id},data:{sheetError:'초안 상품 확인 대기'}});continue;}
      let payload=row.sheetPayload;
      if(!payload){
        const saved=JSON.parse(product.request?.value||'{}');
        if(!saved.country||!saved.quantity)throw new Error('Missing registration metadata');
        const collector=await findCollectorProfileByCustomerId(admin,row.customerId);
        // Older requests have no raw input snapshot. Preserve known values instead of inventing prices.
        payload=JSON.stringify({requestId:row.id,country:saved.country,customerId:row.customerId,email:data.data?.customer?.email||collector?.fields.customerEmail||'',nickname:collector?.fields.displayName||saved.collectorName||'',title:product.title,sourceUrl:saved.sourceUrl||'',createdAt:row.createdAt.toISOString(),input:{country:saved.country,bottles:saved.quantity},quote:JSON.parse(row.quoteJson)});
      }
      await prisma.quoteDraftRequest.update({where:{id:row.id},data:{productId:product.id,status:'CREATED',sheetPayload:payload,sheetError:null}});
    }catch{await prisma.quoteDraftRequest.update({where:{id:row.id},data:{sheetError:'기존 초안 기록 확인 실패. 자동 재시도 대기.'}});}
  }
}
export async function retryQuoteSheets() {
  if(running||!process.env.QUOTE_SHEET_WEBHOOK_URL||!process.env.QUOTE_SHEET_SECRET)return;
  running=true;
  try {
    await recoverQuoteSheetRequests();
    const rows=await prisma.quoteDraftRequest.findMany({where:{productId:{not:null},sheetPayload:{not:null},sheetStatus:{not:'SYNCED'}},take:20,orderBy:{updatedAt:'asc'}});
    for(const row of rows)await syncQuoteSheet(row.id);
  } finally {running=false;}
}

export function startQuoteSheetWorker() {
  const state=globalThis as typeof globalThis & {quoteSheetTimer?:ReturnType<typeof setInterval>};
  if(state.quoteSheetTimer)return;
  const run=()=>{void retryQuoteSheets().catch(()=>console.error('[quote-sheet] retry worker failed'));void retryQuoteApprovals().catch(()=>console.error('[quote-approval] retry worker failed'));};
  state.quoteSheetTimer=setInterval(run,60000);state.quoteSheetTimer.unref();run();
}
