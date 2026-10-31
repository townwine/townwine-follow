import test from 'node:test';import assert from 'node:assert/strict';import {readMarketHandoff,marketHandoffUrl} from '../app/services/market-handoff.ts';
test('handoff retains wine identity and destination without treating shelf price as a final quote',()=>{
for(const target of ['survey','register']){const url=new URL(marketHandoffUrl(target,'Wine <2020>','https://example.com/products/wine?variant=1','UK'),'https://town.wine');const result=readMarketHandoff(url.searchParams);assert.deepEqual(result,{title:'Wine <2020>',url:'https://example.com/products/wine?variant=1',country:'GB'});assert.equal(url.searchParams.has('price'),false);}
});
test('handoff refuses unsafe or incomplete URLs',()=>{for(const source of ['javascript:alert(1)','http://example.com','https://user:password@example.com'])assert.equal(readMarketHandoff(new URLSearchParams({from:'market',wine:'Wine',source})),undefined);});
