import {findCollectorProfileByCustomerId} from './collector-profiles.server';
import {createHash} from 'node:crypto';
import {prisma} from '../db.server';
import {productUrl} from './demand-product.server';
import {registrationCountries} from './demand-quote';
import {parseRegistrationInput} from './quote-preview.server';
import {readQuoteToken} from './quote-draft-token.server';
export type DraftAdmin={graphql:(query:string,options?:{variables?:Record<string,unknown>})=>Promise<Response>};
async function query(admin:DraftAdmin,q:string,variables:Record<string,unknown>={}){
 const r=await admin.graphql(q,{variables});const j=await r.json();if(!r.ok||j.errors?.length)throw new Error(j.errors?.map((e:{message:string})=>e.message).join(', ')||'Shopify 연결에 실패했습니다.');
 for(const v of Object.values(j.data||{}) as Array<{userErrors?:Array<{message:string}>}>)if(v?.userErrors?.length)throw new Error(v.userErrors.map(e=>e.message).join(', '));return j.data;
}
export function imageFileType(bytes:Uint8Array){
 const b=Buffer.from(bytes);if(b.length>10*1024*1024)throw new Error('이미지는 10MB 이하로 등록해 주세요.');
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'png'};
 if(b[0]===255&&b[1]===216&&b[2]===255)return {mime:'image/jpeg',ext:'jpg'};
 if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return {mime:'image/webp',ext:'webp'};
 throw new Error('JPG·PNG·WEBP 이미지 파일을 선택해 주세요.');
}
async function uploadImage(admin:DraftAdmin,bytes:Uint8Array){
 const t=imageFileType(bytes);const d=await query(admin,'mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}',{input:[{resource:'IMAGE',filename:'townwine-quote.'+t.ext,mimeType:t.mime,httpMethod:'POST',fileSize:String(bytes.length)}]});
 const target=d.stagedUploadsCreate.stagedTargets?.[0];if(!target||new URL(target.url).protocol!=='https:')throw new Error('이미지 업로드 주소를 받지 못했습니다.');
 const body=new FormData();for(const p of target.parameters)body.append(p.name,p.value);body.append('file',new Blob([Buffer.from(bytes)],{type:t.mime}),'townwine-quote.'+t.ext);
 const res=await fetch(target.url,{method:'POST',body,signal:AbortSignal.timeout(25000),redirect:'error'});if(!res.ok)throw new Error('이미지 업로드에 실패했습니다. 다시 시도해 주세요.');return target.resourceUrl as string;
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function registerQuoteDraft(admin:DraftAdmin,shop:string,customerId:string,form:FormData){
 if(!/^\d+$/.test(customerId))throw new Error('로그인이 필요합니다.');
 const key=String(form.get('submissionKey')||'');if(!/^[a-z0-9-]{20,80}$/i.test(key))throw new Error('페이지를 다시 열어 주세요.');
 const input=parseRegistrationInput(form);const signed=readQuoteToken(String(form.get('quoteToken')||''),shop,customerId,input,process.env.SHOPIFY_API_SECRET||'');
 if(form.get('confirmed')!=='on')throw new Error('상품 정보와 예상 판매가를 확인해 주세요.');
 const title=String(form.get('title')||'').trim(),note=String(form.get('shippingNote')||'').trim();
 if(!title||title.length>240||note.length>1000)throw new Error('와인명과 배송 안내를 확인해 주세요.');
 const source=String(form.get('url')||'').trim();let sourceUrl='';try{if(source)sourceUrl=productUrl(source).href;}catch{/* Manual quotes do not require a source URL. */}
 const file=form.get('imageFile');const bytes=file instanceof File&&file.size?new Uint8Array(await file.arrayBuffer()):null;
 if(bytes)imageFileType(bytes);
 let imageUrl=String(form.get('imageUrl')||'').trim();if(imageUrl)imageUrl=productUrl(imageUrl).href;
 if(!bytes&&!imageUrl)throw new Error('공구 썸네일로 사용할 라벨 확대 이미지를 등록해 주세요.');
 const imageHash=bytes?createHash('sha256').update(bytes).digest('hex'):imageUrl;
 const payloadHash=createHash('sha256').update(JSON.stringify({title,note,sourceUrl,input,imageHash})).digest('hex');
 const id=createHash('sha256').update(shop+':'+customerId+':'+key).digest('hex');const handle='townwine-request-'+id.slice(0,32);
 let row=await prisma.quoteDraftRequest.findUnique({where:{id}});
 if(row&&row.payloadHash!==payloadHash)throw new Error('앞선 등록 요청과 내용이 다릅니다. 새 요청으로 다시 등록해 주세요.');
 if(!row){try{row=await prisma.quoteDraftRequest.create({data:{id,shop,customerId,payloadHash,handle,quoteJson:JSON.stringify(signed.quote)}});}catch{row=await prisma.quoteDraftRequest.findUnique({where:{id}});if(!row)throw new Error('등록 요청 저장에 실패했습니다.');}}
 if(row.payloadHash!==payloadHash)throw new Error('동일한 요청으로 다시 시도해 주세요.');
 if(row.productId)return {requestId:id.slice(0,12),productId:row.productId,status:'DRAFT',duplicate:true};
 const claim=await prisma.quoteDraftRequest.updateMany({where:{id,OR:[{status:{in:['PENDING','RETRY']}},{status:'PROCESSING',updatedAt:{lt:new Date(Date.now()-300000)}}]},data:{status:'PROCESSING',error:null}});
 if(!claim.count)throw new Error('초안 등록 처리 중입니다. 잠시 후 다시 확인해 주세요.');
 try{
  const found=await query(admin,'query($handle:String!){productByHandle(handle:$handle){id status} shop{currencyCode}}',{handle});
  let product=found.productByHandle;
  if(!product){
   const quote=JSON.parse(row.quoteJson);const price=found.shop.currencyCode==='HKD'?quote.unitHkd:found.shop.currencyCode==='KRW'?quote.unitKrw:null;
   if(!price||!Number.isFinite(price))throw new Error('스토어 결제 통화를 확인해 주세요.');
   if(bytes)imageUrl=await uploadImage(admin,bytes);
   const collector=await findCollectorProfileByCustomerId(admin,customerId);if(!collector)throw new Error('마이페이지에서 컬렉터 프로필을 등록한 후 승인 요청을 보내주세요.');
   const collectorFields=quoteCollectorFields(collector);
   const country=registrationCountries[input.country];
   const metadata={customerId,collectorName:collector.fields.displayName,collectorHandle:collector.handle,country:input.country,sourceUrl,quantity:input.bottles,shippingNote:note,quote,requestId:id};
   const data=await query(admin,'mutation($input:ProductSetInput!){productSet(input:$input,synchronous:true){product{id status handle} userErrors{message}}}',{input:{
    title,handle,status:'DRAFT',productType:'Wine',vendor:'TOWN WINE',tags:['공구등록요청','승인대기',country,'customer-'+customerId],
    descriptionHtml:'<h2>'+escape(title)+'</h2><p>750ml · 모집 수량 '+input.bottles+'병</p><p>배송센터: '+escape(country)+'</p>'+(note?'<p>'+escape(note)+'</p>':''),
    productOptions:[{name:'Title',values:[{name:'Default Title'}]}],variants:[{optionValues:[{optionName:'Title',name:'Default Title'}],price:Number(price).toFixed(2),inventoryPolicy:'DENY'}],
    metafields:[...collectorFields,{namespace:'townwine',key:'registration_request',type:'json',value:JSON.stringify(metadata)},...(sourceUrl?[{namespace:'custom',key:'quote_source_url',type:'url',value:sourceUrl}]:[])],
    ...(imageUrl?{files:[{originalSource:imageUrl,contentType:'IMAGE',alt:title}]}:{})
   }});product=data.productSet.product;
   if(!product?.id)throw new Error('초안 상품 생성 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
   if(product.status!=='DRAFT')throw new Error('초안 상태를 확인하지 못했습니다. 운영자에게 문의해 주세요.');
  }
  await prisma.quoteDraftRequest.update({where:{id},data:{status:'CREATED',productId:product.id}});
  return {requestId:id.slice(0,12),productId:product.id,status:product.status,duplicate:false};
 }catch(e){await prisma.quoteDraftRequest.update({where:{id},data:{status:'RETRY',error:e instanceof Error?e.message:'등록 실패'}});throw e;}
}

export async function backfillQuoteSourceUrls(admin:DraftAdmin){
 let after:string|null=null;
 do{
  const data=await query(admin,'query($after:String){products(first:50,after:$after,query:"tag:공구등록요청"){nodes{id owner:metafield(namespace:"custom",key:"influencer_handle"){value} requester:metafield(namespace:"custom",key:"quote_requester_name"){value} source:metafield(namespace:"custom",key:"quote_source_url"){value} request:metafield(namespace:"townwine",key:"registration_request"){value}} pageInfo{hasNextPage endCursor}}}',{after});
  for(const product of data.products.nodes){
   if(!product.request?.value)continue;
   const savedRequest=JSON.parse(product.request.value);
   if(savedRequest.customerId){const collector=await findCollectorProfileByCustomerId(admin,savedRequest.customerId);if(collector){const fields=quoteCollectorFields(collector).filter(f=>!product.owner?.value||product.owner.value===collector.handle||f.key==='quote_requester_name');await query(admin,'mutation($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){userErrors{message}}}',{metafields:fields.map(f=>({...f,ownerId:product.id}))});}}
   if(product.source?.value)continue;
   let source='';try{const saved=JSON.parse(product.request.value);if(saved.sourceUrl)source=productUrl(saved.sourceUrl).href;}catch{continue;}
   if(source)await query(admin,'mutation($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){metafields{id} userErrors{message}}}',{metafields:[{ownerId:product.id,namespace:'custom',key:'quote_source_url',type:'url',value:source}]});
  }
  after=data.products.pageInfo.hasNextPage?data.products.pageInfo.endCursor:null;
 }while(after);
}

function quoteCollectorFields(collector:NonNullable<Awaited<ReturnType<typeof findCollectorProfileByCustomerId>>>){
 return Object.entries({quote_requester_name:collector.fields.displayName,collector_tag:collector.fields.displayName,influencer_handle:collector.handle,host_handle:collector.fields.publicHandle||collector.handle,host_name:collector.fields.displayName}).map(([key,value])=>({namespace:'custom',key,type:'single_line_text_field',value}));
}
