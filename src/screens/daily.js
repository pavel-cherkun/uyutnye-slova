// Ежедневные испытания: 3 задания на день, за каждое — маленькая награда, за все три — сундук.
// Прогресс считается как разница со «снимком» на начало дня, поэтому в мини-игры ничего встраивать не нужно.

import { h, toast } from '../ui/common.js';
import { state, commit, applyReward } from '../state.js';
import { chestReward, gainXP } from '../progression.js';
import { showReward } from '../ui/common.js';
import { openChest } from '../ui/fx.js';

const plays = (id) => state.stats.plays?.[id] || 0;
const totalWords = () => Object.values(state.progress.wordsMade).reduce((a, b) => a + b, 0);
const placed = () => Object.values(state.rooms).reduce((n, r) => n + Object.keys(r.cells).length, 0);

// метрики, от которых считается прогресс
const METRICS = {
  words: totalWords,
  shooter: () => plays('shooter'),
  hidden: () => plays('hidden'),
  match3: () => plays('match3'),
  solitaire: () => plays('solitaire'),
  burned: () => state.oven.burned || 0,
  orders: () => state.progress.ordersDone || 0,
  xp: () => state.xp || 0,
  placed,
};

const POOL = [
  { m: 'words', n: 5, icon: '✍️', text: 'Собери 5 слов' },
  { m: 'words', n: 10, icon: '✍️', text: 'Собери 10 слов' },
  { m: 'shooter', n: 2, icon: '🎯', text: 'Сыграй в Блоки ×2' },
  { m: 'hidden', n: 1, icon: '🔍', text: 'Сыграй в Поиск' },
  { m: 'match3', n: 1, icon: '🍬', text: 'Сыграй в Три в ряд' },
  { m: 'solitaire', n: 1, icon: '🃏', text: 'Сыграй в Пасьянс' },
  { m: 'burned', n: 3, icon: '🔥', text: 'Сожги 3 вещи' },
  { m: 'orders', n: 1, icon: '📋', text: 'Выполни заказ' },
  { m: 'xp', n: 80, icon: '⭐', text: 'Набери 80 ⭐' },
  { m: 'placed', n: 2, icon: '🏠', text: 'Поставь 2 вещи дома' },
];

const today = () => new Date().toLocaleDateString('sv');

function seededPick(seed, arr, k) {
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const out = [];
  for (const t of a) { if (!out.some((o) => o.m === t.m)) out.push(t); if (out.length === k) break; }
  return out;
}

export function ensureDaily() {
  const d = today();
  if (state.daily?.date === d) return state.daily;
  const seed = Number(d.replace(/-/g, ''));
  const tasks = seededPick(seed, POOL, 3).map((t) => ({ ...t, base: METRICS[t.m](), claimed: false }));
  state.daily = { date: d, tasks, chest: false };
  commit();
  return state.daily;
}

const progressOf = (t) => Math.min(t.n, METRICS[t.m]() - t.base);

export function dailyReady() {
  const dl = ensureDaily();
  return dl.tasks.filter((t) => !t.claimed && progressOf(t) >= t.n).length + (dl.tasks.every((t) => t.claimed) && !dl.chest ? 1 : 0);
}

export function dailyCard(nav, rerender) {
  const dl = ensureDaily();
  const allDone = dl.tasks.every((t) => t.claimed);
  const doneN = dl.tasks.filter((t) => t.claimed).length;
  return h('div.dl-card',
    h('div.dl-head', h('b', 'Испытания дня'), h('span.dl-n', `${doneN}/3`)),
    ...dl.tasks.map((t) => {
      const p = progressOf(t);
      const ready = !t.claimed && p >= t.n;
      return h('button.dl-row' + (t.claimed ? '.done' : ready ? '.ready' : ''), {
        onclick: () => {
          if (t.claimed) return;
          if (!ready) { toast(`${t.text}: ${p}/${t.n}`); return; }
          t.claimed = true;
          const r = { energy: 5, letters: 'АОЕ' };
          applyReward(r); commit();
          showReward('Испытание выполнено!', r, rerender);
          gainXP(15);
        },
      },
      h('span.dl-ic', t.icon),
      h('span.dl-t', h('span', t.text), h('span.dl-bar', h('i', { style: { width: (p / t.n) * 100 + '%' } }))),
      h('span.dl-go', t.claimed ? '✓' : ready ? '🎁' : `${p}/${t.n}`),
      );
    }),
    h('button.dl-chest' + (allDone && !dl.chest ? '.ready' : dl.chest ? '.done' : ''), {
      onclick: () => {
        if (dl.chest) { toast('Новые испытания завтра'); return; }
        if (!allDone) { toast('Выполни все три испытания'); return; }
        dl.chest = true;
        const r = chestReward('gold');
        applyReward(r); commit();
        openChest('Сундук дня', 'gold', r, rerender);
        gainXP(40);
      },
    }, h('span', dl.chest ? '✓' : '👑'), h('span', dl.chest ? 'Сундук открыт' : 'Сундук дня')),
  );
}
