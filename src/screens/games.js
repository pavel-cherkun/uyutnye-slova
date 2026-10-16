// Хаб мини-игр: карточки игр с подсказкой «готово ли / что нужно», задание, правила при первом запуске.

import { h } from '../ui/common.js';
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

// Порядок = порядок карточек. Метаданные дублируем здесь, чтобы не грузить все модули заранее.
export const GAMES = [
  {
    id: 'shooter', title: 'Блоки', emoji: '🎯', energy: 0, color: 'orange',
    desc: 'Сбивай блоки — собирай буквы', takes: 'ничего', gives: 'буквы',
    status: () => ({ ok: true, text: `🔤 букв в сумке: ${totalLetters()}` }),
    tip: ['Веди пальцем — появится прицел, отпусти — полетят шарики.', 'Разбитый блок с буквой отдаёт букву тебе в сумку.', 'Игра бесплатная: букв никогда не бывает слишком много — они нужны Эрудиту.'],
  },
  {
    id: 'erudite', title: 'Эрудит', emoji: '🔤', energy: 0, color: 'violet',
    desc: 'Составляй слова из своих букв', takes: 'буквы', gives: 'карточки-слова, предметы, комнаты',
    status: () => (totalLetters() >= 3
      ? { ok: true, text: `🔤 букв: ${totalLetters()} — можно составлять` }
      : { ok: false, text: 'Мало букв — сыграй в «Блоки»' }),
    tip: ['Конкретное слово (СТОЛ, ЛИЛИЯ) → карточка-слово своей категории. Их собирают в Пасьянсе.', 'Слово-предмет (КОТ, ЛАМПА) сразу даёт предмет. Абстрактное (ЛЮБОВЬ) → эссенция для печи.', 'Название комнаты (КУХНЯ, СПАЛЬНЯ) открывает её. Инструменты тоже делаются словами: МОЛОТОК, ЛУПА. Алфавит открывается постепенно — чем больше слов, тем больше букв.'],
  },
  {
    id: 'solitaire', title: 'Пасьянс в слова', emoji: '🃏', energy: 4, color: 'blue',
    desc: 'Раскладывай слова по категориям', takes: 'твои карточки-слова', gives: 'предметы, ключи',
    status: () => {
      const n = cardCats();
      return n >= 2 ? { ok: true, text: `🃏 готовых категорий: ${n}` }
        : { ok: false, text: `Нужно по 2 карточки в 2 категориях (есть: ${n}) — составляй слова в Эрудите` };
    },
    tip: ['Колода собирается из твоих карточек-слов (с 🎒) и добивается словами из каталога.', 'Положи карту-категорию в пустую ячейку, потом собирай на неё слова этой категории. Тап по карте — она сама найдёт место.', 'Собранная категория превращается в настоящий предмет. Чем больше твоих карточек в ней — тем он реже.'],
  },
  {
    id: 'match3', title: 'Три в ряд', emoji: '🍬', energy: 5, color: 'green',
    desc: 'Фишки — твои предметы', takes: '3–6 предметов (не тратятся)', gives: '×2 предметов, ключи',
    status: () => (tier1Kinds() >= 3
      ? { ok: true, text: `🎒 разных предметов: ${tier1Kinds()}` }
      : { ok: false, text: `Нужно 3 разных предмета (есть ${tier1Kinds()}) — Пасьянс или Поиск` }),
    tip: ['Выбери до 6 своих предметов — они станут фишками.', 'Выполнил цель по предмету — получаешь ещё 2 таких же. Так размножают мебель и декор.', 'За победу — ключ 🗝️: ключи открывают новые локации «Поиска». 🔨 Молоток разбивает любую фишку — его делают в Эрудите словом МОЛОТОК.'],
  },
  {
    id: 'hidden', title: 'Поиск', emoji: '🔍', energy: 6, color: 'pink',
    desc: 'Найди предметы на захламлённой сцене', takes: 'энергия, ключи для новых локаций', gives: 'новые предметы',
    status: () => ({ ok: true, text: `🗺️ локаций открыто: ${state.progress.hiddenUnlocked.length}/6 · 🗝️ ${state.keys}` }),
    tip: ['Внизу — список слов. Найди эти предметы на сцене и тапни.', 'Промах отнимает 5 секунд. 🔍 Лупа подсвечивает один предмет — составь ЛУПА в Эрудите.', 'Каждая локация — свои категории. Новые локации открываются ключами из «Три в ряд» и «Пасьянса».'],
  },
];

export function renderGames(root, nav) {
  root.replaceChildren(h('div.screen',
    h('div.screen-title', `Во что сыграем, ${state.profile.name}?`),
    questCard(nav, () => renderGames(root, nav)),
    h('div.gm-list', GAMES.map((g) => {
      const st = g.status();
      return h('button.gm-card.gm-' + g.color, { onclick: () => nav.openGame(g.id) },
        h('div.gm-emoji', g.emoji),
        h('div.gm-text',
          h('div.gm-title', g.title, h('span.gm-soon', g.energy ? `⚡ ${g.energy}` : 'бесплатно')),
          h('div.gm-desc', g.desc),
          h('div.gm-tags',
            h('span.gm-tag', 'берёт: ' + g.takes),
            h('span.gm-tag', 'даёт: ' + g.gives),
          ),
          h('div.gm-status' + (st.ok ? '' : '.no'), (st.ok ? '✓ ' : '⚠ ') + st.text),
        ),
      );
    })),
    h('div.gm-loop.small',
      h('b', 'Как всё связано'), h('br'),
      '🎯 Блоки → буквы → 🔤 Эрудит → карточки-слова → 🃏 Пасьянс → предметы → 🍬 Три в ряд → ×2 предметов и 🗝️ → 🔍 Поиск → новые предметы → 🏠 квартира и 📋 заказы. Лишнее — в 🔥 печь за ⚡.'),
  ));
}
