import type {LoaderFunctionArgs, ActionFunctionArgs} from 'react-router';
import {authenticate} from '../shopify.server';
import {calculateDemandQuote} from '../services/demand-quote';
import {registrationRates,parseRegistrationInput,previewRegistration} from '../services/quote-preview.server';
import {renderQuotePreview} from '../services/quote-preview-page.server';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
let active=0;
export async function loader({request}:LoaderFunctionArgs){
 await authenticate.public.appProxy(request);
 return new Response(renderQuotePreview(),{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
export async function action({request}:ActionFunctionArgs){
 await authenticate.public.appProxy(request);
 if(Number(request.headers.get('content-length')||0)>16000)return Response.json({error:'입력 내용이 너무 깁니다.'},{status:413,headers});
 if(active>=3)return Response.json({error:'조회가 몰리고 있습니다. 잠시 후 다시 시도해 주세요.'},{status:429,headers});
 active++;
 try{
  const raw=await request.text();if(raw.length>16000)throw new Error('입력 내용이 너무 깁니다.');
  const params=new URLSearchParams(raw),form=new FormData();params.forEach((v,k)=>form.set(k,v));
  const intent=form.get('intent');
  if(intent==='extract')return Response.json({product:await previewRegistration(String(form.get('url')||''))},{headers});
  if(intent==='quote')return Response.json({quote:calculateDemandQuote(parseRegistrationInput(form),await registrationRates())},{headers});
  return Response.json({error:'미리보기에서는 상품 게시와 시트 저장을 실행하지 않습니다.'},{status:400,headers});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'조회에 실패했습니다. 다시 시도해 주세요.'},{status:400,headers});}finally{active--;}
}
