# ☕ Koffie-alarm

Eén app voor **Albert Heijn** én **Jumbo**: zoek producten in beide winkels, zet ze op je
watchlist en krijg een **pushbericht** zodra iets van je lijstje in de aanbieding is.
Gemaakt met koffie in gedachten, maar het werkt voor elk product.

## Wat kan het?

- 🔎 **Zoeken** in het assortiment van AH en Jumbo tegelijk (aanbiedingen staan bovenaan).
- ⭐ **Volgen** van een specifiek product (bv. *Douwe Egberts Aroma rood 500 g bij de Jumbo*).
- 🏷️ **Zoekterm volgen**, bv. „douwe egberts bonen”: elk product in de gekozen winkel(s) met
  al die woorden in de naam dat in de aanbieding komt, levert een melding op.
- 🔔 **Pushberichten** via de browser (ook als app op je beginscherm) en/of de gratis
  [ntfy](https://ntfy.sh)-app voor iPhone en Android.
- 🧠 Je krijgt per aanbieding maar **één** melding; een nieuwe aanbiedingsperiode wordt wel weer gemeld.
- ⏰ Controleert automatisch elke 6 uur (instelbaar), of direct met **Nu controleren**.

## Snel proberen (demo, zonder winkel-API's)

```bash
npm install
npm run demo
```

Open <http://localhost:3000>. In demo-modus wordt een nepcatalogus gebruikt waarvan de
aanbiedingen elke dag wisselen.

## Echt gebruiken

```bash
npm install
npm start            # http://localhost:3000
```

of met Docker (bv. op een Raspberry Pi, NAS of VPS):

```bash
docker compose up -d
```

De app moet blijven draaien om op de achtergrond te kunnen controleren. Je watchlist,
instellingen en sleutels worden bewaard in de map `data/`.

### Meldingen instellen

Ga in de app naar het tabblad **Meldingen** en kies één (of beide) van:

1. **Pushberichten op dit apparaat** – druk op *Pushberichten aanzetten*.
   - Werkt in Chrome/Edge/Firefox (desktop en Android).
   - iPhone/iPad (iOS 16.4+): open de site in Safari → *Deel* → *Zet op beginscherm*,
     open de app vanaf het beginscherm en zet daar de pushberichten aan.
   - Browsers staan pushberichten alleen toe via **https** (of `localhost`). Zet de app dus
     achter een reverse proxy met een certificaat (bv. Caddy, Nginx Proxy Manager,
     Cloudflare Tunnel of Tailscale Serve) als je hem vanaf je telefoon gebruikt.
2. **ntfy** – installeer de ntfy-app, abonneer je op een zelfbedachte, moeilijk te raden
   topicnaam (bv. `koffie-edwin-8k2p`) en vul diezelfde naam in bij de app. Dit werkt ook
   zonder https en is de makkelijkste optie voor iPhone.

Met **Stuur testbericht** controleer je of alles werkt.

### Instellingen (omgevingsvariabelen)

| Variabele              | Standaard                          | Uitleg |
|------------------------|------------------------------------|--------|
| `PORT`                 | `3000`                             | Poort van de webserver |
| `CHECK_INTERVAL_HOURS` | `6`                                | Hoe vaak de watchlist gecontroleerd wordt |
| `APP_PASSWORD`         | –                                  | Zet een wachtwoord (HTTP Basic Auth, gebruikersnaam maakt niet uit). Aanrader als de app vanaf internet bereikbaar is |
| `DEMO`                 | –                                  | `1` = demo-catalogus i.p.v. de echte winkels |
| `DB_FILE`              | `data/db.json`                     | Opslag van watchlist en instellingen |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | automatisch in `data/vapid.json` | Sleutels voor Web Push |
| `VAPID_SUBJECT`        | `mailto:koffie-alarm@example.com`  | Contactadres voor Web Push-diensten |
| `AH_API_BASE`          | `https://api.ah.nl`                | Basis-URL van de AH-API |
| `JUMBO_API_BASE`       | `https://mobileapi.jumbo.com/v17`  | Basis-URL van de Jumbo-API |

### Alleen controleren via cron

Wil je geen server laten draaien voor de controle zelf, dan kan het ook eenmalig:

```bash
npm run check
```

bijvoorbeeld via cron: `0 8,14,20 * * * cd /pad/naar/koffie-alarm && npm run check`.
(Voor de web-interface en het aanzetten van browser-push moet `npm start` wel draaien.)

## Hoe werkt het?

```
public/            PWA: index.html, app.js, styles.css, service worker (sw.js), manifest
src/server.js      start de webserver + periodieke controle
src/app.js         REST API (/api/search, /api/watchlist, /api/check, ...)
src/checker.js     vergelijkt watchlist met actuele aanbiedingen, voorkomt dubbele meldingen
src/notify.js      Web Push + ntfy
src/providers/     ah.js, jumbo.js (echte winkels) en demo.js
src/store.js       opslag in data/db.json
test/              tests (npm test)
```

## Let op

Albert Heijn en Jumbo hebben geen officiële openbare API. Deze app gebruikt dezelfde
(onofficiële) API's als hun eigen mobiele apps. Die kunnen zonder aankondiging veranderen;
als zoeken of controleren dan foutmeldingen geeft, moet de betreffende provider in
`src/providers/` worden bijgewerkt. Gebruik de app voor persoonlijk gebruik en controleer
niet vaker dan nodig (de standaard van elke 6 uur is ruim voldoende – aanbiedingen wisselen
meestal wekelijks).
