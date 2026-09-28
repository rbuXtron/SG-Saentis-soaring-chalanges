// scripts/snapshot.mjs
// ------------------------------------------------------------------
// Tägliche Ranglisten-Snapshots für den SG Säntis Cup.
// Erfasst ZWEI Ranglisten von der deployten Seite:
//   • Cup    -> snapshots/<saison>.json          (#rangliste)
//   • Badges -> snapshots/<saison>-badges.json    (#badge-ranking-container)
// Liest die Reihenfolge aus den data-pilot-Attributen (oben = Rang 1).
// Keine Scoring-Duplikation.
//
// Lokal:  SITE_URL="https://dein-projekt.vercel.app" node scripts/snapshot.mjs
// CI:     per GitHub Action (siehe daily-snapshot.yml)
// ------------------------------------------------------------------
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SITE_URL    = process.env.SITE_URL;
const OUT_DIR     = process.env.SNAPSHOT_DIR || 'snapshots';
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 60);
const WAIT_MS     = Number(process.env.WAIT_MS || 60000);

if (!SITE_URL) {
  console.error('❌  SITE_URL fehlt (z. B. https://dein-projekt.vercel.app)');
  process.exit(1);
}

// Die zwei Ranglisten: Tab-Kennung, Container-Selektor, Dateisuffix
const RANKINGS = [
  { name: 'Cup',    tab: 'rangliste', container: '#rangliste',                suffix: '' },
  { name: 'Badges', tab: 'badges',    container: '#badge-ranking-container',  suffix: '-badges' },
];

function seasonKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 9 ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
}
function utcDay(iso) { return new Date(iso).toISOString().slice(0, 10); }

// Rang = erste Nennung je Name (robust gegen Duplikate)
function ranksFromNames(names) {
  const ranks = {};
  let r = 0;
  for (const name of names) if (!(name in ranks)) ranks[name] = ++r;
  return ranks;
}

async function readOrderFromTab(page, tab, container) {
  // Tab aktivieren und auf die Zeilen im zugehörigen Container warten
  await page.click(`[data-tab="${tab}"]`).catch(() => {});
  try {
    await page.waitForSelector(`${container} [data-pilot]`, { timeout: WAIT_MS });
  } catch {
    return []; // Tab evtl. leer (z. B. noch keine Badges) -> kein Snapshot
  }
  return page.$$eval(`${container} [data-pilot]`, els =>
    els.map(el => el.getAttribute('data-pilot')).filter(Boolean));
}

async function writeSnapshot(suffix, ranks) {
  const file = join(OUT_DIR, `${seasonKey()}${suffix}.json`);
  await mkdir(dirname(file), { recursive: true });

  let hist = [];
  try { hist = JSON.parse(await readFile(file, 'utf8')); } catch { hist = []; }

  const now = new Date().toISOString();
  if (hist.length && utcDay(hist[hist.length - 1].t) === utcDay(now)) {
    hist[hist.length - 1] = { t: now, ranks };     // gleicher Tag -> ersetzen
  } else {
    hist.push({ t: now, ranks });
  }
  while (hist.length > MAX_HISTORY) hist.shift();

  await writeFile(file, JSON.stringify(hist, null, 2) + '\n', 'utf8');
  return { file, count: Object.keys(ranks).length, history: hist.length };
}

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    // Konsole der Seite mitschreiben (hilft beim Debuggen unter vercel dev)
    page.on('console', msg => {
      const t = msg.text();
      if (/pilot|error|fehler|badge/i.test(t)) console.log('   [seite]', t);
    });

    console.log(`→ Öffne ${SITE_URL} ...`);
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });

    // Auf sichtbare Ranglisten-Zeilen warten, NICHT auf window.pilotData.
    // Erst den Rangliste-Tab aktivieren, damit die Tabelle gebaut wird.
    console.log('→ Warte auf Pilotdaten / Rangliste ...');
    await page.click('[data-tab="rangliste"]').catch(() => {});
    try {
      await page.waitForSelector('#rangliste [data-pilot]', { timeout: WAIT_MS });
    } catch {
      // Fallback: irgendeine data-pilot-Zeile irgendwo auf der Seite
      await page.waitForSelector('[data-pilot]', { timeout: WAIT_MS });
    }
    console.log('→ Zeilen gefunden, lese Ranglisten ...');

    for (const r of RANKINGS) {
      const names = await readOrderFromTab(page, r.tab, r.container);
      if (!names.length) {
        console.log(`ℹ️   ${r.name}: keine Zeilen gefunden — übersprungen.`);
        continue;
      }
      const res = await writeSnapshot(r.suffix, ranksFromNames(names));
      console.log(`✅  ${r.name}: ${res.count} Piloten -> ${res.file} (Historie: ${res.history})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('❌ ', err.message); process.exit(1); });
