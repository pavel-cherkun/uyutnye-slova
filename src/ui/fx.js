// Эффекты «маленьких и больших побед»: всплывающие +N, полёт трофеев в шапку,
// окно наград с переворотом карточек, праздник нового уровня. Окна идут очередью, не перекрывая друг друга.

import { h, confetti } from './common.js';
import { getItem, RARITY } from '../data/items.js';
import { lastNew } from '../state.js';
import { sfx, buzz } from './device.js';

// ---------- Очередь больших окон ----------
// Ритм: большие окна — только для больших побед, по одному; во время мини-игры они ждут выхода.
const queue = [];
let busy = false;
let held = false;
export function enqueue(show) {
  queue.push(show);
  if (!busy && !held) next();
}
function next() {
  if (held) { busy = false; return; }
  const show = queue.shift();
  if (!show) { busy = false; return; }
  busy = true;
  show(() => setTimeout(next, 350));
}
/** Придержать большие окна (true) или отпустить накопившиеся (false) */
export function hold(on) {
  held = on;
  if (!on && !busy) next();
}

/** Лёгкая награда без окна: плашка сверху, значки улетают в шапку. Для мелких побед (задания, испытания). */
export function quickReward(text, reward = {}) {
  ensureCss();
  const parts = [];
  if (reward.energy) parts.push(`⚡+${reward.energy}`);
  if (reward.keys) parts.push(`🗝️+${reward.keys}`);
  const letters = typeof reward.letters === 'string' ? reward.letters.length : 0;
  if (letters) parts.push(`А+${letters}`);
  for (const [id, n] of Object.entries(reward.items || {})) parts.push(getItem(id).emoji + (n > 1 ? '×' + n : ''));
  const el = h('div.qr', h('b', text), h('span', parts.join('  ')));
  document.body.append(el);
  sfx('coin'); buzz(12);
  const r = { x: innerWidth / 2, y: 90 };
  setTimeout(() => {
    if (reward.energy) flyTo('⚡', r, '.hud-pill[data-k="energy"]');
    if (reward.keys) flyTo('🗝️', r, '.hud-pill[data-k="keys"]');
    if (letters) flyTo('А', r, '.hud-pill[data-k="letters"]');
    if (reward.items) flyTo('🎁', r, '.tab[data-tab="bag"]');
  }, 500);
  setTimeout(() => el.classList.add('out'), 1700);
  setTimeout(() => el.remove(), 2100);
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
.rw-rays { position: absolute; width: 640px; height: 640px; left: 50%; top: 40%; margin: -320px 0 0 -320px; pointer-events: none; opacity: .35; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, rgba(200,255,46,.5) 0 10deg, transparent 10deg 20deg); animation: rw-spin 20s linear infinite; will-change: transform; }
.rw-back.gold .rw-rays { background: repeating-conic-gradient(from 0deg, rgba(255,176,0,.6) 0 10deg, transparent 10deg 20deg); opacity: .5; }
.rw-title { position: relative; font-family: var(--display); font-weight: 900; font-size: 30px; color: var(--lime); text-align: center;
  text-transform: uppercase; letter-spacing: -1px; text-shadow: 0 4px 0 #000; animation: rw-pop .5s cubic-bezier(.2,1.8,.4,1); }
.rw-grid { position: relative; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-width: 420px; }
.rw-card { width: 92px; min-height: 112px; background: #fff; border: 3px solid var(--ink); border-radius: 18px; box-shadow: 0 5px 0 var(--ink);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 8px 4px 0; position: relative; overflow: hidden;
  visibility: hidden; }
.rw-card.in { visibility: visible; animation: rw-flipin .55s cubic-bezier(.2,1.6,.4,1); }
.rw-card .e { font-size: 40px; line-height: 1.1; }
.rw-card .w { font-weight: 900; font-size: 11px; text-align: center; padding: 0 4px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rw-card .n { font-family: var(--display); font-weight: 900; font-size: 16px; }
.rw-card .band { align-self: stretch; margin-top: auto; height: 10px; background: var(--rar, var(--lime)); border-top: 2px solid var(--ink); }
.rw-card.rar-e { box-shadow: 0 5px 0 var(--ink), 0 0 22px 4px rgba(180,107,255,.75); }
.rw-card.rar-l { box-shadow: 0 5px 0 var(--ink), 0 0 30px 8px rgba(255,176,0,.9); }
.rw-card.rar-l.in { animation: rw-flipin .55s cubic-bezier(.2,1.6,.4,1); }
.rw-new { position: absolute; top: 4px; right: -22px; transform: rotate(35deg); background: var(--pink); color: #fff; font-size: 9px; font-weight: 900;
  padding: 2px 24px; border-top: 2px solid var(--ink); border-bottom: 2px solid var(--ink); }
.rw-letters { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; max-width: 320px; }
.rw-letters .tile { visibility: hidden; }
.rw-letters .tile.in { visibility: visible; animation: rw-dropin .4s cubic-bezier(.2,1.6,.4,1); }
.rw-btn { position: relative; z-index: 2; min-width: 220px; font-family: var(--display); font-size: 18px; text-transform: uppercase; visibility: hidden; }
.rw-btn.show { visibility: visible; }
@keyframes rw-show { to { opacity: 1; } }
.rw-empty { color: #fff; font-weight: 800; }
.ch-box { position: relative; font-size: 120px; line-height: 1; border: 0; background: none; cursor: pointer; transform: scale(var(--s, 1));
  animation: ch-idle 1.2s ease-in-out infinite; transition: transform .15s; }
.ch-box.hit { animation: ch-hit .35s; }
.ch-box.boom { animation: ch-boom .45s forwards; }
.ch-hint { position: relative; font-family: var(--display); font-weight: 900; font-size: 22px; color: #fff; text-transform: uppercase; animation: hud-bump 1s infinite; min-height: 28px; }
@keyframes ch-idle { 50% { transform: scale(var(--s, 1)) rotate(-4deg) translateY(-6px); } }
@keyframes ch-hit { 25% { transform: scale(calc(var(--s, 1) * 1.15)) rotate(-12deg); } 60% { transform: scale(var(--s, 1)) rotate(10deg); } }
@keyframes ch-boom { to { transform: scale(2.4); opacity: 0; } }
.qr { position: fixed; left: 50%; top: calc(64px + env(safe-area-inset-top, 0px)); z-index: 350; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 2px;
  background: var(--ink); color: #fff; border: 2.5px solid var(--lime); border-radius: 20px; padding: 8px 18px; box-shadow: 0 5px 0 #000; pointer-events: none;
  animation: rw-pop .4s cubic-bezier(.2,1.8,.4,1); transition: opacity .35s, transform .35s; max-width: 90vw; }
.qr b { font-family: var(--display); font-size: 14px; color: var(--lime); text-transform: uppercase; }
.qr span { font-weight: 900; font-size: 16px; }
.qr.out { opacity: 0; transform: translate(-50%, -14px); }
.lv-sm { padding: 10px 22px 6px; border-radius: 28px; }
.lv-sm b { font-size: 56px; }
.lv-sm small { font-size: 11px; }
.lv-big { position: relative; font-family: var(--display); font-weight: 900; color: var(--ink); background: var(--lime); border: 4px solid var(--ink);
  border-radius: 40px; box-shadow: 0 8px 0 #000; padding: 18px 28px 12px; text-align: center; animation: rw-pop .6s cubic-bezier(.2,1.8,.4,1); }
.lv-big small { display: block; font-size: 14px; letter-spacing: 3px; }
.lv-big b { display: block; font-size: 84px; line-height: 1; letter-spacing: -4px; }
@keyframes rw-spin { to { transform: rotate(360deg); } }
@keyframes rw-pop { from { transform: scale(.2) rotate(-8deg); opacity: 0; } }
@keyframes rw-flipin { from { opacity: 0; transform: rotateY(90deg) scale(.6); } }
@keyframes rw-dropin { from { opacity: 0; transform: translateY(-30px); } }
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
export function revealReward(title, reward = {}, onClose, opts = {}) {
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
    const lvl = opts.level ? h('div.lv-big.lv-sm', h('small', 'НОВЫЙ УРОВЕНЬ'), h('b', String(opts.level))) : null;
    const back = h('div.rw-back' + (best === 'l' || opts.level ? '.gold' : ''), h('div.rw-rays'), lvl, h('div.rw-title', title), grid, letters ? lettersEl : null,
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
    // кнопку показываем таймером, а не CSS-анимацией: та может «застрять» в свёрнутой вкладке
    setTimeout(() => btn.classList.add('show'), Math.min(1600, 300 + cards.length * 220 + letters.length * 60));

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
    // тап по фону тоже закрывает — после того, как всё показалось
    setTimeout(() => back.addEventListener('click', (e) => { if (e.target === back) close(); }), 1700);
  });
}

/** Сундук: тапни несколько раз — он трясётся и лопается, внутри — награда */
export function openChest(title, tier, reward, onClose) {
  enqueue((done) => {
    ensureCss();
    const icon = { wood: '🎁', silver: '💼', gold: '👑' }[tier] || '🎁';
    const chest = h('button.ch-box.ch-' + tier, icon);
    const hint = h('div.ch-hint', 'Тапни!');
    const back = h('div.rw-back' + (tier === 'gold' ? '.gold' : ''), h('div.rw-rays'), h('div.rw-title', title), chest, hint);
    document.body.append(back);
    sfx('coin');
    let taps = 0;
    const need = 3;
    chest.addEventListener('click', () => {
      taps++;
      buzz(15 + taps * 10);
      sfx(taps < need ? 'tap' : 'win');
      chest.classList.remove('hit'); void chest.offsetWidth; chest.classList.add('hit');
      chest.style.setProperty('--s', 1 + taps * 0.15);
      if (taps >= need) {
        hint.textContent = '';
        chest.classList.add('boom');
        const r = chest.getBoundingClientRect();
        confetti(r.left + r.width / 2, r.top + r.height / 2, 70);
        setTimeout(() => { back.remove(); done(); revealReward('Что внутри!', reward, onClose); }, 450);
      } else hint.textContent = ['Ещё!', 'Почти!'][taps - 1] || 'Ещё!';
    });
  });
}

/** Большая победа: новый уровень — одно окно с подарком */
export function celebrateLevel(level, reward, onClose) {
  buzz([20, 60, 20, 60, 40]);
  revealReward('Подарок за уровень', reward, onClose, { level });
}
