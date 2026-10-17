// Эрудит: составляешь слова из букв в сумке. Слово превращается в предмет, карточку, эссенцию
// или открывает комнату. Буквы тратятся.

import { h, toast, confetti, pick, modal } from '../ui/common.js';
import { classifyWord, getItem, ITEMS, ROOMS, CATEGORIES, RARITY, RARITY_ORDER } from '../data/items.js';
import { CARD_WORDS, ESSENCE_WORDS } from '../data/words.js';
import { ALPHABET, isLetterOpen, randomLetter } from '../data/letters.js';
import { dictWords, dictCat } from '../data/dict.js';
import { nextStage, checkLetterUnlock, wordsCount, gainXP, WORD_XP } from '../progression.js';
import { floatText } from '../ui/fx.js';
import { sfx, buzz } from '../ui/device.js';

// Что делают инструменты — подсказка прямо в превью слова
const TOOL_USE = { МОЛОТОК: 'бустер для «Три в ряд»', ЛУПА: 'подсказка в «Поиске»' };

export const meta = {
  id: 'erudite', title: 'Эрудит', emoji: '✍️',
  desc: 'Составляй слова из своих букв', cost: { energy: 0 }, gives: 'предметы, комнаты',
};

const HINT_COST = 2;     // энергии
const STREAK_BONUS = 3;  // каждые N слов серии — +1 буква
// Пороги длины для редкости карточек/эссенций (как в wordRarity)
const RAR_LEN = { r: 5, e: 7, l: 9 };

let ALL_WORDS = null;
function allWords() {
  if (!ALL_WORDS) ALL_WORDS = [...new Set([
    ...ROOMS.map((r) => r.word), ...ITEMS.map((i) => i.word), ...Object.keys(CARD_WORDS), ...ESSENCE_WORDS, ...dictWords(),
  ])];
  return ALL_WORDS;
}

