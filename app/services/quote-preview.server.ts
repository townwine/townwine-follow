import {quoteCurrency,type QuoteInput,type QuoteRates} from './demand-quote';
import {createHmac} from 'node:crypto';
import {fetchProductHtml,parseDemandProduct} from './demand-product.server';
const rateCaches=new Map<string,{expires:number;rates:QuoteRates}>();
export async function registrationRates(country:QuoteInput['country']='US'):Promise<QuoteRates>{
 const rateCache=rateCaches.get(country);
 if(rateCache&&rateCache.expires>Date.now())return rateCache.rates;
 const endpoint=process.env.QUOTE_SHEET_WEBHOOK_URL,secret=process.env.QUOTE_SHEET_SECRET;
 if(!endpoint||!secret)throw new Error('견적표 환율 연결을 확인해 주세요.');
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!url.pathname.endsWith('/exec'))throw new Error('견적표 연결 주소를 확인해 주세요.');
 const payload=JSON.stringify({action:'rates',country}),timestamp=String(Date.now()),signature=createHmac('sha256',secret).update(timestamp+'.'+payload).digest('hex');
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,timestamp,signature}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('견적표 환율 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.');
 const result=await response.json();if(!result.ok||!result.rates)throw new Error('견적표 환율을 확인할 수 없습니다.');
 const rates=result.rates as QuoteRates;for(const c of ['KRW','USD','HKD','EUR','GBP','JPY'] as const)if(!Number.isFinite(rates[c])||rates[c]<=0)throw new Error('견적표 환율 값이 올바르지 않습니다.');
 rateCaches.set(country,{expires:Date.now()+60000,rates});return rates;
}
export async function previewRegistration(url:string){const p=await fetchProductHtml(url);return parseDemandProduct(p.html,p.url);}
export function parseRegistrationInput(form:FormData){
 const country=String(form.get('destination')) as QuoteInput['country'];if(!(Object.hasOwn(quoteCurrency,country)))throw new Error('배송센터를 선택하세요.');
 const currency=String(form.get('currency'));if(currency!==quoteCurrency[country])throw new Error('배송센터의 계산기 통화로 병당 상품가를 입력해 주세요.');
 if(form.get('localShipping')===''||form.get('localShipping')===null)throw new Error('현지 배송비를 확인해 주세요.');
 const origin=String(form.get('origin')||'OTHER');if(!['EU','US','OTHER'].includes(origin))throw new Error('원산지를 확인하세요.');
 const shippingMode=String(form.get('shippingMode')||'total');if(!['total','per_bottle'].includes(shippingMode))throw new Error('배송비 입력 기준을 확인해 주세요.');
 const input:QuoteInput={country,bottlePrice:Number(form.get('price')),bottles:Number(form.get('quantity')),localShipping:Number(form.get('localShipping'))*(shippingMode==='per_bottle'?Number(form.get('quantity')):1),origin:origin as QuoteInput['origin'],ftaConfirmed:form.get('ftaConfirmed')==='on',germanyVatRefund:form.get('germanyVatRefund')==='on',ukLocalTax:Number(form.get('ukLocalTax')??2.76),...(country==='HK'?{hkViaUk:form.get('hkViaUk')==='on'}:{})};
 input.ftaConfirmed=country==='US'?input.origin==='US':country==='FR'||country==='DE'?input.origin==='EU':country==='GB'&&form.get('ftaConfirmed')==='on';
 return input;
}
