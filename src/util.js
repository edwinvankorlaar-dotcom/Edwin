/** Kleine hulpfuncties die door meerdere modules gebruikt worden. */

export function toEuro(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function centsToEuro(cents) {
  const n = Number(cents);
  return Number.isFinite(n) ? Math.round(n) / 100 : null;
}

export function formatEuro(value) {
  if (value === null || value === undefined) return '';
  return `€ ${value.toFixed(2).replace('.', ',')}`;
}

/** Normaliseer een datum (ISO-string, Date of epoch ms) naar YYYY-MM-DD. */
export function toDateString(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function todayString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Loopt een aanbieding op `now`? Ontbrekende start/einddatum telt als open. */
export function isPromoActive(promo, now = new Date()) {
  if (!promo) return false;
  const today = todayString(now);
  if (promo.start && promo.start > today) return false;
  if (promo.end && promo.end < today) return false;
  return true;
}

/** Alle woorden uit de zoekterm moeten in de tekst voorkomen (hoofdletterongevoelig). */
export function matchesQuery(text, query) {
  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  const haystack = normalize(text);
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
