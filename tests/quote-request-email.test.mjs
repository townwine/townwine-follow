import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(deps={}){
 const source=readFileSync(new URL('../app/services/quote-request-email.server.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:name=>{if(!(name in deps))throw Error(name);return deps[name];},console,Date,encodeURIComponent});return exports;
}
function harness({mode='live',fail=false}={}){
 const row={id:'request',shop:'town-wine.myshopify.com',customerId:'1',productId:'gid://shopify/Product/123',status:'CREATED',requestEmailLeaseAt:null,requestEmailSentAt:null,requestEmailCheckedAt:null,sheetPayload:JSON.stringify({country:'US',sourceUrl:'https://merchant.example/wine',input:{bottles:6}})};
 const calls=[];
 const db={updateMany:async({where,data})=>{if(data.requestEmailLeaseAt){if(row.status!==where.status||!row.productId||row.requestEmailLeaseAt||row.requestEmailSentAt)return {count:0};}else if(row.requestEmailLeaseAt!==where.requestEmailLeaseAt)return {count:0};Object.assign(row,data);return {count:1};},findUniqueOrThrow:async()=>row,findMany:async()=>row.requestEmailSentAt?[]:[row],update:async({data})=>Object.assign(row,data)};
 const service=load({'../db.server':{prisma:{quoteDraftRequest:db}},'./email.server':{getEmailDeliveryRuntimeStatus:()=>({mode}),deliverEmailMessage:async p=>{calls.push(p);assert.equal(p.to,'info@town.wine');if(fail)throw Error('network');return {mode:'resend',isTestOverride:false};}},'../shopify.server':{unauthenticated:{admin:async()=>({admin:{graphql:async()=>({json:async()=>({data:{product:{title:'<Wine>',handle:'wine'}}})})}})}}});
 return {service,row,calls};
}
test('request registration sends one escaped notification with request and draft details',async()=>{
 const h=harness();await Promise.all([h.service.notifyQuoteRequestRegistered('request'),h.service.notifyQuoteRequestRegistered('request')]);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].subject,'[타운와인] 공구 요청이 등록됐습니다');assert(h.calls[0].text.includes('6병'));assert(h.calls[0].text.includes('https://merchant.example/wine'));assert(h.calls[0].text.includes('/products/123'));assert(h.calls[0].html.includes('&lt;Wine&gt;'));assert(h.row.requestEmailSentAt);assert.equal(h.row.requestEmailLeaseAt,null);
});
test('non-live email mode does not send or mark sent',async()=>{
 for(const mode of ['log-only','test-override']){const h=harness({mode});await h.service.notifyQuoteRequestRegistered('request');assert.equal(h.calls.length,0);assert.equal(h.row.requestEmailSentAt,null);}
});
test('failed delivery clears lease and remains retryable',async()=>{
 const h=harness({fail:true});await assert.rejects(h.service.notifyQuoteRequestRegistered('request'));assert.equal(h.row.requestEmailSentAt,null);assert.equal(h.row.requestEmailLeaseAt,null);
});
