// Маленький «Эрудит» для покупок: чтобы что-то получить, нужно набрать его название своими буквами.
// Буквы тратятся — так буквы работают как общая валюта игры.

import { h, modal, confetti } from './common.js';
import { state, canSpell, spendLetters, commit } from '../state.js';
import { normWord } from '../data/letters.js';
import { sfx, buzz } from './device.js';

const countChars = (w) => { const m = {}; for (const ch of w) m[ch] = (m[ch] || 0) + 1; return m; };

/** Каких букв не хватает для слова: { 'Л': 1 } */
export function missingLetters(word) {
  const need = countChars(normWord(word));
  const miss = {};
  for (const [ch, n] of Object.entries(need)) {
    const lack = n - (state.letters[ch] || 0);
    if (lack > 0) miss[ch] = lack;
  }
  return miss;
}

/**
 * Окно набора слова. word — что набрать, icon — картинка (эмодзи или узел), title — заголовок.
 * onDone() вызывается после списания букв.
 */
export function spellModal({ word, title, icon, sub, onDone }) {
  const w = normWord(word);
  const can = canSpell(w);
  const slots = w.split('').map(() => h('span.tile.sp-slot'));
  let pos = 0;
  let m;

  // плитки: буквы слова (если хватает) + несколько своих лишних для выбора
  const rack = h('div.sp-rack');
  if (can) {
    const own = { ...state.letters };
    for (const ch of w) own[ch]--;
    const extra = Object.entries(own).flatMap(([ch, n]) => Array(Math.max(0, Math.min(n, 2))).fill(ch));
    const decoys = [];
    while (decoys.length < Math.max(2, 8 - w.length) && extra.length) decoys.push(...extra.splice(Math.floor(Math.random() * extra.length), 1));
    const tiles = [...w.split(''), ...decoys].sort(() => Math.random() - 0.5);
    for (const ch of tiles) {
      const t = h('button.tile.sp-key', ch);
      t.onclick = () => {
        if (pos >= w.length || t.disabled) return;
        if (ch !== w[pos]) {
          t.classList.remove('sp-no'); void t.offsetWidth; t.classList.add('sp-no');
          sfx('error'); buzz(20);
          return;
        }
        t.disabled = true;
        t.classList.add('used');
        slots[pos].textContent = ch;
        slots[pos].classList.add('on');
        pos++;
        sfx('tap');
        if (pos === w.length) finish();
      };
      rack.append(t);
    }
  }

  function finish() {
    if (!spendLetters(w)) return;
    commit();
    sfx('reward');
    buzz([10, 40, 10]);
    word_.classList.add('done');
    confetti();
    setTimeout(() => { m.close(); onDone?.(); }, 650);
  }

  const miss = missingLetters(w);
  const word_ = h('div.sp-word', ...slots);
  m = modal([
    h('div.sp-icon', icon),
    h('div.modal-title', title),
    sub ? h('div.sp-sub', sub) : null,
    word_,
    can
      ? h('div.sp-hint', 'Набери слово буквами')
      : h('div.sp-miss',
        h('div', 'Не хватает букв:'),
        h('div.letters-row', ...Object.entries(miss).flatMap(([ch, n]) => Array(n).fill(0).map(() => h('span.tile.sp-need', ch)))),
        h('small', 'Буквы дают Блоки, игры и прогулки')),
    can ? rack : null,
    h('button.btn.btn-ghost', { onclick: () => m.close() }, can ? 'Отмена' : 'Понятно'),
  ]);
  // показываем само слово контуром, чтобы было понятно, что набирать
  slots.forEach((s, i) => s.dataset.ch = w[i]);
  return m;
}

const CSS = `
.sp-icon { font-size: 64px; line-height: 1; text-align: center; display: flex; justify-content: center; }
.sp-icon svg { width: 140px; height: auto; }
.sp-sub { text-align: center; font-weight: 800; color: var(--ink-soft); margin: -4px 0 8px; font-size: 14px; }
.sp-word { display: flex; justify-content: center; gap: 6px; flex-wrap: wrap; margin: 6px 0 10px; }
.sp-slot { position: relative; background: #fff !important; box-shadow: inset 0 0 0 3px var(--ink) !important; color: var(--ink); }
.sp-slot:not(.on)::after { content: attr(data-ch); position: absolute; inset: 0; display: grid; place-items: center; opacity: .2; font-weight: 900; }
.sp-slot.on { background: var(--lime, #c8ff2e) !important; animation: sp-pop .25s cubic-bezier(.2,1.8,.4,1); }
.sp-word.done .sp-slot { animation: sp-pop .4s cubic-bezier(.2,1.8,.4,1); }
.sp-hint { text-align: center; font-weight: 800; font-size: 13px; opacity: .6; margin-bottom: 8px; }
.sp-rack { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 12px; }
.sp-key { border: 0; width: 44px; height: 48px; font-size: 24px; cursor: pointer; }
.sp-key.used { opacity: .15; transform: scale(.85); }
.sp-key.sp-no { animation: sp-shake .3s; }
.sp-miss { text-align: center; font-weight: 800; display: flex; flex-direction: column; gap: 8px; align-items: center; margin-bottom: 10px; }
.sp-miss small { opacity: .6; font-size: 12px; }
.sp-need { background: #ffd0d8 !important; box-shadow: inset 0 0 0 2px #e8445a !important; color: #b0203a !important; }
@keyframes sp-pop { 40% { transform: scale(1.25); } }
@keyframes sp-shake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
