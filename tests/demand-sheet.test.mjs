import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../deploy/quote-sheet-webhook.gs',import.meta.url),'utf8');
function setup(){
 const rows=[];const sheet={getLastRow:()=>rows.length,getMaxRows:()=>1000,setFrozenRows(){},setColumnWidths(){},setColumnWidth(){},hideColumns(){},getRange(r,c,h=1,w=1){return {setValues(v){for(let i=0;i<v.length;i++){rows[r-1+i]??=[];v[i].forEach((x,j)=>rows[r-1+i][c-1+j]=x);}return this;},getValues(){return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>rows[r-1+i]?.[c-1+j]??''));},getValue(){return rows[r-1]?.[c-1];},setNumberFormat(){return this;},setFontWeight(){return this;},setBackground(){return this;},createTextFinder(key){return {matchEntireCell(){return this;},useRegularExpression(){return this;},findNext(){const idx=rows.findIndex((x,i)=>i>=r-1&&x[c-1]===key);return idx<0?null:{getRow:()=>idx+1};}};}};}};
 const ctx={SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush(){}},Utilities:{formatDate:d=>d.toISOString()}};vm.createContext(ctx);vm.runInContext(source,ctx);return {rows,sync:ctx.syncDemandParticipant_};
}
const data={requestId:'a'.repeat(64),surveyId:'survey-1',version:1,nickname:'=formula',email:'a@example.test',phone:'+821012345678',title:'wine',quantity:2,status:'참여',createdAt:'2026-11-08T12:00:00Z',updatedAt:'2026-11-08T12:00:00Z'};
test('participant writes once, updates quantities and cancellation, ignores stale retry',()=>{const {rows,sync}=setup();sync(data);sync(data);assert.equal(rows.length,2);assert.equal(rows[1][0],"'=formula");assert.equal(rows[1][2],"'+821012345678");sync({...data,version:3,quantity:4});assert.equal(rows[1][4],4);sync({...data,version:2,quantity:1});assert.equal(rows[1][4],4);sync({...data,version:4,quantity:0,status:'취소'});assert.equal(rows[1][5],'취소');assert.equal(rows.length,2);});
test('different surveys create separate participation records and missing contacts explicit',()=>{const {rows,sync}=setup();sync(data);sync({...data,requestId:'b'.repeat(64),surveyId:'survey-2',email:'',phone:''});assert.equal(rows.length,3);assert.equal(rows[2][1],'미등록');assert.equal(rows[2][2],'미등록');assert.throws(()=>sync({...data,quantity:-1}));});

test('worker signs contact payload, uses address fallback, retries failures and checks version on ack',async()=>{
 const ts=(await import('typescript')).default;const {createHmac}=await import('node:crypto');
 const row={id:'q1',surveyId:'s1',customerId:'12',displayName:'Nick',createdAt:new Date(1000),updatedAt:new Date(2000)};
 const updates=[],posts=[];let fail=true;
 const prisma={demandSheetSync:{findMany:async()=>[row],updateMany:async data=>{updates.push(data);return {count:1};}},demandSurvey:{findUnique:async()=>({id:'s1',shop:'shop',title:'wine'})},demandEntry:{findUnique:async()=>({displayName:'Nick',quantity:3})}};
 const exports={};const code=ts.transpileModule(readFileSync(new URL('../app/services/demand-sheet.server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const shopify={unauthenticated:{admin:async()=>({admin:{graphql:async()=>Response.json({data:{customer:{email:'customer@example.test',phone:null,defaultAddress:{phone:'01012345678'}}}})}})}};
 vm.runInNewContext(code,{exports,require:n=>n==='node:crypto'?{createHmac}:n==='../db.server'?{prisma}:shopify,process:{env:{QUOTE_SHEET_WEBHOOK_URL:'https://script.google.com/macros/s/test/exec',QUOTE_SHEET_SECRET:'test'}},URL,Date,AbortSignal,console:{error(){}},fetch:async(url,opts)=>{const body=JSON.parse(opts.body);posts.push(body);if(fail)throw Error('network');return Response.json({ok:true,requestId:JSON.parse(body.payload).requestId});}});
 await exports.retryDemandSheets();assert.ok(updates[0].data.nextAttemptAt);assert.equal(updates[0].data.syncedAt,undefined);
 fail=false;await exports.retryDemandSheets();const payload=JSON.parse(posts[1].payload);assert.equal(payload.phone,'01012345678');assert.equal(payload.quantity,3);assert.equal(payload.email,'customer@example.test');assert.equal(posts[1].signature,createHmac('sha256','test').update(posts[1].timestamp+'.'+posts[1].payload).digest('hex'));assert.equal(updates[1].where.updatedAt,row.updatedAt);assert.ok(updates[1].data.syncedAt);
});
