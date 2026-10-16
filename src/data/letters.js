// Русский алфавит: очки (как в «Эрудите») и частоты (для выпадения букв).

export const ALPHABET = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'.split('');

export const LETTER_SCORE = {
  А: 1, Б: 3, В: 1, Г: 3, Д: 2, Е: 1, Ж: 5, З: 5, И: 1, Й: 4, К: 2, Л: 2, М: 2, Н: 1, О: 1, П: 2,
  Р: 1, С: 1, Т: 1, У: 2, Ф: 10, Х: 5, Ц: 5, Ч: 5, Ш: 8, Щ: 10, Ъ: 10, Ы: 4, Ь: 3, Э: 8, Ю: 8, Я: 3,
};

// Относительная частота выпадения
export const LETTER_WEIGHT = {
  О: 10, Е: 8, А: 8, И: 7, Н: 6.5, Т: 6, С: 5.5, Р: 5, В: 4.5, Л: 4.5, К: 4, М: 3.5, Д: 3, П: 3,
  У: 3, Я: 2.2, Ы: 2, Ь: 2, Г: 2, З: 1.8, Б: 1.8, Ч: 1.4, Й: 1.2, Х: 1, Ж: 1, Ш: 1, Ю: 0.7,
  Ц: 0.6, Щ: 0.4, Э: 0.4, Ф: 0.4, Ъ: 0.15,
};

const WEIGHT_TOTAL = Object.values(LETTER_WEIGHT).reduce((a, b) => a + b, 0);

export function randomLetter(rng = Math.random) {
  let r = rng() * WEIGHT_TOTAL;
  for (const [ch, w] of Object.entries(LETTER_WEIGHT)) {
    r -= w;
    if (r <= 0) return ch;
  }
  return 'О';
}

/** Верхний регистр, Ё → Е, только кириллица */
export function normWord(s) {
  return String(s).toUpperCase().replace(/Ё/g, 'Е').replace(/[^А-Я]/g, '');
}

export function wordScore(word) {
  const w = normWord(word);
  let s = 0;
  for (const ch of w) s += LETTER_SCORE[ch] || 0;
  // бонус за длину
  if (w.length >= 5) s += (w.length - 4) * 3;
  return s;
}
