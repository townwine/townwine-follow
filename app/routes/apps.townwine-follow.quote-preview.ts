import type {LoaderFunctionArgs, ActionFunctionArgs} from 'react-router';
import {authenticate} from '../shopify.server';
import {calculateDemandQuote} from '../services/demand-quote';
import {registrationRates,parseRegistrationInput,previewRegistration} from '../services/quote-preview.server';
import {renderQuotePreview} from '../services/quote-preview-page.server';
import {issueQuoteToken} from '../services/quote-draft-token.server';
import {fetchLabelImage} from '../services/demand-product.server';
import {imageFileType} from '../services/quote-draft.server';
import {registerQuoteDraft} from '../services/quote-draft.server';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
let active=0;
export async function loader({request}:LoaderFunctionArgs){
 await authenticate.public.appProxy(request);
 const customerId=new URL(request.url).searchParams.get('logged_in_customer_id')||'';
 return new Response(renderQuotePreview(Boolean(customerId)),{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
async function boundedForm(request:Request){
 const limit=11*1024*1024;
 if(Number(request.headers.get('content-length')||0)>limit)throw new Error('10MB 이하의 이미지를 등록해 주세요.');
 const reader=request.body?.getReader();const parts:Uint8Array[]=[];let size=0;
 if(reader)for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('입력한 파일이 너무 큽니다.');}parts.push(value);}
 return new Response(Buffer.concat(parts),{headers:{'Content-Type':request.headers.get('content-type')||'application/x-www-form-urlencoded'}}).formData();
}
export async function action({request}:ActionFunctionArgs){
 const {admin}=await authenticate.public.appProxy(request);
 const params=new URL(request.url).searchParams,shop=params.get('shop')||'',customerId=params.get('logged_in_customer_id')||'';
 if(active>=3)return Response.json({error:'조회가 몰리고 있습니다. 잠시 후 다시 시도해 주세요.'},{status:429,headers});
 active++;
 try{
  const form=await boundedForm(request),intent=form.get('intent');
  if(intent==='label-image'){const bytes=await fetchLabelImage(String(form.get('imageUrl')||''));const type=imageFileType(bytes);return Response.json({image:'data:'+type.mime+';base64,'+bytes.toString('base64')},{headers});}
  if(intent==='extract')return Response.json({product:await previewRegistration(String(form.get('url')||''))},{headers});
  if(intent==='quote'){
   const input=parseRegistrationInput(form),quote=calculateDemandQuote(input,await registrationRates());
   const quoteToken=issueQuoteToken({input,quote,shop,customerId},process.env.SHOPIFY_API_SECRET||'');
   return Response.json({quote,quoteToken},{headers});
  }
  if(intent==='register'){
   if(!admin||!customerId||!shop)return Response.json({error:'로그인 후 견적을 다시 계산해 주세요.',loginRequired:true},{status:401,headers});
   const registration=await registerQuoteDraft(admin,shop,customerId,form);
   return Response.json({registration},{headers});
  }
  return Response.json({error:'지원하지 않는 요청입니다.'},{status:400,headers});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'조회에 실패했습니다. 다시 시도해 주세요.'},{status:400,headers});}finally{active--;}
}
