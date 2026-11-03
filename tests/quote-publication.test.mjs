import test from 'node:test';
import assert from 'node:assert/strict';
import {publishQuoteToOnlineStore} from '../app/services/quote-publication.server.ts';

test('selects Online Store only and connects the draft without changing its status',async()=>{
 const calls=[];
 const admin={graphql:async(query,options)=>{calls.push({query,variables:options.variables});if(query.includes('publications('))return Response.json({data:{publications:{nodes:[{id:'pos',catalog:{apps:{nodes:[{handle:'pos',title:'Point of Sale'}]}}},{id:'online',catalog:{apps:{nodes:[{handle:'online-store',title:'Online Store'}]}}}],pageInfo:{hasNextPage:false,endCursor:null}}}});return Response.json({data:{publishablePublish:{publishable:{__typename:'Product'},userErrors:[]}}});}};
 await publishQuoteToOnlineStore(admin,'gid://shopify/Product/1');
 assert.deepEqual(calls[1].variables,{id:'gid://shopify/Product/1',input:[{publicationId:'online'}]});
 assert.doesNotMatch(calls[1].query,/productUpdate|status/);
});

test('reports missing access without claiming successful publication',async()=>{
 const admin={graphql:async()=>Response.json({errors:[{message:'Access denied'}]})};
 await assert.rejects(publishQuoteToOnlineStore(admin,'gid://shopify/Product/1'),/게시 권한/);
});
