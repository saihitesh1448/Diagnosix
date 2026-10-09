// Auto-generated locale consistency snapshot for Diagnosix.
// Run via: node src/localeAnalytica.cjs (from the repo root)
const fs = require('fs');
const path = require('path');

const baseDir = process.cwd();
const localesDir = path.join(baseDir, 'src', 'locales');
const providersDir = path.join(baseDir, 'src', 'providers');

function readFileSync(p) {
  return fs.readFileSync(p, 'utf8');
}

const KEYS_RAW = readFileSync(path.join(localesDir, 'keys.json'));
const teInHead = KEYS_RAW.indexOf('"te-IN"');
const teInBlock = KEYS_RAW.slice(teInHead);
const endTeIn = teInBlock.indexOf('}', teInBlock.indexOf('{'));

const KEYS = JSON.parse(readFileSync(path.join(localesDir, 'keys.json')));
const keysTeStory = KEYS['te-IN']?.['storyteller.teSummary'] ?? 'MISSING';

const lpSource = readFileSync(path.join(providersDir, 'LanguageProvider.tsx'));
const LANG_CODES = ['en-IN', 'hi-IN', 'te-IN', 'en-US'];

function extractFourLangBlock(source, key) {
  const out = {};
  const start = source.indexOf(`'${key}':`);
  if (start < 0) return out;
  const block = source.slice(start, start + 1200);
  const lines = block.split('\n');
  const content = lines.slice(1).join('\n');
  for (const code of LANG_CODES) {
    const idx = content.indexOf(code);
    if (idx < 0) continue;
    const colonIdx = content.indexOf(':', idx);
    if (colonIdx < 0) continue;
    const after = content.slice(colonIdx + 1).trimStart();
    const q = after[0];
    if (q !== "'" && q !== '"') continue;
    const end = after.indexOf(q, 1);
    out[code] = end >= 0 ? after.slice(1, end) : '';
  }
  return out;
}

const lpBlock = extractFourLangBlock(lpSource, 'storyteller.teSummary');
const lpTeStory = lpBlock['te-IN'] ?? 'MISSING';
const lpTeHi = lpBlock['hi-IN'] ?? 'MISSING';

console.log('--- TELUGU storyteller.teSummary REPR ---');
console.log('1) LanguageProvider.teSummary te-IN excerpt           :', JSON.stringify(String(lpTeStory).slice(0, 80)));
console.log('2) keys.json te-IN storyteller.teSummary excerpt      :', JSON.stringify(String(keysTeStory).slice(0, 80)));
console.log('3) TELUGU storyteller.teSummary nonzero length        :', String(lpTeStory).trim().length > 40);
console.log('4) TELUGU storyteller.teSummary != English source    :', !String(lpTeStory).includes('Your report checked platelets'));
console.log('5) TELUGU storyteller.teSummary matches keys.json     :', String(lpTeStory).trim() === String(keysTeStory).trim());
console.log('--- HINDI storyteller.teSummary HI-IN ---');
console.log('6) LanguageProvider.teSummary hi-IN is HINDI (not Telugu):', String(lpTeHi).includes('डॉक्टर'));
