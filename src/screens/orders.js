// Доска заказов соседей: просят ресурсы из разных игр, платят монетами, ключами и редкими предметами.

import { h, toast, confetti, showReward, pick } from '../ui/common.js';
import { state, commit, removeItem, applyReward, spendCoins } from '../state.js';
import { ITEMS, CATEGORIES, getItem, RARITY } from '../data/items.js';
import { CARD_WORDS } from '../data/words.js';

const NEIGHBOURS = [
  { id: 'cook', emoji: '👩‍🍳', name: 'Повариха Мила', cats: ['food', 'dishes', 'drinks'] },
  { id: 'garden', emoji: '👨‍🌾', name: 'Садовник Петя', cats: ['plants', 'nature', 'tools'] },
  { id: 'artist', emoji: '🧑‍🎨', name: 'Художник Лёва', cats: ['walldecor', 'stationery', 'decor', 'light'] },
  { id: 'wizard', emoji: '🧙', name: 'Волшебник Ося', cats: ['fantasy', 'nature'], essence: true },
  { id: 'fashion', emoji: '💃', name: 'Модница Жанна', cats: ['clothes', 'accessory', 'bath'] },
  { id: 'musician', emoji: '🎸', name: 'Музыкант Гоша', cats: ['music', 'tech', 'transport', 'sport'] },
  { id: 'granny', emoji: '👵', name: 'Бабушка Зина', cats: ['furniture', 'pets', 'food', 'decor'] },
];

const SLOTS = 3;
const REPLACE_COST = 5;

/** Новый заказ. Сложность растёт с числом выполненных заказов. */
function makeOrder(taken) {
  const done = state.progress.ordersDone || 0;
  const nb = pick(NEIGHBOURS.filter((n) => !taken.includes(n.id)));
  const reqs = [];
  const nReq = done < 2 ? 1 : done < 6 ? 2 : 3;
  for (let i = 0; i < nReq; i++) {
    const cat = pick(nb.cats);
    const r = Math.random();
    if (nb.essence && r < 0.35) reqs.push({ type: 'ess', n: 2 + Math.floor(done / 4) });
    else if (r < 0.6) {
      // конкретный предмет: чаще обычный, лучше тот, что игрок уже видел
      const pool = ITEMS.filter((it) => it.cat === cat && (it.rarity === 'c' || done > 4));
      const it = pick(pool.length ? pool : ITEMS.filter((x) => x.cat === cat));
      if (!reqs.some((q) => q.id === it.id)) reqs.push({ type: 'item', id: it.id, n: done > 8 && it.rarity === 'c' ? 2 : 1 });
    } else if (!reqs.some((q) => q.type === 'card' && q.cat === cat)) {
      reqs.push({ type: 'card', cat, n: 1 + Math.floor(done / 5) });
    }
  }
  if (!reqs.length) reqs.push({ type: 'card', cat: nb.cats[0], n: 1 });
  // награда
  const weight = reqs.reduce((s, q) => s + (q.type === 'item' ? 2 * q.n : q.n), 0);
  const reward = { coins: 15 + weight * 8 };
  if (Math.random() < 0.4) reward.keys = 1;
  if (Math.random() < 0.5) reward.energy = 5 + weight;
  if (Math.random() < 0.35 + done * 0.02) {
    const rare = ITEMS.filter((it) => nb.cats.includes(it.cat) && it.rarity !== 'c');
    if (rare.length) reward.items = { [pick(rare).id]: 1 };
  }
  return { nb: nb.id, reqs, reward };
}

function ensureOrders() {
  const list = (state.progress.orders ||= []);
  let changed = false;
  while (list.length < SLOTS) { list.push(makeOrder(list.map((o) => o.nb))); changed = true; }
  if (changed) commit();
  return list;
}

/** Сколько у игрока есть для требования и какие id списывать */
function have(q) {
  if (q.type === 'item') return { n: state.items[q.id] || 0, ids: [q.id] };
  const ids = Object.keys(state.items).filter((id) => {
    const it = getItem(id);
    return q.type === 'ess' ? it.tier === 3 : it.tier === 2 && it.cat === q.cat;
  });
  return { n: ids.reduce((s, id) => s + state.items[id], 0), ids };
}

