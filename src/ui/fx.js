// Эффекты «маленьких и больших побед»: всплывающие +N, полёт трофеев в шапку,
// окно наград с переворотом карточек, праздник нового уровня. Окна идут очередью, не перекрывая друг друга.

import { h, confetti } from './common.js';
import { getItem, RARITY } from '../data/items.js';
import { lastNew } from '../state.js';
import { sfx, buzz } from './device.js';

// ---------- Очередь больших окон ----------
const queue = [];
let busy = false;
export function enqueue(show) {
  queue.push(show);
  if (!busy) next();
}
function next() {
  const show = queue.shift();
  if (!show) { busy = false; return; }
  busy = true;
  show(() => setTimeout(next, 120));
}

// ---------- Маленькие победы ----------
export function floatText(text, x = innerWidth / 2, y = innerHeight / 2) {
  const el = h('div.fx-float', { style: { left: x + 'px', top: y + 'px' } }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 1150);
}

/** Пролететь значком от точки к элементу шапки/меню (по селектору) */
export function flyTo(emoji, from, selector) {
  const target = document.querySelector(selector);
  if (!target) return;
  const t = target.getBoundingClientRect();
  const el = h('div.fx-fly', { style: { left: from.x - 14 + 'px', top: from.y - 14 + 'px' } }, emoji);
  document.body.append(el);
  requestAnimationFrame(() => {
    el.style.transform = `translate(${t.left + t.width / 2 - from.x}px, ${t.top + t.height / 2 - from.y}px) scale(.5)`;
    el.style.opacity = '.2';
  });
  setTimeout(() => {
    el.remove();
    target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump');
  }, 720);
}

// ---------- Окно наград ----------
const CSS = `
.rw-back { position: fixed; inset: 0; z-index: 300; background: rgba(10,10,12,.78); display: flex; flex-direction: column;
  align-items: center; justify-content: center; padding: 24px 18px; gap: 18px; animation: fade .2s; overflow: hidden; }
.rw-rays { position: absolute; width: 900px; height: 900px; left: 50%; top: 42%; margin: -450px 0 0 -450px; pointer-events: none; opacity: .5;
  background: repeating-conic-gradient(from 0deg, rgba(200,255,46,.35) 0 10deg, transparent 10deg 20deg); animation: rw-spin 14s linear infinite;
  -webkit-mask: radial-gradient(circle, #000 0 25%, transparent 60%); mask: radial-gradient(circle, #000 0 25%, transparent 60%); }
.rw-back.gold .rw-rays { background: repeating-conic-gradient(from 0deg, rgba(255,176,0,.55) 0 10deg, transparent 10deg 20deg); opacity: .8; }
.rw-title { position: relative; font-family: var(--display); font-weight: 900; font-size: 30px; color: var(--lime); text-align: center;
  text-transform: uppercase; letter-spacing: -1px; text-shadow: 0 4px 0 #000; animation: rw-pop .5s cubic-bezier(.2,1.8,.4,1); }
.rw-grid { position: relative; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-width: 420px; }
.rw-card { width: 92px; min-height: 112px; background: #fff; border: 3px solid var(--ink); border-radius: 18px; box-shadow: 0 5px 0 var(--ink);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 8px 4px 0; position: relative; overflow: hidden;
  opacity: 0; transform: rotateY(90deg) scale(.6); }
.rw-card.in { animation: rw-flip .55s cubic-bezier(.2,1.6,.4,1) forwards; }
.rw-card .e { font-size: 40px; line-height: 1.1; }
.rw-card .w { font-weight: 900; font-size: 11px; text-align: center; padding: 0 4px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rw-card .n { font-family: var(--display); font-weight: 900; font-size: 16px; }
.rw-card .band { align-self: stretch; margin-top: auto; height: 10px; background: var(--rar, var(--lime)); border-top: 2px solid var(--ink); }
.rw-card.rar-e { box-shadow: 0 5px 0 var(--ink), 0 0 22px 4px rgba(180,107,255,.75); }
.rw-card.rar-l { box-shadow: 0 5px 0 var(--ink), 0 0 30px 8px rgba(255,176,0,.9); animation-name: rw-flip, rw-glow; animation-duration: .55s, 1.2s; animation-delay: 0s, .55s; animation-iteration-count: 1, infinite; animation-fill-mode: forwards, none; }
.rw-new { position: absolute; top: 4px; right: -22px; transform: rotate(35deg); background: var(--pink); color: #fff; font-size: 9px; font-weight: 900;
  padding: 2px 24px; border-top: 2px solid var(--ink); border-bottom: 2px solid var(--ink); }
.rw-letters { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; max-width: 320px; }
.rw-letters .tile { opacity: 0; transform: translateY(-30px); }
.rw-letters .tile.in { animation: rw-drop .4s cubic-bezier(.2,1.6,.4,1) forwards; }
.rw-btn { position: relative; min-width: 220px; font-family: var(--display); font-size: 18px; text-transform: uppercase; opacity: 0; animation: fade .3s forwards; }
.rw-empty { color: #fff; font-weight: 800; }
.lv-big { position: relative; font-family: var(--display); font-weight: 900; color: var(--ink); background: var(--lime); border: 4px solid var(--ink);
  border-radius: 40px; box-shadow: 0 8px 0 #000; padding: 18px 28px 12px; text-align: center; animation: rw-pop .6s cubic-bezier(.2,1.8,.4,1); }
.lv-big small { display: block; font-size: 14px; letter-spacing: 3px; }
.lv-big b { display: block; font-size: 84px; line-height: 1; letter-spacing: -4px; }
@keyframes rw-spin { to { transform: rotate(360deg); } }
@keyframes rw-pop { from { transform: scale(.2) rotate(-8deg); opacity: 0; } }
@keyframes rw-flip { to { opacity: 1; transform: rotateY(0) scale(1); } }
@keyframes rw-drop { to { opacity: 1; transform: none; } }
@keyframes rw-glow { 50% { box-shadow: 0 5px 0 var(--ink), 0 0 44px 14px rgba(255,176,0,1); } }
`;
let cssDone = false;
function ensureCss() { if (!cssDone) { document.head.append(h('style', CSS)); cssDone = true; } }

