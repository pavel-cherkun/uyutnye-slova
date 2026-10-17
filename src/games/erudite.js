// Эрудит: составляешь слова из букв в сумке. Слово превращается в предмет, карточку, эссенцию
// или открывает комнату. Буквы тратятся, за слово дают монеты по очкам букв.

import { h, toast, confetti, pick, modal } from '../ui/common.js';
import { classifyWord, getItem, ITEMS, ROOMS, CATEGORIES, RARITY } from '../data/items.js';
import { CARD_WORDS, ESSENCE_WORDS } from '../data/words.js';
import { ALPHABET, LETTER_SCORE, wordScore } from '../data/letters.js';
import { dictWords, dictCat } from '../data/dict.js';
import { isLetterOpen } from '../data/letters.js';
import { nextStage, checkLetterUnlock, wordsCount } from '../progression.js';

// Что делают инструменты — подсказка прямо в превью слова
const TOOL_USE = { МОЛОТОК: 'бустер для «Три в ряд»', ЛУПА: 'подсказка в «Поиске»' };

export const meta = {
  id: 'erudite', title: 'Эрудит', emoji: '✍️',
  desc: 'Составляй слова из своих букв', cost: { energy: 0 }, gives: 'предметы, комнаты',
};

const HINT_COST = 8;
let ALL_WORDS = null;
function allWords() {
  if (!ALL_WORDS) ALL_WORDS = [...new Set([
    ...ROOMS.map((r) => r.word), ...ITEMS.map((i) => i.word), ...Object.keys(CARD_WORDS), ...ESSENCE_WORDS, ...dictWords(),
  ])];
  return ALL_WORDS;
}

const CSS = `
.er-wrap { flex: 1; display: flex; flex-direction: column; padding: 0 12px calc(12px + var(--safe-bottom)); gap: 10px; min-height: 0; }
.er-goal { background: rgba(255,255,255,.7); border-radius: 14px; padding: 8px 10px; font-size: 13px; display: flex; gap: 8px; align-items: center; }
.er-goal .tile { width: 22px; height: 26px; font-size: 13px; box-shadow: 0 2px 0 #d9a92e; }
.er-goal .tile.miss { opacity: .3; }
.er-board {
  background: linear-gradient(160deg, #3a2a6e, #6a3fb5); border-radius: 22px; padding: 14px 10px;
  min-height: 132px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  box-shadow: inset 0 4px 12px rgba(0,0,0,.3), var(--shadow);
}
.er-word { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; min-height: 44px; align-items: center; }
.er-word .tile { width: 36px; height: 42px; font-size: 22px; animation: er-in .2s cubic-bezier(.3,1.8,.6,1); cursor: pointer; }
.er-word.shake { animation: er-shake .35s; }
.er-empty { color: rgba(255,255,255,.55); font-weight: 700; font-size: 14px; }
.er-preview { color: #fff; font-weight: 800; font-size: 15px; min-height: 22px; text-align: center; }
.er-preview .bad { color: #ffb3c8; }
.er-preview .room { color: #ffe27a; }
.er-actions { display: flex; gap: 8px; }
.er-actions .btn { flex: 1; }
.er-keys { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; }
.er-key { border: 0; padding: 0; background: none; position: relative; }
.er-key .tile { width: 100%; height: 42px; font-size: 19px; }
.er-key .n { position: absolute; top: -5px; right: -3px; background: var(--pink); color: #fff; font-size: 10px; font-weight: 900; border-radius: 99px; min-width: 16px; height: 16px; line-height: 16px; text-align: center; padding: 0 3px; }
.er-key .s { position: absolute; bottom: 2px; right: 4px; font-size: 9px; color: #9b7420; font-weight: 800; }
.er-key:disabled .tile { background: #ece6f3; box-shadow: 0 3px 0 #d6cce3; color: #b9adc9; }
.er-key:disabled .n { display: none; }
.er-key.lock .tile { background: #e4dcef; box-shadow: 0 3px 0 #cfc3df; color: transparent; }
.er-key.lock .tile::after { content: '🔒'; position: absolute; font-size: 15px; color: initial; }
.er-key.lock .n, .er-key.lock .s { display: none; }
.er-next { font-size: 12px; font-weight: 800; color: var(--ink-soft); text-align: center; }
.er-next .tile { width: 20px; height: 24px; font-size: 12px; box-shadow: 0 2px 0 #d9a92e; margin: 0 1px; }
.er-made { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; min-height: 34px; }
.er-made .chip { flex: none; animation: pop .3s; }
.er-burst { position: absolute; left: 50%; top: 40%; font-size: 90px; transform: translate(-50%,-50%); animation: er-burst 1s forwards; pointer-events: none; z-index: 5; }
@keyframes er-in { from { transform: scale(.3) translateY(20px); } }
@keyframes er-shake { 25% { transform: translateX(-8px); } 50% { transform: translateX(8px); } 75% { transform: translateX(-4px); } }
@keyframes er-burst { 0% { transform: translate(-50%,-50%) scale(.2); opacity: 0; } 30% { transform: translate(-50%,-50%) scale(1.2); opacity: 1; } 100% { transform: translate(-50%,-160%) scale(.8); opacity: 0; } }
`;

