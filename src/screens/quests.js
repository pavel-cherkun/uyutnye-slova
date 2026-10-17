// Цепочка стартовых заданий: ведёт игрока по всей экосистеме. Награда — по кнопке.

import { h, confetti, showReward } from '../ui/common.js';
import { state, commit, applyReward } from '../state.js';
import { getItem } from '../data/items.js';
import { gainXP } from '../progression.js';
import { quickReward } from '../ui/fx.js';

const plays = (id) => state.stats.plays?.[id] || 0;
const words = () => Object.keys(state.progress.wordsMade).length;
const made = (w) => !!state.progress.wordsMade[w];
const places = () => state.progress.places || ['КУХНЯ'];
const kinds = () => Object.keys(state.items).filter((id) => getItem(id).tier === 1).length;
function cardCats() {
  const by = {};
  for (const id of Object.keys(state.items)) if (id.startsWith('card:')) { const c = getItem(id).cat; by[c] = (by[c] || 0) + 1; }
  return Object.values(by).filter((n) => n >= 2).length;
}

// Сначала добыча (буквы, первые слова, первые находки), потом крафт (инструменты, пасьянс, комнаты).
export const QUESTS = [
  { id: 'q1', icon: '🎯', text: 'Сыграй в Блоки', go: 'shooter', done: () => plays('shooter') >= 1, reward: { energy: 7, letters: 'АОЕИ' } },
  { id: 'q2', icon: '✍️', text: 'Собери слово КОТ', go: 'erudite', done: () => made('КОТ'), reward: { energy: 10 } },
  { id: 'q3', icon: '🐾', text: 'Заведи питомца', tab: 'pet', done: () => !!state.pet, reward: { energy: 5, letters: 'СТОЛ' } },
  { id: 'q4', icon: '✍️', text: 'Собери 3 слова', go: 'erudite', done: () => words() >= 3, reward: { energy: 7 } },
  { id: 'q5', icon: '🔍', text: 'Сыграй в Поиск', go: 'hidden', done: () => plays('hidden') >= 1, reward: { energy: 8 } },
  { id: 'q6', icon: '🔨', text: 'Собери слово МОЛОТОК', go: 'erudite', done: () => made('МОЛОТОК') || state.items['МОЛОТОК'] > 0, reward: { energy: 10 } },
  { id: 'q7', icon: '🍬', text: 'Пройди Три в ряд', go: 'match3', done: () => state.progress.match3Level >= 2, reward: { energy: 7 } },
  { id: 'q8', icon: '📜', text: 'Собери СТОЛ и ПОЛКА', go: 'erudite', done: () => made('СТОЛ') && made('ПОЛКА'), reward: { energy: 6, letters: 'РОЗАПИОН' } },
  { id: 'q8b', icon: '🌹', text: 'Собери РОЗА и ПИОН', go: 'erudite', done: () => made('РОЗА') && made('ПИОН'), reward: { energy: 6 } },
  { id: 'q9', icon: '🃏', text: 'Сыграй в Пасьянс', go: 'solitaire', done: () => plays('solitaire') >= 1, reward: { energy: 8 } },
  { id: 'q10', icon: '🔥', text: 'Сожги что-нибудь в печи', tab: 'oven', done: () => state.oven.burned >= 1, reward: { energy: 8 } },
  { id: 'q11', icon: '🔍', text: 'Собери слово ЛУПА', go: 'erudite', done: () => made('ЛУПА') || state.items['ЛУПА'] > 0, reward: { energy: 7 } },
  { id: 'q12', icon: '📋', text: 'Выполни заказ соседа', tab: 'orders', done: () => (state.progress.ordersDone || 0) >= 1, reward: { keys: 1 } },
  { id: 'q13', icon: '🌲', text: 'Собери слово ЛЕС — откроется место', go: 'erudite', done: () => places().includes('ЛЕС'), reward: { energy: 10 } },
  { id: 'q14', icon: '🎁', text: 'Собери 8 разных вещей', go: 'hidden', done: () => kinds() >= 8, reward: { energy: 10 } },
  { id: 'q15', icon: '🗺️', text: 'Открой 4 места в Поиске', go: 'erudite', done: () => places().length >= 4, reward: { keys: 1 } },
  { id: 'q16', icon: '🦮', text: 'Отправь питомца гулять', tab: 'pet', done: () => (state.pet?.walks || 0) >= 1, reward: { energy: 10, keys: 1 } },
  { id: 'q17', icon: '🍬', text: 'Пройди 5 уровней Три в ряд', go: 'match3', done: () => state.progress.match3Level >= 6, reward: { keys: 2 } },
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
  const go = () => (ok ? claim(q, rerender) : q.go ? nav.openGame(q.go) : nav.go(q.tab));
  return h('button.qs-card' + (ok ? '.ok' : ''), { onclick: go },
    h('span.qs-badge', q.icon || '📜'),
    h('span.qs-title', q.text),
    h('span.qs-step', `${idx}/${QUESTS.length}`),
    h('span.qs-go', ok ? '🎁' : '▶'),
  );
}

function claim(q, rerender) {
  (state.progress.questsClaimed ||= []).push(q.id);
  applyReward(q.reward);
  commit();
  quickReward('Задание выполнено!', q.reward);
  rerender();
  gainXP(20);
}
