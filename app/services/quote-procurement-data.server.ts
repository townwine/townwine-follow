import type {DraftAdmin} from './quote-draft.server';
import {readNotificationQuery} from './notification-query.server';

export type Registration = {title:string; sourceUrl:string; quantity:number; unitPrice:string; currency:string; items?:Registration[]};
export type OrderLedger = {checkpoint:string; orders:Record<string,number>};
type Page<T> = {nodes:T[]; pageInfo:{hasNextPage:boolean; endCursor:string|null}};
type Line = {currentQuantity:number; product:{id:string}|null};
type Order = {id:string; test:boolean; cancelledAt:string|null; displayFinancialStatus:string; lineItems:Page<Line>};
export type StockProduct = {
  title:string; status:string;
  variants:Page<{inventoryQuantity:number|null; inventoryPolicy:string; inventoryItem:{tracked:boolean}|null}>;
};

export async function queryProcurement<T>(admin:DraftAdmin,query:string,variables:Record<string,unknown>):Promise<T>{
  const result=await readNotificationQuery(await admin.graphql(query,{variables}));
  return result.data as T;
}

export function isSoldOut(product:StockProduct|null):boolean {
  return Boolean(product && product.status==='ACTIVE' && !product.variants.pageInfo.hasNextPage &&
    product.variants.nodes.length && product.variants.nodes.every(v=>
      v.inventoryItem?.tracked && v.inventoryPolicy==='DENY' &&
      typeof v.inventoryQuantity==='number' && v.inventoryQuantity<=0));
}

export function registeredTotal(registration:Registration):string {
  if(registration.items?.length){
    if(registration.items.some(item=>item.items||item.currency!==registration.currency)||registration.quantity!==registration.items.reduce((n,item)=>n+item.quantity,0))throw new Error('상품별 등록 수량과 통화를 확인해 주세요.');
    const cents=registration.items.reduce((n,item)=>n+BigInt(registeredTotal(item).replace('.','')),0n);
    return (cents/100n).toString()+'.'+(cents%100n).toString().padStart(2,'0');
  }
  if(!Number.isSafeInteger(registration.quantity)||registration.quantity<=0||
    !/^\d+(?:\.\d{1,2})?$/.test(registration.unitPrice)||!['HKD','KRW'].includes(registration.currency)){
    throw new Error('등록 당시 판매가·수량·통화 확인 필요');
  }
  const [whole,fraction='']=registration.unitPrice.split('.');
  const cents=(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')))*BigInt(registration.quantity);
  return (cents/100n).toString()+'.'+(cents%100n).toString().padStart(2,'0');
}

// Keep per-order quantities so edits/refunds replace old values, never increment them twice.
export async function refreshPaidQuantities(admin:DraftAdmin,productId:string,ledger:OrderLedger,now=new Date()):Promise<OrderLedger>{
  const from=new Date(ledger.checkpoint);
  if(!Number.isFinite(from.getTime())||now.getTime()-from.getTime()>59*86400000){
    throw new Error('주문 동기화 공백이 59일을 초과했습니다. 전체 주문 확인 후 재처리 필요');
  }
  const orders={...ledger.orders};
  const search=`status:any updated_at:>='${new Date(from.getTime()-120000).toISOString()}' updated_at:<='${now.toISOString()}'`;
  let after:string|null=null;
  const seen=new Set<string>();
  do{
    const data: {orders:Page<Order>}=await queryProcurement(admin,`query ProcurementOrders($search:String!,$after:String){
      orders(first:50,after:$after,sortKey:UPDATED_AT,query:$search){
        nodes{id test cancelledAt displayFinancialStatus lineItems(first:100){nodes{currentQuantity product{id}} pageInfo{hasNextPage endCursor}}}
        pageInfo{hasNextPage endCursor}
      }
    }`,{search,after});
    for(const order of data.orders.nodes){
      let quantity=0;
      if(!order.test&&!order.cancelledAt&&['PAID','PARTIALLY_REFUNDED'].includes(order.displayFinancialStatus)){
        let lines=order.lineItems;
        const lineCursors=new Set<string>();
        for(;;){
          for(const line of lines.nodes){
            if(line.product?.id===productId){
              if(!Number.isSafeInteger(line.currentQuantity)||line.currentQuantity<0)throw new Error('주문 수량 확인 실패');
              quantity+=line.currentQuantity;
            }
          }
          if(!lines.pageInfo.hasNextPage)break;
          const cursor=lines.pageInfo.endCursor;
          if(!cursor||lineCursors.has(cursor))throw new Error('주문 상품 페이지 조회 실패');
          lineCursors.add(cursor);
          const detail:{order:{lineItems:Page<Line>}|null}=await queryProcurement(admin,`query ProcurementOrderLines($id:ID!,$after:String){order(id:$id){lineItems(first:100,after:$after){nodes{currentQuantity product{id}} pageInfo{hasNextPage endCursor}}}}`,{id:order.id,after:cursor});
          if(!detail.order)throw new Error('주문 상품 확인 실패');
          lines=detail.order.lineItems;
        }
      }
      if(quantity)orders[order.id]=quantity;
      else delete orders[order.id];
    }
    if(!data.orders.pageInfo.hasNextPage)break;
    after=data.orders.pageInfo.endCursor;
    if(!after||seen.has(after))throw new Error('주문 페이지 조회 실패');
    seen.add(after);
  }while(true);
  return {checkpoint:now.toISOString(),orders};
}
