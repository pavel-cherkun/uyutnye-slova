// Желания дня — вместо заказов соседей. Питомец каждый день хочет три вещи: конкретную еду, подарок,
// почесаться, поиграть в мяч, путешествие, обновку, трюк… Исполнила — энергия и буквы, все три — сундук.
// Желания на еду и вещи забирают предметы из сумки, поэтому у вещей из игр всегда есть дело.

import { state, commit, applyReward } from '../state.js';
import { ITEMS, getItem, eatValue } from '../data/items.js';
import { randomLetter } from '../data/letters.js';
import { gainXP, chestReward } from '../progression.js';
import { quickReward, openChest } from '../ui/fx.js';

const today = () => new Date().toLocaleDateString('sv');

function rng(seed) {
  let x = seed;
  return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
}

const TYPES = {
  food: { icon: (w) => getItem(w.target).emoji, text: (w) => `Хочу ${getItem(w.target).word.toLowerCase()}` },
  item: { icon: (w) => getItem(w.target).emoji, text: (w) => `Подари ${getItem(w.target).word.toLowerCase()}` },
  brush: { icon: () => '🪮', text: () => 'Расчеши меня' },
  ball: { icon: () => '⚽', text: () => 'Поиграем в мяч? 5 ударов' },
  travel: { icon: () => '🗺️', text: () => 'Хочу в путешествие' },
  wear: { icon: () => '🎀', text: () => 'Хочу обновку' },
  trick: { icon: () => '✨', text: () => 'Покажу трюк — попроси!' },
  pet: { icon: () => '💗', text: () => 'Погладь меня' },
};
export const wishIcon = (w) => TYPES[w.type].icon(w);
export const wishText = (w) => TYPES[w.type].text(w);

/** Сегодняшние желания (создаются при первом обращении за день) */
export function ensureWishes(p) {
  const d = today();
  if (p.wish?.date === d) return p.wish;
  const r = rng(Number(d.replace(/-/g, '')) + (p.born || 0) % 997);
  const pickR = (arr) => arr[Math.floor(r() * arr.length)];
  // еда и вещь — лучше из того, что уже есть в сумке, иначе любая обычная
  const owned = Object.keys(state.items).filter((id) => getItem(id).tier === 1);
  const foods = owned.filter((id) => eatValue(id) != null);
  const things = owned.filter((id) => eatValue(id) == null);
  const anyFood = ITEMS.filter((it) => eatValue(it.id) != null && it.rarity === 'c').map((it) => it.id);
  const anyThing = ITEMS.filter((it) => eatValue(it.id) == null && it.rarity === 'c').map((it) => it.id);
  const list = [{ type: 'food', target: pickR(foods.length ? foods : anyFood) }];
  const pool = ['item', 'brush', 'ball', 'travel', 'wear', 'pet'];
  if ((p.tricks || []).length) pool.push('trick');
  while (list.length < 3) {
    const t = pickR(pool);
    if (list.some((w) => w.type === t)) continue;
    list.push(t === 'item' ? { type: t, target: pickR(things.length ? things : anyThing) } : { type: t });
  }
  p.wish = { date: d, list: list.map((w) => ({ ...w, done: false })), chest: false };
  commit();
  return p.wish;
}

/** Текущее (первое неисполненное) желание — для «облачка мысли» над питомцем */
export function currentWish(p) { return ensureWishes(p).list.find((w) => !w.done) || null; }

/**
 * Отметить событие. type — тип желания, target — id предмета (для food/item).
 * Возвращает исполненное желание или null. Награда выдаётся сразу.
 */
export function markWish(p, type, target) {
  if (!p) return null;
  const wl = ensureWishes(p);
  const w = wl.list.find((x) => !x.done && x.type === type && (!x.target || x.target === target));
  if (!w) return null;
  w.done = true;
  p.wishesDone = (p.wishesDone || 0) + 1;
  let letters = '';
  for (let i = 0; i < 4; i++) letters += randomLetter();
  const reward = { energy: 3, letters };
  if (Math.random() < 0.15) reward.keys = 1;
  applyReward(reward);
  commit();
  setTimeout(() => {
    quickReward('Желание исполнено!', reward);
    gainXP(12);
  }, 900);
  if (wl.list.every((x) => x.done) && !wl.chest) {
    wl.chest = true;
    const r = chestReward('gold');
    applyReward(r);
    commit();
    setTimeout(() => openChest('Все желания исполнены!', 'gold', r), 2200);
  }
  return w;
}