const CSS = `
.er-wrap { flex: 1; display: flex; flex-direction: column; padding: 0 12px calc(12px + var(--safe-bottom)); gap: 10px; min-height: 0; overflow-y: auto; }
.er-title { font-family: var(--display); font-weight: 900; font-size: 18px; letter-spacing: -.5px; text-transform: uppercase; flex: 1; }
.er-streak { font-family: var(--display); font-weight: 800; font-size: 12px; background: var(--ink); color: var(--lime);
  border: 2px solid var(--ink); border-radius: 99px; padding: 4px 9px; box-shadow: 0 3px 0 var(--orange); white-space: nowrap; }
.er-streak[hidden] { display: none; }
.er-streak.bump { animation: er-bump .5s cubic-bezier(.3,1.8,.5,1); }
.er-hint { background: var(--yellow) !important; }

.er-next { font-size: 12px; font-weight: 800; color: var(--ink); text-align: center; display: flex; align-items: center; justify-content: center; gap: 2px; flex-wrap: wrap; }
.er-next .tile { width: 20px; height: 24px; font-size: 12px; margin: 0 1px; background: #fff; color: var(--ink); border: 2px solid var(--ink); box-shadow: 0 2px 0 var(--ink); border-radius: 6px; }
.er-next b { font-family: var(--display); }

.er-board {
  position: relative; background: #111; border: 3px solid var(--ink); border-radius: 26px; padding: 16px 10px 14px;
  min-height: 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  box-shadow: 0 6px 0 var(--ink), inset 0 0 0 2px #2a2a2e, inset 0 0 40px color-mix(in srgb, var(--rar, #c8ff2e) 22%, transparent);
  background-image: radial-gradient(rgba(200,255,46,.09) 1.2px, transparent 1.3px); background-size: 16px 16px;
  transition: box-shadow .3s;
}
.er-board.rar-e, .er-board.rar-l { box-shadow: 0 6px 0 var(--ink), inset 0 0 0 2px var(--rar), inset 0 0 50px color-mix(in srgb, var(--rar) 40%, transparent); }
.er-board.pop { animation: er-boardpop .45s cubic-bezier(.3,1.8,.5,1); }
.er-word { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; min-height: 46px; align-items: center; }
.er-word .tile, .er-fly {
  width: 40px; height: 48px; font-size: 24px; font-family: var(--display); font-weight: 800; cursor: pointer;
  background: var(--lime); color: var(--ink); border: 2.5px solid var(--ink); border-radius: 10px; box-shadow: 0 4px 0 #5f8a00;
}
.er-word.long { gap: 4px; } .er-word.long .tile { width: 31px; height: 42px; font-size: 19px; border-radius: 8px; }
.er-word.xlong .tile { width: 27px; height: 38px; font-size: 17px; }
.er-word .tile { animation: er-in .2s cubic-bezier(.3,1.8,.6,1); }
.er-word .tile.flown { animation: er-land .25s cubic-bezier(.3,1.8,.6,1); }
.er-fly { position: fixed; z-index: 300; pointer-events: none; display: flex; align-items: center; justify-content: center; margin: 0; }
.er-word.shake { animation: er-shake .4s; }
.er-word.shake .tile { background: var(--pink); box-shadow: 0 4px 0 #9b1c55; }
.er-empty { color: rgba(200,255,46,.55); font-weight: 800; font-size: 14px; font-family: var(--display); letter-spacing: .5px; }
.er-preview { color: #fff; font-weight: 800; font-size: 15px; min-height: 26px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
.er-preview .bad { color: var(--pink); }
.er-preview .room { color: var(--lime); font-family: var(--display); }
.er-preview .rar-tag { font-size: 13px; padding: 4px 12px; border-width: 2.5px; transform: rotate(-3deg);
  box-shadow: 0 3px 0 #000, 0 0 16px color-mix(in srgb, var(--rar) 70%, transparent); }
.er-preview .rar-tag.up { animation: er-tagup .55s cubic-bezier(.2,1.9,.4,1); }
.er-preview .rar-l { animation: er-glow 1.2s ease-in-out infinite; }
.er-more { width: 100%; font-size: 11px; font-weight: 800; color: rgba(255,255,255,.6); }
.er-more b { color: var(--rar); font-family: var(--display); }
.er-mini { position: absolute; inset: -3px; border-radius: 26px; border: 4px solid var(--rar); pointer-events: none; animation: er-mini .6s ease-out forwards; }
.er-mini-t { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); font-family: var(--display); font-weight: 900; font-size: 13px;
  background: var(--rar); color: var(--ink); border: 2px solid var(--ink); border-radius: 99px; padding: 2px 10px; white-space: nowrap; pointer-events: none;
  animation: er-minit .9s cubic-bezier(.2,1.6,.4,1) forwards; }

.er-actions { display: flex; gap: 8px; }
.er-actions .btn { flex: none; font-family: var(--display); font-weight: 800; font-size: 13px; padding: 12px 13px; min-width: 0; }
.er-actions .er-go { flex: 1 1 0; font-size: 15px; letter-spacing: .3px; text-transform: uppercase; background: var(--lime); box-shadow: 0 5px 0 var(--ink); }
.er-actions .er-go:disabled, .er-actions .er-go.off { background: #e3e2da; color: #9a9a9f; box-shadow: 0 3px 0 #bdbcb2; border-color: #bdbcb2; opacity: 1; }
.er-actions .er-go.ready { animation: er-pulse 1s ease-in-out infinite; }
.er-actions .er-go.ready:active { animation: none; }

.er-keys { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px 5px; }
.er-key { border: 0; padding: 0; background: none; position: relative; }
.er-key .tile { width: 100%; height: 44px; font-size: 19px; font-family: var(--display); font-weight: 800; background: #fff; color: var(--ink);
  border: 2.5px solid var(--ink); border-radius: 11px; box-shadow: 0 4px 0 var(--ink); transition: transform .08s; }
.er-key:active .tile { transform: translateY(3px); box-shadow: 0 1px 0 var(--ink); }
.er-key .n { position: absolute; top: -6px; right: -4px; background: var(--ink); color: var(--lime); font-family: var(--display); font-size: 10px; font-weight: 800;
  border-radius: 99px; min-width: 18px; height: 18px; line-height: 14px; text-align: center; padding: 0 4px; border: 2px solid var(--lime); }
.er-key:disabled .tile { background: #ebeae2; border-color: #c9c8bd; box-shadow: 0 3px 0 #c9c8bd; color: #b4b3aa; }
.er-key:disabled .n { display: none; }
.er-key.lock .tile { background: repeating-linear-gradient(-45deg, #e6e5dc 0 6px, #d9d8ce 6px 12px); border: 2px dashed #9a998f; box-shadow: none; color: transparent; }
.er-key.lock .tile::after { content: '🔒'; position: absolute; font-size: 15px; color: initial; }
.er-key.lock .n { display: none; }

.er-newl .tile { background: var(--lime); color: var(--ink); border: 2.5px solid var(--ink); box-shadow: 0 4px 0 var(--ink); font-family: var(--display); font-weight: 800; border-radius: 10px; }
.er-newl .tile:nth-child(odd) { transform: rotate(-4deg); } .er-newl .tile:nth-child(even) { transform: rotate(4deg); }
.er-made { display: flex; gap: 6px; overflow-x: auto; padding: 4px 2px 6px; min-height: 40px; }
.er-made .chip { flex: none; animation: er-in .35s cubic-bezier(.3,1.8,.6,1); background: #fff; }

.er-flash { position: fixed; inset: 0; z-index: 320; display: flex; align-items: center; justify-content: center; pointer-events: none; animation: er-fl 1.6s forwards;
  background: radial-gradient(circle, color-mix(in srgb, var(--rar) 65%, transparent), transparent 72%); }
.er-flash::before { content: ''; position: absolute; width: 160vmax; height: 160vmax; left: 50%; top: 50%; margin: -80vmax 0 0 -80vmax;
  background: repeating-conic-gradient(color-mix(in srgb, var(--rar) 45%, transparent) 0 10deg, transparent 10deg 20deg); animation: er-spin 6s linear infinite; opacity: .55; }
.er-flash b { position: relative; font-family: var(--display); font-weight: 900; font-size: clamp(36px, 16vw, 72px); color: var(--rar); -webkit-text-stroke: 3px #111; text-shadow: 0 7px 0 #111;
  transform: rotate(-6deg); animation: er-flpop .6s cubic-bezier(.2,1.8,.4,1); letter-spacing: -2px; }
.er-flash.rar-l b { font-size: clamp(30px, 12vw, 60px); }
.er-burst { position: fixed; z-index: 310; font-size: 96px; transform: translate(-50%,-50%); animation: er-burst 1.1s forwards; pointer-events: none;
  filter: drop-shadow(0 6px 0 rgba(0,0,0,.35)); }
.er-ring { position: fixed; z-index: 305; width: 80px; height: 80px; margin: -40px 0 0 -40px; border-radius: 50%; border: 8px solid var(--rar);
  box-shadow: 0 0 0 3px #111, inset 0 0 0 3px #111; pointer-events: none; animation: er-ring .7s cubic-bezier(.2,.8,.3,1) forwards; }
.er-ring.r2 { animation-delay: .12s; opacity: 0; border-width: 4px; }
.er-part { position: fixed; z-index: 306; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 3px; background: var(--rar); border: 2px solid #111;
  pointer-events: none; animation: er-part .8s cubic-bezier(.15,.8,.3,1) forwards; }
.er-part.star { background: var(--lime); border-radius: 50%; }

@keyframes er-in { from { transform: scale(.3) translateY(20px); } }
@keyframes er-land { 0% { transform: scale(1.25, .8); } 60% { transform: scale(.92, 1.08); } }
@keyframes er-shake { 20% { transform: translateX(-10px) rotate(-2deg); } 40% { transform: translateX(10px) rotate(2deg); } 60% { transform: translateX(-7px); } 80% { transform: translateX(4px); } }
@keyframes er-bump { 40% { transform: scale(1.35) rotate(-6deg); } }
@keyframes er-boardpop { 40% { transform: scale(1.03); } }
@keyframes er-tagup { 0% { transform: scale(.3) rotate(-20deg); } 60% { transform: scale(1.35) rotate(4deg); } 100% { transform: rotate(-3deg); } }
@keyframes er-glow { 50% { box-shadow: 0 3px 0 #000, 0 0 26px var(--rar); } }
@keyframes er-mini { from { transform: scale(.96); opacity: 1; } to { transform: scale(1.08); opacity: 0; } }
@keyframes er-minit { 0% { transform: translate(-50%, 10px) scale(.4); opacity: 0; } 25% { transform: translate(-50%, -4px) scale(1.15); opacity: 1; } 75% { opacity: 1; } 100% { transform: translate(-50%, -18px) scale(1); opacity: 0; } }
@keyframes er-pulse { 50% { transform: translateY(-2px) scale(1.04); box-shadow: 0 7px 0 var(--ink), 0 0 0 5px color-mix(in srgb, var(--lime) 55%, transparent); } }
@keyframes er-fl { 75% { opacity: 1; } to { opacity: 0; } }
@keyframes er-flpop { from { transform: scale(.2) rotate(-14deg); opacity: 0; } 60% { transform: scale(1.15) rotate(-4deg); } }
@keyframes er-spin { to { transform: rotate(360deg); } }
@keyframes er-burst { 0% { transform: translate(-50%,-50%) scale(.2) rotate(-20deg); opacity: 0; } 25% { transform: translate(-50%,-50%) scale(1.35) rotate(6deg); opacity: 1; }
  55% { transform: translate(-50%,-55%) scale(1.1) rotate(0); opacity: 1; } 100% { transform: translate(-50%,-170%) scale(.7); opacity: 0; } }
@keyframes er-ring { from { transform: scale(.2); opacity: 1; } to { transform: scale(3.4); opacity: 0; } }
@keyframes er-part { from { transform: translate(0,0) rotate(0) scale(1); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(.4); opacity: 0; } }
`;

