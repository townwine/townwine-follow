import {randomUUID} from 'node:crypto';
import {prisma} from '../db.server';
import {deliverEmailMessage,getEmailDeliveryRuntimeStatus} from './email.server';
import {readNotificationQuery} from './notification-query.server';
import {notificationEmailKey} from './resend-delivery.server';

type Admin={graphql:(query:string,options?:{variables?:Record<string,unknown>})=>Promise<Response>};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const customerKey=(id:string)=>id.replace(/^gid:\/\/shopify\/Customer\//,'');

/** A delivery barrier shared by every general announcement path. */
export async function ensureDemandPaymentEmails({admin,shop,productId}:{admin:Admin;shop:string;productId:string}){
 const surveys=await prisma.demandSurvey.findMany({where:{shop,productId,status:'CONVERTED'},select:{entries:{select:{customerId:true,quantity:true}}}});
 const recipients=new Map<string,number>();
 for(const survey of surveys)for(const entry of survey.entries)recipients.set(customerKey(entry.customerId),Math.max(recipients.get(customerKey(entry.customerId))||0,entry.quantity));
 const customerIds=[...recipients.keys()];
 if(!customerIds.length)return {ready:true,customerIds};
 if(getEmailDeliveryRuntimeStatus().mode!=='live')return {ready:false,customerIds};
 for(const [customerId,quantity] of recipients){
  await prisma.demandPaymentEmail.upsert({where:{shop_productId_customerId:{shop,productId,customerId}},create:{shop,productId,customerId,quantity},update:{}});
 }
 const pendingWhere={shop,productId,customerId:{in:customerIds},status:'PENDING'};
 if(!await prisma.demandPaymentEmail.count({where:pendingWhere}))return {ready:true,customerIds};
 const result=await readNotificationQuery(await admin.graphql(`query DemandPaymentProduct($id:ID!){product(id:$id){status title handle onlineStoreUrl openAt:metafield(namespace:"custom",key:"deal_open_at_kst"){value} variants(first:2){nodes{id inventoryQuantity inventoryPolicy inventoryItem{tracked}}}}}`,{variables:{id:productId}}));
 const product=result.data.product;
 const openAt=product?.openAt?.value;
 if(!product||product.status!=='ACTIVE'||!product.onlineStoreUrl||(openAt&&(!Number.isFinite(Date.parse(openAt))||Date.parse(openAt)>Date.now())))return {ready:false,customerIds};
 const variants=product.variants?.nodes||[];
 // A survey concerns the first wine; multi-wine products require selection on the product page.
 const variant=variants.length===1?variants[0]:null;
 if(variants.length===0||variants.every((v:{inventoryPolicy:string;inventoryQuantity:number;inventoryItem:{tracked:boolean}})=>v.inventoryItem?.tracked&&v.inventoryPolicy!=='CONTINUE'&&v.inventoryQuantity<=0))return {ready:false,customerIds};
 const rows=await prisma.demandPaymentEmail.findMany({where:pendingWhere,orderBy:{createdAt:'asc'},take:50});
 for(const row of rows){
  const leaseToken=randomUUID();
  const claimed=await prisma.demandPaymentEmail.updateMany({where:{id:row.id,status:'PENDING',OR:[{leaseAt:null},{leaseAt:{lt:new Date(Date.now()-600000)}}]},data:{leaseToken,leaseAt:new Date()}});
  if(!claimed.count)continue;
  try{
   let payload=row.payloadJson?JSON.parse(row.payloadJson):null;
   if(!payload){
    const data=await readNotificationQuery(await admin.graphql('query DemandPaymentCustomer($id:ID!){customer(id:$id){email}}',{variables:{id:'gid://shopify/Customer/'+row.customerId}}));
    const to=data.data.customer?.email;
    if(!to){
     await prisma.demandPaymentEmail.updateMany({where:{id:row.id,leaseToken},data:{status:'SKIPPED',lastError:'CUSTOMER_EMAIL_UNAVAILABLE'}});
     console.warn('[demand-payment] customer email unavailable',{deliveryId:row.id});
     continue;
    }
    const variantId=String(variant?.id||'').replace(/^gid:\/\/shopify\/ProductVariant\//,'');
    const productUrl='https://town.wine/products/'+encodeURIComponent(product.handle);
    const paymentUrl=/^\d+$/.test(variantId)?'https://town.wine/cart/'+variantId+':'+row.quantity:productUrl;
    const text='참여하신 수요조사의 공구가 열렸습니다.\n수요조사 참여자에게 먼저 구매 링크를 안내드립니다.\n\n'+product.title+'\n신청 수량: '+row.quantity+'병\n\n구매·결제하기: '+paymentUrl+'\n상품 및 최종 가격 확인: '+productUrl+'\n\n수요조사 참여는 구매 확정이나 재고 예약이 아닙니다. 최종 가격과 수량을 확인한 뒤 결제해 주세요.';
    payload={to,subject:'[타운와인] 수요조사 참여자 우선 안내 · 결제 링크가 열렸습니다',text,html:'<h2>참여하신 공구의 결제 링크가 열렸습니다</h2><p>수요조사 참여자에게 먼저 안내드립니다.</p><p>'+escape(product.title)+'</p><p>신청 수량: '+row.quantity+'병</p><p><a href="'+escape(paymentUrl)+'">구매·결제하기</a></p><p><a href="'+escape(productUrl)+'">상품 및 최종 가격 확인</a></p><p>수요조사 참여는 구매 확정이나 재고 예약이 아닙니다. 최종 가격과 수량을 확인한 뒤 결제해 주세요.</p>',idempotencyKey:notificationEmailKey({shop,productId,customerId:row.customerId,notificationType:'DEMAND_PAYMENT'}),logLabel:'Demand payment email',logContext:{deliveryId:row.id}};
    // Freeze the payload so a provider retry uses the same key AND message.
    await prisma.demandPaymentEmail.updateMany({where:{id:row.id,leaseToken},data:{payloadJson:JSON.stringify(payload)}});
   }
   const sent=await deliverEmailMessage(payload);
   if(sent.mode!=='log-only'&&!sent.isTestOverride)await prisma.demandPaymentEmail.updateMany({where:{id:row.id,leaseToken},data:{status:'SENT',sentAt:new Date(),lastError:null}});
  }catch{
   await prisma.demandPaymentEmail.updateMany({where:{id:row.id,leaseToken},data:{lastError:'DELIVERY_FAILED'}});
   console.error('[demand-payment] delivery pending',{deliveryId:row.id});
  }finally{
   await prisma.demandPaymentEmail.updateMany({where:{id:row.id,leaseToken},data:{leaseToken:null,leaseAt:null}});
  }
 }
 return {ready:await prisma.demandPaymentEmail.count({where:pendingWhere})===0,customerIds};
}

let running=false;
export async function retryDemandPaymentEmails(){
 if(running||getEmailDeliveryRuntimeStatus().mode!=='live')return;
 running=true;
 try{
  const surveys=await prisma.demandSurvey.findMany({where:{status:'CONVERTED',productId:{not:null},paymentAnnouncementsReleasedAt:null},select:{shop:true,productId:true},distinct:['shop','productId']});
  const {unauthenticated}=await import('../shopify.server');
  for(const survey of surveys){try{
   const {admin}=await unauthenticated.admin(survey.shop);
   const priority=await ensureDemandPaymentEmails({admin,shop:survey.shop,productId:survey.productId!});
   if(priority.ready){
    // Resume after long delivery outages too, beyond the normal webhook/watchdog window.
    const {processProductWebhookEvent}=await import('./product-webhook-processing.server');
    const result=await processProductWebhookEvent({admin,shop:survey.shop,productId:survey.productId!,maxAttempts:1});
    const notification=result.notification;
    if(notification&&!Number(notification.failedCount||0)&&(!notification.skipped||notification.skipped==='NO_FOLLOWERS')){
     await prisma.demandSurvey.updateMany({where:{shop:survey.shop,productId:survey.productId,status:'CONVERTED'},data:{paymentAnnouncementsReleasedAt:new Date()}});
    }
   }
  }catch{console.error('[demand-payment] retry pending',{productId:survey.productId});}}
 }finally{running=false;}
}
