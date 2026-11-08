/**
 * Eenmalige controle vanaf de commandline, bv. voor cron:
 *   0 8,14,20 * * *  cd /pad/naar/app && npm run check
 */
import { createStore } from './store.js';
import { createProviders } from './providers/index.js';
import { createNotifier, loadVapidKeys } from './notify.js';
import { runCheck } from './checker.js';

const [command] = process.argv.slice(2);
if (command !== 'check') {
  console.log('Gebruik: node src/cli.js check');
  process.exit(1);
}

const store = createStore();
const notifier = createNotifier({ store, vapidKeys: loadVapidKeys() });
const result = await runCheck({ store, providers: createProviders(), notifier });

for (const p of result.onSale) console.log(`- [${p.store}] ${p.title}: ${p.promo.label}`);
for (const e of result.errors) console.error(`! ${e.message}`);
console.log(`${result.onSale.length} aanbieding(en), ${result.newlyNotified} nieuw gemeld.`);
process.exit(result.errors.length && !result.onSale.length ? 1 : 0);
