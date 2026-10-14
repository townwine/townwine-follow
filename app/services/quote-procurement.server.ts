import {prisma} from '../db.server';
import {deliverEmailMessage, getEmailDeliveryRuntimeStatus} from './email.server';
import {refreshingNotificationAdmin} from './notification-query.server';
import {isSoldOut, queryProcurement, refreshPaidQuantities, registeredTotal, type OrderLedger, type Registration, type StockProduct} from './quote-procurement-data.server';

export const PROCUREMENT_RECIPIENTS=['ted1990@gmail.com','info@town.wine'] as const;
// GB and HK stay disabled until their procurement workflow is opened.
export const PROCUREMENT_COUNTRIES:readonly string[]=['US'];
type Notice = {registration:Registration; paidQuantity:number; productUrl:string; detectedAt:string};
type State = OrderLedger & {notice?:Notice; sentTo?:string[]};
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function procurementEmail(notice:Notice){
  const r=notice.registration;
  const lines=[
    '공구 등록 수량이 품절되었습니다. 아래 와인 상품을 발주해 주세요.',
    '',
    '와인명: '+r.title,
    '와인 상품 URL: '+(r.sourceUrl||'미입력 - 발주 전 원본 판매처 확인 필요'),
    '발주 수량: '+r.quantity+'병',
    '등록 판매가 (병당): '+r.unitPrice+' '+r.currency,
    '판매 상품 금액 (등록 판매가 × 등록 병수): '+registeredTotal(r)+' '+r.currency,
    '확인된 결제 완료 수량: '+notice.paidQuantity+'병',
    '타운와인 상품: '+notice.productUrl,
    '품절 확인 시각: '+notice.detectedAt,
    '',
    '금액은 할인 후 실결제액이 아닌 등록 당시 판매가 기준입니다.',
    '발주 전 취소·환불 및 판매처 재고를 확인해 주세요. 이 메일은 발주 요청이며 자동 주문은 아닙니다.',
  ];
  return {subject:'[타운와인 발주 요청] '+r.title+' · '+r.quantity+'병 품절',text:lines.join('\n'),html:'<h2>와인 상품 발주 요청</h2>'+lines.map(line=>'<p>'+escapeHtml(line)+'</p>').join('')};
}

