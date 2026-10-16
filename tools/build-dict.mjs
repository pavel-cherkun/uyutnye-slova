// Сборка словаря: node tools/build-dict.mjs
// Вход: tools/russian_nouns.txt (Harrix/Russian-Nouns, MIT) + tools/dict-labels.txt (разметка «СЛОВО код»).
// Выход: src/data/dict.json — { код: 'СЛОВО СЛОВО …' }.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const norm = (s) => s.trim().toUpperCase().replace(/Ё/g, 'Е');

const words = [...new Set(readFileSync(here('./russian_nouns.txt'), 'utf8').split('\n').map(norm)
  .filter((w) => /^[А-Я]{3,}$/.test(w)))];

const labels = new Map();
if (existsSync(here('./dict-labels.txt'))) {
  for (const line of readFileSync(here('./dict-labels.txt'), 'utf8').split('\n')) {
    const [w, code] = line.trim().split(/\s+/);
    if (w && code) labels.set(norm(w), code);
  }
}

// Абстрактные суффиксы → эссенции (если разметка не сказала иное)
const ABSTRACT = /(ОСТЬ|НИЕ|ТИЕ|СТВО|ИЗМ|ЦИЯ|ЕНЬЕ|АНЬЕ|ИЗНА)$/;
const out = {};
let skipped = 0;
for (const w of words) {
  let code = labels.get(w) || (ABSTRACT.test(w) ? 'ess' : 'misc');
  // skip — грубые/неприятные слова: в словаре остаются (слово валидно), но без категории
  if (code === 'skip') { skipped++; code = 'misc'; }
  (out[code] ||= []).push(w);
}
const json = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join(' ')]));
writeFileSync(here('../src/data/dict.json'), JSON.stringify(json));
console.log('слов:', words.length, 'без категории по пометке skip:', skipped);
console.log(Object.entries(out).map(([k, v]) => `${k}:${v.length}`).join(' '));
