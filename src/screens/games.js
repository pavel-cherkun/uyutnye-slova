// Хаб мини-игр: крупные плитки, минимум текста. Что игра берёт и даёт — значками.
// Если игра пока недоступна — на плитке замок, тап объясняет одной фразой.

import { h, toast, modal } from '../ui/common.js';
import { state, totalLetters } from '../state.js';
import { getItem, ITEMS } from '../data/items.js';
import { questCard, currentQuest } from './quests.js';
import { dailyCard } from './daily.js';
import { CHEST_EVERY, levelInfo, chestReward } from '../progression.js';
import { state as st, spendKeys, applyReward, commit } from '../state.js';
import { openChest, enqueue } from '../ui/fx.js';
import { sfx } from '../ui/device.js';

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

// Главное — цепочка «Блоки → буквы → Эрудит → вещи». Остальные игры появляются с уровнем,
// закрытые не показываем: вместо них одна плашка «следующая игра на уровне N».
const CORE = ['shooter', 'erudite'];
const isOpen = (g) => levelInfo().lvl >= (g.lvl || 1);

export function renderGames(root, nav) {
  const rerender = () => renderGames(root, nav);
  const lvl = levelInfo().lvl;
  const extra = GAMES.filter((g) => !CORE.includes(g.id) && isOpen(g));
  const locked = GAMES.filter((g) => !isOpen(g));
  const found = ITEMS.filter((it) => state.dex?.[it.id]).length;
  announceNewGames(nav);
  root.replaceChildren(h('div.screen.gm-screen',
    questCard(nav, rerender),
    coreLoop(nav),
    extra.length ? h('div.gm-sec', h('i', 'Ещё игры')) : null,
    extra.length ? h('div.gm-grid', extra.map((g, i) => tile(g, i, nav))) : null,
    locked.length ? teaser(locked) : null,
    lvl >= 2 ? chestBar() : null,
    lvl >= 2 ? dailyCard(nav, rerender) : null,
    lvl >= 2 ? h('button.gm-dex', { onclick: () => { nav.go('bag'); } },
      h('span.gm-dex-ic', '🏆'),
      h('span.gm-dex-t', h('b', 'Коллекция'), h('span', `${found} из ${ITEMS.length}`)),
      h('span.gm-dex-bar', h('i', { style: { width: Math.round((found / ITEMS.length) * 100) + '%' } })),
    ) : null,
  ));
}

/** Главная цепочка: добыть буквы → собрать слово → получить вещь. Подсвечен следующий шаг. */
function coreLoop(nav) {
  const letters = totalLetters();
  // следующий шаг: как велит текущее задание, иначе по числу букв
  const q = currentQuest();
  const step = q && !q.done() && CORE.includes(q.go) ? q.go : letters < 6 ? 'shooter' : 'erudite';
  const row = (id, title, sub, icon) => h('button.gm-core-btn' + (step === id ? '.now' : ''), { onclick: () => nav.openGame(id) },
    h('span.gm-core-ic', icon), h('span.gm-core-tx', h('b', title), h('span', sub)), h('span.gm-core-go', step === id ? 'Играть' : '→'));
  const sample = Object.entries(state.letters).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ch]) => ch);
  return h('div.gm-core',
    h('div.gm-core-t', h('b', 'Буквы'), h('i', 'превращай в вещи')),
    row('shooter', 'Блоки', 'Стреляй — выбивай буквы', '🎯'),
    h('div.gm-core-mid',
      h('span.gm-core-arr', '↓'),
      h('span.gm-core-ltrs', ...(sample.length ? sample : ['А', 'О', 'К']).map((ch) => h('span.ltr', ch))),
      h('span.gm-core-n', `у тебя ${letters} ${plural(letters, 'буква', 'буквы', 'букв')}`),
    ),
    row('erudite', 'Эрудит', 'Собери из букв слово', h('span.ltr.ltr-big', 'А')),
    h('div.gm-core-mid', h('span.gm-core-arr', '↓')),
    h('div.gm-core-out', h('span.gm-core-gift', '🎁'), h('span.gm-core-tx', h('b', 'Слово становится вещью'), h('span', 'вещи нужны питомцу и другим играм'))),
  );
}
const plural = (n, a, b, c) => { const m = n % 10, m2 = n % 100; return m === 1 && m2 !== 11 ? a : m >= 2 && m <= 4 && (m2 < 12 || m2 > 14) ? b : c; };

function tile(g, i, nav) {
  const need = lockedReason(g);
  return h('button.gm-tile.gm-' + g.color + (need ? '.locked' : ''), {
    style: { animationDelay: i * 60 + 'ms' },
    onclick: () => (need ? toast(need, 2600) : nav.openGame(g.id)),
  },
  g.energy ? h('div.gm-cost', `⚡${g.energy}`) : h('div.gm-cost.free', 'FREE'),
  h('div.gm-big', gameIcon(g.emoji)),
  h('div.gm-name', g.title),
  h('div.gm-flow', need ? '🔒' : flowNodes(g.flow)),
  );
}

/** Одна плашка вместо закрытых игр: какая следующая и сколько осталось до неё */
function teaser(locked) {
  const next = locked[0];
  const li = levelInfo();
  const pct = next.lvl === li.lvl + 1 ? Math.round((li.cur / li.need) * 100) : 0;
  return h('div.gm-teaser',
    h('span.gm-teaser-ic', '🔒'),
    h('span.gm-teaser-t', h('b', `Новая игра на ${next.lvl} уровне`),
      h('span', locked.length > 1 ? `и ещё ${locked.length - 1} — расти, чтобы открыть` : 'расти, чтобы открыть'),
      h('span.gm-teaser-bar', h('i', { style: { width: pct + '%' } }))),
  );
}

/** Открылась новая игра — одно торжественное окно (в общей очереди больших окон) */
function announceNewGames(nav) {
  const p = state.progress;
  if (!p.gamesSeen) { p.gamesSeen = GAMES.filter(isOpen).map((g) => g.id); commit(); return; }
  for (const g of GAMES) {
    if (!isOpen(g) || p.gamesSeen.includes(g.id)) continue;
    p.gamesSeen.push(g.id);
    commit();
    enqueue((done) => {
      sfx('reward');
      const m = modal([
        h('div.gm-new-badge', 'Новая игра!'),
        h('div.hm-big', gameIcon(g.emoji)),
        h('div.modal-title', g.title),
        h('div.tip-flow', flowNodes(g.flow)),
        h('div.center', g.tip),
        h('button.btn.btn-big', { onclick: () => { m.close(); nav.openGame(g.id); } }, 'Играть'),
        h('button.btn.btn-ghost', { onclick: () => m.close() }, 'Потом'),
      ], { onClose: done });
    });
  }
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
  if (!spendKeys(STASH_PRICE)) { toast(`Тайник открывается за ${STASH_PRICE} 🗝️ — ключи дают Три в ряд, Пасьянс и путешествия`, 2800); return; }
  const r = chestReward('silver', { noKeys: true });
  applyReward(r); commit();
  openChest('Тайник', 'silver', r);
}
