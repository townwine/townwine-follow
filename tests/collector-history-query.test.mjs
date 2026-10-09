import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHistoryQuery,historyWhere,normalizeHistorySearch} from '../app/services/collector-history-query.ts';
test('filters require one collector and normalize title keywords',()=>{
 const q=parseHistoryQuery(new URLSearchParams('collector=townie&q=Pérrières+2023&status=ended&from=2026-10-01&to=2026-10-09&page=2&pageSize=10'));
 assert.equal(q.q,'perrieres 2023');assert.equal(historyWhere(q).collectorHandle,'townie');assert.equal(historyWhere(q).available,false);
 assert.deepEqual(historyWhere(q).dealDate,{gte:'2026-10-01',lte:'2026-10-09'});
 assert.equal(normalizeHistorySearch('  Château   Blanc  '),'chateau blanc');
});
test('rejects invalid dates, ranges and unbounded page sizes',()=>{
 for(const suffix of ['from=2026-02-30','from=2026-10-10&to=2026-10-01','pageSize=5000','page=-1','status=unknown']) assert.throws(()=>parseHistoryQuery(new URLSearchParams('collector=townie&'+suffix)));
 assert.throws(()=>parseHistoryQuery(new URLSearchParams()));
});
