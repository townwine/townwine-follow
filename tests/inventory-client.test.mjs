import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../deploy/theme-assets/assets/townwine-inventory.js', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '');
function setup(fetch) {
  const timers = new Map();
  const context = vm.createContext({ fetch, URL, AbortSignal, Intl, console: {error() {}}, document: {readyState: 'loading', addEventListener() {}}, window: {location: {origin: 'https://shop.example'}, setTimeout(fn, delay) {const id = timers.size+1; timers.set(id, {fn, delay}); return id;}, clearTimeout(id) {timers.delete(id);}} });
  vm.runInContext(source, context);
  return {context, timers, run: (code) => vm.runInContext(code, context)};
}
const group = '{cards:[], products:[]}';
test('concurrent inventory hydration shares the request', async () => {
  let calls = 0, resolve;
  const response = new Promise(r => resolve = r);
  const {run} = setup(() => {calls++; return response;});
  const a = run("fetchInventorySnapshots('/apps/test', ['1'])");
  const b = run("fetchInventorySnapshots('/apps/test', ['1'])");
  assert.equal(calls,1);
  resolve({ok:true,json:async()=>({snapshots:{}})});
  await Promise.all([a,b]);
});
test('network failure schedules recovery rather than leaving loading forever', async () => {
  const {run,timers} = setup(async()=>{throw new Error('temporary');});
  await run(`hydrateInventoryGroup('/apps/test', ${group}, ['1'])`);
  assert.equal(timers.size,1);
});
test('missing snapshots are retried, and a ready response clears pending retry', async () => {
  let payload = {snapshots:{}};
  const {run,timers} = setup(async()=>({ok:true,json:async()=>payload}));
  await run(`hydrateInventoryGroup('/apps/test', ${group}, ['1'])`);
  assert.equal(timers.size,1);
  payload = {snapshots:{'1':{soldCount:3,soldCountPending:false}}};
  await run(`hydrateInventoryGroup('/apps/test', ${group}, ['1'])`);
  assert.equal(timers.size,0);
});
test('pending sales still retry after the former four-attempt limit', async () => {
  const {run,timers} = setup(async()=>({ok:true,json:async()=>({snapshots:{'1':{soldCountPending:true}}})}));
  run("inventoryRetryCounts.set(getRetryKey('/apps/test',['1']), 4)");
  await run(`hydrateInventoryGroup('/apps/test', ${group}, ['1'])`);
  assert.equal(timers.size,1);
  assert.ok([...timers.values()][0].delay<=10000);
});
