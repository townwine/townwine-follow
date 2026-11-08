import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {PrismaClient} from '@prisma/client';
import {readNotificationQuery} from '../app/services/notification-query.server.ts';
import {notificationEmailKey} from '../app/services/resend-delivery.server.ts';

const dir=mkdtempSync(join(tmpdir(),'townwine-mail-test-'));
const datasourceUrl='file:'+join(dir,'test.db');
writeFileSync(join(dir,'test.db'),'');
execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:datasourceUrl},stdio:'pipe'});
const db=new PrismaClient({datasourceUrl});
after(async()=>{await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
function load(file,mocks){const source=readFileSync(new URL('../app/services/'+file,import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in mocks,n);return mocks[n];},console,Date,Response});return exports;}
async function harness({status='ACTIVE',mode='live',published=true,future=false,stock=10,multi=false,emails=true}={}){
 const shop=randomUUID()+'.myshopify.com',productId='gid://shopify/Product/2';const attempts=[];let fail=false,hold=null,continuations=0,continuationFails=false;
 await db.demandSurvey.create({data:{shop,ownerId:'9',ownerName:'Host',title:'Wine',description:'',imageUrl:'',sourceUrl:'',closesAt:new Date(),status:'CONVERTED',productId,entries:{create:[{customerId:'1',displayName:'One',quantity:3},{customerId:'2',displayName:'Two',quantity:6}]}}});
 const variant={id:'gid://shopify/ProductVariant/456',inventoryQuantity:stock,inventoryPolicy:'DENY',inventoryItem:{tracked:true}};
 const product={status,title:'<Wine>',handle:'wine',onlineStoreUrl:published?'https://town.wine/products/wine':null,openAt:future?{value:new Date(Date.now()+600000).toISOString()}:null,variants:{nodes:multi?[variant,{...variant,id:'gid://shopify/ProductVariant/789'}]:[variant]}};
 const admin={graphql:async(query,{variables})=>Response.json({data:query.includes('DemandPaymentProduct')?{product}:{customer:emails?{email:variables.id.endsWith('/1')?'one@example.invalid':'two@example.invalid'}:null}})};
 const service=load('demand-payment-email.server.ts',{'../shopify.server':{unauthenticated:{admin:async()=>({admin})}},'./product-webhook-processing.server':{processProductWebhookEvent:async()=>{continuations++;return {notification:{failedCount:continuationFails?1:0}};}},'node:crypto':{randomUUID},'../db.server':{prisma:db},'./notification-query.server':{readNotificationQuery},'./resend-delivery.server':{notificationEmailKey},'./email.server':{getEmailDeliveryRuntimeStatus:()=>({mode}),deliverEmailMessage:async p=>{attempts.push(p);if(hold)await hold;if(fail&&p.to==='two@example.invalid')throw Error('transient');return {mode:'resend',isTestOverride:false};}}});
 return {continuations:()=>continuations,failContinuation:value=>{continuationFails=value;},shop,productId,product,admin,attempts,service,run:()=>service.ensureDemandPaymentEmails({admin,shop,productId}),fail:()=>{fail=true;},recover:()=>{fail=false;},hold:p=>{hold=p;}};
}
test('real SQLite migration, participant quantities and repeat delivery deduplication',async()=>{
 const h=await harness();const first=await h.run();assert.equal(first.ready,true);assert.equal(h.attempts.length,2);
 assert.match(h.attempts[0].text,/https:\/\/town.wine\/cart\/456:3/);assert.match(h.attempts[1].text,/cart\/456:6/);assert.match(h.attempts[0].html,/&lt;Wine&gt;/);
 await h.run();assert.equal(h.attempts.length,2);assert.equal(await db.demandPaymentEmail.count({where:{shop:h.shop,status:'SENT'}}),2);
});
test('draft, unpublished, scheduled, sold-out and test-mode products do not send',async()=>{
 for(const options of [{status:'DRAFT'},{published:false},{future:true},{stock:0},{mode:'log-only'},{mode:'test-override'}]){const h=await harness(options);assert.equal((await h.run()).ready,false);assert.equal(h.attempts.length,0);}
});
test('partial failure holds general delivery; retry freezes payload and sends only failed recipient',async()=>{
 const h=await harness();h.fail();assert.equal((await h.run()).ready,false);assert.equal(h.attempts.length,2);
 h.product.title='Changed title';h.recover();assert.equal((await h.run()).ready,true);assert.equal(h.attempts.length,3);assert.deepEqual(h.attempts[1],h.attempts[2]);
});
test('simultaneous workers cannot pass the barrier or duplicate in-flight recipients',async()=>{
 const h=await harness();let release;const hold=new Promise(r=>{release=r;});h.hold(hold);
 const first=h.run();while(!h.attempts.length)await new Promise(r=>setTimeout(r,5));
 const second=h.run();while(h.attempts.length<2)await new Promise(r=>setTimeout(r,5));
 assert.equal((await h.run()).ready,false);release();await Promise.all([first,second]);assert.equal((await h.run()).ready,true);assert.equal(h.attempts.length,2);
});
test('missing customer email is recorded as skipped, not falsely sent',async()=>{
 const h=await harness({emails:false});assert.equal((await h.run()).ready,true);assert.equal(h.attempts.length,0);assert.equal(await db.demandPaymentEmail.count({where:{shop:h.shop,status:'SKIPPED',sentAt:null}}),2);
});
test('multi-wine products link to product selection instead of guessing a variant',async()=>{
 const h=await harness({multi:true});await h.run();assert.match(h.attempts[0].text,/구매·결제하기: https:\/\/town.wine\/products\/wine/);assert.doesNotMatch(h.attempts[0].text,/\/cart\//);
});
test('GraphQL errors remain pending and do not fall through to general announcements',async()=>{
 const h=await harness();h.admin.graphql=async()=>Response.json({errors:[{message:'Denied'}]});await assert.rejects(h.run());assert.equal(h.attempts.length,0);
});
test('unrelated products and shops are not blocked',async()=>{
 const h=await harness();const result=await h.service.ensureDemandPaymentEmails({admin:h.admin,shop:'other.myshopify.com',productId:h.productId});assert.equal(result.ready,true);assert.equal(h.attempts.length,0);
});

test('scheduled open alerts wait for participants and do not resend to participants',async()=>{
 let ready=false;const sent=[],cleaned=[];const productId='gid://shopify/Product/2';
 const service=load('open-alert.server.ts',{
  './demand-payment-email.server':{ensureDemandPaymentEmails:async()=>({ready,customerIds:['1']})},
  './resend-delivery.server':{notificationEmailKey},
  '../db.server':{prisma:{upcomingDealAlertSubscription:{findMany:async()=>[{id:'a',productId,customerId:'1'},{id:'b',productId,customerId:'2'}],deleteMany:async p=>{cleaned.push(...p.where.id.in);}}}},
  './follow.server':{reserveNotificationSend:async()=>({reserved:true}),releaseNotificationSendReservation:async()=>{}},
  './email.server':{getEmailDeliveryRuntimeStatus:()=>({provider:'resend',mode:'live'}),sendUpcomingOpenAlertEmail:async p=>{sent.push(p);return {mode:'resend',isTestOverride:false};}},
  './follow-email-template.server':{loadFollowEmailTemplateConfigSafe:async()=>({})},
  './open-at-label.server':{formatOpenAtLabel:()=>''},
  './product-collector.server':{resolveProductInfluencerHandle:()=> 'host'},
  './product-status.server':{hasOnlineStoreUrl:Boolean,isActiveProductStatus:s=>s==='ACTIVE'}
 });
 const params={shop:'store.myshopify.com',admin:{graphql:async(query)=>Response.json({data:query.includes('OpenAlertCustomer')?{customer:{id:'2',email:'two@example.invalid'}}:{nodes:[{id:productId,status:'ACTIVE',title:'Wine',onlineStoreUrl:'https://town.wine/products/wine',openAtKst:{value:'2026-01-01T00:00:00Z'}}]}})}};
 await service.processDueOpenAlerts(params);assert.equal(sent.length,0);assert.equal(cleaned.length,0);
 ready=true;await service.processDueOpenAlerts(params);assert.equal(sent.length,1);assert.equal(sent[0].to,'two@example.invalid');assert.deepEqual(cleaned,['a','b']);
});

test('abandoned leases recover and sent records remain immutable',async()=>{
 const h=await harness();h.fail();await h.run();
 await db.demandPaymentEmail.updateMany({where:{shop:h.shop,status:'PENDING'},data:{leaseToken:'abandoned',leaseAt:new Date(Date.now()-700000)}});
 h.recover();assert.equal((await h.run()).ready,true);assert.equal(h.attempts.length,3);
 const rows=await db.demandPaymentEmail.findMany({where:{shop:h.shop}});assert.ok(rows.every(r=>r.status==='SENT'&&r.leaseToken===null));
});


test('worker durably resumes general announcements and stops after successful handoff',async()=>{
 await db.demandSurvey.deleteMany();
 const h=await harness();h.failContinuation(true);
 await h.service.retryDemandPaymentEmails();assert.equal(h.continuations(),1);assert.equal(h.attempts.length,2);
 assert.equal((await db.demandSurvey.findFirst({where:{shop:h.shop}})).paymentAnnouncementsReleasedAt,null);
 h.failContinuation(false);await h.service.retryDemandPaymentEmails();assert.equal(h.continuations(),2);assert.equal(h.attempts.length,2);
 assert.ok((await db.demandSurvey.findFirst({where:{shop:h.shop}})).paymentAnnouncementsReleasedAt);
 await h.service.retryDemandPaymentEmails();assert.equal(h.continuations(),2);
});