export function mount(root, ctx) {
  const { store } = ctx;
  const { state } = store;
  let word = [];          // массив букв
  const made = [];        // составленные в этой сессии

  const wordEl = h('div.er-word');
  const previewEl = h('div.er-preview');
  const keysEl = h('div.er-keys');
  const madeEl = h('div.er-made');
  const nextEl = h('div.er-next');
  const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов');
  const submitBtn = h('button.btn.btn-green', { onclick: submit }, 'Составить');

  root.append(
    h('style', CSS),
    h('div.game-top',
      h('button.btn-icon', { onclick: () => ctx.exit() }, '✕'),
      h('div.game-title', '✍️ Эрудит'),
      h('button.btn.btn-yellow.btn-sm', { onclick: hint, style: { boxShadow: '0 3px 0 #d79a00' } }, `💡 ${HINT_COST}🪙`),
    ),
    h('div.er-wrap',
      nextEl,
      h('div.er-board', wordEl, previewEl),
      h('div.er-actions',
        h('button.btn.btn-ghost', { onclick: () => { word = []; render(); } }, 'Стереть'),
        h('button.btn.btn-ghost', { onclick: () => { word.pop(); render(); } }, '⌫'),
        submitBtn,
      ),
      keysEl,
      madeEl,
    ),
  );

  // сколько букв доступно с учётом уже выложенных
  const avail = (ch) => (state.letters[ch] || 0) - word.filter((c) => c === ch).length;

  function render() {
    wordEl.classList.remove('shake');
    wordEl.replaceChildren(...(word.length
      ? word.map((ch, i) => h('span.tile', { onclick: () => { word.splice(i, 1); render(); } }, ch))
      : [h('div.er-empty', wordsCount() < 2 ? 'Попробуй: К · О · Т' : '')]));

    const w = word.join('');
    const c = w.length >= 2 ? classifyWord(w) : null;
    previewEl.replaceChildren();
    submitBtn.disabled = !c || c.kind === 'invalid';
    if (c) {
      const score = wordScore(w);
      if (c.kind === 'invalid') previewEl.append(h('span.bad', w.length < 3 ? '…' : 'нет такого слова'));
      else if (c.kind === 'room') previewEl.append(state.rooms[c.room.id]
        ? h('span', `🏠 · +${score}🪙`)
        : h('span.room', `🔓 ${c.room.name}!`));
      else {
        const it = getItem(c.id);
        const label = TOOL_USE[c.id] ? '🔨 инструмент' : c.kind === 'item' ? '🎁' : c.kind === 'card' ? CATEGORIES[it.cat].name.toLowerCase() : '✨ в печь';
        previewEl.append(h('span', `${it.emoji} ${label} · +${score}🪙`));
      }
    }

    keysEl.replaceChildren(...ALPHABET.filter((ch) => ch !== 'Ъ' || state.letters[ch]).map((ch) => {
      const n = avail(ch);
      if (!isLetterOpen(ch) && !n) {
        return h('button.er-key.lock', {
          onclick: () => { const ns = nextStage(); toast(ns ? `Буква откроется, когда составишь ещё слов: ${Math.max(1, ns.need)}` : 'Скоро откроется'); },
        }, h('span.tile', ch));
      }
      return h('button.er-key', { disabled: n <= 0, onclick: () => { word.push(ch); navigator.vibrate?.(5); render(); } },
        h('span.tile', ch), h('span.n', n), h('span.s', LETTER_SCORE[ch]));
    }));

    const ns = nextStage();
    nextEl.replaceChildren(...(ns ? ['🔒 ', ...[...ns.letters].map((ch) => h('span.tile', ch)), ` через ${Math.max(1, ns.need)} ${plural(Math.max(1, ns.need))}`] : []));
    madeEl.replaceChildren(...made.map((m) => h('div.chip', h('span.chip-emoji', m.emoji), h('span.chip-word', m.word.toLowerCase()))));
  }

  function submit() {
    const w = word.join('');
    const c = classifyWord(w);
    if (c.kind === 'invalid') { wordEl.classList.add('shake'); return; }
    if (!store.spendLetters(w)) { toast('Не хватает букв'); return; }

    const first = !state.progress.wordsMade[w];
    state.progress.wordsMade[w] = (state.progress.wordsMade[w] || 0) + 1;
    let coins = wordScore(w) * (first ? 2 : 1);
    let emoji;

    if (c.kind === 'room') {
      if (!state.rooms[c.room.id]) {
        state.rooms[c.room.id] = { cells: {} };
        coins += 30;
        emoji = '🔑';
        toast(`Открыта комната «${c.room.name}»!`, 2600);
        confetti(innerWidth / 2, innerHeight / 3, 60);
      } else emoji = '🏠';
    } else {
      store.addItem(c.id);
      emoji = getItem(c.id).emoji;
      if (c.kind === 'item') confetti(innerWidth / 2, innerHeight / 3, 30);
    }
    store.addCoins(coins);
    toast(`+${coins} 🪙`);
    made.unshift({ word: w, emoji });
    const burst = h('div.er-burst', emoji);
    root.append(burst); setTimeout(() => burst.remove(), 1000);
    word = [];
    store.commit();
    const opened = checkLetterUnlock();
    render();
    if (opened) {
      setTimeout(() => {
        confetti(innerWidth / 2, innerHeight / 3, 50);
        const m = modal([
          h('div.modal-title', 'Открыты новые буквы!'),
          h('div.letters-row', [...opened].map((ch) => h('span.tile', ch))),

          h('button.btn.btn-big', { onclick: () => m.close() }, 'Ура!'),
        ]);
      }, 700);
    }
  }

  function hint() {
    // быстрая проверка «хватает ли букв» без лишних аллокаций
    const have = { ...state.letters };
    const fits = (w) => {
      const used = {};
      for (const ch of w) { used[ch] = (used[ch] || 0) + 1; if (used[ch] > (have[ch] || 0)) return false; }
      return true;
    };
    const can = allWords().filter((w) => w.length >= 3 && fits(w));
    if (!can.length) { toast('Букв маловато — сыграй в Блоки 🎯', 2400); return; }
    if (!store.spendCoins(HINT_COST)) { toast('Не хватает монет'); return; }
    // сначала комнаты, потом предметы, карточки, эссенции, «разное»; среди них — новые слова
    const scored = can.map((w) => {
      const c = classifyWord(w);
      let rank = { room: 0, item: 1, card: 2, essence: 3 }[c.kind];
      if (c.kind === 'card' && !CARD_WORDS[w] && dictCat(w) === 'misc') rank = 4;
      const fresh = !state.progress.wordsMade[w] && !(c.kind === 'room' && state.rooms[c.room.id]);
      return { w, rank: rank + (fresh ? 0 : 10) };
    });
    const top = Math.min(...scored.map((x) => x.rank));
    const w = pick(scored.filter((x) => x.rank === top)).w;
    word = [...w];
    render();
    toast('Попробуй это слово 😉');
  }

  render();
  return () => {};
}
