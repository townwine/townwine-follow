import test from 'node:test';
import assert from 'node:assert/strict';
import {issueQuoteToken,readQuoteToken} from '../app/services/quote-draft-token.server.ts';
import {calculateDemandQuote,quoteCurrency} from '../app/services/demand-quote.ts';
const secret='test-only-key';const rates={date:'2026-10-09',EUR:1,KRW:1600,USD:1.1,HKD:8.6,GBP:.85,JPY:170};
const base={bottlePrice:700,bottles:6,localShipping:120,origin:'OTHER',ftaConfirmed:false,germanyVatRefund:false,ukLocalTax:2.67};
test('every supported country can carry an authenticated quote for draft registration',()=>{for(const country of Object.keys(quoteCurrency)){const input={...base,country};const quote=calculateDemandQuote(input,rates);const token=issueQuoteToken({shop:'test.myshopify.com',customerId:'123',input,quote},secret,1000);assert.equal(readQuoteToken(token,'test.myshopify.com','123',input,secret,2000).quote.unitHkd,quote.unitHkd);}});
test('tampered, expired, changed customer and changed amount quotes are rejected',()=>{const input={...base,country:'HK'},quote=calculateDemandQuote(input,rates);const token=issueQuoteToken({shop:'test.myshopify.com',customerId:'123',input,quote},secret,1000);for(const args of [[token+'x','test.myshopify.com','123',input,secret,2000],[token,'test.myshopify.com','999',input,secret,2000],[token,'test.myshopify.com','123',{...input,bottlePrice:1},secret,2000],[token,'test.myshopify.com','123',input,secret,3601001],[token,'other.myshopify.com','123',input,secret,2000]])assert.throws(()=>readQuoteToken(...args));});
