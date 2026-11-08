/**
 * Pushberichten versturen via:
 *  - Web Push (browser / als app op het beginscherm, Android + iOS 16.4+)
 *  - ntfy (gratis app voor iOS/Android, abonneer op een eigen "topic")
 */
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

export function loadVapidKeys(file = process.env.VAPID_FILE || path.resolve('data/vapid.json')) {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(keys, null, 2));
  return keys;
}

export function createNotifier({ store, vapidKeys, fetchImpl = fetch, webpushImpl = webpush } = {}) {
  if (vapidKeys) {
    webpushImpl.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:koffie-alarm@example.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey,
    );
  }

  async function sendWebPush(message) {
    const subs = store.data.subscriptions;
    if (!vapidKeys || subs.length === 0) return 0;
    const payload = JSON.stringify(message);
    const gone = new Set();
    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpushImpl.sendNotification(sub, payload, { TTL: 24 * 3600 });
          sent++;
        } catch (err) {
          // 404/410: abonnement bestaat niet meer, opruimen.
          if (err.statusCode === 404 || err.statusCode === 410) gone.add(sub.endpoint);
          else console.warn('[push] versturen mislukt:', err.message);
        }
      }),
    );
    if (gone.size) {
      store.update((d) => {
        d.subscriptions = d.subscriptions.filter((s) => !gone.has(s.endpoint));
      });
    }
    return sent;
  }

  async function sendNtfy(message) {
    const { ntfyServer, ntfyTopic } = store.data.settings;
    if (!ntfyTopic) return 0;
    const res = await fetchImpl(String(ntfyServer || 'https://ntfy.sh').replace(/\/+$/, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: ntfyTopic,
        title: message.title,
        message: message.body,
        tags: ['coffee'],
        click: message.url || undefined,
        icon: message.icon || undefined,
      }),
    });
    if (!res.ok) throw new Error(`ntfy fout (HTTP ${res.status})`);
    return 1;
  }

  return {
    /** Verstuur via alle ingestelde kanalen; geeft per kanaal het aantal terug. */
    async send(message) {
      const result = { webpush: 0, ntfy: 0, errors: [] };
      await Promise.all([
        sendWebPush(message).then((n) => (result.webpush = n)),
        sendNtfy(message)
          .then((n) => (result.ntfy = n))
          .catch((err) => result.errors.push(err.message)),
      ]);
      return result;
    },
  };
}
