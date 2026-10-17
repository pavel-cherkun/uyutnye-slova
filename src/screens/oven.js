// Печь: сжигание предметов, слов и эссенций в энергию; запекание дублей в новые предметы; улучшение.

import { h, toast, confetti, showReward, pick } from '../ui/common.js';
import { state, commit, removeItem, addEnergy, spendCoins, applyReward, MAX_ENERGY } from '../state.js';
import { getItem, burnValue, RARITY, ITEMS, itemsByCat } from '../data/items.js';

export const OVEN_MAX = 5;
export function ovenMult() { return 1 + 0.25 * (state.oven.level - 1); }
function upgradeCost() { return 60 * state.oven.level; }

let selected = {}; // id -> сколько положить

export function renderOven(root) {
  const rerender = () => renderOven(root);
  const mult = ovenMult();
  const entries = Object.entries(state.items).map(([id, n]) => ({ it: getItem(id), n }))
    // сначала эссенции и карточки — их не жалко
    .sort((a, b) => b.it.tier - a.it.tier || burnValue(a.it.id) - burnValue(b.it.id));

  const total = Math.round(Object.entries(selected).reduce((s, [id, n]) => s + burnValue(id) * n, 0) * mult);

  const bakeable = Object.entries(state.items).filter(([, n]) => n >= 3).map(([id]) => getItem(id))
    .filter((it) => it.tier === 2 || (it.tier === 1 && it.rarity !== 'e'));

  root.replaceChildren(h('div.screen',
    h('div.screen-title', 'Печь'),
    h('div.ov-stove' + (total ? '.hot' : ''),
      h('div.ov-chimney'),
      h('div.ov-body',
        h('div.ov-door', h('div.ov-fire', '🔥')),
        h('div.ov-level', 'Ур. ' + state.oven.level + ' · ×' + mult),
      ),
    ),
    h('div.ov-energy',
      h('div.ov-bar', h('div.ov-fill', { style: { width: (state.energy / MAX_ENERGY) * 100 + '%' } })),
      h('div.small.center', `⚡ ${state.energy} / ${MAX_ENERGY}`),
    ),
    h('button.btn.btn-big.btn-orange', {
      disabled: !total,
      onclick: () => {
        let count = 0;
        for (const [id, n] of Object.entries(selected)) { if (removeItem(id, n)) count += n; }
        selected = {};
        state.oven.burned += count;
        addEnergy(total);
        confetti(innerWidth / 2, 260, 24);
        toast(`🔥 Сгорело ${count} · +${total} ⚡`);
        rerender();
      },
    }, total ? `🔥 Сжечь · +${total} ⚡` : '👇 Выбери, что сжечь'),

    entries.length ? h('div.ov-list', entries.map(({ it, n }) => {
      const sel = selected[it.id] || 0;
      return h('button.ov-item' + (sel ? '.on' : ''), {
        style: { '--rar': RARITY[it.rarity].color },
        onclick: () => { selected[it.id] = sel >= n ? 0 : sel + 1; if (!selected[it.id]) delete selected[it.id]; rerender(); },
      },
      h('span.bag-emoji', it.emoji),
      h('span.bag-word', it.word.toLowerCase()),
      h('span.ov-val', '+' + Math.round(burnValue(it.id) * mult)),
      h('span.bag-n', sel ? `${sel}/${n}` : n));
    })) : h('div.card.small.muted.center', 'Пока пусто 🔥'),

    h('div.card.stack',
      h('b', '🥧 3 одинаковых → 1 получше'),
      bakeable.length ? h('div.ov-bake', bakeable.map((it) =>
        h('button.chip', { onclick: () => bake(it, rerender) }, h('span.chip-emoji', it.emoji), h('span.chip-word', it.word.toLowerCase() + ' ×3'))))
        : h('div.small.muted', 'Пока нет троек'),
    ),

    h('div.card.row',
      h('div', h('b', '⬆️ Печь'), h('div.small.muted', state.oven.level >= OVEN_MAX ? 'максимум' : `⚡ ×${1 + 0.25 * state.oven.level}`)),
      state.oven.level < OVEN_MAX ? h('button.btn.btn-yellow', {
        style: { flex: 'none' },
        onclick: () => {
          if (!spendCoins(upgradeCost())) { toast('Не хватает монет'); return; }
          state.oven.level++; commit(); confetti(); rerender();
        },
      }, `${upgradeCost()} 🪙`) : null,
    ),
  ));
}

function bake(it, rerender) {
  if (!removeItem(it.id, 3)) return;
  let pool;
  if (it.tier === 2) {
    pool = itemsByCat(it.cat);
    if (!pool.length) pool = ITEMS;
  } else {
    const next = it.rarity === 'c' ? 'r' : 'e';
    pool = itemsByCat(it.cat).filter((x) => x.rarity === next);
    if (!pool.length) pool = ITEMS.filter((x) => x.rarity === next);
  }
  const got = pick(pool);
  applyReward({ items: { [got.id]: 1 } });
  confetti();
  showReward('Испеклось!', { items: { [got.id]: 1 } }, rerender);
}
