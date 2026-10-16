// Полный словарь существительных (≈50 тыс.), размеченный по категориям.
// Собирается скриптом tools/build-dict.mjs в src/data/dict.json и грузится при старте.

const DICT = new Map(); // СЛОВО → код категории ('ess' — эссенция, 'misc' — разное)
let loaded = false;

export async function loadDict() {
  if (loaded) return;
  try {
    const res = await fetch(new URL('./dict.json', import.meta.url));
    const data = await res.json();
    for (const [code, list] of Object.entries(data)) {
      for (const w of list.split(' ')) DICT.set(w, code);
    }
    loaded = true;
  } catch (e) {
    console.warn('Словарь не загрузился, работаем на малом словаре', e);
  }
}

export function dictCat(word) { return DICT.get(word); }
export function dictSize() { return DICT.size; }
export function dictWords() { return DICT.keys(); }
