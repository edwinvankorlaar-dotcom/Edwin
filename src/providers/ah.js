/**
 * Albert Heijn provider.
 *
 * Gebruikt de (onofficiële) API van de Appie-app. Er is een anoniem token nodig,
 * dat we ophalen en hergebruiken tot het verloopt.
 */
import { toEuro, toDateString } from '../util.js';

const DEFAULT_BASE = 'https://api.ah.nl';
const HEADERS = {
  'User-Agent': 'Appie/8.22.3',
  'x-application': 'AHWEBSHOP',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

export function createAhProvider({ baseUrl = process.env.AH_API_BASE || DEFAULT_BASE, fetchImpl = fetch } = {}) {
  let token = null;
  let tokenExpires = 0;

  async function getToken() {
    if (token && Date.now() < tokenExpires) return token;
    const res = await fetchImpl(`${baseUrl}/mobile-auth/v1/auth/token/anonymous`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ clientId: 'appie' }),
    });
    if (!res.ok) throw new Error(`AH token ophalen mislukt (HTTP ${res.status})`);
    const data = await res.json();
    token = data.access_token;
    // Ruim voor het verlopen een nieuw token halen.
    tokenExpires = Date.now() + Math.max(60, (Number(data.expires_in) || 3600) - 300) * 1000;
    return token;
  }

  async function request(path, retry = true) {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      headers: { ...HEADERS, Authorization: `Bearer ${await getToken()}` },
    });
    if (res.status === 401 && retry) {
      token = null;
      return request(path, false);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`AH API fout (HTTP ${res.status})`);
    return res.json();
  }

  return {
    id: 'ah',
    name: 'Albert Heijn',

    async search(query, { size = 30 } = {}) {
      const params = new URLSearchParams({ query, sortOn: 'RELEVANCE', page: '0', size: String(size) });
      const data = await request(`/mobile-services/product/search/v2?${params}`);
      return (data?.products || []).map(normalizeAhProduct).filter(Boolean);
    },

    async getProduct(id) {
      const data = await request(`/mobile-services/product/detail/v4/fir/${encodeURIComponent(id)}`);
      if (!data) return null;
      return normalizeAhProduct(data.productCard || data);
    },
  };
}

export function normalizeAhProduct(p) {
  if (!p || p.webshopId === undefined) return null;
  const id = String(p.webshopId);
  const regularPrice = toEuro(p.priceBeforeBonus ?? p.currentPrice);
  const currentPrice = toEuro(p.currentPrice ?? p.priceBeforeBonus);

  let promo = null;
  if (p.isBonus) {
    const label =
      p.bonusMechanism ||
      p.discountLabels?.map((l) => l.defaultDescription).filter(Boolean).join(', ') ||
      'Bonus';
    promo = {
      label,
      price: currentPrice !== regularPrice ? currentPrice : null,
      start: toDateString(p.bonusStartDate),
      end: toDateString(p.bonusEndDate),
    };
  }

  const images = Array.isArray(p.images) ? [...p.images] : [];
  images.sort((a, b) => Math.abs((a.width || 0) - 400) - Math.abs((b.width || 0) - 400));

  return {
    store: 'ah',
    id,
    title: p.title || '',
    brand: p.brand || '',
    size: p.salesUnitSize || '',
    image: images[0]?.url || null,
    price: promo?.price ?? regularPrice,
    regularPrice,
    promo,
    url: `https://www.ah.nl/producten/product/wi${id}`,
  };
}
