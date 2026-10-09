import type { LoaderFunctionArgs } from 'react-router';
import {parseHistoryQuery} from '../services/collector-history-query';
import {getCollectorHistory} from '../services/collector-history.server';
export async function loader({request}:LoaderFunctionArgs) {
  let query;
  try {query=parseHistoryQuery(new URL(request.url).searchParams);} catch {return Response.json({error:'검색 조건을 확인해 주세요.'},{status:400});}
  try {
    const result=await getCollectorHistory(query);
    return Response.json(result,{status:result.pending?202:200,headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    console.error('[collector-history] query failed',String(error));
    return Response.json({error:'공구 내역을 불러오지 못했습니다.'},{status:503});
  }
}
