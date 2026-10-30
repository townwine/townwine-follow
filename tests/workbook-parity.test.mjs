import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {calculateDemandQuote} from '../app/services/demand-quote.ts';
const fixtures=JSON.parse(readFileSync(new URL('./workbook-reference.json',import.meta.url)));
const script=readFileSync(new URL('../deploy/quote-sheet-webhook.gs',import.meta.url),'utf8');
for(const f of fixtures)test(f.country+' reproduces workbook row and all calculation columns',()=>{
 const get=name=>f.values[f.headers.findIndex(h=>h.replace(/\s/g,'')===name)];
 const rates={date:'2026-10-30',KRW:1,USD:1/get('USD'),HKD:1/get('HKD'),EUR:f.country==='FR'?1/get('EUR'):1/1494.32,GBP:1/1700,JPY:1/9};
 const input={country:f.country,bottlePrice:f.country==='US'?200:115,bottles:f.country==='US'?1:3,localShipping:f.country==='US'?30:19.9,origin:f.country==='US'?'US':'EU',ftaConfirmed:true,germanyVatRefund:false,ukLocalTax:0};
 const quote=calculateDemandQuote(input,rates);
 assert.equal(quote.unitKrw,get('최종판매가(KRW)'));
 assert.ok(Math.abs(quote.unitHkd-get('최종판매가(HKD)'))<0.000001);
 const ctx={Utilities:{formatDate:()=>rates.date}};vm.createContext(ctx);vm.runInContext(script,ctx);
 const headers=['No','견적번호','상태','이메일','닉네임','입력날짜','상품명','구매병수',...f.headers];
 const row=ctx.quoteRow_(headers,{country:f.country,requestId:'a'.repeat(64),createdAt:'2026-10-30',input,quote},1);
 for(let index=2;index<f.values.length;index++){
  const expected=f.values[index],actual=row[index+8],header=f.headers[index].replace(/\s/g,'');
  if(header==='등록요청ID')continue;
  assert.notEqual(actual,'',header+' must be filled');
  if(typeof expected==='number')assert.ok(Math.abs(actual-expected)<0.000001,header+': '+actual+' != '+expected);
 }
});
