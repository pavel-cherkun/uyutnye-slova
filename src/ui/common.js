// Общие UI-хелперы: создание элементов, тосты, модальные окна, показ наград.

import { getItem, RARITY } from '../data/items.js';
import { sfx, buzz } from './device.js';

/** h('div.class#id', {attrs, onclick}, ...children) */
export function h(sel, props, ...children) {
  const [tag, ...rest] = sel.split(/(?=[.#])/);
  const el = document.createElement(tag || 'div');
  for (const part of rest) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else if (part[0] === '#') el.id = part.slice(1);
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(text, ms = 1800) {
  let wrap = document.getElementById('toasts');
  if (!wrap) { wrap = h('div#toasts'); document.body.append(wrap); }
  const t = h('div.toast', text);
  wrap.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/** Модальное окно. Возвращает { el, close }. */
export function modal(content, { onClose, dismissable = true } = {}) {
  const box = h('div.modal-box', content);
  const back = h('div.modal-back', box);
  const close = () => { back.classList.add('out'); setTimeout(() => back.remove(), 200); onClose && onClose(); };
  if (dismissable) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return { el: box, close };
}

export function itemChip(id, n) {
  const it = getItem(id);
  return h('div.chip', { style: { '--rar': RARITY[it.rarity].color } },
    h('span.chip-emoji', it.emoji),
    h('span.chip-word', it.word.toLowerCase()),
    n > 1 ? h('span.chip-n', '×' + n) : null,
  );
}

/** Строки для отображения награды */
export function rewardChips(reward = {}) {
  const out = [];
  if (reward.energy) out.push(h('div.chip', h('span.chip-emoji', '⚡'), h('span.chip-word', 'энергия'), h('span.chip-n', '+' + reward.energy)));
  if (reward.coins) out.push(h('div.chip', h('span.chip-emoji', '🪙'), h('span.chip-word', 'монеты'), h('span.chip-n', '+' + reward.coins)));
  if (reward.keys) out.push(h('div.chip', h('span.chip-emoji', '🗝️'), h('span.chip-word', 'ключи'), h('span.chip-n', '+' + reward.keys)));
  if (reward.letters) {
    const str = typeof reward.letters === 'string'
      ? reward.letters
      : Object.entries(reward.letters).map(([ch, n]) => ch.repeat(n)).join('');
    if (str) out.push(h('div.letters-row', [...str].sort().map((ch) => h('span.tile', ch))));
  }
  if (reward.items) for (const [id, n] of Object.entries(reward.items)) out.push(itemChip(id, n));
  return out;
}

export function showReward(title, reward, onClose) {
  sfx('reward');
  buzz([10, 40, 10]);
  const chips = rewardChips(reward);
  const m = modal([
    h('div.modal-title', title),
    chips.length ? h('div.reward-list', chips) : h('p.muted', 'В этот раз без трофеев'),
    h('button.btn.btn-big', { onclick: () => m.close() }, 'Забрать'),
  ], { onClose });
  return m;
}

export function confirmDialog(text, yesLabel = 'Да') {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal([
      h('div.modal-title', text),
      h('div.row',
        h('button.btn.btn-ghost', { onclick: () => { answered = true; m.close(); resolve(false); } }, 'Отмена'),
        h('button.btn', { onclick: () => { answered = true; m.close(); resolve(true); } }, yesLabel),
      ),
    ], { onClose: () => { if (!answered) resolve(false); } });
  });
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr, rng = Math.random) { return arr[Math.floor(rng() * arr.length)]; }

// Конфетти для праздничных моментов
export function confetti(x = innerWidth / 2, y = innerHeight / 2, count = 30) {
  sfx('win');
  const colors = ['#ff4f8b', '#ffc93c', '#3ad29f', '#3fa9ff', '#a66bff', '#ff8a3d'];
  for (let i = 0; i < count; i++) {
    const p = h('div.confetti', { style: { left: x + 'px', top: y + 'px', background: pick(colors) } });
    const ang = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 140;
    p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(ang) * dist - 60 + 'px');
    p.style.setProperty('--rot', Math.random() * 720 - 360 + 'deg');
    document.body.append(p);
    setTimeout(() => p.remove(), 1100);
  }
}
