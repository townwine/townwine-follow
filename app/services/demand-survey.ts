import {createHmac, timingSafeEqual} from 'node:crypto';
export const demandPath='/apps/townwine-follow/demand-surveys';
export function escapeDemand(value:unknown){return String(value??'').replace(/[&<>"'{}]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','{':'&#123;','}':'&#125;'}[c]!));}
export function demandInteger(value:unknown,min:number,max:number){const s=String(value??'');if(!/^\d+$/.test(s)||!Number.isSafeInteger(Number(s))||Number(s)<min||Number(s)>max)throw Error(`${min}~${max} 사이의 정수를 입력해 주세요.`);return Number(s);}
export function surveyOpen(s:{status:string;closesAt:Date},now=Date.now()){return s.status==='OPEN'&&s.closesAt.getTime()>now;}
export function demandToken(shop:string,customer:string,secret:string,expiry=Date.now()+7200000){if(!secret)throw Error('인증 설정을 확인해 주세요.');return expiry+'.'+createHmac('sha256',secret).update(`${shop}:${customer}:${expiry}`).digest('hex');}
export function verifyDemandToken(token:string,shop:string,customer:string,secret:string){const [expiry]=token.split('.');if(!/^\d+$/.test(expiry)||Number(expiry)<Date.now()||Number(expiry)>Date.now()+7200000)return false;const expected=demandToken(shop,customer,secret,Number(expiry));return token.length===expected.length&&timingSafeEqual(Buffer.from(token),Buffer.from(expected));}
export function demandInput(form:FormData){
 const title=String(form.get('title')||'').trim(),description=String(form.get('description')||'').trim();
 if(!title||title.length>240||description.length>2000)throw Error('와인명은 240자, 소개는 2,000자 이내로 입력해 주세요.');
 const safeUrl=(key:string)=>{const value=String(form.get(key)||'').trim();if(!value)return '';const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||value.length>2048)throw Error('HTTPS 주소를 입력해 주세요.');return u.href;};
 if(!String(form.get('sourceUrl')||'').trim())throw Error('와인 상품 URL을 입력해 주세요.');
 const date=String(form.get('closesAt')||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('마감일을 선택해 주세요.');const closesAt=new Date(date+'T23:59:59+09:00');if(!Number.isFinite(closesAt.getTime())||closesAt.getTime()<=Date.now()||closesAt.getTime()>Date.now()+366*86400000)throw Error('마감일은 오늘부터 1년 이내로 선택해 주세요.');
 return {title,description,imageUrl:safeUrl('imageUrl'),sourceUrl:safeUrl('sourceUrl'),expectedPrice:form.get('expectedPrice')?demandInteger(form.get('expectedPrice'),1,100000000):null,targetQuantity:form.get('targetQuantity')?demandInteger(form.get('targetQuantity'),1,100000):null,closesAt};
}
