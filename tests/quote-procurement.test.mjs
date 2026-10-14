import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(name,deps={}){
  const source=readFileSync(new URL('../app/services/'+name,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,require:name=>{if(!(name in deps))throw Error(name);return deps[name];},console,Date,URL,encodeURIComponent,setInterval});
  return exports;
}
const data=load('quote-procurement-data.server.ts',{'./notification-query.server':{readNotificationQuery:async r=>{const result=await r.json();if(!r.ok||result.errors||!result.data)throw Error('query failed');return result;}}});
const page=(nodes,hasNextPage=false,endCursor=null)=>({nodes,pageInfo:{hasNextPage,endCursor}});
const product={title:'Wine',handle:'wine',status:'ACTIVE',request:null,variants:page([{inventoryQuantity:0,inventoryPolicy:'DENY',inventoryItem:{tracked:true}}])};
const registration={title:'<Wine>',sourceUrl:'https://merchant.example/wine',quantity:6,unitPrice:'123.45',currency:'HKD'};
const line=(currentQuantity,id='product')=>({currentQuantity,product:{id}});
const order=(id,lines,extra={})=>({id,test:false,cancelledAt:null,displayFinancialStatus:'PAID',lineItems:page(lines),...extra});

test('registered amount uses exact registered unit price multiplied by bottles',()=>{
  assert.equal(data.registeredTotal(registration),'740.70');
  assert.equal(data.registeredTotal({...registration,unitPrice:'134927',currency:'KRW'}),'809562.00');
  assert.throws(()=>data.registeredTotal({...registration,quantity:0}));
});
test('only active, fully tracked, deny-overselling, zero-stock products are sold out',()=>{
  assert.equal(data.isSoldOut(product),true);
  for(const p of [null,{...product,status:'DRAFT'},{...product,variants:page([])},{...product,variants:page(product.variants.nodes,true,'more')},...[{inventoryQuantity:1},{inventoryQuantity:null},{inventoryPolicy:'CONTINUE'},{inventoryItem:{tracked:false}}].map(v=>({...product,variants:page([{...product.variants.nodes[0],...v}])}))])assert.equal(data.isSoldOut(p),false);
});
test('paid ledger excludes unpaid/test/cancelled orders and replaces refunded quantities',async()=>{
  const rows=[order('paid',[line(6),line(10,'other')]),order('refund',[line(2)],{displayFinancialStatus:'PARTIALLY_REFUNDED'}),order('cancel',[line(8)],{cancelledAt:'now'}),order('pending',[line(8)],{displayFinancialStatus:'PENDING'}),order('test',[line(8)],{test:true}),order('fully-refunded',[line(0)],{displayFinancialStatus:'REFUNDED'})];
  const admin={graphql:async()=>({ok:true,json:async()=>({data:{orders:page(rows)}})})};
  const ledger=await data.refreshPaidQuantities(admin,'product',{checkpoint:new Date().toISOString(),orders:{refund:4,cancel:8,'fully-refunded':3}});
  assert.deepEqual(JSON.parse(JSON.stringify(ledger.orders)),{paid:6,refund:2});
  const repeat=await data.refreshPaidQuantities(admin,'product',ledger);
  assert.deepEqual(JSON.parse(JSON.stringify(repeat.orders)),{paid:6,refund:2});
});
test('paginates orders and line items without silently truncating quantities',async()=>{
  const calls=[];
  const admin={graphql:async(q,{variables:v})=>{calls.push(v);return {ok:true,json:async()=>({data:q.includes('ProcurementOrderLines')?{order:{lineItems:page([line(4)])}}:{orders:v.after?page([order('second',[line(2)])]):page([order('first',[],{lineItems:page([line(1,'other')],true,'line-next')})],true,'order-next')}})}}};
  const ledger=await data.refreshPaidQuantities(admin,'product',{checkpoint:new Date().toISOString(),orders:{}});
  assert.equal(ledger.orders.first,4);assert.equal(ledger.orders.second,2);assert.equal(calls.length,3);
});
test('API failure and missing historical coverage fail closed',async()=>{
  const admin={graphql:async()=>({ok:true,json:async()=>({errors:[{}]})})};
  await assert.rejects(data.refreshPaidQuantities(admin,'product',{checkpoint:new Date().toISOString(),orders:{}}));
  await assert.rejects(data.refreshPaidQuantities(admin,'product',{checkpoint:'2020-01-01',orders:{}}));
});

