export function normalizeHistorySearch(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
export function parseHistoryQuery(params: URLSearchParams) {
  const collector = (params.get('collector') || '').trim();
  if (!collector || collector.length > 100 || /[\s/\\]/.test(collector)) throw new Error('INVALID_COLLECTOR');
  const q = normalizeHistorySearch(params.get('q') || '').slice(0, 160);
  const status = params.get('status') || 'all';
  if (!['all','active','ended'].includes(status)) throw new Error('INVALID_STATUS');
  const from = params.get('from') || '', to = params.get('to') || '';
  for (const value of [from,to]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) throw new Error('INVALID_DATE');
  }
  if (from && to && from > to) throw new Error('INVALID_RANGE');
  const pageSize = Number(params.get('pageSize') || 10);
  if (![10,20,50].includes(pageSize)) throw new Error('INVALID_PAGE_SIZE');
  const page = Number(params.get('page') || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error('INVALID_PAGE');
  return {collector,q,status,from,to,page,pageSize};
}
export function historyWhere(query: ReturnType<typeof parseHistoryQuery>) {
  return {
    collectorHandle: query.collector,
    ...(query.status === 'all' ? {} : {available: query.status === 'active'}),
    ...(query.from || query.to ? {dealDate:{...(query.from ? {gte:query.from} : {}),...(query.to ? {lte:query.to} : {})}} : {}),
    AND: query.q.split(' ').filter(Boolean).map(word=>({searchTitle:{contains:word}})),
  };
}
