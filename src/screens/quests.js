// Цепочка стартовых заданий: ведёт игрока по всей экосистеме. Награда — по кнопке.

import { h, confetti, showReward } from '../ui/common.js';
import { state, commit, applyReward } from '../state.js';

const plays = (id) => state.stats.plays?.[id] || 0;
const placed = () => Object.values(state.rooms).reduce((n, r) => n + Object.keys(r.cells).length, 0);
const words = () => Object.keys(state.progress.wordsMade).length;

export const QUESTS = [
  { id: 'q1', text: 'Сыграй в «Блоки» и добудь буквы', go: 'shooter', done: () => plays('shooter') >= 1, reward: { coins: 20 } },
  { id: 'q2', text: 'Составь первое слово в «Эрудите»', go: 'erudite', done: () => words() >= 1, reward: { energy: 10 } },
  { id: 'q3', text: 'Поставь предмет в квартиру', tab: 'home', done: () => placed() >= 1, reward: { items: { СВЕЧА: 1 }, coins: 10 } },
  { id: 'q4', text: 'Найди предметы в «Поиске»', go: 'hidden', done: () => plays('hidden') >= 1, reward: { items: { ЛУПА: 2 } } },
  { id: 'q5', text: 'Пройди уровень «Три в ряд»', go: 'match3', done: () => state.progress.match3Level >= 2, reward: { keys: 1, coins: 20 } },
  { id: 'q6', text: 'Сожги что-нибудь в печи', tab: 'oven', done: () => state.oven.burned >= 1, reward: { energy: 8 } },
  { id: 'q7', text: 'Разложи «Пасьянс в слова»', go: 'solitaire', done: () => plays('solitaire') >= 1, reward: { coins: 25 } },
  { id: 'q8', text: 'Открой кухню — составь слово КУХНЯ', go: 'erudite', done: () => !!state.rooms.kitchen, reward: { items: { ЧАЙНИК: 1, ЧАШКА: 2 } } },
  { id: 'q9', text: 'Составь 10 разных слов', go: 'erudite', done: () => words() >= 10, reward: { letters: 'ЕАОИНТСР', coins: 30 } },
  { id: 'q10', text: 'Поставь 8 предметов в квартиру', tab: 'home', done: () => placed() >= 8, reward: { items: { КАРТИНА: 1, ДИВАН: 1 } } },
  { id: 'q11', text: 'Открой спальню', go: 'erudite', done: () => !!state.rooms.bedroom, reward: { items: { КРОВАТЬ: 1, ЛАМПА: 1 } } },
  { id: 'q12', text: 'Пройди 5 уровней «Три в ряд»', go: 'match3', done: () => state.progress.match3Level >= 6, reward: { keys: 2, items: { МОЛОТОК: 3 } } },
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
