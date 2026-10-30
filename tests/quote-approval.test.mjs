import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function module(path,deps={}){
 const source=readFileSync(new URL('../app/services/'+path,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:name=>{if(!(name in deps))throw Error(name);return deps[name];},console,Date});return exports;
}
function harness({status='ACTIVE',mode='live',fail=false}={}){
 const row={id:'test',shop:'test.myshopify.com',customerId:'1',productId:'gid://shopify/Product/2',approvalEmailLeaseAt:null,approvalEmailSentAt:null};let calls=0;
 const db={updateMany:async({where,data})=>{if(data.approvalEmailLeaseAt){if(row.approvalEmailLeaseAt||row.approvalEmailSentAt)return {count:0};}else if(row.approvalEmailLeaseAt!==where.approvalEmailLeaseAt)return {count:0};Object.assign(row,data);return {count:1};},findUniqueOrThrow:async()=>row,update:async({data})=>Object.assign(row,data)};
 const service=module('quote-approval.server.ts',{'../db.server':{prisma:{quoteDraftRequest:db}},'./email.server':{getEmailDeliveryRuntimeStatus:()=>({mode}),deliverEmailMessage:async p=>{calls++;assert.equal(p.to,'registrant@example.invalid');assert(p.html.includes('&lt;Wine&gt;'));if(fail)throw Error('network');return {mode:'resend',isTestOverride:false};}},'../shopify.server':{unauthenticated:{admin:async()=>({admin:{graphql:async()=>({json:async()=>({data:{product:{status,title:'<Wine>'},customer:{email:'registrant@example.invalid'}}})})}})}}});
 return {service,row,calls:()=>calls};
}
test('approval sends once, including concurrent and later retries',async()=>{
 const h=harness();await Promise.all([h.service.notifyQuoteApproval('test'),h.service.notifyQuoteApproval('test')]);await h.service.notifyQuoteApproval('test');assert.equal(h.calls(),1);assert(h.row.approvalEmailSentAt);assert.equal(h.row.approvalEmailLeaseAt,null);
});
test('drafts and unconfigured delivery do not send',async()=>{
 for(const config of [{status:'DRAFT'},{mode:'log-only'},{mode:'test-override'}]){const h=harness(config);await h.service.notifyQuoteApproval('test');assert.equal(h.calls(),0);assert.equal(h.row.approvalEmailSentAt,null);}
});
test('failed delivery releases lease and remains retryable',async()=>{
 const h=harness({fail:true});await assert.rejects(h.service.notifyQuoteApproval('test'));assert.equal(h.row.approvalEmailSentAt,null);assert.equal(h.row.approvalEmailLeaseAt,null);
});
test('server forces FTA N for other origins',()=>{
 const service=module('quote-preview.server.ts',{'./demand-quote':{quoteCurrency:{US:'USD',FR:'EUR'}},'node:crypto':{},'./demand-product.server':{}});
 for(const [country,currency,origin,expected] of [['US','USD','OTHER',false],['US','USD','EU',false],['US','USD','US',true],['FR','EUR','EU',true],['FR','EUR','OTHER',false]]){
 const form=new FormData();for(const [k,v] of Object.entries({destination:country,currency,origin,ftaConfirmed:'on',price:'200',quantity:'6',localShipping:'0'}))form.set(k,v);assert.equal(service.parseRegistrationInput(form).ftaConfirmed,expected);
 }
});
test('rendered page contains approval step and valid inline script',()=>{
 const html=module('quote-preview-page.server.ts').renderQuotePreview();assert(html.includes('4. 운영자 승인'));assert(html.includes('공구 등록</h1>'));assert(html.includes('id="ftaStatus"'));new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
