// Сумка: предметы по категориям, буквы, слова. Действия с предметом: съесть, сжечь, поставить.

import { h, toast, modal, showReward, confetti } from '../ui/common.js';
import { state, removeItem, addEnergy, applyReward, commit } from '../state.js';
import { getItem, CATEGORIES, RARITY, ITEMS, itemsByCat, eatValue, burnValue, isPlaceable } from '../data/items.js';
import { gainXP } from '../progression.js';
import { ALPHABET } from '../data/letters.js';
import { ovenMult } from './oven.js';

let tab = 'items';

const USE_HINT = {
  ЛУПА: 'Подсказка в «Поиске предметов». Ещё одну — составь ЛУПА в Эрудите',
  МОЛОТОК: 'Разбивает фишку в «Три в ряд». Ещё один — составь МОЛОТОК в Эрудите',
};

export function renderBag(root, nav) {
  const rerender = () => renderBag(root, nav);
  const tabs = h('div.seg',
    seg('items', '🎁'), seg('dex', '🏆'), seg('letters', h('span.ltr', 'А')), seg('words', '📜'),
  );
  function seg(id, label) {
    return h('button.seg-btn' + (tab === id ? '.on' : ''), { onclick: () => { tab = id; rerender(); } }, label);
  }

  let body;
  if (tab === 'letters') body = lettersView(nav);
  else if (tab === 'dex') body = dexView(rerender);
  else body = itemsView(tab === 'items' ? 1 : 2, rerender, nav);

  root.replaceChildren(h('div.screen', h('div.screen-title', 'Сумка'), tabs, body));
}

function lettersView(nav) {
  const total = Object.values(state.letters).reduce((a, b) => a + b, 0);
  return h('div.stack',
    h('div.bag-letters', ALPHABET.map((ch) => {
      const n = state.letters[ch] || 0;
      return h('div.bag-letter' + (n ? '' : '.empty'),
        h('span.tile', ch),
        h('span.bag-letter-n', '×' + n));
    })),

    h('div.row',
      h('button.btn.btn-orange', { onclick: () => nav.openGame('shooter') }, '🎯 Добыть'),
      h('button.btn.btn-violet', { onclick: () => nav.openGame('erudite') }, '✍️ Составить'),
    ),
  );
}

function itemsView(tierGroup, rerender, nav) {
  // tierGroup 1 — предметы, 2 — карточки-слова и эссенции
  const entries = Object.entries(state.items)
    .map(([id, n]) => ({ it: getItem(id), n }))
    .filter(({ it }) => (tierGroup === 1 ? it.tier === 1 : it.tier > 1));

  if (!entries.length) {
    return h('div.card.center.stack',
      h('div', { style: { fontSize: '48px' } }, tierGroup === 1 ? '🎒' : '📜'),
      h('div.muted', 'Пока пусто'),
      h('button.btn', { onclick: () => nav.go('games') }, 'К играм'),
    );
  }

  const byCat = {};
  for (const e of entries) (byCat[e.it.cat] ||= []).push(e);
  const order = Object.keys(CATEGORIES);
  return h('div.stack', order.filter((c) => byCat[c]).map((cat) =>
    h('div.bag-group',
      h('div.bag-cat', CATEGORIES[cat].icon + ' ' + CATEGORIES[cat].name),
      h('div.bag-grid', byCat[cat].sort((a, b) => a.it.word.localeCompare(b.it.word)).map(({ it, n }) =>
        h('button.bag-item', { style: { '--rar': RARITY[it.rarity].color }, onclick: () => itemMenu(it.id, rerender, nav) },
          h('span.bag-emoji', it.emoji),
          h('span.bag-word', it.word.toLowerCase()),
          n > 1 ? h('span.bag-n', n) : null,
        ))),
    )));
}

export function itemMenu(id, rerender, nav) {
  const it = getItem(id);
  const n = state.items[id] || 0;
  const eat = eatValue(id);
  const burn = Math.round(burnValue(id) * ovenMult());
  const tierName = it.tier === 1 ? RARITY[it.rarity].name : it.tier === 2 ? 'Карточка-слово' : 'Эссенция';
  let m;
  const close = () => { m.close(); rerender(); };
  m = modal([
    h('div.hm-big', it.emoji),
    h('div.modal-title', it.word[0] + it.word.slice(1).toLowerCase()),
    h('div.small.muted.center', `${CATEGORIES[it.cat].name} · ${tierName} · в сумке: ${n}`),
    USE_HINT[id] ? h('div.small.center', '🛠 ' + USE_HINT[id]) : null,

    h('div.stack',
      eat ? h('button.btn.btn-green', {
        onclick: () => { removeItem(id); addEnergy(eat); toast(`Ням! +${eat} ⚡`); close(); },
      }, `Съесть · +${eat} ⚡`) : null,
      isPlaceable(id) ? h('button.btn.btn-violet', { onclick: () => { m.close(); nav.go('home'); toast('Нажми на «+» в комнате'); } }, 'Поставить в квартиру') : null,
      h('button.btn.btn-orange', {
        onclick: () => { removeItem(id); addEnergy(burn); state.oven.burned++; toast(`🔥 +${burn} ⚡`); close(); },
      }, `Сжечь в печи · +${burn} ⚡`),
    ),
  ]);
}

// ---------- Коллекция: альбом по категориям ----------
function dexReward(cat) {
  const pool = ITEMS.filter((it) => it.rarity === 'e' || it.rarity === 'l');
  return { energy: 25, keys: 1, items: { [pool[Math.floor(Math.random() * pool.length)].id]: 1 } };
}

function dexView(rerender) {
  const dex = state.dex || {};
  const claimed = (state.progress.dexClaimed ||= []);
  const cats = Object.keys(CATEGORIES).filter((c) => itemsByCat(c).length);
  const total = ITEMS.length, found = ITEMS.filter((it) => dex[it.id]).length;
  return h('div.stack',
    h('div.dx-head', h('b', `${found}/${total}`), h('div.gm-dex-bar', h('i', { style: { width: Math.round((found / total) * 100) + '%' } }))),
    ...cats.map((cat) => {
      const its = itemsByCat(cat);
      const n = its.filter((it) => dex[it.id]).length;
      const full = n === its.length;
      const canClaim = full && !claimed.includes(cat);
      return h('div.dx-cat' + (full ? '.full' : ''),
        h('div.dx-cat-h', h('span', CATEGORIES[cat].icon + ' ' + CATEGORIES[cat].name), h('span.dx-n', `${n}/${its.length}`)),
        h('div.dx-grid', its.map((it) => h('div.dx-it.rar-' + it.rarity + (dex[it.id] ? '' : '.unk'), dex[it.id] ? it.emoji : h('span', it.emoji)))),
        canClaim ? h('button.btn.btn-sm.dx-claim', {
          onclick: () => {
            claimed.push(cat);
            const r = dexReward(cat);
            applyReward(r); commit(); confetti();
            showReward(`Собрано: ${CATEGORIES[cat].name}!`, r, rerender);
            gainXP(50);
          },
        }, '🏆 Забрать награду') : null,
      );
    }),
  );
}
