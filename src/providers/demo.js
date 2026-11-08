/**
 * Demo provider: nepcatalogus zodat je de app kunt uitproberen zonder
 * verbinding met de echte winkel-API's (start met `npm run demo`).
 * Welke producten in de aanbieding zijn wisselt per dag.
 */
import { matchesQuery, todayString } from '../util.js';

const CATALOG = {
  ah: [
    ['ah-1', 'Douwe Egberts Aroma rood filterkoffie', 'Douwe Egberts', '500 g', 6.49, '2e halve prijs'],
    ['ah-2', 'AH Excellent koffiebonen espresso', 'AH Excellent', '1 kg', 13.99, '25% korting'],
    ['ah-3', 'L\'OR Espresso Forza capsules', "L'OR", '20 stuks', 6.29, '1+1 gratis'],
    ['ah-4', 'Senseo Classic koffiepads', 'Senseo', '36 stuks', 4.79, '2 voor € 7,50'],
    ['ah-5', 'Lavazza Qualità Oro bonen', 'Lavazza', '1 kg', 18.49, '30% korting'],
    ['ah-6', 'Nescafé Gold oploskoffie', 'Nescafé', '200 g', 9.99, '2e gratis'],
  ],
  jumbo: [
    ['j-1', 'Douwe Egberts Aroma rood filterkoffie', 'Douwe Egberts', '500 g', 6.59, '2 voor € 10,00'],
    ['j-2', 'Jumbo koffiebonen extra intens', 'Jumbo', '1 kg', 9.49, '25% korting'],
    ['j-3', 'Senseo Classic koffiepads', 'Senseo', '36 stuks', 4.89, '1+1 gratis'],
    ['j-4', 'Lavazza Crema e Aroma bonen', 'Lavazza', '1 kg', 17.99, '35% korting'],
    ['j-5', 'Nespresso compatible Lungo capsules', 'Jumbo', '20 stuks', 3.99, '2e halve prijs'],
    ['j-6', 'Kanis & Gunnink snelfilterkoffie', 'Kanis & Gunnink', '500 g', 5.29, '20% korting'],
  ],
};

function dayNumber(now) {
  return Math.floor(now.getTime() / 86_400_000);
}

function build(store, row, index, now) {
  const [id, title, brand, size, regularPrice, label] = row;
  const onSale = (index + dayNumber(now)) % 2 === 0;
  const today = todayString(now);
  const end = todayString(new Date(now.getTime() + 6 * 86_400_000));
  const promoPrice = /(\d+)% korting/.exec(label);
  const price = promoPrice ? Math.round(regularPrice * (100 - Number(promoPrice[1]))) / 100 : null;
  return {
    store,
    id,
    title,
    brand,
    size,
    image: null,
    price: onSale && price ? price : regularPrice,
    regularPrice,
    promo: onSale ? { label, price, start: today, end } : null,
    url: store === 'ah' ? 'https://www.ah.nl/bonus' : 'https://www.jumbo.com/aanbiedingen',
  };
}

export function createDemoProvider(store, { now = () => new Date() } = {}) {
  const rows = CATALOG[store];
  const all = () => rows.map((row, i) => build(store, row, i, now()));
  return {
    id: store,
    name: store === 'ah' ? 'Albert Heijn (demo)' : 'Jumbo (demo)',
    async search(query) {
      const words = String(query).toLowerCase().trim();
      if (!words || words === 'koffie') return all();
      return all().filter((p) => matchesQuery(`${p.brand} ${p.title}`, words));
    },
    async getProduct(id) {
      return all().find((p) => p.id === id) || null;
    },
  };
}
