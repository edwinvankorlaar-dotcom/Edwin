const STORE_NAMES = { ah: 'Albert Heijn', jumbo: 'Jumbo' };
const $ = (sel) => document.querySelector(sel);

let state = { watchlist: [], status: null };

/** Mini-helper om veilig DOM-elementen te maken (geen innerHTML met externe data). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fout ${res.status}`);
  return data;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3000);
}

const euro = (v) => (v === null || v === undefined ? '' : `€ ${Number(v).toFixed(2).replace('.', ',')}`);
const dateNl = (d) => (d ? d.split('-').reverse().join('-') : '');

/* ---------- Tabs ---------- */
document.querySelectorAll('.tabs button').forEach((btn) =>
  btn.addEventListener('click', () => showTab(btn.dataset.tab)),
);
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== `tab-${name}`));
  if (name === 'search' && !$('#search-results').childElementCount) search();
}

/* ---------- Productkaart ---------- */
function isWatched(product) {
  return state.watchlist.some((w) => w.type === 'product' && w.store === product.store && w.productId === product.id);
}

function productCard(product, { action } = {}) {
  const promo = product.promo;
  return h(
    'div',
    { class: 'product' },
    product.image ? h('img', { src: product.image, alt: '', loading: 'lazy' }) : h('div', { class: 'noimg' }, '☕'),
    h(
      'div',
      {},
      h('div', { class: 'title' }, product.title),
      h('div', { class: 'meta' }, [product.size, product.brand].filter(Boolean).join(' · ')),
      h(
        'div',
        { class: 'meta' },
        h('span', { class: 'price' }, euro(product.price)),
        promo && product.regularPrice && product.price !== product.regularPrice
          ? h('span', { class: 'was' }, euro(product.regularPrice))
          : null,
      ),
      h(
        'div',
        {},
        h('span', { class: `badge ${product.store}` }, STORE_NAMES[product.store]),
        promo ? h('span', { class: 'badge promo' }, promo.label + (promo.end ? ` t/m ${dateNl(promo.end)}` : '')) : null,
      ),
    ),
    action ? h('div', { class: 'actions' }, action) : null,
  );
}

function followButton(product) {
  const watched = isWatched(product);
  return h(
    'button',
    {
      class: `btn btn-small ${watched ? 'btn-outline' : ''}`,
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          if (isWatched(product)) {
            const item = state.watchlist.find((w) => w.type === 'product' && w.store === product.store && w.productId === product.id);
            await api(`/api/watchlist?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
            toast('Verwijderd van je lijstje');
          } else {
            await api('/api/watchlist', {
              method: 'POST',
              body: { type: 'product', store: product.store, productId: product.id, title: product.title, image: product.image, size: product.size },
            });
            toast(product.promo ? 'Toegevoegd — en nu al in de aanbieding!' : 'Toegevoegd aan je lijstje');
          }
          await loadWatchlist();
          btn.replaceWith(followButton(product));
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
        }
      },
    },
    watched ? '✓ Volgend' : '+ Volg',
  );
}

/* ---------- Mijn lijst ---------- */
async function loadWatchlist() {
  state.watchlist = (await api('/api/watchlist')).watchlist;
  renderWatchlist();
}

function renderWatchlist() {
  const el = $('#watchlist');
  el.replaceChildren();
  if (!state.watchlist.length) {
    el.append(h('div', { class: 'empty' }, 'Je lijstje is nog leeg. Ga naar ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); showTab('search'); } }, 'Zoeken'), ' en volg je favoriete koffie.'));
    return;
  }
  const remove = (item) =>
    h('button', {
      class: 'btn btn-small btn-outline',
      onclick: async () => {
        await api(`/api/watchlist?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        await loadWatchlist();
        toast('Verwijderd');
      },
    }, 'Verwijder');

  const list = h('div', { class: 'products' });
  for (const item of state.watchlist) {
    if (item.type === 'product') {
      list.append(
        h('div', { class: 'product' },
          item.image ? h('img', { src: item.image, alt: '', loading: 'lazy' }) : h('div', { class: 'noimg' }, '☕'),
          h('div', {},
            h('div', { class: 'title' }, item.title || item.productId),
            h('div', { class: 'meta' }, item.size || ''),
            h('span', { class: `badge ${item.store}` }, STORE_NAMES[item.store])),
          h('div', { class: 'actions' }, remove(item))),
      );
    } else {
      list.append(
        h('div', { class: 'product' },
          h('div', { class: 'noimg' }, '🔎'),
          h('div', {},
            h('div', { class: 'title' }, `„${item.query}”`),
            h('div', { class: 'meta' }, 'Elk product met deze woorden in de naam'),
            h('span', { class: 'badge keyword' }, 'Zoekterm'),
            ...item.stores.map((s) => h('span', { class: `badge ${s}` }, STORE_NAMES[s]))),
          h('div', { class: 'actions' }, remove(item))),
      );
    }
  }
  el.append(list);
}

async function loadStatus() {
  state.status = await api('/api/status');
  renderStatus();
}

function renderStatus() {
  const { lastCheck } = state.status;
  $('#last-check').textContent = lastCheck
    ? `Laatst gecontroleerd: ${new Date(lastCheck.at).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}`
    : 'Nog niet gecontroleerd';
  $('#check-errors').textContent = lastCheck?.errors?.length ? ` · ${lastCheck.errors.length} fout(en): ${lastCheck.errors[0].message}` : '';
  $('#check-errors').classList.toggle('error', !!lastCheck?.errors?.length);

  const onSale = $('#on-sale');
  onSale.replaceChildren();
  const items = lastCheck?.onSale || [];
  if (!items.length) {
    onSale.append(h('div', { class: 'empty' }, lastCheck ? 'Niets van je lijstje is nu in de aanbieding.' : 'Druk op „Nu controleren”.'));
  } else {
    for (const p of items) onSale.append(productCard(p, { action: h('a', { class: 'btn btn-small btn-outline', href: p.url, target: '_blank', rel: 'noopener' }, 'Bekijk') }));
  }

  const { settings } = state.status;
  $('#ntfy-topic').value = settings.ntfyTopic || '';
  $('#ntfy-server').value = settings.ntfyServer || '';
}

$('#check-now').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Bezig…';
  try {
    const { lastCheck } = await api('/api/check', { method: 'POST' });
    state.status.lastCheck = lastCheck;
    renderStatus();
    toast(lastCheck.newlyNotified ? `${lastCheck.newlyNotified} nieuwe aanbieding(en) gemeld!` : 'Klaar — geen nieuwe aanbiedingen');
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Nu controleren';
  }
});

