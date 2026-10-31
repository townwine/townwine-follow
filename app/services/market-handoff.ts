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
