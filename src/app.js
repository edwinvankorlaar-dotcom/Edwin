/**
 * HTTP-server: REST API + statische PWA-bestanden. Geen framework nodig.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck } from './checker.js';
import { STORES } from './providers/index.js';
import { randomId } from './util.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, 'Request te groot');
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Ongeldige JSON');
  }
}

function checkAuth(req, password) {
  if (!password) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const [, pass] = Buffer.from(header.slice(6), 'base64').toString().split(':');
  return pass === password;
}

function serveStatic(req, res, pathname) {
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Niet gevonden');
  }
  const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' };
  if (pathname === '/sw.js') headers['Cache-Control'] = 'no-cache';
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

export function createApp({ store, providers, notifier, vapidPublicKey, password = process.env.APP_PASSWORD }) {
  let checking = null;
  const check = () => {
    // Voorkom dat twee checks tegelijk lopen.
    checking ??= runCheck({ store, providers, notifier }).finally(() => (checking = null));
    return checking;
  };

  const routes = {
    'GET /api/status': () => ({
      lastCheck: store.data.lastCheck,
      vapidPublicKey,
      subscriptions: store.data.subscriptions.length,
      settings: store.data.settings,
      intervalHours: Number(process.env.CHECK_INTERVAL_HOURS || 6),
    }),

    'GET /api/search': async ({ url }) => {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) throw new HttpError(400, 'Zoekterm ontbreekt');
      const which = url.searchParams.get('store') || 'all';
      const stores = which === 'all' ? STORES : STORES.filter((s) => s === which);
      const results = await Promise.all(
        stores.map(async (s) => {
          try {
            return { store: s, products: await providers[s].search(q, { size: 30 }) };
          } catch (err) {
            return { store: s, products: [], error: err.message };
          }
        }),
      );
      return { results };
    },

    'GET /api/watchlist': () => ({ watchlist: store.data.watchlist }),

    'POST /api/watchlist': async ({ body }) => {
      let item;
      if (body.type === 'product') {
        if (!STORES.includes(body.store) || !body.productId) throw new HttpError(400, 'store en productId zijn verplicht');
        const exists = store.data.watchlist.find(
          (w) => w.type === 'product' && w.store === body.store && w.productId === String(body.productId),
        );
        if (exists) return { item: exists };
        item = {
          type: 'product',
          store: body.store,
          productId: String(body.productId),
          title: String(body.title || '').slice(0, 200),
          image: body.image || null,
          size: String(body.size || '').slice(0, 50),
        };
      } else if (body.type === 'keyword') {
        const query = String(body.query || '').trim().slice(0, 100);
        if (!query) throw new HttpError(400, 'Zoekterm is verplicht');
        const stores = (Array.isArray(body.stores) ? body.stores : STORES).filter((s) => STORES.includes(s));
        if (!stores.length) throw new HttpError(400, 'Kies minstens één winkel');
        item = { type: 'keyword', query, stores };
      } else {
        throw new HttpError(400, 'type moet "product" of "keyword" zijn');
      }
      item = { id: randomId(), addedAt: new Date().toISOString(), ...item };
      store.update((d) => d.watchlist.push(item));
      return { item };
    },

    'DELETE /api/watchlist': ({ url }) => {
      const id = url.searchParams.get('id');
      store.update((d) => {
        d.watchlist = d.watchlist.filter((w) => w.id !== id);
      });
      return { ok: true };
    },

    'PUT /api/settings': ({ body }) => {
      store.update((d) => {
        if (typeof body.ntfyTopic === 'string') d.settings.ntfyTopic = body.ntfyTopic.trim().slice(0, 64);
        if (typeof body.ntfyServer === 'string' && /^https?:\/\//.test(body.ntfyServer)) {
          d.settings.ntfyServer = body.ntfyServer.trim();
        }
      });
      return { settings: store.data.settings };
    },

    'POST /api/push/subscribe': ({ body }) => {
      if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) throw new HttpError(400, 'Ongeldig abonnement');
      store.update((d) => {
        d.subscriptions = d.subscriptions.filter((s) => s.endpoint !== body.endpoint);
        d.subscriptions.push({ endpoint: body.endpoint, keys: body.keys });
      });
      return { ok: true };
    },

    'POST /api/push/unsubscribe': ({ body }) => {
      store.update((d) => {
        d.subscriptions = d.subscriptions.filter((s) => s.endpoint !== body.endpoint);
      });
      return { ok: true };
    },

    'POST /api/notify/test': async () =>
      notifier.send({
        title: '☕ Koffie-alarm werkt!',
        body: 'Zo ziet een melding eruit als iets van je lijstje in de aanbieding is.',
        tag: 'koffie-alarm-test',
      }),

    'POST /api/check': async () => ({ lastCheck: await check() }),
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (!checkAuth(req, password)) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Koffie-alarm"' });
        return res.end('Inloggen vereist');
      }
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Methode niet toegestaan');
        return serveStatic(req, res, url.pathname);
      }
      const handler = routes[`${req.method} ${url.pathname}`];
      if (!handler) throw new HttpError(404, 'Onbekende route');
      const body = req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : {};
      sendJson(res, 200, await handler({ url, body }));
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: err.message });
    }
  });

  return { server, check };
}
