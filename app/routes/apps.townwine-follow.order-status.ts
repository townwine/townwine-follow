import type {LoaderFunctionArgs} from 'react-router';
import {authenticate} from '../shopify.server';
import {readOrderStatusRequest} from '../services/follow-request.server';
import {getOrderStatusSnapshots} from '../services/order-status.server';
const headers={'Cache-Control':'private, no-store, max-age=0'};
export async function loader({request}:LoaderFunctionArgs){
  // Never use an offline admin after a failed customer proxy signature.
  let context;
  try{context=await authenticate.public.appProxy(request);}catch{
    return Response.json({statuses:{},error:'UNAUTHORIZED'},{status:401,headers});
  }
  const customerIds=new URL(request.url).searchParams.getAll('logged_in_customer_id');
  const customerId=customerIds.length===1?customerIds[0]:'';
  if(!/^\d+$/.test(customerId))return Response.json({statuses:{},loggedIn:false},{status:401,headers});
  if(!context.admin)return Response.json({statuses:{},error:'SERVICE_UNAVAILABLE'},{status:503,headers});
  try{
    const {orderIds}=await readOrderStatusRequest(request);
    if(orderIds.length>50)return Response.json({statuses:{},error:'TOO_MANY_ORDERS'},{status:400,headers});
    const snapshots=await getOrderStatusSnapshots({admin:context.admin,orderIds,customerId});
    return Response.json({statuses:Object.fromEntries(snapshots.map(s=>[s.orderId,s])),loggedIn:true,generatedAt:new Date().toISOString()},{headers});
  }catch{
    console.error('[order-status] authenticated order query failed');
    return Response.json({statuses:{},error:'ORDER_STATUS_FAILED'},{status:502,headers});
  }
}
