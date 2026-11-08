import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {calculateDemandQuote,quoteCurrency} from '../app/services/demand-quote.ts';
import {issueQuoteToken,readQuoteToken} from '../app/services/quote-draft-token.server.ts';
const rates={date:'2026-11-08',KRW:1,HKD:1/173.8875,GBP:1/1823.06,USD:1/1363.8,EUR:1/1519.56,JPY:1/9};
const input={country:'HK',bottlePrice:100,bottles:6,localShipping:12,origin:'OTHER',ftaConfirmed:false,germanyVatRefund:false,ukLocalTax:2.76,hkViaUk:true,currency:'GBP'};
function parser(){const exports={};const code=ts.transpileModule(readFileSync(new URL('../app/services/quote-preview.server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(code,{exports,require:n=>n==='./demand-quote'?{quoteCurrency}:{},FormData,URL,Object,Number,Map});return exports.parseRegistrationInput;}
test('HK GBP follows workbook currency conversion and retains HK freight and fees',()=>{
 const q=calculateDemandQuote(input,rates);assert.equal(q.currency,'GBP');assert.equal(q.country,'HK');
 assert.equal(q.goods,182306);assert.equal(q.localShipping,3646.12);assert.equal(q.bankFee,(182306+3646.12)*.02);assert.equal(q.internationalShipping,22000);assert.equal(q.platformRate,.04);
 const equivalent=calculateDemandQuote({...input,currency:undefined,bottlePrice:input.bottlePrice*1823.06/173.8875,localShipping:input.localShipping*1823.06/173.8875},rates);
 assert.equal(q.unitKrw,equivalent.unitKrw);assert.equal(q.unitHkd,equivalent.unitHkd);
 assert.equal(calculateDemandQuote({...input,hkViaUk:false},rates).bankFee,0);
});
test('parser accepts HK GBP, rejects unsupported combinations, and binds currency in quote token',()=>{
 const f=new FormData();for(const [k,v] of Object.entries({destination:'HK',currency:'GBP',price:'100',quantity:'6',localShipping:'12',origin:'OTHER',hkViaUk:'on'}))f.set(k,v);
 const parse=parser(),i=parse(f);assert.equal(i.currency,'GBP');const q=calculateDemandQuote(i,rates),token=issueQuoteToken({shop:'test',customerId:'1',input:i,quote:q},'secret');
 assert.equal(readQuoteToken(token,'test','1',i,'secret').quote.currency,'GBP');
 f.set('currency','HKD');const hkd=parse(f);assert.equal(hkd.currency,undefined);assert.throws(()=>readQuoteToken(token,'test','1',hkd,'secret'));
 f.set('currency','USD');assert.throws(()=>parse(f));f.set('destination','FR');f.set('currency','GBP');assert.throws(()=>parse(f));
});
test('sheet stores selected currency, original GBP amounts and separate HKD conversions',()=>{
 const context={};vm.createContext(context);vm.runInContext(readFileSync(new URL('../deploy/quote-sheet-webhook.gs',import.meta.url),'utf8'),context);
 for(const currency of ['GBP','HKD']){
 const i={...input,currency},q=calculateDemandQuote(i,rates),row=Array(47).fill('');context.fillCountryRow_(row,{country:'HK',input:i,quote:q});
 const cell=col=>row[[...col].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1];
 assert.equal(cell('T'),currency);assert.equal(cell('U'),100);assert.equal(cell('V'),12);assert.equal(cell('W'),2);
 assert.ok(Math.abs(cell('X')-2.04)<1e-10);assert.equal(cell('Y'),q.goods/173.8875);assert.equal(cell('Z'),q.localShipping/173.8875);assert.equal(cell('AD'),q.bankFee);assert.equal(cell('AT'),q.unitKrw);
 }
});
