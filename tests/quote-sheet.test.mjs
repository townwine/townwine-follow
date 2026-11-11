import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';

const source=readFileSync(new URL('../deploy/quote-sheet-webhook.gs',import.meta.url),'utf8');
function harness({header='No',initialRows=[],dropNumber=false}={}){
 const rows=initialRows.map(r=>[...r]),headers=[header,'견적번호','상태','이메일','닉네임','입력날짜','상품명','구매병수','견적종류','구매링크','최종 판매가 \n(KRW)','최종 판매가 \n(HKD)','등록요청ID'];
 let tab,locked=false;
 const sheet={getLastRow:()=>rows.length+1,getLastColumn:()=>headers.length,getMaxRows:()=>30000,hideColumns(){},insertRowsBefore(row,n){rows.splice(row-2,0,...Array.from({length:n},()=>[]));},
 getRange(row,col,height=1,width=1){return {
 getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>row+i===1?headers[col+j-1]:(rows[row+i-2]?.[col+j-1]??''))),
 getFormulas:()=>Array.from({length:height},()=>Array(width).fill('')),
 getValue:()=>rows[row-2]?.[col-1]??'',getDisplayValues:()=>[headers],
 setValue(value){assert(locked);rows[row-2][col-1]=value;},
 setValues(values){assert(locked);values.forEach((values,i)=>{rows[row+i-2]=[...values];if(dropNumber)rows[row+i-2][0]='';});},
 createTextFinder(key){return {matchEntireCell(){return this;},useRegularExpression(){return this;},findNext(){for(let i=row-2;i<row-2+height;i++){if(rows[i]?.[col-1]===key)return {getRow:()=>i+2};}return null;}};}};}};
 const context={console:{error(){}},Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(message,key)=>[...createHmac('sha256',key).update(message).digest()],formatDate:()=> '2026-10-14'},PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-secret'})},LockService:{getScriptLock:()=>({waitLock(){locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},SpreadsheetApp:{flush(){},openById(id){assert.equal(id,'1sJnPCGz_jFKIf0XY5ytme5aqjNf7dh1LVSIwxpQxgsE');return {getSheetByName(name){tab=name;return sheet;}}}}};
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

function post(h,body=request('HK')){return h.context.doPost({postData:{contents:JSON.stringify(body)}});}
test('No is always numeric and increments the last existing number',()=>{
 const h=harness({initialRows:[[1224,'홍콩견적#1224'],[1225,'홍콩견적#1225']]});
 assert.equal(post(h).ok,true);assert.equal(h.rows[2][0],1226);assert.equal(h.rows[2][1],'홍콩견적#1226');
 assert.equal(post(h).duplicate,true);assert.equal(h.rows.length,3);
});
test('header whitespace and case cannot silently drop No',()=>{
 for(const header of ['No',' No\n','NO','No.']){const h=harness({header});assert.equal(post(h).ok,true);assert.equal(h.rows[0][0],1);}
 const h=harness({header:'Missing'});assert.equal(post(h).ok,false);assert.equal(h.rows.length,0);
});
test('existing quote labels reserve numbers even when No is blank or rows are reordered',()=>{
 const h=harness({initialRows:[[1225,'홍콩견적#1225'],['','홍콩견적#1226'],[1223,'홍콩견적#1223']]});
 assert.equal(post(h).number,1227);assert.equal(h.rows[3][0],1227);
});
test('retry repairs missing No on the same request without appending another row',()=>{
 const row=Array(13).fill('');row[1]='홍콩견적#1226';row[12]='TW-'+'a'.repeat(64);
 const h=harness({initialRows:[[1225,'홍콩견적#1225'],row]});
 assert.equal(post(h).duplicate,true);assert.equal(h.rows[1][0],1226);assert.equal(h.rows.length,2);
});
test('repair refuses a duplicate number and failed persistence is never acknowledged',()=>{
 const row=Array(13).fill('');row[1]='홍콩견적#1226';row[12]='TW-'+'a'.repeat(64);
 const h=harness({initialRows:[[1226,'홍콩견적#1226'],row]});assert.equal(post(h).ok,false);assert.equal(h.rows[1][0],'');
 assert.equal(post(harness({dropNumber:true})).ok,false);
});
test('sequence overflow is rejected',()=>{const h=harness({initialRows:[[Number.MAX_SAFE_INTEGER,'']]});assert.equal(post(h).ok,false);assert.equal(h.rows.length,1);});

test('calculation tails do not push new multi-item quotes to row 25000',()=>{
 const rows=Array.from({length:25114},()=>[]);rows[0]=[225,'영국견적#225','','customer','nick','','Wine'];rows[25113]=Array(13).fill('');rows[25113][10]=123;
 const h=harness({initialRows:rows});assert.equal(post(h,request('GB')).ok,true);assert.equal(h.rows[1][0],226);assert.equal(h.rows[25114][10],123);
 const body=request('GB');const data=JSON.parse(body.payload);data.requestId='b'.repeat(64);body.payload=JSON.stringify(data);body.signature=createHmac('sha256','test-secret').update(body.timestamp+'.'+body.payload).digest('hex');
 assert.equal(post(h,body).ok,true);assert.equal(h.rows[2][0],227);const count=h.rows.length;assert.equal(post(h,body).duplicate,true);assert.equal(h.rows.length,count);
});
test('row selection ignores formula-only and default quantity rows but preserves partial customer rows',()=>{
 const h=harness();const rows=[[225,'영국견적#225'],['','영국견적#', '', '', '', '', '',6,'공동구매'],[],['','','','','','', '', '', '', 'https://seller.test/wine']];
 const formulas=[[],['','=formula'],[],[]];assert.equal(h.context.quoteRecordRow_(rows,formulas,[]),6);assert.equal(h.context.quoteRecordRow_(rows.slice(0,3),formulas,[]),3);
 assert.equal(h.context.quoteRecordRow_([[],[]],[[],[]],[[],['TW-'+'a'.repeat(64)]]),4);
});