function harness({stock=product,paid=6,failRecipient='',mode='live'}={}){
  const row={id:'request',productId:'product',shop:'test.myshopify.com',createdAt:new Date(),procurementRegistration:JSON.stringify(registration),procurementState:null,procurementLeaseAt:null,procurementSentAt:null};
  const calls=[];let failure=failRecipient;
  const db={findUniqueOrThrow:async()=>({...row}),update:async({data})=>Object.assign(row,data),updateMany:async({where,data})=>{
    if(where.OR){if(row.procurementLeaseAt||row.procurementSentAt)return {count:0};}
    else if(where.procurementLeaseAt!==row.procurementLeaseAt)return {count:0};
    Object.assign(row,data);return {count:1};
  }};
  const service=load('quote-procurement.server.ts',{
    '../db.server':{prisma:{quoteDraftRequest:db}},
    './email.server':{getEmailDeliveryRuntimeStatus:()=>({mode}),deliverEmailMessage:async p=>{calls.push(p);if(p.to===failure)throw Error('delivery failed');return {mode:'resend',isTestOverride:false};}},
    './notification-query.server':{refreshingNotificationAdmin:a=>a},
    './quote-procurement-data.server':{...data,queryProcurement:async()=>({product:stock,shop:{currencyCode:'HKD'}}),refreshPaidQuantities:async()=>({checkpoint:new Date().toISOString(),orders:{order:paid}})},
    '../shopify.server':{unauthenticated:{admin:async()=>({admin:{}})}},
  });
  return {service,row,calls,allowDelivery:()=>{failure='';}};
}
test('sold-out registration sends both requested addresses exactly once',async()=>{
  const h=harness();await Promise.all([h.service.processQuoteProcurement('request'),h.service.processQuoteProcurement('request')]);await h.service.processQuoteProcurement('request');
  assert.deepEqual(h.calls.map(x=>x.to),['ted1990@gmail.com','Info@town.wine']);assert(h.row.procurementSentAt);
  for(const mail of h.calls){assert(mail.text.includes('740.70 HKD'));assert(mail.text.includes('6병'));assert(mail.text.includes(registration.sourceUrl));assert(mail.html.includes('&lt;Wine&gt;'));}
});
test('one recipient failure retries only that recipient with a stable key and body',async()=>{
  const h=harness({failRecipient:'Info@town.wine'});await assert.rejects(h.service.processQuoteProcurement('request'));assert.equal(h.row.procurementSentAt,null);assert.equal(h.row.procurementLeaseAt,null);
  h.allowDelivery();await h.service.processQuoteProcurement('request');assert.deepEqual(h.calls.map(x=>x.to),['ted1990@gmail.com','Info@town.wine','Info@town.wine']);assert.equal(h.calls[1].idempotencyKey,h.calls[2].idempotencyKey);assert.equal(h.calls[1].text,h.calls[2].text);assert(h.row.procurementSentAt);
});
test('unpaid target, untracked inventory, draft and log-only mode never send mail',async()=>{
  for(const options of [{paid:5},{stock:{...product,status:'DRAFT'}},{stock:{...product,variants:page([{...product.variants.nodes[0],inventoryItem:{tracked:false}}])}},{mode:'log-only'}]){
    const h=harness(options);try{await h.service.processQuoteProcurement('request');}catch{}assert.equal(h.calls.length,0);assert.equal(h.row.procurementSentAt,null);
  }
});
