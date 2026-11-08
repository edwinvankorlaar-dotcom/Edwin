import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCheck, offerKey } from '../src/checker.js';
import { createStore } from '../src/store.js';

const NOW = new Date('2026-11-08T10:00:00Z');

function product(store, id, title, promo) {
  return { store, id, title, brand: '', size: '', image: null, price: 5, regularPrice: 6, promo, url: 'https://x' };
}

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'koffie-'));
  return createStore(path.join(dir, 'db.json'));
}

function fakeNotifier() {
  const sent = [];
  return { sent, send: async (m) => (sent.push(m), { webpush: 1, ntfy: 0, errors: [] }) };
}

test('meldt een aanbieding op de watchlist precies één keer', async () => {
  const store = tmpStore();
  store.update((d) => d.watchlist.push({ id: 'w1', type: 'product', store: 'ah', productId: '1' }));
  const promo = { label: '2e halve prijs', price: null, start: '2026-11-02', end: '2026-11-08' };
  const providers = { ah: { getProduct: async () => product('ah', '1', 'Douwe Egberts', promo) } };
  const notifier = fakeNotifier();

  const first = await runCheck({ store, providers, notifier, now: NOW });
  assert.equal(first.newlyNotified, 1);
  assert.equal(notifier.sent.length, 1);
  assert.match(notifier.sent[0].title, /Albert Heijn: Douwe Egberts/);
  assert.match(notifier.sent[0].body, /2e halve prijs t\/m 08-11-2026/);

  const second = await runCheck({ store, providers, notifier, now: NOW });
  assert.equal(second.newlyNotified, 0);
  assert.equal(second.onSale.length, 1);
  assert.equal(notifier.sent.length, 1);
});

test('nieuwe aanbiedingsperiode wordt opnieuw gemeld', async () => {
  const p1 = product('ah', '1', 'x', { label: 'Bonus', start: '2026-11-02', end: '2026-11-08' });
  const p2 = product('ah', '1', 'x', { label: 'Bonus', start: '2026-11-16', end: '2026-11-22' });
  assert.notEqual(offerKey(p1), offerKey(p2));
});

test('toekomstige of verlopen aanbiedingen worden niet gemeld', async () => {
  const store = tmpStore();
  store.update((d) => {
    d.watchlist.push({ id: 'a', type: 'product', store: 'jumbo', productId: 'future' });
    d.watchlist.push({ id: 'b', type: 'product', store: 'jumbo', productId: 'past' });
  });
  const providers = {
    jumbo: {
      getProduct: async (id) =>
        id === 'future'
          ? product('jumbo', id, 'x', { label: 'x', start: '2026-11-09', end: '2026-11-15' })
          : product('jumbo', id, 'y', { label: 'y', start: '2026-10-01', end: '2026-11-07' }),
    },
  };
  const notifier = fakeNotifier();
  const result = await runCheck({ store, providers, notifier, now: NOW });
  assert.equal(result.onSale.length, 0);
  assert.equal(notifier.sent.length, 0);
});

test('zoekterm-watch: alleen producten die alle woorden bevatten en in de aanbieding zijn', async () => {
  const store = tmpStore();
  store.update((d) => d.watchlist.push({ id: 'k', type: 'keyword', query: 'douwe egberts', stores: ['ah', 'jumbo'] }));
  const promo = { label: '1+1 gratis', start: null, end: null };
  const providers = {
    ah: {
      search: async () => [
        product('ah', '1', 'Douwe Egberts Aroma rood', promo),
        product('ah', '2', 'Douwe Egberts Gold', null),
        product('ah', '3', 'Lavazza Oro', promo),
      ],
    },
    jumbo: { search: async () => { throw new Error('Jumbo onbereikbaar'); } },
  };
  const notifier = fakeNotifier();
  const result = await runCheck({ store, providers, notifier, now: NOW });
  assert.deepEqual(result.onSale.map((p) => p.id), ['1']);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Jumbo onbereikbaar/);
});

test('veel aanbiedingen tegelijk worden samengevat in één bericht', async () => {
  const store = tmpStore();
  store.update((d) => d.watchlist.push({ id: 'k', type: 'keyword', query: 'koffie', stores: ['ah'] }));
  const promo = { label: 'Bonus', start: null, end: null };
  const providers = {
    ah: { search: async () => Array.from({ length: 8 }, (_, i) => product('ah', String(i), `Koffie ${i}`, promo)) },
  };
  const notifier = fakeNotifier();
  await runCheck({ store, providers, notifier, now: NOW });
  assert.equal(notifier.sent.length, 1);
  assert.match(notifier.sent[0].title, /8 producten/);
});
