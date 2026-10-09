import { load } from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
export function allowedProductAddress(address:string) {
  if(isIP(address)!==4)return false; // IPv6 endpoints may be added with equivalent public-range checks.
  const [a,b]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
}
export function productUrl(value:string) {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hostname.endsWith('.local')||u.hostname==='localhost'||(isIP(u.hostname)!==0&&!allowedProductAddress(u.hostname))||u.hostname.startsWith('[')||u.href.length>2048)throw new Error('공개 판매처의 HTTPS 상품 주소를 입력해 주세요.');
  return u;
}
export async function fetchProductHtml(value:string, redirects=0):Promise<{html:string;url:string}> {
  const u=productUrl(value);
  const addresses=await lookup(u.hostname,{all:true,family:4});
  if(!addresses.length||addresses.some(a=>!allowedProductAddress(a.address)))throw new Error('이 주소는 조회할 수 없습니다.');
  const address=addresses[0].address;
  return new Promise((resolve,reject)=>{
    const req=https.get(u,{family:4,lookup:(_host,_opts,cb)=>cb(null,address,4),headers:{'User-Agent':'TownWineProductPreview/1.0','Accept':'text/html'}},res=>{
      if([301,302,303,307,308].includes(res.statusCode||0)){
        res.resume();if(redirects>=3||!res.headers.location)return reject(new Error('주소 이동이 너무 많습니다.'));
        fetchProductHtml(new URL(res.headers.location,u).href,redirects+1).then(resolve,reject);return;
      }
      if(res.statusCode!==200||!String(res.headers['content-type']).includes('text/html')){res.resume();reject(new Error('판매처가 조회를 허용하지 않거나 상품 페이지가 아닙니다.'));return;}
      const parts:Buffer[]=[];let size=0;
      res.on('data',(part:Buffer)=>{size+=part.length;if(size>2000000){req.destroy(new Error('상품 페이지가 너무 큽니다.'));return;}parts.push(part);});
      res.on('end',()=>resolve({html:Buffer.concat(parts).toString('utf8'),url:u.href}));res.on('error',reject);
    });
    const timer=setTimeout(()=>req.destroy(new Error('판매처 응답 시간이 초과되었습니다.')),10000);req.on('close',()=>clearTimeout(timer));req.on('error',reject);
  });
}
export async function fetchLabelImage(value:string, redirects=0):Promise<Buffer> {
  const u=productUrl(value);
  const addresses=await lookup(u.hostname,{all:true,family:4});
  if(!addresses.length||addresses.some(a=>!allowedProductAddress(a.address)))throw new Error('이 주소는 조회할 수 없습니다.');
  const address=addresses[0].address;
  return new Promise((resolve,reject)=>{
    const req=https.get(u,{family:4,lookup:(_host,_opts,cb)=>cb(null,address,4),headers:{'User-Agent':'TownWineProductPreview/1.0','Accept':'image/*'}},res=>{
      if([301,302,303,307,308].includes(res.statusCode||0)){
        res.resume();if(redirects>=3||!res.headers.location)return reject(new Error('주소 이동이 너무 많습니다.'));
        fetchLabelImage(new URL(res.headers.location,u).href,redirects+1).then(resolve,reject);return;
      }
      if(res.statusCode!==200||!/^image\/(jpeg|png|webp)(;|$)/i.test(String(res.headers['content-type']))){res.resume();reject(new Error('판매처가 조회를 허용하지 않거나 상품 페이지가 아닙니다.'));return;}
      const parts:Buffer[]=[];let size=0;
      res.on('data',(part:Buffer)=>{size+=part.length;if(size>10*1024*1024){req.destroy(new Error('상품 페이지가 너무 큽니다.'));return;}parts.push(part);});
      res.on('end',()=>resolve(Buffer.concat(parts)));res.on('error',reject);
    });
    const timer=setTimeout(()=>req.destroy(new Error('판매처 응답 시간이 초과되었습니다.')),10000);req.on('close',()=>clearTimeout(timer));req.on('error',reject);
  });
}
export function parseDemandProduct(html:string,url:string) {
  const $=load(html);const products:Record<string,any>[]=[];
  function walk(v:any){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}if([v['@type']].flat().includes('Product'))products.push(v);if(v['@graph'])walk(v['@graph']);}
  $('script[type="application/ld+json"]').each((_i,e)=>{try{walk(JSON.parse($(e).text()));}catch{ /* Some stores include invalid JSON-LD. */ }});
  const p=products.length===1?products[0]:undefined;
  const offers=p?[p.offers||[]].flat():[];
  const o=offers.length===1?offers[0]:undefined;
  const priceText=o?.price??$('meta[property="product:price:amount"]').attr('content');
  const price=priceText!==undefined&&/^\d+(\.\d+)?$/.test(String(priceText))?Number(priceText):null;
  const currency=String(o?.priceCurrency||$('meta[property="product:price:currency"]').attr('content')||'').toUpperCase();
  const title=String(p?.name||$('meta[property="og:title"]').attr('content')||$('h1').first().text()).trim().slice(0,240);
  let image=String([p?.image].flat()[0]?.url||[p?.image].flat()[0]||$('meta[property="og:image"]').attr('content')||'');
  try{image=image?productUrl(new URL(image,url).href).href:'';}catch{image='';}
  const shipping=[o?.shippingDetails||[]].flat().map((s:any)=>({country:s.shippingDestination?.addressCountry||'',price:s.shippingRate?.value??null,currency:s.shippingRate?.currency||'',minDays:s.deliveryTime?.transitTime?.minValue??null,maxDays:s.deliveryTime?.transitTime?.maxValue??null}));
  return {url,title,image,price:price&&price>0?price:null,currency:/^[A-Z]{3}$/.test(currency)?currency:null,shipping,requiresReview:true,multipleProducts:products.length>1,multipleOffers:offers.length>1};
}
