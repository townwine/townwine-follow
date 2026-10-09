import {quoteCurrency,type QuoteInput,type QuoteRates} from './demand-quote';
import {parseReferenceRates} from './wine-merchants.server';
import {fetchProductHtml,parseDemandProduct} from './demand-product.server';
export async function registrationRates():Promise<QuoteRates>{const r=await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',{signal:AbortSignal.timeout(8000),redirect:'error'});if(!r.ok)throw new Error('최신 환율 조회 실패');const f=parseReferenceRates(await r.text());return {date:f.date,...f.rates} as QuoteRates;}
export async function previewRegistration(url:string){const p=await fetchProductHtml(url);return parseDemandProduct(p.html,p.url);}
export function parseRegistrationInput(form:FormData){
 const country=String(form.get('destination')) as QuoteInput['country'];if(!(Object.hasOwn(quoteCurrency,country)))throw new Error('배송센터를 선택하세요.');
 const currency=String(form.get('currency'));if(currency!==quoteCurrency[country])throw new Error('배송센터의 계산기 통화로 병당 상품가를 입력해 주세요.');
 if(form.get('localShipping')===''||form.get('localShipping')===null)throw new Error('현지 배송비를 확인해 주세요.');
 const origin=String(form.get('origin')||'OTHER');if(!['EU','US','OTHER'].includes(origin))throw new Error('원산지를 확인하세요.');
 const input:QuoteInput={country,bottlePrice:Number(form.get('price')),bottles:Number(form.get('quantity')),localShipping:Number(form.get('localShipping')),origin:origin as QuoteInput['origin'],ftaConfirmed:form.get('ftaConfirmed')==='on',germanyVatRefund:form.get('germanyVatRefund')==='on',ukLocalTax:Number(form.get('ukLocalTax')||2.67)};
 return input;
}
