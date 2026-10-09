import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Node {
  constructor(tag='div') {this.tag=tag;this.children=[];this.attributes={};this.events={};this.textContent='';}
  appendChild(node){this.children.push(node);return node;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(key,fn){this.events[key]=fn;}
  focus(){}
}
async function fixture(count){
  const list=new Node(),status=new Node(),pagination=new Node(),select=new Node(),heading=new Node();
  const root={dataset:{collectorHandle:'test'},scrollIntoView(){},querySelector(selector){return {'[data-history-list]':list,'[data-history-status]':status,'[data-history-pagination]':pagination,'[data-history-page-size]':select,h2:heading}[selector];}};
  const products=Array.from({length:count},(_,i)=>({handle:'wine-'+i,title:'2026.10.09 Wine '+i,created_at:new Date(Date.UTC(2026,0,1)+i*86400000).toISOString(),vendor:'townwine HK',images:[{src:'https://example.com/wine.jpg'}]}));
  const collectorDetails=Object.fromEntries(products.map(p=>[p.handle,{followHandle:'test'}]));
  products.push({handle:'other',created_at:'2027-01-01'});collectorDetails.other={followHandle:'other'};
  vm.runInNewContext(fs.readFileSync('deploy/theme-assets/assets/townwine-collector-history.js','utf8'),{document:{createElement:tag=>new Node(tag),querySelectorAll:()=>[root]},window:{TownWineCatalog:{load:async()=>({products,collectorDetails})}},Date,Intl});
  await new Promise(setImmediate);
  return {list,status,pagination,select};
}
test('105 deals show 10 per page, final page 5, and no other collector',async()=>{
  const f=await fixture(105);
  assert.equal(f.list.children.length,10);
  assert.match(f.status.textContent,/총 105개 · 1–10개 표시/);
  assert.equal(f.list.children[0].href,'/products/wine-104');
  assert.equal(f.list.children[0].children[0].children[0].children[0].tag,'img');
  f.pagination.children.find(n=>n.textContent==='11').events.click();
  assert.equal(f.list.children.length,5);
  assert.match(f.status.textContent,/101–105/);
  assert.equal(f.pagination.children.find(n=>n.textContent==='다음').disabled,true);
  f.pagination.children.find(n=>n.textContent==='이전').events.click();
  assert.equal(f.list.children.length,10);
  f.select.value='20';f.select.events.change();
  assert.equal(f.list.children.length,20);
  assert.match(f.status.textContent,/1–20/);
});
test('single page hides pagination and avoids surplus rows',async()=>{
  const f=await fixture(6);
  assert.equal(f.list.children.length,6);
  assert.equal(f.pagination.hidden,true);
});
