// Сумка: предметы по категориям, буквы, слова. Действия с предметом: съесть, сжечь, поставить.

import { h, toast, modal } from '../ui/common.js';
import { state, removeItem, addEnergy } from '../state.js';
import { getItem, CATEGORIES, RARITY, eatValue, burnValue, isPlaceable } from '../data/items.js';
import { ALPHABET, LETTER_SCORE } from '../data/letters.js';
import { ovenMult } from './oven.js';

let tab = 'items';

const USE_HINT = {
  ЛУПА: 'Подсказка в «Поиске предметов». Ещё одну — составь ЛУПА в Эрудите',
  МОЛОТОК: 'Разбивает фишку в «Три в ряд». Ещё один — составь МОЛОТОК в Эрудите',
};

export function renderBag(root, nav) {
  const rerender = () => renderBag(root, nav);
  const tabs = h('div.seg',
    seg('items', '🎁 Вещи'), seg('letters', [h('span.ltr', 'А'), ' Буквы']), seg('words', '📜 Слова'),
  );
  function seg(id, label) {
    return h('button.seg-btn' + (tab === id ? '.on' : ''), { onclick: () => { tab = id; rerender(); } }, label);
  }

  let body;
  if (tab === 'letters') body = lettersView(nav);
  else body = itemsView(tab === 'items' ? 1 : 2, rerender, nav);

  root.replaceChildren(h('div.screen', h('div.screen-title', 'Сумка'), tabs, body));
}

function lettersView(nav) {
  const total = Object.values(state.letters).reduce((a, b) => a + b, 0);
  return h('div.stack',
    h('div.bag-letters', ALPHABET.map((ch) => {
      const n = state.letters[ch] || 0;
      return h('div.bag-letter' + (n ? '' : '.empty'),
        h('span.tile', ch, h('sub.tile-score', LETTER_SCORE[ch])),
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
