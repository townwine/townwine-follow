import type {DraftAdmin} from './quote-draft.server';

/** Connect the draft to the Online Store without making it active or listed. */
export async function publishQuoteToOnlineStore(admin:DraftAdmin,productId:string){
 let after:string|null=null;
 let publicationId='';
 do {
  const response=await admin.graphql('query($after:String){publications(first:50,after:$after,catalogType:APP){nodes{id catalog{... on AppCatalog{apps(first:10){nodes{handle title}}}}} pageInfo{hasNextPage endCursor}}}',{variables:{after}});
  const body=await response.json();
  if(!response.ok||body.errors?.length)throw new Error('온라인 스토어 채널을 확인하지 못했습니다. 앱 게시 권한을 확인해 주세요.');
  const connection=body.data?.publications;
  if(!connection)throw new Error('온라인 스토어 채널을 확인하지 못했습니다.');
  const matches=connection.nodes.filter((entry:{catalog?:{apps?:{nodes?:Array<{handle:string,title:string}>}}})=>entry.catalog?.apps?.nodes?.some(app=>app.handle==='online-store'||app.title==='Online Store'));
  if(matches.length>1||(matches.length===1&&publicationId))throw new Error('온라인 스토어 채널이 여러 개여서 자동 연결할 수 없습니다.');
  if(matches.length)publicationId=matches[0].id;
  after=connection.pageInfo.hasNextPage?connection.pageInfo.endCursor:null;
 }while(after);
 if(!publicationId)throw new Error('온라인 스토어 채널을 찾을 수 없습니다.');
 const response=await admin.graphql('mutation($id:ID!,$input:[PublicationInput!]!){publishablePublish(id:$id,input:$input){publishable{__typename} userErrors{message}}}',{variables:{id:productId,input:[{publicationId}]}});
 const body=await response.json();
 if(!response.ok||body.errors?.length||!body.data?.publishablePublish?.publishable||body.data.publishablePublish.userErrors?.length)throw new Error('온라인 스토어 자동 연결에 실패했습니다. 앱 게시 권한을 확인해 주세요.');
}