export function mount(root, ctx) {
  const { store } = ctx;
  const { state } = store;
  let word = [];          // массив букв
  const made = [];        // составленные в этой сессии
  let streak = 0;         // слов подряд за эту сессию
  let topRank = -1;       // высшая редкость, достигнутая при наборе текущего слова
  let lastLen = 0;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  const wordEl = h('div.er-word');
  const previewEl = h('div.er-preview');
  const boardEl = h('div.er-board', wordEl, previewEl);
  const keysEl = h('div.er-keys');
  const madeEl = h('div.er-made');
  const nextEl = h('div.er-next');
  const streakEl = h('div.er-streak', { hidden: true });
  const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов');
  const pluralL = (n) => (n === 1 ? 'буква' : n < 5 ? 'буквы' : 'букв');
  const submitBtn = h('button.btn.er-go', { onclick: submit }, 'Составить');

  root.append(
    h('style', CSS),
    h('div.game-top',
      h('button.btn-icon', { onclick: () => ctx.exit() }, '✕'),
      h('div.er-title', '✍️ Эрудит'),
      streakEl,
      h('button.btn.btn-sm.er-hint', { onclick: hint }, `💡 ${HINT_COST}⚡`),
    ),
    h('div.er-wrap',
      nextEl,
      boardEl,
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
  const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  // Плитка прыгает по дуге из клавиатуры в слово
  function flyTile(ch, from, target) {
    const to = target.getBoundingClientRect();
    if (!to.width || !from.animate) return;
    target.style.visibility = 'hidden';
    const w = to.width, hgt = to.height;
    const x0 = from.left + from.width / 2 - w / 2, y0 = from.top + from.height / 2 - hgt / 2;
    const dx = to.left - x0, dy = to.top - y0;
    const lift = Math.min(-60, dy * 0.4 - 40);
    const fly = h('span.er-fly', { style: { left: x0 + 'px', top: y0 + 'px', width: w + 'px', height: hgt + 'px' } }, ch);
    document.body.append(fly);
    const anim = fly.animate([
      { transform: 'translate(0,0) scale(.8) rotate(0)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) scale(1.25) rotate(-12deg)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(0)` },
    ], { duration: 280, easing: 'cubic-bezier(.3,.6,.4,1)' });
    const done = () => {
      fly.remove();
      if (target.isConnected) { target.style.visibility = ''; target.classList.add('flown'); }
    };
    anim.onfinish = done;
    anim.oncancel = done;
  }

  // Мини-вспышка при переходе на редкость выше
  function rarityUp(rar) {
    boardEl.querySelectorAll('.er-mini, .er-mini-t').forEach((e) => e.remove());
    const ring = h('div.er-mini');
    const tag = h('div.er-mini-t', `▲ ${RARITY[rar].name}!`);
    boardEl.append(ring, tag);
    boardEl.classList.remove('pop'); void boardEl.offsetWidth; boardEl.classList.add('pop');
    later(() => { ring.remove(); tag.remove(); }, 950);
    sfx(rar === 'r' ? 'coin' : 'win');
    buzz(rar === 'l' ? [15, 40, 15, 40, 30] : rar === 'e' ? [15, 40, 25] : 15);
  }

  function render(flyFrom) {
    wordEl.classList.remove('shake');
    wordEl.classList.toggle('long', word.length >= 8);
    wordEl.classList.toggle('xlong', word.length >= 10);
    wordEl.replaceChildren(...(word.length
      ? word.map((ch, i) => h('span.tile', { onclick: () => { word.splice(i, 1); render(); } }, ch))
      : [h('div.er-empty', wordsCount() < 2 ? 'Попробуй: К · О · Т' : 'Собери слово')]));
    if (flyFrom && word.length) flyTile(word[word.length - 1], flyFrom, wordEl.lastChild);

    const w = word.join('');
    const c = w.length >= 2 ? classifyWord(w) : null;
    previewEl.replaceChildren();
    const valid = !!c && c.kind !== 'invalid';
    // невалидное слово можно «нажать» — получишь тряску; пустое — нельзя
    submitBtn.disabled = w.length < 2;
    submitBtn.classList.toggle('off', !valid);
    submitBtn.classList.toggle('ready', valid);

    let rar = null;
    if (c) {
      if (c.kind === 'invalid') previewEl.append(h('span.bad', w.length < 3 ? '…' : 'нет такого слова'));
      else if (c.kind === 'room') {
        rar = 'l';
        previewEl.append(state.rooms[c.room.id] ? h('span', '🏠 уже открыта') : h('span.room', `🔓 ${c.room.name}!`));
      } else {
        const it = getItem(c.id);
        rar = it.rarity;
        const label = TOOL_USE[c.id] ? '🔨 инструмент' : c.kind === 'item' ? '🎁' : c.kind === 'card' ? CATEGORIES[it.cat].name.toLowerCase() : '✨ в печь';
        // редкость видна до того, как слово составлено — тянет собирать слова подлиннее
        previewEl.append(h('span', `${it.emoji} ${label}`), h('span.rar-tag.rar-' + it.rarity, RARITY[it.rarity].name));
        // у карточек и эссенций редкость зависит от длины — подсказываем, сколько ещё до следующей
        if (c.kind !== 'item' && it.rarity !== 'l') {
          const nx = RARITY_ORDER[RARITY_ORDER.indexOf(it.rarity) + 1];
          const more = RAR_LEN[nx] - w.length;
          previewEl.append(h('div.er-more.rar-' + nx, `ещё +${more} ${pluralL(more)} → `, h('b', RARITY[nx].name)));
        }
      }
    }
    boardEl.classList.remove('rar-c', 'rar-r', 'rar-e', 'rar-l');
    if (rar) boardEl.classList.add('rar-' + rar);

    // переход на редкость выше по мере набора
    const rank = rar ? RARITY_ORDER.indexOf(rar) : -1;
    if (w.length < lastLen) topRank = rank;
    else if (rank > topRank) {
      if (rank >= 1 && w.length > lastLen) {
        rarityUp(rar);
        previewEl.querySelector('.rar-tag')?.classList.add('up');
      }
      topRank = rank;
    }
    lastLen = w.length;

    keysEl.replaceChildren(...ALPHABET.filter((ch) => ch !== 'Ъ' || state.letters[ch]).map((ch) => {
      const n = avail(ch);
      if (!isLetterOpen(ch) && !n) {
        return h('button.er-key.lock', {
          onclick: () => { const ns = nextStage(); toast(ns ? `Буква откроется, когда составишь ещё слов: ${Math.max(1, ns.need)}` : 'Скоро откроется'); },
        }, h('span.tile', ch));
      }
      const btn = h('button.er-key', {
        disabled: n <= 0,
        onclick: () => { const from = btn.getBoundingClientRect(); word.push(ch); render(from); },
      }, h('span.tile', ch), h('span.n', n));
      return btn;
    }));

    const ns = nextStage();
    nextEl.replaceChildren(...(ns ? ['🔒 ', ...[...ns.letters].map((ch) => h('span.tile', ch)), ' через ', h('b', String(Math.max(1, ns.need))), ` ${plural(Math.max(1, ns.need))}`] : []));
    madeEl.replaceChildren(...made.map((m) => h('div.chip.rar-' + m.rar, h('span.chip-emoji', m.emoji), h('span.chip-word', m.word.toLowerCase()))));
  }

  // Слово взрывается в предмет: кольца цвета редкости, частицы, эмодзи
  function explode(emoji, rar) {
    const { x, y } = center(boardEl);
    const big = rar === 'e' || rar === 'l';
    const els = [
      h('div.er-ring.rar-' + rar, { style: { left: x + 'px', top: y + 'px' } }),
      h('div.er-ring.r2.rar-' + rar, { style: { left: x + 'px', top: y + 'px' } }),
      h('div.er-burst.rar-' + rar, { style: { left: x + 'px', top: y + 'px' } }, emoji),
    ];
    const count = big ? 26 : rar === 'r' ? 18 : 12;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = (big ? 120 : 80) + Math.random() * 70;
      const p = h('div.er-part.rar-' + rar + (i % 3 === 0 ? '.star' : ''), { style: { left: x + 'px', top: y + 'px' } });
      p.style.setProperty('--dx', Math.cos(a) * d + 'px');
      p.style.setProperty('--dy', Math.sin(a) * d + 'px');
      p.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg');
      els.push(p);
    }
    document.body.append(...els);
    later(() => els.forEach((e) => e.remove()), 1150);
  }

  function bumpStreak() {
    streak++;
    streakEl.hidden = streak < 2;
    streakEl.textContent = `🔥 серия ×${streak}`;
    streakEl.classList.remove('bump'); void streakEl.offsetWidth; streakEl.classList.add('bump');
    if (streak % STREAK_BONUS === 0) {
      const ch = randomLetter();
      store.addLetters(ch);
      const p = center(streakEl.hidden ? boardEl : streakEl);
      later(() => { floatText(`+1 буква ${ch}`, p.x, p.y + 24); sfx('coin'); buzz([10, 30, 10]); render(); }, 450);
    }
  }

  function submit() {
    const w = word.join('');
    const c = classifyWord(w);
    if (c.kind === 'invalid') {
      wordEl.classList.remove('shake'); void wordEl.offsetWidth; wordEl.classList.add('shake');
      sfx('error'); buzz([30, 40, 30]);
      return;
    }
    if (!store.spendLetters(w)) { toast('Не хватает букв'); sfx('error'); return; }

    const first = !state.progress.wordsMade[w];
    state.progress.wordsMade[w] = (state.progress.wordsMade[w] || 0) + 1;
    let emoji;

    if (c.kind === 'room') {
      if (!state.rooms[c.room.id]) {
        state.rooms[c.room.id] = { cells: {} };
        emoji = '🔑';
        toast(`Открыта комната «${c.room.name}»!`, 2600);
        confetti(innerWidth / 2, innerHeight / 3, 60);
      } else emoji = '🏠';
    } else {
      store.addItem(c.id);
      emoji = getItem(c.id).emoji;
      if (c.kind === 'item') confetti(innerWidth / 2, innerHeight / 3, 30);
    }
    if (first) toast('✨ Новое слово');
    const rar = c.kind === 'room' ? 'l' : getItem(c.id).rarity;
    made.unshift({ word: w, emoji, rar });
    boardEl.querySelectorAll('.er-mini, .er-mini-t').forEach((e) => e.remove());
    explode(emoji, rar);
    sfx(rar === 'c' ? 'coin' : 'reward');
    buzz(rar === 'l' ? [30, 50, 30, 50, 60] : rar === 'e' ? [25, 50, 40] : 20);
    if (rar === 'e' || rar === 'l') {
      const flash = h('div.er-flash.rar-' + rar, h('b', rar === 'l' ? 'ЛЕГЕНДА!' : 'ЭПИК!'));
      document.body.append(flash); later(() => flash.remove(), 1600);
      confetti(innerWidth / 2, innerHeight / 3, rar === 'l' ? 90 : 50);
    }
    const br = wordEl.getBoundingClientRect();
    gainXP((c.kind === 'room' ? 40 : WORD_XP[rar]) * (first ? 2 : 1), { x: br.left + br.width / 2, y: br.top });
    word = [];
    topRank = -1; lastLen = 0;
    store.commit();
    const opened = checkLetterUnlock();
    if (opened) gainXP(15);
    bumpStreak();
    render();
    if (opened) {
      setTimeout(() => {
        confetti(innerWidth / 2, innerHeight / 3, 50);
        const m = modal([
          h('div.modal-title', 'Открыты новые буквы!'),
          h('div.letters-row.er-newl', [...opened].map((ch) => h('span.tile', ch))),
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
    if (!store.spendEnergy(HINT_COST)) { toast('Нужно ' + HINT_COST + ' ⚡'); return; }
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
    topRank = -1; lastLen = 0;
    render();
    toast('Попробуй это слово 😉');
  }

  render();
  return () => {
    timers.forEach(clearTimeout);
    document.querySelectorAll('.er-fly, .er-flash, .er-burst, .er-ring, .er-part').forEach((e) => e.remove());
  };
}
