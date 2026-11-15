/** Pass identity only: overseas shelf prices are not landed group-buy prices. */
export function readMarketHandoff(params: URLSearchParams) {
  if(params.get('from')!=='market')return undefined;
  const title=(params.get('wine')||'').trim().slice(0,200);
  try{
    const url=new URL(params.get('source')||'');
    if(!title||url.protocol!=='https:'||url.username||url.password||url.href.length>2048)return undefined;
    const country=params.get('country')||'';
    return {title,url:url.href,country:['US','FR','HK','DE','GB','JP'].includes(country)?country:''};
  }catch{return undefined;}
}
export function marketHandoffUrl(target:'survey'|'register',title:string,source:string,country:string){
 const params=new URLSearchParams(target==='survey'?{view:'new'}:{step:'register'});
 params.set('from','market');params.set('wine',title.slice(0,200));params.set('source',source);
 const code:Record<string,string>={USA:'US',France:'FR','Hong Kong':'HK',Germany:'DE',UK:'GB',Japan:'JP'};
 if(code[country])params.set('country',code[country]);
 return '/apps/townwine-follow/'+(target==='survey'?'demand-surveys':'group-buy-registration')+'?'+params;
}

/** Editable survey estimates only; never used to authorize a purchase. */
export function readCalculatorHandoff(params:URLSearchParams){
 if(params.get('from')!=='calculator')return undefined;
 const price=params.get('expectedPrice')||'',quantity=params.get('quantity')||'';
 if(!/^[1-9]\d*$/.test(price)||!/^[1-9]\d*$/.test(quantity))return undefined;
 const expectedPrice=Number(price),targetQuantity=Number(quantity);
 if(!Number.isSafeInteger(expectedPrice)||expectedPrice>100000000||!Number.isSafeInteger(targetQuantity)||targetQuantity>10000)return undefined;
 return {expectedPrice,targetQuantity};
}
export function calculatorHandoffUrl(value:{expectedPrice:number;targetQuantity:number}){
 return '/apps/townwine-follow/demand-surveys?'+new URLSearchParams({view:'new',from:'calculator',expectedPrice:String(value.expectedPrice),quantity:String(value.targetQuantity)});
}

/** Same-tab draft only; failures (e.g. private storage restrictions) retain URL handoff. */
export const calculatorDraftScript = `
const calculatorDraftKey='townwine.calculator-survey.v1';
function validCalculatorDraft(value){return value&&Number.isSafeInteger(value.expectedPrice)&&value.expectedPrice>0&&value.expectedPrice<=100000000&&Number.isSafeInteger(value.targetQuantity)&&value.targetQuantity>0&&value.targetQuantity<=10000;}
function saveCalculatorDraft(value){try{if(validCalculatorDraft(value))sessionStorage.setItem(calculatorDraftKey,JSON.stringify({...value,savedAt:Date.now()}));else sessionStorage.removeItem(calculatorDraftKey);}catch{}}
function loadCalculatorDraft(){try{const value=JSON.parse(sessionStorage.getItem(calculatorDraftKey)||'null');if(validCalculatorDraft(value)&&Number.isFinite(value.savedAt)&&Date.now()-value.savedAt>=0&&Date.now()-value.savedAt<2*60*60*1000)return value;sessionStorage.removeItem(calculatorDraftKey);}catch{}return null;}
function calculatorDraftUrl(value){return '/apps/townwine-follow/demand-surveys?'+new URLSearchParams({view:'new',from:'calculator',expectedPrice:String(value.expectedPrice),quantity:String(value.targetQuantity)});}
`;
