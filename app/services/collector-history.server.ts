import { load } from 'cheerio';
import prisma from '../db.server';
import { normalizeHistorySearch, historyWhere, type parseHistoryQuery } from './collector-history-query';
const INDEX_ID = 'townwine-public-catalog';
const TTL = 5 * 60_000;
let refreshing: Promise<void> | null = null;
let retryAt = 0;
type Product = {handle:string;title:string;vendor?:string;created_at:string;available:boolean;images?:Array<{src:string}>};
type Feed = {page:number;totalPages:number;products:Product[];collectorDetails:Record<string,{followHandle:string}>};
async function readPage(page: number): Promise<Feed> {
  const response = await fetch(`https://town-wine.myshopify.com/?section_id=townwine-catalog-feed&page=${page}`,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'TownWine/1.0 (collector history)',Accept:'text/html'}});
  if (!response.ok) throw new Error(`CATALOG_${response.status}`);
  const feed = JSON.parse(load(await response.text())('[data-townwine-catalog-feed]').text()) as Feed;
  if (feed.page !== page || !Array.isArray(feed.products) || !Number.isInteger(feed.totalPages) || feed.totalPages > 500 || !feed.collectorDetails) throw new Error('INVALID_CATALOG');
  return feed;
}
async function refresh() {
  const first = await readPage(1);
  const feeds = [first];
  for (let page=2;page<=first.totalPages;page+=2) {
    feeds.push(...await Promise.all(Array.from({length:Math.min(2, first.totalPages-page+1)},(_,i)=>readPage(page+i))));
  }
  const generation = new Date().toISOString();
  const rows = new Map<string, {handle:string;collectorHandle:string;title:string;searchTitle:string;vendor:string;image:string;available:boolean;dealDate:string;createdAt:Date;generation:string}>();
  for (const feed of feeds) for (const product of feed.products) {
    const collector = feed.collectorDetails[product.handle]?.followHandle;
    if (!collector) continue;
    const createdAt = new Date(product.created_at);
    if (!Number.isFinite(createdAt.getTime())) throw new Error('INVALID_PRODUCT_DATE');
    const titleDate = product.title.match(/^(20\d{2})[.\-/](\d{2})[.\-/](\d{2})/);
    const dealDate = titleDate ? titleDate.slice(1).join('-') : new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(createdAt);
    rows.set(product.handle,{handle:product.handle,collectorHandle:collector,title:product.title,searchTitle:normalizeHistorySearch(product.title),vendor:product.vendor || '',image:product.images?.[0]?.src || '',available:product.available,dealDate,createdAt,generation});
  }
  // Publish one complete snapshot atomically; a failed refresh keeps the previous index.
  await prisma.$transaction(async tx=>{
    for (const row of rows.values()) await tx.collectorDealIndex.upsert({where:{handle:row.handle},create:row,update:row});
    await tx.collectorDealIndex.deleteMany({where:{generation:{not:generation}}});
    await tx.collectorDealIndexState.upsert({where:{id:INDEX_ID},create:{id:INDEX_ID,updatedAt:new Date()},update:{updatedAt:new Date()}});
  },{timeout:60000});
}
export async function getCollectorHistory(query: ReturnType<typeof parseHistoryQuery>) {
  const state = await prisma.collectorDealIndexState.findUnique({where:{id:INDEX_ID}});
  if ((!state || Date.now()-state.updatedAt.getTime()>TTL) && !refreshing && Date.now()>retryAt) {
    refreshing = refresh().catch(error=>{retryAt=Date.now()+60000;console.error('[collector-history] index refresh failed',String(error));}).finally(()=>{refreshing=null;});
  }
  if (!state) return {pending:true,products:[],total:0,page:1,pageSize:query.pageSize,totalPages:0};
  const where = historyWhere(query);
  return prisma.$transaction(async tx=>{
    const total = await tx.collectorDealIndex.count({where});
    const totalPages = Math.max(1,Math.ceil(total/query.pageSize));
    const page = Math.min(query.page,totalPages);
    const rows = await tx.collectorDealIndex.findMany({where,orderBy:[{dealDate:'desc'},{createdAt:'desc'},{handle:'asc'}],skip:(page-1)*query.pageSize,take:query.pageSize});
    return {pending:false,total,totalPages,page,pageSize:query.pageSize,updatedAt:state.updatedAt.toISOString(),products:rows.map(row=>({handle:row.handle,title:row.title,vendor:row.vendor,available:row.available,created_at:row.createdAt.toISOString(),images:row.image ? [{src:row.image}] : [],dealDate:row.dealDate}))};
  });
}
