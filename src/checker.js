/**
 * Controleert de watchlist en stuurt een pushbericht voor elke aanbieding
 * waarover nog niet eerder een bericht is gestuurd.
 */
import { formatEuro, isPromoActive, matchesQuery } from './util.js';

const STORE_NAMES = { ah: 'Albert Heijn', jumbo: 'Jumbo' };
const MAX_SEPARATE_MESSAGES = 5;
const NOTIFIED_TTL_DAYS = 60;

/** Unieke sleutel per product + aanbieding, zodat we niet elke check opnieuw melden. */
export function offerKey(product) {
  const p = product.promo || {};
  return [product.store, product.id, p.label || '', p.end || p.start || ''].join('|');
}

export function describeOffer(product) {
  const store = STORE_NAMES[product.store] || product.store;
  const parts = [product.promo.label];
  if (product.promo.price !== null && product.promo.price !== undefined) {
    parts.push(`nu ${formatEuro(product.promo.price)}`);
    if (product.regularPrice) parts.push(`(was ${formatEuro(product.regularPrice)})`);
  }
  if (product.promo.end) parts.push(`t/m ${product.promo.end.split('-').reverse().join('-')}`);
  return { store, text: parts.join(' ') };
}

async function collectOffers(watchlist, providers, now) {
  const offers = new Map();
  const errors = [];

  const add = (product, item) => {
    if (!product || !isPromoActive(product.promo, now)) return;
    const key = offerKey(product);
    if (!offers.has(key)) offers.set(key, { key, product, watchIds: [] });
    offers.get(key).watchIds.push(item.id);
  };

  for (const item of watchlist) {
    try {
      if (item.type === 'product') {
        const provider = providers[item.store];
        if (!provider) continue;
        add(await provider.getProduct(item.productId), item);
      } else if (item.type === 'keyword') {
        for (const storeId of item.stores || Object.keys(providers)) {
          const provider = providers[storeId];
          if (!provider) continue;
          const results = await provider.search(item.query, { size: 50 });
          for (const product of results) {
            if (matchesQuery(`${product.brand} ${product.title}`, item.query)) add(product, item);
          }
        }
      }
    } catch (err) {
      errors.push({ watchId: item.id, message: err.message });
    }
  }
  return { offers: [...offers.values()], errors };
}

export async function runCheck({ store, providers, notifier, now = new Date() }) {
  const { offers, errors } = await collectOffers(store.data.watchlist, providers, now);
  const fresh = offers.filter((o) => !store.data.notified[o.key]);

  const messages = fresh.map(({ product }) => {
    const { store: storeName, text } = describeOffer(product);
    return {
      title: `☕ ${storeName}: ${product.title}`,
      body: text,
      url: product.url,
      icon: product.image || undefined,
      tag: `${product.store}-${product.id}`,
    };
  });

  let toSend = messages;
  if (messages.length > MAX_SEPARATE_MESSAGES) {
    toSend = [
      {
        title: `☕ ${messages.length} producten van je lijstje in de aanbieding`,
        body: fresh.map((o) => `${STORE_NAMES[o.product.store]}: ${o.product.title}`).join('\n'),
        tag: 'koffie-alarm-summary',
      },
    ];
  }

  const deliveryErrors = [];
  for (const message of toSend) {
    const result = await notifier.send(message);
    deliveryErrors.push(...result.errors);
  }

  const cutoff = now.getTime() - NOTIFIED_TTL_DAYS * 86_400_000;
  store.update((d) => {
    for (const o of fresh) d.notified[o.key] = now.getTime();
    for (const [key, at] of Object.entries(d.notified)) if (at < cutoff) delete d.notified[key];
    d.lastCheck = {
      at: now.toISOString(),
      onSale: offers.map((o) => ({ ...o.product, watchIds: o.watchIds })),
      newlyNotified: fresh.length,
      errors: [...errors, ...deliveryErrors.map((message) => ({ message }))],
    };
  });

  return store.data.lastCheck;
}
