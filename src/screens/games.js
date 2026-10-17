// Хаб мини-игр: крупные плитки, минимум текста. Что игра берёт и даёт — значками.
// Если игра пока недоступна — на плитке замок, тап объясняет одной фразой.

import { h, toast } from '../ui/common.js';
import { state, totalLetters } from '../state.js';
import { getItem, ITEMS } from '../data/items.js';
import { questCard } from './quests.js';

const tier1Kinds = () => Object.keys(state.items).filter((id) => getItem(id).tier === 1).length;
function cardCats() {
  const by = {};
  for (const id of Object.keys(state.items)) {
    if (!id.startsWith('card:')) continue;
    const it = getItem(id);
    if (it.word.length <= 9 && ITEMS.some((x) => x.cat === it.cat)) by[it.cat] = (by[it.cat] || 0) + 1;
  }
  return Object.values(by).filter((n) => n >= 2).length;
}

// Порядок = порядок плиток. Метаданные дублируем здесь, чтобы не грузить все модули заранее.
// flow — «берёт → даёт» значками; need() — null, если можно играть, иначе короткая подсказка.
export const GAMES = [
  {
    id: 'shooter', title: 'Блоки', emoji: '🎯', energy: 0, color: 'orange', flow: '→ L',
    takes: 'ничего', gives: 'буквы', need: () => null,
    tip: 'Веди пальцем и отпускай. Блоки с буквами — твои.',
  },
  {
    id: 'erudite', title: 'Эрудит', emoji: 'L', energy: 0, color: 'violet', flow: 'L → 🎁',
    takes: 'буквы', gives: 'вещи и комнаты',
    need: () => (totalLetters() >= 3 ? null : 'Мало букв — сыграй в Блоки'),
    tip: 'Собери слово из букв — получишь вещь.',
  },
  {
    id: 'solitaire', title: 'Пасьянс', emoji: '🃏', energy: 4, color: 'blue', flow: '📜 → 🎁',
    takes: 'слова-карточки', gives: 'предметы',
    need: () => (cardCats() >= 2 ? null : 'Нужны слова-вещи: СТОЛ, ПОЛКА, РОЗА…'),
    tip: 'Клади слова на их категорию. Собранная категория станет вещью.',
  },
  {
    id: 'match3', title: 'Три в ряд', emoji: '🍬', energy: 5, color: 'green', flow: '🎁 → 🎁🎁',
    takes: 'твои предметы', gives: 'ещё предметы и ключи',
    need: () => (tier1Kinds() >= 3 ? null : 'Нужно 3 разных предмета'),
    tip: 'Фишки — твои вещи. Собери цель — получишь ещё.',
  },
  {
    id: 'hidden', title: 'Поиск', emoji: '🔍', energy: 6, color: 'pink', flow: '⚡ → 🎁',
    takes: 'энергия', gives: 'новые предметы', need: () => null,
    tip: 'Найди на картинке предметы из списка.',
  },
];

// «L» — буква-плитка (эмодзи 🔤 на телефонах рисуется латиницей abc)
export const gameIcon = (e) => (e === 'L' ? h('span.ltr.ltr-big', 'А') : e);
export const flowNodes = (flow) => flow.split(' ').map((t, i) => [i ? ' ' : '', t === 'L' ? h('span.ltr', 'А') : t]);

export function renderGames(root, nav) {
  root.replaceChildren(h('div.screen',
    questCard(nav, () => renderGames(root, nav)),
    h('div.gm-grid', GAMES.map((g) => {
      const need = g.need();
      return h('button.gm-tile.gm-' + g.color + (need ? '.locked' : ''), {
        onclick: () => (need ? toast(need, 2600) : nav.openGame(g.id)),
      },
      g.energy ? h('div.gm-cost', `⚡${g.energy}`) : null,
      h('div.gm-big', gameIcon(g.emoji)),
      h('div.gm-name', g.title),
      h('div.gm-flow', need ? '🔒' : flowNodes(g.flow)),
      );
    })),
  ));
}
