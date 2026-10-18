// Печь: сжигание предметов, слов и эссенций в энергию; запекание дублей в новые предметы; улучшение.

import { h, toast, confetti, showReward, pick } from '../ui/common.js';
import { state, commit, removeItem, addEnergy, spendKeys, applyReward, MAX_ENERGY } from '../state.js';
import { getItem, burnValue, RARITY, ITEMS, itemsByCat } from '../data/items.js';
import { gainXP } from '../progression.js';
import { ALPHABET, isLetterOpen } from '../data/letters.js';

export const OVEN_MAX = 5;
export function ovenMult() { return 1 + 0.25 * (state.oven.level - 1); }
function upgradeCost() { return state.oven.level; } // ключей

let selected = {}; // id -> сколько положить

export function renderOven(root) {
  const rerender = () => renderOven(root);
  const mult = ovenMult();
  const entries = Object.entries(state.items).map(([id, n]) => ({ it: getItem(id), n }))
    // сначала эссенции и карточки — их не жалко
    .sort((a, b) => b.it.tier - a.it.tier || burnValue(a.it.id) - burnValue(b.it.id));

  const total = Math.round(Object.entries(selected).reduce((s, [id, n]) => s + burnValue(id) * n, 0) * mult);

  const bakeable = Object.entries(state.items).filter(([, n]) => n >= 3).map(([id]) => getItem(id))
    .filter((it) => it.tier === 2 || (it.tier === 1 && it.rarity !== 'l'));

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
        gainXP(count, { x: innerWidth / 2, y: 240 });
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

    lettersSwap(rerender),

    h('div.card.row',
      h('div', h('b', '⬆️ Печь'), h('div.small.muted', state.oven.level >= OVEN_MAX ? 'максимум' : `⚡ ×${1 + 0.25 * state.oven.level}`)),
      state.oven.level < OVEN_MAX ? h('button.btn.btn-yellow', {
        style: { flex: 'none' },
        onclick: () => {
          if (!spendKeys(upgradeCost())) { toast('Нужно ключей: ' + upgradeCost() + ' 🗝️'); return; }
          state.oven.level++; commit(); confetti(); rerender();
        },
      }, `${upgradeCost()} 🗝️`) : null,
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
    const next = { c: 'r', r: 'e', e: 'l' }[it.rarity];
    pool = itemsByCat(it.cat).filter((x) => x.rarity === next);
    if (!pool.length) pool = ITEMS.filter((x) => x.rarity === next);
  }
  const got = pick(pool);
  applyReward({ items: { [got.id]: 1 } });
  confetti();
  showReward('Испеклось!', { items: { [got.id]: 1 } }, rerender);
}

// Обмен букв: 3 самые многочисленные (лишние) буквы → 1 нужная открытая.
// Решает проблему «копятся буквы, из которых ничего не собрать».
function takeFor(target) {
  const pool = Object.entries(state.letters).filter(([ch, n]) => ch !== target && n > 0).sort((a, b) => b[1] - a[1]);
  const take = [];
  const left = Object.fromEntries(pool);
  for (let i = 0; i < 3; i++) {
    const best = Object.entries(left).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    take.push(best[0]); left[best[0]]--;
  }
  return take;
}
function lettersSwap(rerender) {
  const total = Object.values(state.letters).reduce((a, b) => a + b, 0);
  return h('div.card.stack',
    h('b', '🔁 Обмен букв: 3 лишних → 1 нужная'),
    total < 3 ? h('div.small.muted', 'Нужно хотя бы 3 буквы') : h('div.ov-swap', ALPHABET.filter((ch) => isLetterOpen(ch)).map((ch) =>
      h('button.tile', {
        onclick: () => {
          const take = takeFor(ch);
          if (!take) { toast('Не хватает букв для обмена'); return; }
          for (const t of take) { state.letters[t]--; if (state.letters[t] <= 0) delete state.letters[t]; }
          state.letters[ch] = (state.letters[ch] || 0) + 1;
          commit();
          toast(`${take.join(' ')} → ${ch}`);
          rerender();
        },
      }, ch))),
    total >= 3 ? h('div.small.muted', 'Тап по букве — заберём 3 самые многочисленные') : null,
  );
}
