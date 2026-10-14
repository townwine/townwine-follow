import {prisma} from '../db.server';
import {deliverEmailMessage, getEmailDeliveryRuntimeStatus} from './email.server';

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export async function notifyQuoteApproval(id:string){
 if(getEmailDeliveryRuntimeStatus().mode!=='live')return;
 const lease=new Date();
 const claimed=await prisma.quoteDraftRequest.updateMany({where:{id,productId:{not:null},approvalEmailSentAt:null,OR:[{approvalEmailLeaseAt:null},{approvalEmailLeaseAt:{lt:new Date(Date.now()-600000)}}]},data:{approvalEmailLeaseAt:lease,approvalEmailCheckedAt:lease}});
 if(!claimed.count)return;
 try{
  const row=await prisma.quoteDraftRequest.findUniqueOrThrow({where:{id}});
  const {unauthenticated}=await import('../shopify.server');
  const {admin}=await unauthenticated.admin(row.shop);
  const response=await admin.graphql('query($id:ID!,$customer:ID!){product(id:$id){status title onlineStoreUrl} customer(id:$customer){email}}',{variables:{id:row.productId,customer:'gid://shopify/Customer/'+row.customerId}});
  const result=await response.json() as {errors?:unknown[];data?:{product?:{status:string;title:string;onlineStoreUrl?:string};customer?:{email?:string}}};
  if(result.errors?.length)throw new Error('Approval lookup failed');
  const product=result.data?.product;
  if(product?.status!=='ACTIVE')return;
  const to=result.data?.customer?.email;
  if(!to)throw new Error('Registrant email unavailable');
  const text='등록하신 공구가 운영자 승인을 받았습니다.\n\n'+product.title+(product.onlineStoreUrl?'\n\n공구 보기: '+product.onlineStoreUrl:'');
  const sent=await deliverEmailMessage({to,subject:'[타운와인] 공구 등록이 승인되었습니다',text,html:'<h2>공구 등록이 승인되었습니다</h2><p>등록하신 공구가 운영자 승인을 받았습니다.</p><p>'+escapeHtml(product.title)+'</p>'+(product.onlineStoreUrl?'<p><a href="'+escapeHtml(product.onlineStoreUrl)+'">공구 보기</a></p>':''),idempotencyKey:'quote-approval-'+id,logLabel:'Quote approval email',logContext:{requestId:id}});
  if(sent.mode!=='log-only'&&!sent.isTestOverride)await prisma.quoteDraftRequest.update({where:{id},data:{approvalEmailSentAt:new Date()}});
 }finally{
  await prisma.quoteDraftRequest.updateMany({where:{id,approvalEmailLeaseAt:lease},data:{approvalEmailLeaseAt:null}});
 }
}

let running=false;
export async function retryQuoteApprovals(){
 if(running||getEmailDeliveryRuntimeStatus().mode!=='live')return;
 running=true;
 try{
  const rows=await prisma.quoteDraftRequest.findMany({where:{productId:{not:null},approvalEmailSentAt:null,OR:[{approvalEmailCheckedAt:null},{approvalEmailCheckedAt:{lt:new Date(Date.now()-60000)}}]},orderBy:{approvalEmailCheckedAt:'asc'},take:20});
  for(const row of rows){try{await notifyQuoteApproval(row.id);}catch{console.error('[quote-approval] notification pending',{requestId:row.id});}}
 }finally{running=false;}
}
