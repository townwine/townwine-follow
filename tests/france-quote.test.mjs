import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {calculateDemandQuote} from '../app/services/demand-quote.ts';
const fixture=JSON.parse(readFileSync(new URL('./france-workbook-20261108.json',import.meta.url)));
const script=readFileSync(new URL('../deploy/quote-sheet-webhook.gs',import.meta.url),'utf8');
const input={country:'FR',bottlePrice:115,bottles:3,localShipping:19.9,origin:'EU',ftaConfirmed:true,germanyVatRefund:false,ukLocalTax:0};
const rates={date:'2026-11-08',KRW:1,USD:1/1363.8,EUR:1/1519.56,HKD:1/173.8875,GBP:1/1700,JPY:1/9};
for(let n=0;n<fixture.rows.length;n++)test('France matches live workbook row '+(n+2)+' and exported calculation columns',()=>{
 const values=fixture.rows[n],i={...input,bottlePrice:values[11],bottles:fixture.quantities[n],localShipping:values[13]};
 const q=calculateDemandQuote(i,rates);
 assert.equal(q.unitKrw,values[35]);assert.equal(q.unitHkd,values[36]);
 const context={Utilities:{formatDate:()=>rates.date}};vm.createContext(context);vm.runInContext(script,context);
 const row=context.quoteRow_(['No','견적번호','상태','이메일','닉네임','입력날짜','상품명','구매병수',...fixture.headers],{country:'FR',requestId:'f'.repeat(64),createdAt:'2026-11-08',input:i,quote:q},1);
 values.forEach((expected,index)=>{if(typeof expected==='number')assert.ok(Math.abs(row[index+8]-expected)<1e-6,fixture.headers[index]+': '+row[index+8]+' != '+expected);});
});
test('France 2kg taxable freight uses 14.92 EUR; actual shipping remains 11.9 EUR',()=>{
 for(const [eur,price,freight] of [[1000,120,14920],[1519.56,115,18500],[1500,159.99,18500],[1500,160,22380],[4000,100,43800]]){
  const q=calculateDemandQuote({...input,bottlePrice:price},{...rates,EUR:1/eur});
  assert.equal(q.taxableFreight,freight);
  assert.equal(q.internationalShipping,11.9*eur+(q.fta?3*eur:0)+5.5*eur);
  assert.equal(q.version,'townwine-sheet-2026-11-08-fr-v4');
 }
});
test('updated freight flows through duty and tax for non-EU wines above threshold',()=>{
 const q=calculateDemandQuote({...input,bottlePrice:240,origin:'OTHER',ftaConfirmed:false},rates);
 const goods=240*1519.56/1.2,freight=14.92*1519.56;
 assert.equal(q.taxBase,goods+freight);
 const duty=Math.round((goods+freight)*.15),liquor=Math.round((goods+freight+duty)*.3),education=Math.round(liquor*.1);
 assert.equal(q.duty,duty);assert.equal(q.liquor,liquor);assert.equal(q.education,education);assert.equal(q.vat,Math.round((goods+freight+duty+liquor+education)*.1));
});
