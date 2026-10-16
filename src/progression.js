// Прогрессия: какие буквы алфавита уже открыты. Открываются составленными в Эрудите словами.

import { state, commit } from './state.js';
import { LETTER_STAGES, setAllowedLetters } from './data/letters.js';

export const wordsCount = () => Object.keys(state.progress.wordsMade).length;

export function openLetters() {
  return LETTER_STAGES.slice(0, (state.progress.letterStage || 0) + 1).map((s) => s.letters).join('');
}

/** Следующая ступень: { need, letters } или null, если открыт весь алфавит */
export function nextStage() {
  const st = LETTER_STAGES[(state.progress.letterStage || 0) + 1];
  return st ? { need: st.words - wordsCount(), letters: st.letters } : null;
}

export function syncLetters() { setAllowedLetters(openLetters()); }

/** Проверить, не пора ли открыть новые буквы. Возвращает строку открытых букв или ''. */
export function checkLetterUnlock() {
  let opened = '';
  while (true) {
    const st = LETTER_STAGES[(state.progress.letterStage || 0) + 1];
    if (!st || wordsCount() < st.words) break;
    state.progress.letterStage = (state.progress.letterStage || 0) + 1;
    opened += st.letters;
  }
  if (opened) { commit(); syncLetters(); }
  return opened;
}
