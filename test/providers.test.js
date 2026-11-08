import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAhProduct, createAhProvider } from '../src/providers/ah.js';
import { normalizeJumboProduct, createJumboProvider } from '../src/providers/jumbo.js';

const AH_BONUS = {
  webshopId: 4130,
  title: 'Douwe Egberts Aroma rood filterkoffie',
  brand: 'Douwe Egberts',
  salesUnitSize: '500 g',
  images: [
    { width: 48, url: 'https://img/48.jpg' },
    { width: 400, url: 'https://img/400.jpg' },
    { width: 800, url: 'https://img/800.jpg' },
  ],
  currentPrice: 4.86,
  priceBeforeBonus: 6.49,
  isBonus: true,
  bonusMechanism: '25% korting',
  bonusStartDate: '2026-11-02',
  bonusEndDate: '2026-11-08',
};

test('AH: bonusproduct wordt genormaliseerd', () => {
  const p = normalizeAhProduct(AH_BONUS);
  assert.equal(p.store, 'ah');
  assert.equal(p.id, '4130');
  assert.equal(p.price, 4.86);
  assert.equal(p.regularPrice, 6.49);
  assert.equal(p.image, 'https://img/400.jpg');
  assert.deepEqual(p.promo, { label: '25% korting', price: 4.86, start: '2026-11-02', end: '2026-11-08' });
  assert.equal(p.url, 'https://www.ah.nl/producten/product/wi4130');
});

test('AH: product zonder bonus heeft geen promo', () => {
  const p = normalizeAhProduct({ webshopId: 1, title: 'x', priceBeforeBonus: 3.5, isBonus: false });
  assert.equal(p.promo, null);
  assert.equal(p.price, 3.5);
});

test('AH: "1+1 gratis" zonder prijsverschil gebruikt discountLabels', () => {
  const p = normalizeAhProduct({
    webshopId: 2,
    title: 'Senseo pads',
    priceBeforeBonus: 4.79,
    isBonus: true,
    discountLabels: [{ code: 'DISCOUNT_ONE_PLUS_ONE', defaultDescription: '1+1 gratis' }],
  });
  assert.equal(p.promo.label, '1+1 gratis');
  assert.equal(p.promo.price, null);
  assert.equal(p.price, 4.79);
});

test('AH provider: haalt token op, zoekt en vernieuwt token na 401', async () => {
  const calls = [];
  let searchCalls = 0;
  const fetchImpl = async (url, opts) => {
    calls.push({ url, auth: opts.headers.Authorization });
    if (url.includes('/auth/token/anonymous')) {
      return Response.json({ access_token: `tok${calls.length}`, expires_in: 86400 });
    }
    searchCalls++;
    if (searchCalls === 1) return new Response('', { status: 401 });
    return Response.json({ products: [AH_BONUS] });
  };
  const ah = createAhProvider({ baseUrl: 'https://ah.test', fetchImpl });
  const results = await ah.search('koffie');
  assert.equal(results.length, 1);
  assert.equal(results[0].title, AH_BONUS.title);
  assert.ok(calls.some((c) => c.url.includes('query=koffie')));
  assert.equal(calls.filter((c) => c.url.includes('token')).length, 2);
});

const JUMBO_PROMO = {
  id: '67649PAK',
  title: 'Jumbo Koffiebonen Extra Intens 1kg',
  quantity: '1 kg',
  imageInfo: { primaryView: [{ url: 'https://jimg/360.png', width: 360 }, { url: 'https://jimg/720.png', width: 720 }] },
  prices: { price: { currency: 'EUR', amount: 949 }, promotionalPrice: { currency: 'EUR', amount: 712 } },
  promotion: { name: '25% korting', fromDate: Date.UTC(2026, 10, 4), toDate: Date.UTC(2026, 10, 10) },
};

test('Jumbo: aanbieding wordt genormaliseerd (centen → euro)', () => {
  const p = normalizeJumboProduct(JUMBO_PROMO);
  assert.equal(p.store, 'jumbo');
  assert.equal(p.price, 7.12);
  assert.equal(p.regularPrice, 9.49);
  assert.equal(p.image, 'https://jimg/360.png');
  assert.deepEqual(p.promo, { label: '25% korting', price: 7.12, start: '2026-11-04', end: '2026-11-10' });
});

test('Jumbo: product zonder aanbieding', () => {
  const p = normalizeJumboProduct({ id: 'A', title: 'x', prices: { price: { amount: 399 } } });
  assert.equal(p.promo, null);
  assert.equal(p.price, 3.99);
});

test('Jumbo provider: zoeken en product ophalen', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/search')) return Response.json({ products: { data: [JUMBO_PROMO], total: 1 } });
    if (url.endsWith('/products/67649PAK')) return Response.json({ product: { data: JUMBO_PROMO } });
    return new Response('', { status: 404 });
  };
  const jumbo = createJumboProvider({ baseUrl: 'https://jumbo.test', fetchImpl });
  assert.equal((await jumbo.search('koffie')).length, 1);
  assert.equal((await jumbo.getProduct('67649PAK')).id, '67649PAK');
  assert.equal(await jumbo.getProduct('BESTAATNIET'), null);
});
