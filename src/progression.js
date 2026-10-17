// Прогрессия: какие буквы алфавита уже открыты. Открываются составленными в Эрудите словами.

import { state, commit } from './state.js';
import { LETTER_STAGES, setAllowedLetters } from './data/letters.js';
import { applyReward } from './state.js';
import { randomLetter as rl } from './data/letters.js';
import { ITEMS } from './data/items.js';
import { floatText, celebrateLevel } from './ui/fx.js';

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

// ---------- Уровень игрока ----------

const xpFor = (lvl) => 40 + (lvl - 1) * 30; // сколько опыта нужно на уровень lvl → lvl+1

export function levelInfo(xp = state.xp || 0) {
  let lvl = 1, rest = xp;
  while (rest >= xpFor(lvl)) { rest -= xpFor(lvl); lvl++; }
  return { lvl, cur: rest, need: xpFor(lvl) };
}

/** Опыт за маленькие победы. at — точка на экране для всплывающего «+N». */
export function gainXP(n, at) {
  if (!n) return;
  const before = levelInfo().lvl;
  state.xp = (state.xp || 0) + n;
  commit();
  floatText(`+${n} ⭐`, at?.x ?? innerWidth / 2, at?.y ?? 120);
  const after = levelInfo().lvl;
  for (let lvl = before + 1; lvl <= after; lvl++) celebrateLevel(lvl, levelReward(lvl));
}

function levelReward(lvl) {
  let letters = '';
  for (let i = 0; i < 4 + lvl; i++) letters += rl();
  const reward = { energy: 10 + lvl * 2, letters };
  if (lvl % 2 === 0) reward.keys = 1;
  if (lvl % 3 === 0) {
    const pool = ITEMS.filter((it) => it.rarity === (lvl % 6 === 0 ? 'l' : 'e'));
    reward.items = { [pool[Math.floor(Math.random() * pool.length)].id]: 1 };
  }
  applyReward(reward);
  return reward;
}

// Опыт за слово — по редкости; новое слово ×2
export const WORD_XP = { c: 4, r: 8, e: 15, l: 30 };
