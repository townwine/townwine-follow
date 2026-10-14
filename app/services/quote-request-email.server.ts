import {prisma} from '../db.server';
import {deliverEmailMessage,getEmailDeliveryRuntimeStatus} from './email.server';

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export async function notifyQuoteRequestRegistered(id:string){
 if(getEmailDeliveryRuntimeStatus().mode!=='live')return;
 const lease=new Date();
 const claimed=await prisma.quoteDraftRequest.updateMany({where:{id,status:'CREATED',productId:{not:null},requestEmailSentAt:null,OR:[{requestEmailLeaseAt:null},{requestEmailLeaseAt:{lt:new Date(Date.now()-600000)}}]},data:{requestEmailLeaseAt:lease,requestEmailCheckedAt:lease}});
 if(!claimed.count)return;
 try{
  const row=await prisma.quoteDraftRequest.findUniqueOrThrow({where:{id}});
  const {unauthenticated}=await import('../shopify.server');
  const {admin}=await unauthenticated.admin(row.shop);
  const response=await admin.graphql('query($id:ID!){product(id:$id){title handle}}',{variables:{id:row.productId}});
  const result=await response.json() as {errors?:unknown[];data?:{product?:{title:string;handle:string}}};
  const product=result.data?.product;
  if(result.errors?.length||!product)throw new Error('Draft lookup failed');
  const saved=JSON.parse(row.sheetPayload||'{}');
  const input=saved.input||{};
  const country=String(saved.country||input.country||'');
  const count=Number(input.bottles||input.quantity||0);
  const sourceUrl=String(saved.sourceUrl||'');
  const productUrl='https://'+row.shop+'/products/'+encodeURIComponent(product.handle);
  const adminUrl='https://admin.shopify.com/store/'+encodeURIComponent(row.shop.replace('.myshopify.com',''))+'/products/'+encodeURIComponent(row.productId!.replace(/^gid:\/\/shopify\/Product\//,''));
  const lines=['공구 요청이 등록됐습니다.','',`와인명: ${product.title}`,...(country?[`국가/센터: ${country}`]:[]),...(count?[`요청 수량: ${count}병`]:[]),...(sourceUrl?[`원본 상품 URL: ${sourceUrl}`]:[]),`Shopify 초안: ${adminUrl}`,`스토어 상품 경로: ${productUrl}`];
  const text=lines.join('\n');
  const html='<h2>공구 요청이 등록됐습니다</h2>'+lines.slice(2).map(line=>'<p>'+escapeHtml(line)+'</p>').join('');
  const sent=await deliverEmailMessage({to:'info@town.wine',subject:'[타운와인] 공구 요청이 등록됐습니다',text,html,idempotencyKey:'quote-request-'+id,logLabel:'Quote request email',logContext:{requestId:id}});
  if(sent.mode!=='log-only'&&!sent.isTestOverride)await prisma.quoteDraftRequest.update({where:{id},data:{requestEmailSentAt:new Date()}});
 }finally{
  await prisma.quoteDraftRequest.updateMany({where:{id,requestEmailLeaseAt:lease},data:{requestEmailLeaseAt:null}});
 }
}

let running=false;
export async function retryQuoteRequestEmails(){
 if(running||getEmailDeliveryRuntimeStatus().mode!=='live')return;
 running=true;
 try{
  const rows=await prisma.quoteDraftRequest.findMany({where:{status:'CREATED',productId:{not:null},requestEmailSentAt:null,OR:[{requestEmailCheckedAt:null},{requestEmailCheckedAt:{lt:new Date(Date.now()-60000)}}]},orderBy:{requestEmailCheckedAt:'asc'},take:20});
  for(const row of rows){try{await notifyQuoteRequestRegistered(row.id);}catch{console.error('[quote-request-email] notification pending',{requestId:row.id});}}
 }finally{running=false;}
}
