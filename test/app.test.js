import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';
import { createDemoProvider } from '../src/providers/demo.js';

let server;
let base;
const sent = [];

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'koffie-app-'));
  const store = createStore(path.join(dir, 'db.json'));
  const providers = { ah: createDemoProvider('ah'), jumbo: createDemoProvider('jumbo') };
  const notifier = { send: async (m) => (sent.push(m), { webpush: 0, ntfy: 1, errors: [] }) };
  ({ server } = createApp({ store, providers, notifier, vapidPublicKey: 'test-key', password: '' }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const call = async (method, p, body) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};

test('volledige flow: zoeken, volgen, controleren, verwijderen', async () => {
  const search = await call('GET', '/api/search?q=koffie&store=all');
  assert.equal(search.status, 200);
  assert.equal(search.data.results.length, 2);

  const all = search.data.results.flatMap((r) => r.products);
  const onSale = all.find((p) => p.promo);
  const added = await call('POST', '/api/watchlist', { type: 'product', store: onSale.store, productId: onSale.id, title: onSale.title });
  assert.equal(added.status, 200);

  // Dubbel toevoegen levert geen duplicaat op.
  await call('POST', '/api/watchlist', { type: 'product', store: onSale.store, productId: onSale.id });
  assert.equal((await call('GET', '/api/watchlist')).data.watchlist.length, 1);

  const check = await call('POST', '/api/check');
  assert.equal(check.data.lastCheck.newlyNotified, 1);
  assert.equal(sent.length, 1);

  await call('DELETE', `/api/watchlist?id=${added.data.item.id}`);
  assert.equal((await call('GET', '/api/watchlist')).data.watchlist.length, 0);
});

test('validatie en statische bestanden', async () => {
  assert.equal((await call('POST', '/api/watchlist', { type: 'product', store: 'lidl', productId: '1' })).status, 400);
  assert.equal((await call('POST', '/api/watchlist', { type: 'keyword', query: '  ' })).status, 400);
  assert.equal((await call('GET', '/api/search')).status, 400);
  const html = await fetch(`${base}/`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Koffie-alarm/);
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
});

test('ntfy-instellingen opslaan', async () => {
  const r = await call('PUT', '/api/settings', { ntfyTopic: 'koffie-test', ntfyServer: 'https://ntfy.sh' });
  assert.equal(r.data.settings.ntfyTopic, 'koffie-test');
  assert.equal((await call('GET', '/api/status')).data.vapidPublicKey, 'test-key');
});
