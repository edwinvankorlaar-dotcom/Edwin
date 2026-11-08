/**
 * Jumbo provider.
 *
 * Gebruikt de (onofficiële) mobiele API van Jumbo. Prijzen staan daar in centen.
 */
import { centsToEuro, toDateString } from '../util.js';

const DEFAULT_BASE = 'https://mobileapi.jumbo.com/v17';
const HEADERS = {
  'User-Agent': 'Jumbo/9.6.0 (Android)',
  Accept: 'application/json',
};

export function createJumboProvider({ baseUrl = process.env.JUMBO_API_BASE || DEFAULT_BASE, fetchImpl = fetch } = {}) {
  async function request(path) {
    const res = await fetchImpl(`${baseUrl}${path}`, { headers: HEADERS });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Jumbo API fout (HTTP ${res.status})`);
    return res.json();
  }

  return {
    id: 'jumbo',
    name: 'Jumbo',

    async search(query, { size = 30 } = {}) {
      const params = new URLSearchParams({ q: query, offset: '0', limit: String(size) });
      const data = await request(`/search?${params}`);
      return (data?.products?.data || []).map(normalizeJumboProduct).filter(Boolean);
    },

    async getProduct(id) {
      const data = await request(`/products/${encodeURIComponent(id)}`);
      return normalizeJumboProduct(data?.product?.data ?? data?.product ?? null);
    },
  };
}

export function normalizeJumboProduct(p) {
  if (!p || !p.id) return null;
  const prices = p.prices || {};
  const regularPrice = centsToEuro(prices.price?.amount);
  const promoPrice = centsToEuro(prices.promotionalPrice?.amount);

  // De promotie kan op verschillende plekken staan, afhankelijk van de API-versie.
  const promotion = p.promotion || (Array.isArray(p.promotions) ? p.promotions[0] : null);

  let promo = null;
  if (promotion || promoPrice !== null) {
    const label =
      promotion?.name ||
      promotion?.summary ||
      promotion?.tags?.map((t) => t.text).filter(Boolean).join(', ') ||
      p.badgeDescription ||
      'Aanbieding';
    promo = {
      label,
      price: promoPrice,
      start: toDateString(promotion?.fromDate ?? promotion?.startDate),
      end: toDateString(promotion?.toDate ?? promotion?.endDate),
    };
  }

  const views = p.imageInfo?.primaryView || [];
  const image = [...views].sort((a, b) => Math.abs((a.width || 0) - 400) - Math.abs((b.width || 0) - 400))[0]?.url || null;
  const title = p.title || '';

  return {
    store: 'jumbo',
    id: String(p.id),
    title,
    brand: p.brand || '',
    size: p.quantity || '',
    image,
    price: promo?.price ?? regularPrice,
    regularPrice,
    promo,
    url: `https://www.jumbo.com/producten/?searchTerms=${encodeURIComponent(title)}`,
  };
}
