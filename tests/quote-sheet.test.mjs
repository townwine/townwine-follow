import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';

const source=readFileSync(new URL('../deploy/quote-sheet-webhook.gs',import.meta.url),'utf8');
function harness(){
 const rows=[],headers=['No','견적번호','상태','이메일','닉네임','입력날짜','상품명','구매병수','견적종류','구매링크','최종 판매가 \n(KRW)','최종 판매가 \n(HKD)','등록요청ID'];
 let tab,locked=false;
 const context={console:{error(){}},Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(message,key)=>[...createHmac('sha256',key).update(message).digest()],formatDate:()=> '2026-10-14'},PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-secret'})},LockService:{getScriptLock:()=>({waitLock(){locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},SpreadsheetApp:{flush(){},openById(id){assert.equal(id,'1sJnPCGz_jFKIf0XY5ytme5aqjNf7dh1LVSIwxpQxgsE');return {getSheetByName(name){tab=name;return {getLastRow:()=>rows.length+1,getLastColumn:()=>headers.length,getMaxRows:()=>1000,hideColumns(){},getRange(){return {getValues:()=>rows.map(r=>[r[0]]),getDisplayValues:()=>[headers],setValues(values){assert(locked);rows.push(...values);},createTextFinder(key){return {matchEntireCell(){return this;},useRegularExpression(){return this;},findNext:()=>rows.find(r=>r.includes(key))}}};}}}}}}};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,rows,tab:()=>tab};
}
function request(country='US'){
 const data={requestId:'a'.repeat(64),country,customerId:'123',productId:'gid://shopify/Product/456',email:'test@example.invalid',nickname:'=danger()',title:'Wine',sourceUrl:'https://example.invalid/wine',createdAt:'2026-10-14T00:00:00Z',input:{country,bottles:6,bottlePrice:50,localShipping:0,origin:'US'},quote:{rates:{KRW:1400,USD:1,EUR:0.9,HKD:7.8,GBP:0.8,JPY:150},currency:'USD',unitKrw:120000,unitHkd:670,fxDate:'2026-10-14'}};
 const payload=JSON.stringify(data),timestamp=String(Date.now());
 return {payload,timestamp,signature:createHmac('sha256','test-secret').update(timestamp+'.'+payload).digest('hex')};
}
test('routes all supported countries, writes customer details and prices once',()=>{
 for(const [country,tab] of Object.entries({US:'미국',FR:'프랑스',DE:'독일',GB:'영국',HK:'홍콩',JP:'일본'})){
 const h=harness(),body=request(country),event={postData:{contents:JSON.stringify(body)}};
 assert.equal(h.context.doPost(event).ok,true);assert.equal(h.tab(),tab);assert.equal(h.rows.length,1);
 assert.equal(h.rows[0][3],'test@example.invalid');assert.equal(h.rows[0][4],"'=danger()");assert.equal(h.rows[0][10],120000);
 assert.equal(h.context.doPost(event).duplicate,true);assert.equal(h.rows.length,1);
 }
});
test('invalid or expired signatures never write',()=>{
 for(const change of [{signature:'invalid'},{timestamp:'1'}]){
 const h=harness(),body={...request(),...change};assert.equal(h.context.doPost({postData:{contents:JSON.stringify(body)}}).ok,false);assert.equal(h.rows.length,0);
 }
});
