// Места для «Поиска предметов». Каждое место открывается, когда игрок собирает его название в Эрудите
// (КУХНЯ открыта сразу). Предметы на сцене берутся из категорий места.

import { normWord } from './letters.js';

export const PLACES = [
  { word: 'КУХНЯ',      icon: '🍳', cats: ['dishes', 'food', 'drinks'], color: '#ff7a1a', free: true },
  { word: 'САД',        icon: '🌻', cats: ['plants', 'nature'],          color: '#22d68a' },
  { word: 'ЛЕС',        icon: '🌲', cats: ['nature', 'plants', 'pets'],  color: '#3fb950' },
  { word: 'КАФЕ',       icon: '☕', cats: ['drinks', 'food', 'dishes'],  color: '#c98b62' },
  { word: 'ШКАФ',       icon: '👗', cats: ['clothes', 'accessory'],      color: '#ff5fa2' },
  { word: 'ПАРК',       icon: '🎡', cats: ['sport', 'plants', 'pets'],   color: '#4fb8ff' },
  { word: 'МОРЕ',       icon: '🌊', cats: ['nature', 'transport', 'sport'], color: '#2f8fff' },
  { word: 'ОФИС',       icon: '🖥️', cats: ['tech', 'stationery'],        color: '#8c7bff' },
  { word: 'РЫНОК',      icon: '🧺', cats: ['food', 'drinks', 'dishes', 'plants'], color: '#ffd60a' },
  { word: 'ДВОР',       icon: '🐕', cats: ['pets', 'plants', 'tools'],   color: '#9fd400' },
  { word: 'ШКОЛА',      icon: '🎒', cats: ['stationery', 'sport', 'tech'], color: '#ffb000' },
  { word: 'ГАРАЖ',      icon: '🔧', cats: ['tools', 'transport'],        color: '#7d8590' },
  { word: 'ЗАМОК',      icon: '🏰', cats: ['fantasy', 'decor', 'walldecor'], color: '#b46bff' },
  { word: 'ТЕАТР',      icon: '🎭', cats: ['music', 'clothes', 'light'], color: '#e8445a' },
  { word: 'ЧЕРДАК',     icon: '🕯️', cats: ['decor', 'music', 'fantasy', 'light'], color: '#a0522d' },
  { word: 'ВАННАЯ',     icon: '🛁', cats: ['bath', 'plants'],            color: '#4fd1ff' },
  { word: 'ВОКЗАЛ',     icon: '🚉', cats: ['transport', 'food', 'accessory'], color: '#5d5d66' },
  { word: 'ГОСТИНАЯ',   icon: '🛋️', cats: ['furniture', 'light', 'walldecor', 'decor'], color: '#ff8a3d' },
  { word: 'МАСТЕРСКАЯ', icon: '🪚', cats: ['tools', 'furniture', 'stationery'], color: '#b8860b' },
  { word: 'ОРАНЖЕРЕЯ',  icon: '🌺', cats: ['plants', 'nature'],          color: '#ff6fa1' },
];

const BY_WORD = Object.fromEntries(PLACES.map((p) => [p.word, p]));

/** Место по слову (или null). */
export function placeForWord(word) { return BY_WORD[normWord(word)] || null; }

/** Открытые места: state.progress.places — массив слов. */
export function openPlaces(state) {
  const list = (state.progress.places ||= PLACES.filter((p) => p.free).map((p) => p.word));
  return PLACES.filter((p) => list.includes(p.word));
}

/** Открыть место; true — если оно было закрыто. */
export function unlockPlace(state, word) {
  const p = placeForWord(word);
  if (!p) return false;
  const list = (state.progress.places ||= PLACES.filter((x) => x.free).map((x) => x.word));
  if (list.includes(p.word)) return false;
  list.push(p.word);
  return true;
}

/**
 * Темы — общие для Поиска, Мерджа и Пасьянса: это категории всех открытых мест.
 * Открыла место словом в Эрудите → его категории появились во всех трёх играх.
 */
export function openThemes(state) {
  const out = [];
  for (const p of openPlaces(state)) for (const c of p.cats) if (!out.includes(c)) out.push(c);
  return out;
}
/** Сколько тем откроет ещё не открытое место */
export function placeNewThemes(state, place) {
  const have = openThemes(state);
  return place.cats.filter((c) => !have.includes(c));
}
