// Exporte les modèles de src/data/defaultTips.ts en un fichier JSON de BROUILLONS,
// à importer depuis le Studio admin (Réglages > Importer JSON).
// Usage : npm run export-templates
//
// Le fichier généré (private/cases-brouillons.json) et defaultTips.ts ne doivent
// PAS être publiés : ils contiennent les futures cases (voir .gitignore).
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src', 'data', 'defaultTips.ts');
const outDir = path.join(root, 'private');
const tmp = path.join(outDir, '.defaultTips.bundle.mjs');

if (!fs.existsSync(src)) {
  console.error(`Introuvable : ${src}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

await build({ entryPoints: [src], bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'error' });
const { DEFAULT_TIPS } = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
fs.rmSync(tmp, { force: true });

const isWeekday = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d >= 1 && d <= 5;
};

const cards = [];
const skipped = [];
for (const tpl of DEFAULT_TIPS) {
  const { day, date, ...content } = tpl;
  const iso = date ?? `2026-12-${String(day).padStart(2, '0')}`;
  if (!isWeekday(iso)) {
    skipped.push(iso);
    continue;
  }
  cards.push({ publish_date: iso, status: 'draft', content });
}

const outFile = path.join(outDir, 'cases-brouillons.json');
fs.writeFileSync(outFile, JSON.stringify({ exported_at: new Date().toISOString(), cards }, null, 2));
console.log(`✅ ${cards.length} case(s) brouillon exportée(s) -> ${outFile}`);
if (skipped.length) console.log(`⚠️  Ignorées (week-end) : ${skipped.join(', ')}`);
