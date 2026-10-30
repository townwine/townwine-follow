import {registrationCountries, type QuoteCountry} from './demand-quote';

export const groupBuySuppliers:Record<QuoteCountry,string>={FR:'GV Globus France',US:'townwine US-OR',JP:'townwine JP',HK:'townwine HK',DE:'Menetz International GmbH',GB:'GV Globus UK'};
const KST=9*60*60*1000;
export function parseGroupSchedule(openDate:string,purchaseAt:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(openDate)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(purchaseAt))throw Error('공구 오픈일과 매입 예정 일시를 입력해 주세요.');
 const opening=new Date(openDate+'T00:00:00+09:00'),purchase=new Date(purchaseAt+':00+09:00');
 const local=(d:Date)=>new Date(d.getTime()+KST).toISOString().slice(0,16);
 if(!Number.isFinite(opening.getTime())||!Number.isFinite(purchase.getTime())||local(opening).slice(0,10)!==openDate||local(purchase)!==purchaseAt||purchase<opening)throw Error('매입 예정 일시는 공구 오픈일 이후의 올바른 한국시간으로 입력해 주세요.');
 return {openDate,purchaseAtKst:purchaseAt+':00+09:00'};
}
export function groupBuyTitle(title:string,collector:string,openDate:string){
 const name=collector.trim();
 return `${openDate.replaceAll('-','.')} ${name.endsWith('님')?name:name+'님'} pick - ${title}`;
}
export function shippingPolicy(countries:QuoteCountry[]){
 const unique=[...new Set(countries)];
 if(!unique.length||unique.some(c=>!Object.hasOwn(groupBuySuppliers,c)))throw Error('배송 출발 국가를 확인해 주세요.');
 const origin=unique.map(c=>registrationCountries[c]).join(' · ');
 const exporters=unique.map(c=>unique.length===1?groupBuySuppliers[c]:registrationCountries[c]+' — '+groupBuySuppliers[c]).join(' / ');
 return `✔️ 구매에 참고해주세요!\n1. ${origin}에서 한국으로 배송되는 상품 입니다.${unique.length>1?' 상품별 출발 국가를 확인해주세요.':''}\n2. 개인통관고유부호는 결제화면의 추가정보 칸에 기재해주세요.\n3. 구매수수료, 관세, 주세, 해외 배송비 모두 포함된 가격 입니다.\n4. 배송중 발생한 열화현상은 보상이 어려우므로, 필요시 출고보류 요청해주세요.\n5. 수출자 정보 : ${exporters}`;
}
export function refundPolicy(purchaseAtKst:string){
 const d=new Date(new Date(purchaseAtKst).getTime()+KST);
 if(!Number.isFinite(d.getTime()))throw Error('매입 예정 일시를 확인해 주세요.');
 const hour=d.getUTCHours(),minute=d.getUTCMinutes(),time=(hour<12?'오전':'오후')+' '+(hour%12||12)+'시'+(minute?' '+minute+'분':'');
 return `한국시간 ${d.getUTCMonth()+1}/${d.getUTCDate()}(${'일월화수목금토'[d.getUTCDay()]}) ${time} 매입 예정으로, 이후에는 주문취소가 어렵습니다.\n\n**배송일자 조정을 원하시는 경우 info@town.wine 으로 메일 요청주세요.`;
}