function countUp(el, to, prefix = '+') {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 600);
    el.textContent = prefix + Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Окно наград. reward: { items, letters, energy, keys }. Новые для коллекции предметы помечаются «НОВОЕ!». */
export function revealReward(title, reward = {}, onClose) {
  const fresh = new Set(lastNew);
  enqueue((done) => {
    ensureCss();
    const cards = [];
    const add = (emoji, word, n, rar, isNew) => cards.push({ emoji, word, n, rar, isNew });
    if (reward.energy) add('⚡', 'энергия', reward.energy, 'c');
    if (reward.keys) add('🗝️', 'ключ', reward.keys, 'e');
    for (const [id, n] of Object.entries(reward.items || {})) {
      const it = getItem(id);
      add(it.emoji, it.word.toLowerCase(), n, it.rarity, fresh.has(id));
    }
    const letters = typeof reward.letters === 'string' ? reward.letters
      : Object.entries(reward.letters || {}).map(([ch, n]) => ch.repeat(n)).join('');
    const best = cards.some((c) => c.rar === 'l') ? 'l' : cards.some((c) => c.rar === 'e') ? 'e' : '';

    const grid = h('div.rw-grid');
    const lettersEl = h('div.rw-letters', [...letters].sort().map((ch) => h('span.tile', ch)));
    const btn = h('button.btn.btn-big.rw-btn', 'Забрать');
    const back = h('div.rw-back' + (best === 'l' ? '.gold' : ''), h('div.rw-rays'), h('div.rw-title', title), grid, letters ? lettersEl : null,
      !cards.length && !letters ? h('div.rw-empty', 'В этот раз без трофеев') : null, btn);
    document.body.append(back);

    sfx('reward'); buzz([10, 40, 10]);
    cards.forEach((c, i) => {
      const n = h('div.n', '+0');
      const card = h('div.rw-card.rar-' + c.rar, h('div.e', c.emoji), h('div.w', c.word), n, h('div.band'), c.isNew ? h('div.rw-new', 'НОВОЕ') : null);
      grid.append(card);
      setTimeout(() => {
        card.classList.add('in'); countUp(n, c.n, c.n > 1 || c.emoji === '⚡' ? '+' : '×');
        sfx(c.rar === 'l' || c.rar === 'e' ? 'win' : 'coin');
        if (c.rar === 'l' || c.rar === 'e' || c.isNew) {
          const r = card.getBoundingClientRect();
          confetti(r.left + r.width / 2, r.top + r.height / 2, c.rar === 'l' ? 40 : 18);
        }
      }, 250 + i * 220);
    });
    [...lettersEl.children].forEach((t, i) => setTimeout(() => t.classList.add('in'), 250 + cards.length * 220 + i * 60));
    btn.style.animationDelay = (0.3 + cards.length * 0.22 + letters.length * 0.06) + 's';

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      // трофеи улетают в шапку/меню
      [...grid.children].forEach((card, i) => {
        const r = card.getBoundingClientRect();
        const emoji = card.querySelector('.e').textContent;
        const to = emoji === '⚡' ? '.hud-pill[data-k="energy"]' : emoji === '🗝️' ? '.hud-pill[data-k="keys"]' : '.tab[data-tab="bag"]';
        setTimeout(() => flyTo(emoji, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, to), i * 60);
      });
      if (letters) flyTo('А', { x: innerWidth / 2, y: innerHeight / 2 }, '.hud-pill[data-k="letters"]');
      back.style.transition = 'opacity .25s'; back.style.opacity = '0';
      setTimeout(() => { back.remove(); onClose && onClose(); done(); }, 260);
    };
    btn.addEventListener('click', close);
  });
}

/** Большая победа: новый уровень */
export function celebrateLevel(level, reward, onClose) {
  enqueue((done) => {
    ensureCss();
    const back = h('div.rw-back.gold', h('div.rw-rays'),
      h('div.lv-big', h('small', 'УРОВЕНЬ'), h('b', String(level))),
      h('div.rw-title', 'Новый уровень!'));
    const btn = h('button.btn.btn-big.rw-btn', { style: { animationDelay: '.6s' } }, 'Ура!');
    back.append(btn);
    document.body.append(back);
    sfx('reward'); buzz([20, 60, 20, 60, 40]);
    for (let i = 0; i < 4; i++) setTimeout(() => confetti(innerWidth * (0.2 + Math.random() * 0.6), innerHeight * 0.35, 50), i * 250);
    btn.addEventListener('click', () => {
      back.remove();
      done();
      revealReward(`Подарок за уровень ${level}`, reward, onClose);
    });
  });
}