export async function processQuoteProcurement(id:string){
  const lease=new Date();
  const claim=await prisma.quoteDraftRequest.updateMany({where:{id,productId:{not:null},procurementSentAt:null,OR:[{procurementLeaseAt:null},{procurementLeaseAt:{lt:new Date(Date.now()-600000)}}]},data:{procurementLeaseAt:lease,procurementCheckedAt:lease}});
  if(!claim.count)return;
  try{
    const row=await prisma.quoteDraftRequest.findUniqueOrThrow({where:{id}});
    const country=JSON.parse(row.quoteJson).country;
    if(!PROCUREMENT_COUNTRIES.includes(country))return;
    let state:State=row.procurementState?JSON.parse(row.procurementState):{checkpoint:row.createdAt.toISOString(),orders:{}};
    const persist=async()=>{
      const saved=await prisma.quoteDraftRequest.updateMany({where:{id,procurementLeaseAt:lease},data:{procurementState:JSON.stringify(state),procurementError:null}});
      if(!saved.count)throw new Error('발주 알림 처리 잠금이 변경되었습니다');
    };
    if(!state.notice){
      const {unauthenticated}=await import('../shopify.server');
      const load=async()=>(await unauthenticated.admin(row.shop)).admin;
      const admin=refreshingNotificationAdmin(await load(),load);
      const data=await queryProcurement<{product:(StockProduct & {handle:string; request:{value:string}|null})|null;shop:{currencyCode:string}}>(admin,`query ProcurementProduct($id:ID!){
        shop{currencyCode} product(id:$id){title handle status request:metafield(namespace:"townwine",key:"registration_request"){value}
          variants(first:100){nodes{inventoryQuantity inventoryPolicy inventoryItem{tracked}} pageInfo{hasNextPage endCursor}}
        }
      }`,{id:row.productId});
      if(!data.product)return;
      let registration:Registration;
      if(row.procurementRegistration){registration=JSON.parse(row.procurementRegistration);}
      else{
        // Legacy drafts were priced by this same currency branch from the immutable quote.
        const sheet=JSON.parse(row.sheetPayload||'null');
        const request=JSON.parse(data.product.request?.value||'null');
        const quote=JSON.parse(row.quoteJson);
        const price=data.shop.currencyCode==='HKD'?quote.unitHkd:data.shop.currencyCode==='KRW'?quote.unitKrw:null;
        if(!price||!Number.isFinite(price))throw new Error('등록 판매가 복원 실패');
        registration={title:sheet?.title||data.product.title,sourceUrl:sheet?.sourceUrl||request?.sourceUrl||'',quantity:sheet?.input?.bottles||request?.quantity,unitPrice:Number(price).toFixed(2),currency:data.shop.currencyCode};
        registeredTotal(registration);
        await prisma.quoteDraftRequest.update({where:{id},data:{procurementRegistration:JSON.stringify(registration)}});
      }
      registeredTotal(registration);
      // Continue syncing while unsold, retaining paid counts beyond Shopify's 60-day order window.
      const ledger=await refreshPaidQuantities(admin,row.productId!,state);
      state={...state,...ledger};
      await persist();
      const paidQuantity=Object.values(state.orders).reduce((sum,n)=>sum+n,0);
      if(!isSoldOut(data.product)||paidQuantity<registration.quantity)return;
      if(Date.now()-row.createdAt.getTime()>59*86400000){
        throw new Error('장기 공구의 과거 주문 취소·환불 확인 필요. 자동 발주 알림 보류');
      }
      state.notice={registration,paidQuantity,productUrl:'https://'+row.shop+'/products/'+encodeURIComponent(data.product.handle),detectedAt:new Date().toISOString()};
      state.sentTo=[];
      await persist();
    }
    if(getEmailDeliveryRuntimeStatus().mode!=='live')throw new Error('메일 실발송 설정 확인 필요');
    const message=procurementEmail(state.notice);
    for(const to of PROCUREMENT_RECIPIENTS){
      if(state.sentTo?.some(sent=>sent.toLowerCase()===to.toLowerCase()))continue;
      await persist();
      // Keep the existing provider key across the address capitalization cleanup.
      const recipientKey=to==='info@town.wine'?'Info@town.wine':to;
      const result=await deliverEmailMessage({...message,to,idempotencyKey:'quote-procurement-'+id+'-'+recipientKey,logLabel:'Quote procurement email',logContext:{requestId:id}});
      if(result.mode==='log-only'||result.isTestOverride)throw new Error('실제 수신자 발송 미완료');
      state.sentTo=[...(state.sentTo||[]),to];
      await persist();
    }
    await prisma.quoteDraftRequest.updateMany({where:{id,procurementLeaseAt:lease},data:{procurementSentAt:new Date(),procurementError:null}});
  }catch(error){
    await prisma.quoteDraftRequest.updateMany({where:{id,procurementLeaseAt:lease},data:{procurementError:error instanceof Error?error.message:'발주 알림 확인 실패'}});
    throw error;
  }finally{
    await prisma.quoteDraftRequest.updateMany({where:{id,procurementLeaseAt:lease},data:{procurementLeaseAt:null}});
  }
}

let running=false;
export async function retryQuoteProcurement(){
  if(running)return;
  running=true;
  try{
    const rows=await prisma.quoteDraftRequest.findMany({where:{productId:{not:null},procurementSentAt:null,OR:[{procurementCheckedAt:null},{procurementCheckedAt:{lt:new Date(Date.now()-60000)}}]},orderBy:{procurementCheckedAt:'asc'},take:20});
    for(const row of rows){try{await processQuoteProcurement(row.id);}catch{console.error('[quote-procurement] pending retry',{requestId:row.id});}}
  }finally{running=false;}
}

export function startQuoteProcurementWorker(){
  const state=globalThis as typeof globalThis & {quoteProcurementTimer?:ReturnType<typeof setInterval>};
  if(state.quoteProcurementTimer)return;
  const run=()=>{void retryQuoteProcurement().catch(()=>console.error('[quote-procurement] worker failed'));};
  state.quoteProcurementTimer=setInterval(run,60000);state.quoteProcurementTimer.unref();run();
}
