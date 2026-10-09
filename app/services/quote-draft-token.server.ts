import {createHmac,timingSafeEqual} from 'node:crypto';
import type {QuoteInput} from './demand-quote';
import type {calculateDemandQuote} from './demand-quote';
type Quoted=ReturnType<typeof calculateDemandQuote>;
type SignedQuote={shop:string;customerId:string;input:QuoteInput;quote:Quoted;expires:number};
function sign(value:string,secret:string){if(!secret)throw new Error('견적 인증 설정이 필요합니다.');return createHmac('sha256',secret).update(value).digest();}
export function issueQuoteToken(data:Omit<SignedQuote,'expires'>,secret:string,now=Date.now()){
 const body=Buffer.from(JSON.stringify({...data,expires:now+3600000})).toString('base64url');return body+'.'+sign(body,secret).toString('base64url');
}
export function readQuoteToken(token:string,shop:string,customerId:string,input:QuoteInput,secret:string,now=Date.now()):SignedQuote{
 if(token.length>12000)throw new Error('견적을 다시 계산해 주세요.');
 const [body,signature,extra]=token.split('.');const actual=Buffer.from(signature||'','base64url'),expected=sign(body||'',secret);
 if(extra||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('견적을 다시 계산해 주세요.');
 const data=JSON.parse(Buffer.from(body,'base64url').toString()) as SignedQuote;
 if(data.shop!==shop||data.customerId!==customerId||!customerId||data.expires<now||JSON.stringify(data.input)!==JSON.stringify(input))throw new Error('로그인 후 현재 조건으로 견적을 다시 계산해 주세요.');
 return data;
}
