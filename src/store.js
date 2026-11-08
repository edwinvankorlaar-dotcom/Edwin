/**
 * Eenvoudige opslag in een JSON-bestand (data/db.json).
 * Schrijven gaat atomair via een tijdelijk bestand + rename.
 */
import fs from 'node:fs';
import path from 'node:path';

const EMPTY = () => ({
  watchlist: [],
  notified: {},
  subscriptions: [],
  settings: { ntfyServer: 'https://ntfy.sh', ntfyTopic: '' },
  lastCheck: null,
});

export function createStore(file = process.env.DB_FILE || path.resolve('data/db.json')) {
  let data = EMPTY();
  if (fs.existsSync(file)) {
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    const empty = EMPTY();
    data = { ...empty, ...loaded, settings: { ...empty.settings, ...(loaded.settings || {}) } };
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    file,
    get data() {
      return data;
    },
    /** Pas de data aan via een callback en sla direct op. */
    update(fn) {
      const result = fn(data);
      save();
      return result;
    },
  };
}
