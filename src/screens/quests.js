// Цепочка стартовых заданий: ведёт игрока по всей экосистеме. Награда — по кнопке.

import { h, confetti, showReward } from '../ui/common.js';
import { state, commit, applyReward } from '../state.js';
import { getItem } from '../data/items.js';

const plays = (id) => state.stats.plays?.[id] || 0;
const placed = () => Object.values(state.rooms).reduce((n, r) => n + Object.keys(r.cells).length, 0);
const words = () => Object.keys(state.progress.wordsMade).length;
const made = (w) => !!state.progress.wordsMade[w];
const kinds = () => Object.keys(state.items).filter((id) => getItem(id).tier === 1).length;
function cardCats() {
  const by = {};
  for (const id of Object.keys(state.items)) if (id.startsWith('card:')) { const c = getItem(id).cat; by[c] = (by[c] || 0) + 1; }
  return Object.values(by).filter((n) => n >= 2).length;
}

// Сначала добыча (буквы, первые слова, первые находки), потом крафт (инструменты, пасьянс, комнаты).
export const QUESTS = [
  { id: 'q1', text: 'Сыграй в «Блоки» — сбивай блоки с буквами', go: 'shooter', done: () => plays('shooter') >= 1, reward: { coins: 20, letters: 'АОЕИ' } },
  { id: 'q2', text: 'Составь первое слово в «Эрудите». Есть буквы на КОТ!', go: 'erudite', done: () => words() >= 1, reward: { energy: 10 } },
  { id: 'q3', text: 'Поставь кота (или другой предмет) в квартиру', tab: 'home', done: () => placed() >= 1, reward: { coins: 15, letters: 'СТОЛ' } },
  { id: 'q4', text: 'Составь 3 разных слова — откроются новые буквы М, П, Д, У, В', go: 'erudite', done: () => words() >= 3, reward: { coins: 20 } },
  { id: 'q5', text: 'Найди предметы в «Поиске»', go: 'hidden', done: () => plays('hidden') >= 1, reward: { energy: 8 } },
  { id: 'q6', text: 'Сделай молоток: составь МОЛОТОК в «Эрудите». Он разбивает фишки в «Три в ряд»', go: 'erudite', done: () => made('МОЛОТОК') || state.items['МОЛОТОК'] > 0, reward: { coins: 15, energy: 5 } },
  { id: 'q7', text: 'Пройди уровень «Три в ряд» — фишками станут твои предметы', go: 'match3', done: () => state.progress.match3Level >= 2, reward: { coins: 20 } },
  { id: 'q8', text: 'Составь слова-вещи для пасьянса: по 2 в двух категориях (СТОЛ и ПОЛКА, РОЗА и ПИОН…)', go: 'erudite', done: () => cardCats() >= 2, reward: { energy: 6 } },
  { id: 'q9', text: 'Разложи «Пасьянс в слова» — категория превратится в предмет', go: 'solitaire', done: () => plays('solitaire') >= 1, reward: { coins: 25 } },
  { id: 'q10', text: 'Сожги лишнее в печи — получишь энергию', tab: 'oven', done: () => state.oven.burned >= 1, reward: { energy: 8 } },
  { id: 'q11', text: 'Сделай лупу: составь ЛУПА — подсказка в «Поиске»', go: 'erudite', done: () => made('ЛУПА') || state.items['ЛУПА'] > 0, reward: { coins: 20 } },
  { id: 'q12', text: 'Выполни заказ соседа', tab: 'orders', done: () => (state.progress.ordersDone || 0) >= 1, reward: { keys: 1 } },
  { id: 'q13', text: 'Открой кухню — составь КУХНЯ (буквы Х и Я откроются позже)', go: 'erudite', done: () => !!state.rooms.kitchen, reward: { items: { ЧАЙНИК: 1, ЧАШКА: 2 } } },
  { id: 'q14', text: 'Собери 8 разных предметов', go: 'hidden', done: () => kinds() >= 8, reward: { coins: 30 } },
  { id: 'q15', text: 'Поставь 8 предметов в квартиру', tab: 'home', done: () => placed() >= 8, reward: { items: { КАРТИНА: 1 } } },
  { id: 'q16', text: 'Открой спальню', go: 'erudite', done: () => !!state.rooms.bedroom, reward: { items: { КРОВАТЬ: 1 } } },
  { id: 'q17', text: 'Пройди 5 уровней «Три в ряд»', go: 'match3', done: () => state.progress.match3Level >= 6, reward: { keys: 2 } },
];

export function currentQuest() {
  const claimed = state.progress.questsClaimed || [];
  return QUESTS.find((q) => !claimed.includes(q.id)) || null;
}

export function questCard(nav, rerender) {
  const q = currentQuest();
  if (!q) return null;
  const ok = q.done();
  const idx = QUESTS.indexOf(q) + 1;
  return h('div.qs-card' + (ok ? '.ok' : ''),
    h('div.qs-badge', ok ? '✅' : '📜'),
    h('div.qs-text',
      h('div.qs-step', `Задание ${idx} из ${QUESTS.length}`),
      h('div.qs-title', q.text),
    ),
    ok
      ? h('button.btn.btn-sm.btn-green', { style: { boxShadow: '0 3px 0 #1a9c70' }, onclick: () => claim(q, rerender) }, 'Забрать')
      : h('button.btn.btn-sm', { onclick: () => (q.go ? nav.openGame(q.go) : nav.go(q.tab)) }, 'Вперёд'),
  );
}

function claim(q, rerender) {
  (state.progress.questsClaimed ||= []).push(q.id);
  applyReward(q.reward);
  commit();
  confetti();
  showReward('Задание выполнено!', q.reward, rerender);
}
