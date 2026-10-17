// Полный словарь существительных (≈50 тыс.), размеченный по категориям.
// Собирается скриптом tools/build-dict.mjs в src/data/dict.json и грузится при старте.
// Загрузка с повторами: на телефоне с плохой сетью первая попытка может сорваться.

const DICT = new Map(); // СЛОВО → код категории ('ess' — эссенция, 'misc' — разное)
let loaded = false;
let loading = null;

async function fetchOnce() {
  const res = await fetch(new URL('./dict.json', import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  for (const [code, list] of Object.entries(data)) {
    for (const w of list.split(' ')) DICT.set(w, code);
  }
  loaded = true;
}

/** Загрузить словарь (до 4 попыток с паузой). Повторный вызов после неудачи пробует снова. */
export function loadDict() {
  if (loaded) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    for (let i = 0; i < 4 && !loaded; i++) {
      try { await fetchOnce(); } catch (e) {
        console.warn('Словарь: попытка', i + 1, e);
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
    loading = null;
  })();
  return loading;
}

export const dictReady = () => loaded;
export function dictCat(word) { return DICT.get(word); }
export function dictSize() { return DICT.size; }
export function dictWords() { return DICT.keys(); }