function reqView(q) {
  const { n } = have(q);
  const ok = n >= q.n;
  let emoji, label, where;
  if (q.type === 'item') {
    const it = getItem(q.id);
    emoji = it.emoji; label = it.word.toLowerCase();
    where = 'Поиск, Пасьянс, Три в ряд';
  } else if (q.type === 'card') {
    emoji = CATEGORIES[q.cat].icon; label = 'слова: ' + CATEGORIES[q.cat].name.toLowerCase();
    const ex = Object.keys(CARD_WORDS).filter((w) => CARD_WORDS[w] === q.cat && w.length <= 6).slice(0, 3);
    where = 'Эрудит' + (ex.length ? ', например ' + ex.join(', ') : '');
  } else {
    emoji = '✨'; label = 'эссенции';
    where = 'Эрудит: абстрактные слова';
  }
  return h('button.or-req' + (ok ? '.ok' : ''), { onclick: () => toast(ok ? 'Есть ✓' : 'Где взять: ' + where, 2600) },
    h('span.or-req-e', emoji),
    h('div.or-req-t', h('b', label)),
    h('span.or-req-n', ok ? '✓' : `${Math.min(n, q.n)}/${q.n}`),
  );
}

function fulfil(idx, rerender) {
  const o = state.progress.orders[idx];
  if (!o.reqs.every((q) => have(q).n >= q.n)) return;
  for (const q of o.reqs) {
    let left = q.n;
    for (const id of have(q).ids) {
      while (left > 0 && (state.items[id] || 0) > 0) { removeItem(id); left--; }
    }
  }
  state.progress.orders.splice(idx, 1);
  state.progress.ordersDone = (state.progress.ordersDone || 0) + 1;
  applyReward(o.reward);
  commit();
  confetti();
  showReward('Заказ выполнен!', o.reward, rerender);
}

export function renderOrders(root, nav) {
  const rerender = () => renderOrders(root, nav);
  const list = ensureOrders();
  root.replaceChildren(h('div.screen',
    h('div.screen-title', 'Заказы'),
    h('div.stack', list.map((o, i) => {
      const nb = NEIGHBOURS.find((n) => n.id === o.nb) || NEIGHBOURS[0];
      const ready = o.reqs.every((q) => have(q).n >= q.n);
      return h('div.or-card' + (ready ? '.ready' : ''),
        h('div.or-head', h('span.or-ava', nb.emoji), h('b', nb.name)),
        h('div.or-reqs', o.reqs.map(reqView)),
        h('div.or-reward', h('span', '🎁'),
          o.reward.coins ? h('span.or-rw', `🪙 ${o.reward.coins}`) : null,
          o.reward.keys ? h('span.or-rw', `🗝️ ${o.reward.keys}`) : null,
          o.reward.energy ? h('span.or-rw', `⚡ ${o.reward.energy}`) : null,
          ...Object.keys(o.reward.items || {}).map((id) => h('span.or-rw', { style: { boxShadow: `inset 0 0 0 2px ${RARITY[getItem(id).rarity].color}` } }, getItem(id).emoji + ' ' + getItem(id).word.toLowerCase())),
        ),
        h('div.row',
          h('button.btn.btn-ghost.btn-sm', {
            onclick: () => {
              if (!spendCoins(REPLACE_COST)) { toast('Не хватает монет'); return; }
              state.progress.orders[i] = makeOrder(list.filter((_, j) => j !== i).map((x) => x.nb));
              commit(); rerender();
            },
          }, `🔄 ${REPLACE_COST}🪙`),
          h('button.btn.btn-green.btn-sm', { disabled: !ready, style: { boxShadow: '0 3px 0 #1a9c70' }, onclick: () => fulfil(i, rerender) }, ready ? 'Отдать ✓' : 'Отдать'),
        ),
      );
    })),
  ));
}

/** Сколько заказов можно выполнить прямо сейчас (для бейджа на вкладке) */
export function readyOrders() {
  return (state.progress.orders || []).filter((o) => o.reqs.every((q) => have(q).n >= q.n)).length;
}
