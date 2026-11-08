import { createApp } from './app.js';
import { createStore } from './store.js';
import { createProviders } from './providers/index.js';
import { createNotifier, loadVapidKeys } from './notify.js';

const port = Number(process.env.PORT || 3000);
const intervalHours = Number(process.env.CHECK_INTERVAL_HOURS || 6);

const store = createStore();
const vapidKeys = loadVapidKeys();
const providers = createProviders();
const notifier = createNotifier({ store, vapidKeys });
const { server, check } = createApp({ store, providers, notifier, vapidPublicKey: vapidKeys.publicKey });

async function scheduledCheck() {
  try {
    const result = await check();
    console.log(
      `[check] ${result.at}: ${result.onSale.length} aanbieding(en), ${result.newlyNotified} nieuw gemeld` +
        (result.errors.length ? `, ${result.errors.length} fout(en)` : ''),
    );
  } catch (err) {
    console.error('[check] mislukt:', err);
  }
}

server.listen(port, () => {
  console.log(`☕ Koffie-alarm draait op http://localhost:${port}${process.env.DEMO === '1' ? ' (demo-modus)' : ''}`);
  console.log(`   Controle elke ${intervalHours} uur.`);
  setTimeout(scheduledCheck, 5_000);
  setInterval(scheduledCheck, intervalHours * 3600 * 1000);
});
