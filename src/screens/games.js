// Хаб мини-игр: крупные плитки, минимум текста. Что игра берёт и даёт — значками.
// Если игра пока недоступна — на плитке замок, тап объясняет одной фразой.

import { h, toast } from '../ui/common.js';
import { state, totalLetters } from '../state.js';
import { getItem, ITEMS } from '../data/items.js';
import { questCard } from './quests.js';
import { dailyCard } from './daily.js';
import { CHEST_EVERY, levelInfo, chestReward } from '../progression.js';
import { state as st, spendKeys, applyReward, commit } from '../state.js';
import { openChest } from '../ui/fx.js';

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
    id: 'shooter', title: 'Блоки', lvl: 1, emoji: '🎯', energy: 0, color: 'orange', flow: '→ L',
    takes: 'ничего', gives: 'буквы', need: () => null,
    tip: 'Веди пальцем и отпускай. Блоки с буквами — твои.',
  },
  {
    id: 'erudite', title: 'Эрудит', lvl: 1, emoji: 'L', energy: 0, color: 'violet', flow: 'L → 🎁',
    takes: 'буквы', gives: 'вещи и комнаты',
    need: () => (totalLetters() >= 3 ? null : 'Мало букв — сыграй в Блоки'),
    tip: 'Собери слово из букв — получишь вещь. Каждое слово даёт награду раз в день, так что ищи новые.',
  },
  {
    id: 'hidden', title: 'Поиск', lvl: 2, emoji: '🔍', energy: 6, color: 'pink', flow: '⚡ → 🎁',
    takes: 'энергия', gives: 'новые предметы', need: () => null,
    tip: 'Найди на картинке предметы из списка. Новые места открываются словами в Эрудите: ЛЕС, САД, КАФЕ…',
  },
  {
    id: 'match3', title: 'Три в ряд', lvl: 3, emoji: '🍬', energy: 5, color: 'green', flow: '🎁 → 🎁🎁',
    takes: 'твои предметы', gives: 'ещё предметы и ключи',
    need: () => (tier1Kinds() >= 3 ? null : 'Нужно 3 разных предмета'),
    tip: 'Фишки — твои вещи. Собери цель — получишь ещё.',
  },
  {
    id: 'solitaire', title: 'Пасьянс', lvl: 3, emoji: '🃏', energy: 4, color: 'blue', flow: '📜 → 🎁',
    takes: 'слова-карточки', gives: 'предметы',
    need: () => (cardCats() >= 2 ? null : 'Нужны слова-вещи: СТОЛ, ПОЛКА, РОЗА…'),
    tip: 'Клади слова на их категорию. Собранная категория станет вещью.',
  },
  {
    id: 'merge', title: 'Мердж', lvl: 4, emoji: '✨', energy: 0, color: 'yellow', flow: '🎁+🎁 → 💎',
    takes: 'энергия и вещи', gives: 'редкие вещи', need: () => null,
    tip: 'Соединяй две одинаковые вещи — получишь вещь круче. У генераторов есть заряды: они восстанавливаются со временем или от эссенций ✨.',
  },
];

// «L» — буква-плитка (эмодзи 🔤 на телефонах рисуется латиницей abc)
export const gameIcon = (e) => (e === 'L' ? h('span.ltr.ltr-big', 'А') : e);
export const flowNodes = (flow) => flow.split(' ').map((t, i) => [i ? ' ' : '', t === 'L' ? h('span.ltr', 'А') : t]);

export function renderGames(root, nav) {
  const found = ITEMS.filter((it) => state.dex?.[it.id]).length;
  root.replaceChildren(h('div.screen.gm-screen',
    questCard(nav, () => renderGames(root, nav)),
    chestBar(),
    h('div.gm-grid', GAMES.map((g, i) => {
      const need = lockedReason(g);
      return h('button.gm-tile.gm-' + g.color + (need ? '.locked' : ''), {
        style: { animationDelay: i * 60 + 'ms' },
        onclick: () => (need ? toast(need, 2600) : nav.openGame(g.id)),
      },
      g.energy ? h('div.gm-cost', `⚡${g.energy}`) : h('div.gm-cost.free', 'FREE'),
      h('div.gm-big', gameIcon(g.emoji)),
      h('div.gm-name', g.title),
      h('div.gm-flow', need ? (levelInfo().lvl < (g.lvl || 1) ? `🔒 ур. ${g.lvl}` : '🔒') : flowNodes(g.flow)),
      );
    })),
    dailyCard(nav, () => renderGames(root, nav)),
    h('button.gm-dex', { onclick: () => { nav.go('bag'); } },
      h('span.gm-dex-ic', '🏆'),
      h('span.gm-dex-t', h('b', 'Коллекция'), h('span', `${found} из ${ITEMS.length}`)),
      h('span.gm-dex-bar', h('i', { style: { width: Math.round((found / ITEMS.length) * 100) + '%' } })),
    ),
  ));
}

// Полоска «сундук через N партий»: каждая сыгранная партия приближает сундук
function chestBar() {
  const n = (state.progress.playCount || 0) % CHEST_EVERY;
  return h('div.gm-chest',
    h('span.gm-chest-ic', '💼'),
    h('span.gm-chest-dots', Array.from({ length: CHEST_EVERY }, (_, i) => h('i' + (i < n ? '.on' : '')))),
    h('span.gm-chest-t', `сундук через ${CHEST_EVERY - n}`),
    h('button.gm-stash' + (st.keys >= STASH_PRICE ? '.ready' : ''), { onclick: openStash }, `🗝️×${STASH_PRICE}`),
  );
}

/** Почему игра закрыта: сначала уровень игрока (игры открываются постепенно), потом нехватка ресурсов. */
export function lockedReason(g) {
  if (levelInfo().lvl < (g.lvl || 1)) return `Откроется на уровне ${g.lvl} — играй в Блоки и Эрудит, чтобы расти`;
  return g.need();
}

// Тайник: ключи → серебряный сундук. Главная трата ключей наряду с открытием мест.
const STASH_PRICE = 2;
function openStash() {
  if (!spendKeys(STASH_PRICE)) { toast(`Тайник открывается за ${STASH_PRICE} 🗝️ — ключи дают Три в ряд, Пасьянс и заказы`, 2800); return; }
  const r = chestReward('silver', { noKeys: true });
  applyReward(r); commit();
  openChest('Тайник', 'silver', r);
}