/* ---------- Zoeken ---------- */
$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  search();
});

async function search() {
  const q = $('#q').value.trim();
  const store = $('#store').value;
  if (!q) return;
  const el = $('#search-results');
  el.replaceChildren(h('div', { class: 'empty' }, 'Zoeken…'));
  $('#keyword-hint').hidden = false;
  $('#keyword-text').textContent = q;
  try {
    const { results } = await api(`/api/search?q=${encodeURIComponent(q)}&store=${store}`);
    el.replaceChildren();
    for (const r of results) {
      el.append(h('div', { class: 'store-heading' }, h('span', { class: `badge ${r.store}` }, STORE_NAMES[r.store]), h('span', { class: 'muted' }, `${r.products.length} resultaten`)));
      if (r.error) el.append(h('div', { class: 'empty error' }, `Kon ${STORE_NAMES[r.store]} niet bereiken: ${r.error}`));
      else if (!r.products.length) el.append(h('div', { class: 'empty' }, 'Geen producten gevonden.'));
      const list = h('div', { class: 'products' });
      // Aanbiedingen bovenaan.
      [...r.products].sort((a, b) => !!b.promo - !!a.promo).forEach((p) => list.append(productCard(p, { action: followButton(p) })));
      el.append(list);
    }
  } catch (err) {
    el.replaceChildren(h('div', { class: 'empty error' }, err.message));
  }
}

$('#add-keyword').addEventListener('click', async () => {
  const q = $('#q').value.trim();
  const store = $('#store').value;
  try {
    await api('/api/watchlist', { method: 'POST', body: { type: 'keyword', query: q, stores: store === 'all' ? ['ah', 'jumbo'] : [store] } });
    await loadWatchlist();
    toast(`Je volgt nu alles met „${q}”`);
  } catch (err) {
    toast(err.message);
  }
});

/* ---------- Pushberichten ---------- */
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js');
}

async function renderPushState() {
  const stateEl = $('#push-state');
  const btn = $('#push-toggle');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    stateEl.textContent = 'Deze browser ondersteunt geen pushberichten. Op iPhone: zet de app eerst op je beginscherm. Je kunt ook ntfy gebruiken.';
    btn.hidden = true;
    return;
  }
  const reg = await getRegistration();
  const sub = await reg.pushManager.getSubscription();
  if (Notification.permission === 'denied') {
    stateEl.textContent = 'Meldingen zijn geblokkeerd in je browserinstellingen.';
    btn.hidden = true;
  } else {
    stateEl.textContent = sub ? '✅ Pushberichten staan aan op dit apparaat.' : 'Pushberichten staan uit op dit apparaat.';
    btn.textContent = sub ? 'Pushberichten uitzetten' : 'Pushberichten aanzetten';
    btn.classList.toggle('btn-outline', !!sub);
  }
}

$('#push-toggle').addEventListener('click', async () => {
  try {
    const reg = await getRegistration();
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: existing.endpoint } });
      await existing.unsubscribe();
      toast('Pushberichten uitgezet');
    } else {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Geen toestemming voor meldingen');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(state.status.vapidPublicKey),
      });
      await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
      toast('Pushberichten aangezet');
    }
  } catch (err) {
    toast(err.message);
  }
  renderPushState();
});

$('#ntfy-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/settings', { method: 'PUT', body: { ntfyTopic: $('#ntfy-topic').value, ntfyServer: $('#ntfy-server').value || 'https://ntfy.sh' } });
    toast('Opgeslagen');
  } catch (err) {
    toast(err.message);
  }
});

$('#test-push').addEventListener('click', async () => {
  try {
    const r = await api('/api/notify/test', { method: 'POST' });
    const parts = [`${r.webpush} apparaat/apparaten`, r.ntfy ? 'ntfy ✓' : null, ...r.errors].filter(Boolean);
    $('#test-result').textContent = r.webpush || r.ntfy ? `Verstuurd naar ${parts.join(', ')}` : 'Nog geen meldingskanaal ingesteld.';
  } catch (err) {
    $('#test-result').textContent = err.message;
  }
});

/* ---------- Start ---------- */
Promise.all([loadWatchlist(), loadStatus()])
  .then(renderPushState)
  .catch((err) => toast(err.message));
