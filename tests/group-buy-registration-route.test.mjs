import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load({proxyError}={}){
 const source=readFileSync(new URL('../app/routes/apps.townwine-follow.group-buy-registration.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const calls=[];
 const deps={
  './apps.townwine-follow.demand-surveys':{loader:async()=>new Response('survey-page')},
  '../services/demand-survey.server':{demandPrefill:async()=>({id:'survey'})},
  '../shopify.server':{authenticate:{public:{appProxy:async()=>{calls.push('auth');if(proxyError)throw Error('proxy failed');return {admin:{}};}}}},
  '../services/demand-quote':{calculateDemandQuote:()=>({})},
  '../services/quote-preview.server':{registrationRates:async()=>({}),parseRegistrationInput:()=>({}),previewRegistration:async()=>({})},
  '../services/quote-preview-page.server':{renderQuotePreview:loggedIn=>loggedIn?'logged-in-page':'public-page'},
  '../services/quote-draft-token.server':{issueQuoteToken:()=>''},
  '../services/demand-product.server':{fetchLabelImage:async()=>new Uint8Array()},
  '../services/quote-draft.server':{imageFileType:()=>({mime:'image/png'}),registerQuoteDraft:async()=>({})},
 };
 const exports={};vm.runInNewContext(code,{exports,require:name=>deps[name],console,Response,URL,FormData,Buffer});return {route:exports,calls};
}
test('storefront proxy auth failure still renders public registration instead of Shopify blank error',async()=>{
 const {route}=load({proxyError:true});
 const response=await route.loader({request:new Request('https://shop.example/apps/group-buy-registration?step=register&logged_in_customer_id=123')});
 assert.equal(response.status,200);assert.equal(await response.text(),'public-page');assert.equal(response.headers.get('Content-Type'),'application/liquid; charset=utf-8');
});
test('registration actions report expired proxy auth as a recoverable JSON response',async()=>{
 const {route}=load({proxyError:true});
 const response=await route.action({request:new Request('https://shop.example/apps/group-buy-registration?shop=town-wine.myshopify.com&logged_in_customer_id=123',{method:'POST'})});
 assert.equal(response.status,401);assert.equal((await response.json()).loginRequired,true);
});

test('registration entry starts with the price calculator',async()=>{const {route}=load();const response=await route.loader({request:new Request('https://shop.example/apps/group-buy-registration')});assert.equal(await response.text(),'public-page');});
