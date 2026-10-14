import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
function load(path,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(!(n in deps))throw Error(n);return deps[n];},Response,URL,console});return exports;}
const service=load('services/order-status.server.ts');
const order={id:'gid://shopify/Order/1',legacyResourceId:'1',customer:{legacyResourceId:'42'},cancelledAt:null,displayFinancialStatus:'PAID',displayFulfillmentStatus:'FULFILLED',fulfillments:[]};
const parcel={id:'parcel',status:'SUCCESS',displayStatus:'IN_TRANSIT',createdAt:'2026-10-14',estimatedDeliveryAt:null,inTransitAt:null,deliveredAt:null,trackingInfo:[{company:'Carrier',number:'123',url:'https://example.com/track'}]};
test('shipping stages distinguish preparation, dispatch, transit and delivery',()=>{
  assert.equal(service.orderSnapshot({...order,displayFulfillmentStatus:'UNFULFILLED'}).stage,1);
  for(const [displayStatus,stage] of [['MARKED_AS_FULFILLED',2],['IN_TRANSIT',3],['OUT_FOR_DELIVERY',3],['DELIVERED',4]])assert.equal(service.orderSnapshot({...order,fulfillments:[{...parcel,displayStatus}]}).stage,stage);
});
test('partial delivery and canceled parcels cannot complete an order',()=>{
  const delivered={...parcel,displayStatus:'DELIVERED'};
  assert.notEqual(service.orderSnapshot({...order,displayFulfillmentStatus:'PARTIALLY_FULFILLED',fulfillments:[delivered]}).bucket,'delivered');
  assert.notEqual(service.orderSnapshot({...order,fulfillments:[delivered,parcel]}).bucket,'delivered');
  assert.equal(service.orderSnapshot({...order,fulfillments:[delivered,{...parcel,status:'CANCELLED'}]}).bucket,'delivered');
  assert.notEqual(service.orderSnapshot({...order,fulfillments:Array(100).fill(delivered)}).bucket,'delivered');
});
test('canceled, refunded and unpaid orders do not claim payment or delivery completion',()=>{
  for(const changes of [{cancelledAt:'2026-10-14'},{displayFinancialStatus:'REFUNDED'},{displayFinancialStatus:'PENDING'},{displayFinancialStatus:'VOIDED'}]){const r=service.orderSnapshot({...order,...changes,fulfillments:[parcel]});assert.equal(r.bucket,'other');assert.equal(r.stage,-1);if(changes.displayFinancialStatus==='REFUNDED')assert.equal(r.label,'환불됨');}
});
test('all tracking numbers preserved and unsafe tracking URLs removed',()=>{
  const r=service.orderSnapshot({...order,fulfillments:[{...parcel,trackingInfo:[...parcel.trackingInfo,{number:'456',url:'javascript:alert(1)'}]}]});
  assert.equal(r.shipments[0].tracking.length,2);assert.equal(r.shipments[0].tracking[1].url,'');
});
test('only authenticated customer ownership is returned, with strict ID and batch limits',async()=>{
  const admin={graphql:async()=>Response.json({data:{nodes:[order,{...order,id:'gid://shopify/Order/2',legacyResourceId:'2',customer:{legacyResourceId:'99'}},null]}})};
  const result=await service.getOrderStatusSnapshots({admin,orderIds:['1','2'],customerId:'42'});assert.equal(result.length,1);assert.equal(result[0].orderId,'1');
  assert.equal((await service.getOrderStatusSnapshots({admin,orderIds:['x1'],customerId:'42'})).length,0);
  await assert.rejects(service.getOrderStatusSnapshots({admin,orderIds:Array.from({length:51},(_,i)=>String(i+1)),customerId:'42'}));
});
test('GraphQL errors fail closed instead of inventing paid status',async()=>{
  await assert.rejects(service.getOrderStatusSnapshots({admin:{graphql:async()=>Response.json({errors:[{message:'denied'}]})},orderIds:['1'],customerId:'42'}));
});
test('route rejects forged signatures, missing identity and duplicate identity; private responses',async()=>{
  let valid=true,queries=0;
  const route=load('routes/apps.townwine-follow.order-status.ts',{'../shopify.server':{authenticate:{public:{appProxy:async()=>{if(!valid)throw Error('invalid signature');return {admin:{}};}}}},'../services/follow-request.server':{readOrderStatusRequest:async()=>({orderIds:['1']})},'../services/order-status.server':{getOrderStatusSnapshots:async()=>{queries++;return [];}}});
  for(const search of ['', '?logged_in_customer_id=42&logged_in_customer_id=99'])assert.equal((await route.loader({request:new Request('https://example.com/'+search)})).status,401);
  valid=false;assert.equal((await route.loader({request:new Request('https://example.com/?logged_in_customer_id=42')})).status,401);assert.equal(queries,0);
  valid=true;const result=await route.loader({request:new Request('https://example.com/?logged_in_customer_id=42')});assert.equal(result.status,200);assert.match(result.headers.get('Cache-Control'),/no-store/);assert.equal(queries,1);
});
