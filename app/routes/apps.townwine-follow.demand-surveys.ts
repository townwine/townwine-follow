import type {LoaderFunctionArgs,ActionFunctionArgs} from 'react-router';
import {authenticate} from '../shopify.server';
import {prisma} from '../db.server';
import {findCollectorProfileByCustomerId} from '../services/collector-profiles.server';
import {demandPath,demandToken,verifyDemandToken,demandInput,demandInteger,surveyOpen} from '../services/demand-survey';
import {ownedDemand} from '../services/demand-survey.server';
import {imageFileType} from '../services/quote-draft.server';
import {fetchLabelImage} from '../services/demand-product.server';
import {previewRegistration} from '../services/quote-preview.server';
import {renderDemandPage} from '../services/demand-survey-page.server';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
async function identity(request:Request){const context=await authenticate.public.appProxy(request);const params=new URL(request.url).searchParams;const shop=context.session?.shop||params.get('shop')||'';if(!shop)throw new Response('인증이 필요합니다.',{status:401});return {...context,shop,customerId:params.get('logged_in_customer_id')||''};}
export async function loader({request}:LoaderFunctionArgs){
 const {shop,customerId,admin}=await identity(request),url=new URL(request.url),id=url.searchParams.get('id')||'',view=url.searchParams.get('view')||'all';
 if(url.searchParams.get('image')){const image=await prisma.demandSurvey.findFirst({where:{shop,id:url.searchParams.get('image')||''},select:{imageData:true,imageMime:true}});if(!image?.imageData)return new Response('Not found',{status:404});return new Response(Buffer.from(image.imageData),{headers:{'Content-Type':image.imageMime||'image/png','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});}
 const where={shop,...(id?{id}:{}),...(view==='mine'?{ownerId:customerId||'unauthenticated'}:{})};
 const surveys=await prisma.demandSurvey.findMany({where,orderBy:{createdAt:'desc'},take:id?1:100,select:{id:true,ownerId:true,ownerName:true,title:true,description:true,imageUrl:true,sourceUrl:true,expectedPrice:true,targetQuantity:true,closesAt:true,status:true,productId:true,entries:{select:{customerId:true,displayName:true,quantity:true,createdAt:true}}}});
 let productUrl='';
 if(id&&surveys[0]?.productId&&admin){try{const response=await admin.graphql('query($id:ID!){product(id:$id){status onlineStoreUrl}}',{variables:{id:surveys[0].productId}});const data=await response.json();const product=data.data?.product;if(product?.status==='ACTIVE'&&product.onlineStoreUrl){const u=new URL(product.onlineStoreUrl);if(u.protocol==='https:')productUrl=u.href;}}catch{console.error('[demand-survey] linked product unavailable');}}
 const token=customerId?demandToken(shop,customerId,process.env.SHOPIFY_API_SECRET||''):'';
 const html=renderDemandPage({surveys,customerId,token,view,id,productUrl,notice:url.searchParams.get('notice')||''});
 return new Response(html,{status:id&&!surveys.length?404:200,headers:{...headers,'Content-Type':'application/liquid; charset=utf-8'}});
}
export async function action({request}:ActionFunctionArgs){
 const {shop,customerId,admin}=await identity(request);
 if(!customerId||!admin)return Response.json({error:'로그인 후 다시 시도해 주세요.'},{status:401,headers});
 const limit=6*1024*1024;let size=0;const chunks:Uint8Array[]=[];const reader=request.body?.getReader();
 if(reader)for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return new Response('이미지는 5MB 이하로 올려주세요.',{status:413,headers});}chunks.push(value);}
 const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')||'application/x-www-form-urlencoded'}}).formData();
 if(!verifyDemandToken(String(form.get('token')||''),shop,customerId,process.env.SHOPIFY_API_SECRET||''))return new Response('페이지를 새로고침한 뒤 다시 시도해 주세요.',{status:403,headers});
 let id=String(form.get('id')||''),notice='저장했습니다.';
 try{
  const intent=String(form.get('intent')||'');
  if(intent==='extract'){
   try{
    const product=await previewRegistration(String(form.get('sourceUrl')||''));
    let thumbnail='',thumbnailWarning='';
    if(product.image){try{const bytes=await fetchLabelImage(product.image);if(bytes.length>5*1024*1024)throw Error('too large');const type=imageFileType(bytes);thumbnail='data:'+type.mime+';base64,'+bytes.toString('base64');}catch{thumbnailWarning='판매처 이미지를 가져올 수 없습니다. 썸네일 파일을 직접 등록해 주세요.';}}
    else thumbnailWarning='상품 페이지에 이미지가 없습니다. 썸네일 파일을 직접 등록해 주세요.';
    return Response.json({product,thumbnail,thumbnailWarning},{headers});
   }catch{return Response.json({error:'상품 정보를 가져오지 못했습니다. 와인명과 썸네일을 직접 등록해 주세요.'},{status:400,headers});}
  }
  if(intent==='create'){
   const profile=await findCollectorProfileByCustomerId(admin,customerId);if(!profile)throw Error('마이페이지에서 컬렉터 프로필을 먼저 등록해 주세요.');
   const data=demandInput(form);const file=form.get('imageFile');
   if(!(file instanceof File)||!file.size||file.size>5*1024*1024)throw Error('5MB 이하의 JPG·PNG·WEBP 썸네일 파일을 등록해 주세요.');
   const imageData=Buffer.from(await file.arrayBuffer()),imageMime=imageFileType(imageData).mime;
   const key=String(form.get('key')||'');if(!/^[a-f0-9-]{36}$/.test(key))throw Error('페이지를 새로고침해 주세요.');
   const existing=await prisma.demandSurvey.findUnique({where:{id:key}});if(existing&&(existing.shop!==shop||existing.ownerId!==customerId))throw Error('다시 등록해 주세요.');
   const survey=existing||await prisma.demandSurvey.create({data:{...data,imageData,imageMime,imageUrl:demandPath+'?image='+encodeURIComponent(key),id:key,shop,ownerId:customerId,ownerName:profile.fields.displayName||'컬렉터'}});id=survey.id;notice='수요조사를 등록했습니다.';
  }else if(intent==='close'){
   await ownedDemand(shop,customerId,id);await prisma.demandSurvey.updateMany({where:{id,shop,ownerId:customerId,status:'OPEN'},data:{status:'CLOSED'}});notice='수요조사를 종료했습니다. 공구 초안은 나중에도 만들 수 있어요.';
  }else if(intent==='join'||intent==='cancel'){
   const quantity=intent==='join'?demandInteger(form.get('quantity'),1,120):0;
   const displayName=String(form.get('displayName')||'참여자').trim();if(displayName.length>40)throw Error('닉네임은 40자 이내로 입력해 주세요.');
   await prisma.$transaction(async tx=>{
    const survey=await tx.demandSurvey.findFirst({where:{id,shop}});if(!survey)throw Error('수요조사를 찾을 수 없습니다.');
    if(intent==='cancel'){await tx.demandEntry.deleteMany({where:{surveyId:id,customerId}});return;}
    if(!surveyOpen(survey))throw Error('참여가 마감된 수요조사입니다.');if(survey.ownerId===customerId)throw Error('본인의 수요조사에는 참여할 수 없습니다.');
    await tx.demandEntry.upsert({where:{surveyId_customerId:{surveyId:id,customerId}},create:{surveyId:id,customerId,displayName:displayName||'참여자',quantity},update:{quantity,displayName:displayName||'참여자'}});
   });notice=intent==='join'?'참여 내용을 저장했습니다. 구매 신청이나 결제는 이루어지지 않습니다.':'수요조사 참여를 취소했습니다.';
  }else throw Error('지원하지 않는 요청입니다.');
 }catch(error){console.error('[demand-survey] action failed',error instanceof Error?error.message:'unknown');notice=error instanceof Error?error.message:'저장에 실패했습니다. 다시 시도해 주세요.';if(request.headers.get('Accept')==='application/json')return Response.json({error:notice},{status:400,headers});}
 // App proxy redirects keep navigation on the storefront.
 const destination=demandPath+'?'+new URLSearchParams({...(id?{id}:{}),notice});
 if(request.headers.get('Accept')==='application/json')return Response.json({redirect:destination},{headers});
 return new Response(null,{status:303,headers:{...headers,Location:destination}});
}
