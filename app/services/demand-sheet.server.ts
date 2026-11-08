import {createHmac} from 'node:crypto';
import {prisma} from '../db.server';
let running=false;
/** Durable, version-checked sync: a concurrent participation edit remains pending. */
export async function retryDemandSheets(){
 const endpoint=process.env.QUOTE_SHEET_WEBHOOK_URL,secret=process.env.QUOTE_SHEET_SECRET;
 if(running||!endpoint||!secret)return;
 running=true;
 try{
  const url=new URL(endpoint);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!url.pathname.endsWith('/exec'))throw Error('Invalid endpoint');
  const rows=await prisma.demandSheetSync.findMany({where:{syncedAt:null,nextAttemptAt:{lte:new Date()}},orderBy:{nextAttemptAt:'asc'},take:20});
  for(const row of rows){try{
   const survey=await prisma.demandSurvey.findUnique({where:{id:row.surveyId}});if(!survey)throw Error('Survey unavailable');
   const entry=await prisma.demandEntry.findUnique({where:{surveyId_customerId:{surveyId:row.surveyId,customerId:row.customerId}}});
   const {unauthenticated}=await import('../shopify.server');const {admin}=await unauthenticated.admin(survey.shop);
   const response=await admin.graphql('query DemandSheetCustomer($id:ID!){customer(id:$id){email phone defaultAddress{phone}}}',{variables:{id:'gid://shopify/Customer/'+row.customerId.replace(/^gid:\/\/shopify\/Customer\//,'')}});
   const result=await response.json() as {errors?:unknown[];data?:{customer?:{email?:string;phone?:string;defaultAddress?:{phone?:string}}}};if(!response.ok||result.errors?.length)throw Error('Customer lookup failed');
   const customer=result.data?.customer;
   const requestId=createHmac('sha256',secret).update(survey.shop+'|'+row.surveyId+'|'+row.customerId).digest('hex');
   const payload=JSON.stringify({action:'demand-participant',requestId,version:row.updatedAt.getTime(),nickname:entry?.displayName||row.displayName,email:customer?.email||'',phone:customer?.phone||customer?.defaultAddress?.phone||'',surveyId:survey.id,title:survey.title,quantity:entry?.quantity||0,status:entry?'참여':'취소',createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()});
   const timestamp=String(Date.now()),signature=createHmac('sha256',secret).update(timestamp+'.'+payload).digest('hex');
   const saved=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,timestamp,signature}),signal:AbortSignal.timeout(20000)});
   const ack=await saved.json();if(!saved.ok||ack.ok!==true||ack.requestId!==requestId)throw Error('Sheet not acknowledged');
   await prisma.demandSheetSync.updateMany({where:{id:row.id,updatedAt:row.updatedAt},data:{syncedAt:new Date()}});
  }catch{await prisma.demandSheetSync.updateMany({where:{id:row.id,updatedAt:row.updatedAt},data:{nextAttemptAt:new Date(Date.now()+60000)}});console.error('[demand-sheet] sync pending');}}
 }finally{running=false;}
}
