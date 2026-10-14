type Admin = {graphql:(query:string,options?:{variables?:Record<string,unknown>})=>Promise<Response>};
type Tracking = {company:string|null;number:string|null;url:string|null};
type Fulfillment = {id:string;status:string;displayStatus:string|null;createdAt:string;estimatedDeliveryAt:string|null;inTransitAt:string|null;deliveredAt:string|null;trackingInfo:Tracking[]};
type OrderNode = {id:string;legacyResourceId:string;cancelledAt:string|null;displayFinancialStatus:string;displayFulfillmentStatus:string;customer:{legacyResourceId:string}|null;fulfillments:Fulfillment[]};
export type OrderStatusSnapshot = {
  orderId:string;bucket:'paid'|'shipping'|'delivered'|'other';stage:number;label:string;description:string;
  trackingNumber:string;trackingCompany:string;trackingUrl:string;
  shipments:Array<{id:string;label:string;stage:number;estimatedDeliveryAt:string|null;deliveredAt:string|null;tracking:Tracking[]}>;
};
export function safeTrackingUrl(value:string|null|undefined){
  try{const url=new URL(value||'');return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
function shipmentStage(f:Fulfillment):[number,string]{
  if(f.deliveredAt||['DELIVERED','PICKED_UP'].includes(f.displayStatus||''))return [4,'배송 완료'];
  if(['FAILURE','ERROR'].includes(f.status)||['FAILURE','NOT_DELIVERED','ATTEMPTED_DELIVERY','DELAYED'].includes(f.displayStatus||''))return [3,'배송 확인 필요'];
  if(f.displayStatus==='READY_FOR_PICKUP')return [3,'수령 대기'];
  if(f.displayStatus==='OUT_FOR_DELIVERY')return [3,'배송 출발'];
  if(f.inTransitAt||['IN_TRANSIT','CARRIER_PICKED_UP'].includes(f.displayStatus||''))return [3,'배송 중'];
  if(f.status==='SUCCESS'||['FULFILLED','MARKED_AS_FULFILLED'].includes(f.displayStatus||''))return [2,'출고 완료'];
  return [1,'배송 준비'];
}
export function orderSnapshot(node:OrderNode):OrderStatusSnapshot{
  const active=(node.fulfillments||[]).filter(f=>!['CANCELLED','CANCELED'].includes(f.status)&&f.displayStatus!=='CANCELED');
  const shipments=active.map(f=>{const [stage,label]=shipmentStage(f);return {id:f.id,stage,label,estimatedDeliveryAt:f.estimatedDeliveryAt,deliveredAt:f.deliveredAt,tracking:(f.trackingInfo||[]).map(t=>({...t,url:safeTrackingUrl(t.url)}))};});
  const first=shipments.flatMap(s=>s.tracking).find(t=>t.number)||{number:'',company:'',url:''};
  let stage=1,label='배송 준비',bucket:OrderStatusSnapshot['bucket']='paid',description='결제가 완료되어 상품 배송을 준비하고 있습니다.';
  const financial=node.displayFinancialStatus;
  if(node.cancelledAt){stage=-1;label='주문 취소';bucket='other';description='취소된 주문입니다.';}
  else if(['REFUNDED','VOIDED'].includes(financial)){stage=-1;label=financial==='REFUNDED'?'환불됨':'결제 취소';bucket='other';description=financial==='REFUNDED'?'환불된 주문입니다. 자세한 내용은 주문 상세에서 확인해 주세요.':'결제가 취소된 주문입니다.';}
  else if(!['PAID','PARTIALLY_REFUNDED'].includes(financial)){stage=-1;label='결제 확인 중';bucket='other';description='결제 완료 여부를 확인하고 있습니다.';}
  else if(shipments.length){
    // A delivered parcel must not mark a partially fulfilled order complete.
    const complete=node.displayFulfillmentStatus==='FULFILLED'&&active.length<100&&shipments.every(s=>s.stage===4);
    stage=complete?4:Math.min(3,Math.max(...shipments.map(s=>s.stage)));
    bucket=complete?'delivered':stage>=2?'shipping':'paid';
    label=complete?'배송 완료':shipments.length===1&&shipments[0].stage!==4?shipments[0].label:'부분 배송';
    if(!complete&&node.displayFulfillmentStatus==='PARTIALLY_FULFILLED')label='부분 배송';
    description=complete?'주문의 모든 배송이 완료되었습니다.':label==='부분 배송'?'일부 상품의 배송이 진행 중입니다. 배송 건별 상태를 확인해 주세요.':stage===2?'관리자가 출고 처리했습니다. 배송사 이동 정보는 접수 후 반영됩니다.':'배송 건별 진행 상황과 운송장 정보를 확인해 주세요.';
  }else if(node.displayFulfillmentStatus==='ON_HOLD'){label='배송 보류';description='배송이 보류되어 확인 중입니다.';}
  else if(node.displayFulfillmentStatus==='FULFILLED'){stage=2;bucket='shipping';label='출고 완료';description='출고 처리되었습니다. 배송 완료 여부는 아직 확인되지 않았습니다.';}
  if(financial==='PARTIALLY_REFUNDED')description+=' 일부 금액이 환불된 주문입니다.';
  return {orderId:String(node.legacyResourceId||node.id.split('/').pop()),bucket,stage,label,description,trackingNumber:first.number||'',trackingCompany:first.company||'',trackingUrl:first.url||'',shipments};
}
export async function getOrderStatusSnapshots({admin,orderIds,customerId}:{admin:Admin;orderIds:string[];customerId:string}){
  if(!/^\d+$/.test(customerId))return [];
  const ids=[...new Set(orderIds.filter(id=>/^(?:gid:\/\/shopify\/Order\/)?\d+$/.test(id)).map(id=>id.startsWith('gid:')?id:'gid://shopify/Order/'+id))];
  if(!ids.length)return [];
  if(ids.length>50)throw new Error('Too many order IDs');
  const response=await admin.graphql(`query OrderStatusSnapshots($ids:[ID!]!){nodes(ids:$ids){... on Order{
    id legacyResourceId cancelledAt displayFinancialStatus displayFulfillmentStatus customer{legacyResourceId}
    fulfillments(first:100){id status displayStatus createdAt estimatedDeliveryAt inTransitAt deliveredAt trackingInfo(first:100){company number url}}
  }}}`,{variables:{ids}});
  const result=await response.json() as {data?:{nodes:Array<OrderNode|null>};errors?:unknown[]};
  if(!response.ok||result.errors?.length||!result.data)throw new Error('Order status query failed');
  return result.data.nodes.filter((node):node is OrderNode=>!!node?.id&&String(node.customer?.legacyResourceId)===customerId).map(orderSnapshot);
}
