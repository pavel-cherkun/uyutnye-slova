// Мини-игра «Блоки» — стрелялка в стиле Ballz. Бесплатная, главный источник букв.

import { randomLetter } from '../data/letters.js';
import { h, modal, shuffle, confetti } from '../ui/common.js';
import { sfx, buzz } from '../ui/device.js';

export const meta = {
  id: 'shooter',
  title: 'Блоки',
  emoji: '🎯',
  desc: 'Сбивай блоки — собирай буквы',
  cost: { energy: 0 },
  gives: 'буквы',
};

// ---------- Константы мира (единица = одна клетка) ----------
const COLS = 7;
const ROWS = 10;             // ряды 0..ROWS-2 — игровые, ряд ROWS-1 — «смертельный»
const FH = ROWS + 0.9;       // высота мира
const FLOOR = FH - 0.2;      // y центра шарика на полу
const R = 0.13;              // радиус шарика
const GAP = 0.05;            // половина зазора между блоками
const SPEED = 19;            // клеток в секунду
const LAUNCH_GAP = 0.075;    // сек между шариками в очереди
const MAX_ANGLE = 1.36;      // ~78° от вертикали
const LETTER_CHANCE = 0.6;
const RECALL_AFTER = 8;      // сек

const CSS = `
.sh-root { position:absolute; inset:0; display:flex; flex-direction:column; color:var(--ink);
  background-color:var(--paper); background-image:radial-gradient(rgba(17,17,17,.08) 1.2px, transparent 1.3px); background-size:18px 18px; }
.sh-root .game-top { gap:6px; padding:calc(8px + var(--safe-top)) 10px 6px; }
.sh-root .game-top .btn-icon { font-weight:900; font-size:18px; }
.sh-root .game-top .btn-icon:active { transform:translateY(3px); box-shadow:0 0 0 var(--ink); }
.sh-title { flex:1; min-width:0; font-family:var(--display); font-weight:900; font-size:17px; letter-spacing:-.5px;
  text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sh-pill { display:flex; align-items:center; gap:4px; background:#fff; border:2.5px solid var(--ink); border-radius:999px;
  padding:4px 10px; font-family:var(--display); font-weight:800; font-size:13px; box-shadow:0 3px 0 var(--ink); white-space:nowrap; }
.sh-pill small { font-family:var(--font, inherit); font-size:10px; font-weight:900; opacity:.55; text-transform:uppercase; }
.sh-pill.sh-turn { background:var(--lime); }
.sh-pill .ltr { background:var(--yellow); border:2px solid var(--ink); color:var(--ink); box-shadow:none; }
.sh-pill.sh-bump { animation: sh-bump .45s cubic-bezier(.3,1.8,.5,1); }
@keyframes sh-bump { 35% { transform: scale(1.35) rotate(-6deg); background:var(--yellow); } }
.sh-strip { display:flex; gap:4px; overflow-x:auto; padding:2px 10px 8px; min-height:38px; align-items:center;
  scrollbar-width:none; -webkit-overflow-scrolling:touch; flex:none; }
.sh-strip::-webkit-scrollbar { display:none; }
.sh-tile { display:inline-flex; align-items:center; justify-content:center; flex:none; width:34px; height:38px;
  background:var(--yellow); color:var(--ink); border:2.5px solid var(--ink); border-radius:10px; box-shadow:0 3px 0 var(--ink);
  font-family:var(--display); font-weight:900; font-size:18px; line-height:1; }
.sh-strip .sh-tile { width:24px; height:28px; font-size:13px; border-width:2px; border-radius:7px; box-shadow:0 2px 0 var(--ink);
  animation: sh-pop .4s cubic-bezier(.3,1.8,.6,1); }
.sh-strip-empty { font-size:12px; font-weight:800; color:var(--ink-soft); }
@keyframes sh-pop { from { transform:scale(0) rotate(-20deg); } }
.sh-wrap { flex:1; position:relative; min-height:0; overflow:hidden; }
.sh-wrap canvas { position:absolute; inset:0; touch-action:none; display:block; }
.sh-ctrl { position:absolute; bottom:calc(10px + var(--safe-bottom)); display:flex; gap:8px; z-index:2; }
.sh-ctrl.left { left:12px; } .sh-ctrl.right { right:12px; }
.sh-btn { border:2.5px solid var(--ink); border-radius:999px; padding:7px 14px; font-family:var(--display); font-weight:800; font-size:13px;
  color:#fff; background:var(--violet); box-shadow:0 4px 0 var(--ink); text-transform:uppercase;
  transition: transform .08s, box-shadow .08s, opacity .2s; }
.sh-btn:active { transform:translateY(3px); box-shadow:0 1px 0 var(--ink); }
.sh-btn.sh-orange { background:var(--orange); }
.sh-btn.sh-hide { opacity:0; pointer-events:none; transform:scale(.8); }
.sh-fly { position:fixed; z-index:120; pointer-events:none; left:0; top:0; margin:0; will-change:transform; }
.sh-fly.sh-ghost { opacity:.35; }
.sh-float { position:absolute; z-index:3; pointer-events:none; font-family:var(--display); font-weight:800; font-size:14px;
  color:var(--ink); background:var(--lime); border:2px solid var(--ink); border-radius:99px; padding:1px 8px; box-shadow:0 3px 0 var(--ink);
  transform:translate(-50%,-50%); animation: sh-float .9s cubic-bezier(.2,.9,.3,1) forwards; white-space:nowrap; }
@keyframes sh-float { 0% { transform:translate(-50%,-50%) scale(.4); } 20% { transform:translate(-50%,-80%) scale(1.15); }
  100% { transform:translate(-50%,-190%) scale(1); opacity:0; } }
.sh-combo { position:absolute; left:50%; top:34%; z-index:4; pointer-events:none; white-space:nowrap; font-family:var(--display);
  font-weight:900; letter-spacing:-1px; text-transform:uppercase; color:var(--ink); background:var(--lime); border:3px solid var(--ink);
  border-radius:20px; padding:4px 14px 2px; box-shadow:0 5px 0 var(--ink); transform:translate(-50%,-50%) rotate(-4deg); }
.sh-combo.c2 { background:var(--yellow); } .sh-combo.c3 { background:var(--pink); color:#fff; } .sh-combo.c4 { background:var(--violet); color:#fff; }
.sh-banner { position:absolute; left:-10px; right:-10px; top:16%; z-index:4; pointer-events:none; text-align:center; font-family:var(--display);
  font-weight:900; font-size:26px; letter-spacing:-1px; color:var(--lime); background:var(--ink); border-top:3px solid var(--lime);
  border-bottom:3px solid var(--lime); padding:10px 0 8px; transform:rotate(-3deg); }
.sh-over { position:absolute; inset:0; z-index:5; display:flex; align-items:center; justify-content:center; padding:16px;
  background:rgba(17,17,17,.62); animation: sh-dim .3s; }
@keyframes sh-dim { from { background:rgba(17,17,17,0); } }
.sh-over-box { position:relative; background:#fff; border:3px solid var(--ink); border-radius:28px; padding:18px 16px 16px; width:100%; max-width:380px;
  display:flex; flex-direction:column; gap:12px; text-align:center; box-shadow:0 8px 0 var(--ink); animation: sh-boxin .45s cubic-bezier(.3,1.6,.6,1);
  max-height:100%; overflow-y:auto; }
@keyframes sh-boxin { from { transform:scale(.6) rotate(-4deg); } }
.sh-over-title { font-family:var(--display); font-weight:900; font-size:18px; letter-spacing:-.5px; text-transform:uppercase; }
.sh-big { align-self:center; background:var(--lime); border:3px solid var(--ink); border-radius:26px; box-shadow:0 6px 0 var(--ink);
  padding:8px 26px 4px; font-family:var(--display); font-weight:900; line-height:1; }
.sh-big small { display:block; font-size:12px; letter-spacing:3px; }
.sh-big b { display:block; font-size:72px; letter-spacing:-4px; }
.sh-over-stats { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
.sh-tiles { display:flex; flex-wrap:wrap; gap:5px; justify-content:center; max-height:150px; overflow-y:auto; padding:2px 2px 6px; }
.sh-tiles .sh-tile { animation: sh-pop .4s cubic-bezier(.3,1.8,.6,1) backwards; }
.sh-none { font-weight:800; color:var(--ink-soft); }
.sh-record { align-self:center; font-family:var(--display); font-weight:900; font-size:14px; background:var(--pink); color:#fff;
  border:2.5px solid var(--ink); border-radius:99px; padding:4px 12px; box-shadow:0 3px 0 var(--ink); transform:rotate(-3deg); }
.sh-take { font-family:var(--display); text-transform:uppercase; }
`;

// ---------- Утилиты ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));

// Плоские кислотные цвета: чем крепче блок относительно хода, тем «горячее».
// Жёлтого нет — он у буквенной плитки.
const PALETTE = ['#c8ff2e', '#4fb8ff', '#ff7a1a', '#ff5fa2', '#8c7bff'];
function blockColor(hp, turn) {
  const t = clamp(hp / Math.max(6, turn * 2.4), 0, 1);
  return PALETTE[Math.min(PALETTE.length - 1, Math.floor(t * PALETTE.length))];
}
const INK = '#111111';
const DISPLAY = 'Unbounded, Nunito, system-ui, sans-serif';

function roundRect(g, x, y, w, hgt, r) {
  r = Math.min(r, w / 2, hgt / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hgt, r);
  g.arcTo(x + w, y + hgt, x, y + hgt, r);
  g.arcTo(x, y + hgt, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------- Игра ----------
export function mount(root, ctx) {
  root.classList.add('sh-root');

  // --- Состояние ---
  const S = {
    phase: 'aim',          // aim | fly | shift | over
    turn: 1,
    ballsCount: 1,
    plusPending: 0,
    cannonX: COLS / 2,
    nextCannonX: null,
    blocks: [],            // {c, r, y, hp, max, letter, flash, shake, dead}
    bonuses: [],           // {c, r, y, kind, dead, t}
    balls: [],             // {x, y, vx, vy, state:'fly'|'land'|'home', trail:[]}
    toLaunch: 0,
    launchTimer: 0,
    aimDir: null,          // {x, y} нормализованный
    aiming: false,
    speedMul: 1,
    flyTime: 0,
    particles: [],
    rings: [],             // ударные волны от разбитых блоков
    shakeT: 0,
    paused: false,
    finished: false,
    time: 0,
    combo: 0,              // разбито блоков за текущий выстрел
    comboTier: 0,
    bestCombo: 0,
    recordShown: false,
  };
  const collected = [];   // буквы сессии
  let arrived = 0;        // сколько букв «долетело» до счётчика
  let energy = 0;
  const best0 = (ctx.store.state.stats && ctx.store.state.stats.shooterBest) || 0;

  // --- DOM ---
  const turnNum = h('b', '1');
  const turnPill = h('div.sh-pill.sh-turn', h('small', 'ход'), turnNum);
  const letterNum = h('b', '0');
  const letterPill = h('div.sh-pill', h('span.ltr', 'А'), letterNum);
  const strip = h('div.sh-strip', h('span.sh-strip-empty', 'Сбивай блоки с буквами — они попадут сюда'));
  const canvas = h('canvas');
  const speedBtn = h('button.sh-btn.sh-hide', { onclick: onSpeed }, '⏩ x1');
  const recallBtn = h('button.sh-btn.sh-orange.sh-hide', { onclick: onRecall }, '⤵ Вернуть');
  const wrap = h('div.sh-wrap', canvas,
    h('div.sh-ctrl.left', recallBtn),
    h('div.sh-ctrl.right', speedBtn),
  );
  root.append(
    h('style', CSS),
    h('div.game-top',
      h('button.btn-icon', { onclick: onExit, 'aria-label': 'Выход' }, '✕'),
      h('div.sh-title', 'Блоки'),
      turnPill,
      letterPill,
    ),
    strip,
    wrap,
  );

  const g = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, scale = 40, offX = 0, offY = 0;

  function resize() {
    const rect = wrap.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const pad = 8;
    const bottomUi = 52; // место под кнопки
    scale = Math.max(10, Math.min((W - pad * 2) / COLS, (H - pad - bottomUi) / FH));
    offX = (W - COLS * scale) / 2;
    offY = Math.max(pad, (H - bottomUi - FH * scale) / 2);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();

  // --- Генерация рядов ---
  function spawnRow(turn) {
    const cols = shuffle([...Array(COLS).keys()]);
    const nBlocks = clamp(rint(2, 4) + Math.floor(turn / 8), 2, 6);
    const blockCols = cols.slice(0, nBlocks);
    const free = cols.slice(nBlocks);
    for (const c of blockCols) {
      let hp = turn;
      if (turn >= 3 && Math.random() < 0.25) hp = turn * 2;
      S.blocks.push({
        c, r: 0, y: -1, hp, max: hp,
        letter: Math.random() < LETTER_CHANCE ? randomLetter() : null,
        flash: 0, shake: 0, dead: false,
      });
    }
    // «+1» есть всегда, если есть свободная клетка
    if (free.length) S.bonuses.push({ c: free[0], r: 0, y: -1, kind: 'plus', dead: false, t: Math.random() * 6 });
    for (const c of free.slice(1)) {
      const x = Math.random();
      let kind = null;
      if (turn > 3 && x < 0.05) kind = 'boom';
      else if (x < 0.14) kind = 'energy';
      else if (x < 0.3) kind = 'coin';
      if (kind) S.bonuses.push({ c, r: 0, y: -1, kind, dead: false, t: Math.random() * 6 });
    }
  }

  spawnRow(1);
  // первый ряд сразу на месте (анимация въезда — только для следующих)
  for (const o of [...S.blocks, ...S.bonuses]) o.y = o.r;

  // --- Сетка для быстрых коллизий ---
  function blockAt(c, r) {
    for (const b of S.blocks) if (!b.dead && b.c === c && b.r === r) return b;
    return null;
  }
  let grid = new Array(ROWS * COLS).fill(null);
  function rebuildGrid() {
    grid = new Array(ROWS * COLS).fill(null);
    for (const b of S.blocks) if (!b.dead && b.r >= 0 && b.r < ROWS) grid[b.r * COLS + b.c] = b;
  }
  rebuildGrid();

  // --- Коллизия круг–прямоугольник ---
  // Возвращает true, если был удар «навстречу» (для урона)
  function collideRect(ball, x0, y0, x1, y1) {
    const cx = clamp(ball.x, x0, x1);
    const cy = clamp(ball.y, y0, y1);
    let dx = ball.x - cx, dy = ball.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return false;
    let nx, ny, pen;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      nx = dx / d; ny = dy / d; pen = R - d;
    } else {
      // центр внутри прямоугольника — выталкиваем по ближайшей грани
      const l = ball.x - x0, rr = x1 - ball.x, t = ball.y - y0, b = y1 - ball.y;
      const m = Math.min(l, rr, t, b);
      if (m === l) { nx = -1; ny = 0; } else if (m === rr) { nx = 1; ny = 0; }
      else if (m === t) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
      pen = m + R;
    }
    ball.x += nx * pen;
    ball.y += ny * pen;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= 2 * vn * nx;
      ball.vy -= 2 * vn * ny;
      return true;
    }
    return false;
  }

  function fixAngle(ball) {
    // не даём шарику лететь почти горизонтально — иначе ход вечный
    const sp = Math.hypot(ball.vx, ball.vy) || SPEED;
    const minVy = sp * 0.12;
    if (Math.abs(ball.vy) < minVy) {
      ball.vy = (ball.vy >= 0 ? 1 : -1) * minVy;
      const vx = Math.sign(ball.vx || 1) * Math.sqrt(Math.max(0, sp * sp - minVy * minVy));
      ball.vx = vx;
    }
  }

  // --- Урон / разрушение ---
  let lastVibe = 0;
  function vibe(ms) {
    const now = performance.now();
    if (now - lastVibe < 45) return;
    lastVibe = now;
    buzz(ms);
  }
  // Звук с ограничением частоты: удары — редко и тихо, разрушения — чаще
  const lastSnd = {};
  function snd(name, gap) {
    const now = performance.now();
    if (now - (lastSnd[name] || 0) < gap) return;
    lastSnd[name] = now;
    sfx(name);
  }

  function hitBlock(b, dmg = 1) {
    if (b.dead) return;
    b.hp -= dmg;
    b.flash = 1;
    b.shake = 1;
    if (b.hp <= 0) destroyBlock(b);
    else snd('tap', 140);
  }

  function destroyBlock(b) {
    b.dead = true;
    grid[b.r * COLS + b.c] = null;
    const col = blockColor(b.max, S.turn);
    const cx = b.c + 0.5, cy = b.r + 0.5;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(2, 7);
      S.particles.push({
        x: cx + rnd(-0.3, 0.3), y: cy + rnd(-0.3, 0.3),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
        life: rnd(0.4, 0.8), max: 0.8, size: rnd(0.06, 0.14),
        color: Math.random() < 0.25 ? INK : (b.letter && Math.random() < 0.5 ? '#ffd60a' : col),
      });
    }
    // кольцо-ударная волна
    S.rings.push({ x: cx, y: cy, t: 0, color: col });
    vibe(10);
    snd('coin', 70);
    if (b.letter) {
      collected.push(b.letter);
      flyLetter(b.letter, cx, cy);
    }
    if (S.phase === 'fly') addCombo();
  }

  // --- Комбо за выстрел ---
  const COMBO = [
    { from: 2, word: 'КОМБО!' },
    { from: 4, word: 'МЕГА!' },
    { from: 7, word: 'БЕЗУМИЕ!' },
    { from: 11, word: 'ЛЕГЕНДА!' },
  ];
  let comboEl = null;
  function addCombo() {
    S.combo++;
    if (S.combo > S.bestCombo) S.bestCombo = S.combo;
    if (S.combo < 2) return;
    let tier = 0;
    COMBO.forEach((c, i) => { if (S.combo >= c.from) tier = i + 1; });
    const size = Math.min(44, 18 + S.combo * 2.4);
    if (comboEl) comboEl.remove();
    comboEl = h('div.sh-combo.c' + tier, { style: { fontSize: size + 'px' } }, '×' + S.combo + ' ' + COMBO[tier - 1].word);
    wrap.append(comboEl);
    const el = comboEl;
    const rot = (Math.random() < 0.5 ? -1 : 1) * rnd(2, 6);
    el.animate([
      { transform: `translate(-50%,-50%) scale(.3) rotate(${rot * 3}deg)` },
      { transform: `translate(-50%,-50%) scale(1.25) rotate(${-rot}deg)`, offset: 0.25 },
      { transform: `translate(-50%,-50%) scale(1) rotate(${rot}deg)`, offset: 0.45 },
      { transform: `translate(-50%,-90%) scale(1) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: 1100, easing: 'ease-out', fill: 'forwards' }).onfinish = () => { el.remove(); if (comboEl === el) comboEl = null; };
    if (tier > S.comboTier) {
      // новая ступень — особый звук и тряска
      S.comboTier = tier;
      sfx('win');
      if (tier >= 2) { S.shakeT = Math.max(S.shakeT, 0.18 + tier * 0.07); vibe([15, 30, 15]); }
    } else if (S.combo >= 5 && S.combo % 3 === 0) {
      S.shakeT = Math.max(S.shakeT, 0.15);
    }
  }

  // --- Баннер «НОВЫЙ РЕКОРД!» ---
  function showBanner(text) {
    const el = h('div.sh-banner', text);
    wrap.append(el);
    el.animate([
      { transform: 'translateX(-120%) rotate(-3deg)' },
      { transform: 'translateX(4%) rotate(-3deg)', offset: 0.15 },
      { transform: 'translateX(0) rotate(-3deg)', offset: 0.22 },
      { transform: 'translateX(0) rotate(-3deg) scale(1.04)', offset: 0.6 },
      { transform: 'translateX(120%) rotate(-3deg)' },
    ], { duration: 2200, easing: 'ease-in-out', fill: 'forwards' }).onfinish = () => el.remove();
    const r = wrap.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height * 0.2, 36);
    buzz([20, 50, 20, 50, 30]);
  }

  function explode(c, r) {
    S.shakeT = 0.45;
    vibe(40);
    sfx('error');
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      const b = blockAt(c + dc, r + dr);
      if (b) { b.hp = 0; destroyBlock(b); }
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(3, 12);
      S.particles.push({
        x: c + 0.5, y: r + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(0.4, 0.9), max: 0.9, size: rnd(0.08, 0.2),
        color: ['#ffd60a', '#ff7a1a', '#ff5fa2', INK, '#c8ff2e'][i % 5],
      });
    }
  }

  function pickBonus(bo) {
    bo.dead = true;
    const x = bo.c + 0.5, y = bo.r + 0.5;
    snd('tap', 60);
    if (bo.kind === 'plus') { S.plusPending++; floatText('+1 ●', x, y); }
    else if (bo.kind === 'energy') { energy++; floatText('+1 ⚡', x, y); }
    else if (bo.kind === 'coin') { // 🎁 — пара бонусных букв
      for (let i = 0; i < 2; i++) { const ch = randomLetter(); collected.push(ch); flyLetter(ch, x, y); }
      floatText('+2 буквы', x, y);
    }
    else if (bo.kind === 'boom') { floatText('БУМ!', x, y); explode(bo.c, bo.r); }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      S.particles.push({ x, y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 0.4, max: 0.4, size: 0.08, color: i % 2 ? INK : '#c8ff2e' });
    }
  }

  // --- DOM-эффекты ---
  function worldToClient(x, y) {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + offX + x * scale, y: rect.top + offY + y * scale };
  }

  function floatText(text, x, y) {
    const el = h('div.sh-float', { style: { left: offX + x * scale + 'px', top: offY + y * scale + 'px' } }, text);
    wrap.append(el);
    setTimeout(() => el.remove(), 950);
  }

  const flying = new Set();
  function flyLetter(ch, x, y) {
    const from = worldToClient(x, y);
    const to = letterPill.getBoundingClientRect();
    const fx = from.x - 17, fy = from.y - 19;
    const tx = to.left + to.width / 2 - 17, ty = to.top + to.height / 2 - 19;
    // пружинка: подскок у блока, затем дуга к счётчику
    const up = fy - 46, side = fx + (tx - fx) * 0.15;
    const frames = [
      { transform: `translate(${fx}px, ${fy}px) scale(.2) rotate(-30deg)` },
      { transform: `translate(${fx}px, ${up}px) scale(1.7) rotate(8deg)`, offset: 0.22 },
      { transform: `translate(${fx}px, ${up + 10}px) scale(1.35) rotate(-4deg)`, offset: 0.34 },
      { transform: `translate(${side}px, ${up - 20}px) scale(1.2) rotate(0deg)`, offset: 0.5 },
      { transform: `translate(${tx}px, ${ty}px) scale(.55) rotate(12deg)` },
    ];
    const dur = 820;
    // след из бледных копий
    for (let i = 1; i <= 3; i++) {
      const gh = h('span.sh-tile.sh-fly.sh-ghost', ch);
      gh.style.opacity = String(0.42 - i * 0.1);
      gh.style.transform = frames[0].transform;
      document.body.append(gh);
      flying.add(gh);
      gh.animate(frames, { duration: dur, delay: i * 45, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'both' })
        .onfinish = () => { gh.remove(); flying.delete(gh); };
    }
    const el = h('span.sh-tile.sh-fly', ch);
    el.style.transform = frames[0].transform;
    document.body.append(el);
    flying.add(el);
    // искры у блока
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, sp = rnd(2, 5);
      S.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, life: 0.6, max: 0.6, size: 0.1, color: '#ffd60a', star: true });
    }
    el.animate(frames, { duration: dur, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'both' }).onfinish = () => {
      el.remove();
      flying.delete(el);
      if (S.finished) return;
      arrived++;
      letterNum.textContent = String(arrived);
      letterPill.classList.remove('sh-bump');
      void letterPill.offsetWidth;
      letterPill.classList.add('sh-bump');
      const empty = strip.querySelector('.sh-strip-empty');
      if (empty) empty.remove();
      strip.append(h('span.sh-tile', ch));
      strip.scrollLeft = strip.scrollWidth;
    };
  }

  // --- Управление ---
  function toWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left - offX) / scale, y: (e.clientY - rect.top - offY) / scale };
  }

  function updateAim(e) {
    const p = toWorld(e);
    const dx = p.x - S.cannonX, dy = p.y - FLOOR;
    if (p.y > FLOOR - 0.25 || Math.hypot(dx, dy) < 0.3) { S.aimDir = null; return; }
    let a = Math.atan2(dx, -dy);
    a = clamp(a, -MAX_ANGLE, MAX_ANGLE);
    S.aimDir = { x: Math.sin(a), y: -Math.cos(a) };
  }

  function onDown(e) {
    if (S.phase !== 'aim' || S.paused) return;
    S.aiming = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    updateAim(e);
  }
  function onMove(e) {
    if (!S.aiming) return;
    updateAim(e);
  }
  function onUp(e) {
    if (!S.aiming) return;
    S.aiming = false;
    if (e.type === 'pointercancel') { S.aimDir = null; return; }
    updateAim(e);
    if (S.aimDir && S.phase === 'aim' && !S.paused) shoot(S.aimDir);
    S.aimDir = null;
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  function shoot(dir) {
    S.phase = 'fly';
    S.shotDir = { ...dir };
    S.toLaunch = S.ballsCount;
    S.launchTimer = 0;
    S.nextCannonX = null;
    S.flyTime = 0;
    S.balls = [];
    S.combo = 0;
    S.comboTier = 0;
    speedBtn.classList.remove('sh-hide');
    vibe(8);
  }

  function onSpeed() {
    S.speedMul = S.speedMul >= 3 ? 1 : S.speedMul + 1;
    speedBtn.textContent = '⏩ x' + S.speedMul;
  }

  function onRecall() {
    if (S.phase !== 'fly') return;
    S.toLaunch = 0;
    for (const b of S.balls) if (b.state === 'fly') b.state = 'home';
    recallBtn.classList.add('sh-hide');
  }

  // --- Ход ---
  function launchBall() {
    S.balls.push({
      x: S.cannonX, y: FLOOR,
      vx: S.shotDir.x * SPEED, vy: S.shotDir.y * SPEED,
      state: 'fly', trail: [],
    });
  }

  function endTurn() {
    S.balls = [];
    S.ballsCount += S.plusPending;
    S.plusPending = 0;
    if (S.nextCannonX != null) S.cannonX = S.nextCannonX;
    S.turn++;
    turnNum.textContent = String(S.turn);
    turnPill.classList.remove('sh-bump'); void turnPill.offsetWidth; turnPill.classList.add('sh-bump');
    if (!S.recordShown && best0 > 0 && S.turn > best0) {
      S.recordShown = true;
      showBanner('НОВЫЙ РЕКОРД!');
    }
    speedBtn.classList.add('sh-hide');
    recallBtn.classList.add('sh-hide');
    // сдвиг вниз
    S.blocks = S.blocks.filter((b) => !b.dead);
    S.bonuses = S.bonuses.filter((b) => !b.dead);
    for (const b of S.blocks) b.r++;
    for (const b of S.bonuses) b.r++;
    // бонусы, дошедшие до низа, пропадают («+1» засчитываем — как в Ballz)
    for (const bo of S.bonuses) {
      if (bo.r >= ROWS - 1) {
        bo.dead = true;
        if (bo.kind === 'plus') S.ballsCount++;
      }
    }
    S.bonuses = S.bonuses.filter((b) => !b.dead);
    spawnRow(S.turn);
    rebuildGrid();
    S.phase = 'shift';
  }

  function checkAfterShift() {
    if (S.blocks.some((b) => b.r >= ROWS - 1)) gameOver();
    else S.phase = 'aim';
  }

  // --- Физика ---
  function stepBall(ball, dt) {
    if (ball.state === 'home' || ball.state === 'land') {
      const tx = ball.state === 'home' ? (S.nextCannonX ?? S.cannonX) : S.nextCannonX;
      const ty = FLOOR;
      const dx = tx - ball.x, dy = ty - ball.y;
      const d = Math.hypot(dx, dy);
      const sp = (ball.state === 'home' ? 30 : 14) * dt;
      if (d <= sp) { ball.x = tx; ball.y = ty; ball.state = 'done'; }
      else { ball.x += (dx / d) * sp; ball.y += (dy / d) * sp; }
      return;
    }
    if (ball.state !== 'fly') return;
    const dist = Math.hypot(ball.vx, ball.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / (R * 0.45)));
    const h1 = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.x += ball.vx * h1;
      ball.y += ball.vy * h1;
      // стены и потолок
      if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); }
      else if (ball.x > COLS - R) { ball.x = COLS - R; ball.vx = -Math.abs(ball.vx); }
      if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy); }
      // пол
      if (ball.y >= FLOOR && ball.vy > 0) {
        ball.y = FLOOR;
        if (S.nextCannonX == null) {
          S.nextCannonX = clamp(ball.x, R * 2, COLS - R * 2);
          ball.x = S.nextCannonX;
          ball.state = 'done';
        } else {
          ball.state = 'land';
        }
        return;
      }
      // блоки по соседним клеткам
      const c0 = Math.floor(ball.x), r0 = Math.floor(ball.y);
      let hit = false;
      for (let dr = -1; dr <= 1; dr++) {
        const r = r0 + dr;
        if (r < 0 || r >= ROWS) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const c = c0 + dc;
          if (c < 0 || c >= COLS) continue;
          const b = grid[r * COLS + c];
          if (!b || b.dead) continue;
          if (collideRect(ball, c + GAP, r + GAP, c + 1 - GAP, r + 1 - GAP)) {
            hitBlock(b);
            hit = true;
          }
        }
      }
      if (hit) fixAngle(ball);
      // бонусы
      for (const bo of S.bonuses) {
        if (bo.dead) continue;
        const dx = ball.x - (bo.c + 0.5), dy = ball.y - (bo.r + 0.5);
        if (dx * dx + dy * dy < (R + 0.24) ** 2) pickBonus(bo);
      }
    }
  }

  // --- Прицел: луч до первого касания ---
  function raycast(dir) {
    const p = { x: S.cannonX, y: FLOOR };
    const st = 0.04;
    for (let i = 0; i < 600; i++) {
      p.x += dir.x * st; p.y += dir.y * st;
      if (p.x < R || p.x > COLS - R || p.y < R) break;
      const c0 = Math.floor(p.x), r0 = Math.floor(p.y);
      let hit = false;
      for (let dr = -1; dr <= 1 && !hit; dr++) for (let dc = -1; dc <= 1 && !hit; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        const b = grid[r * COLS + c];
        if (!b || b.dead) continue;
        const cx = clamp(p.x, c + GAP, c + 1 - GAP), cy = clamp(p.y, r + GAP, r + 1 - GAP);
        if ((p.x - cx) ** 2 + (p.y - cy) ** 2 < R * R) hit = true;
      }
      if (hit) break;
    }
    p.x = clamp(p.x, R, COLS - R);
    p.y = Math.max(R, p.y);
    return p;
  }

  // --- Цикл ---
  let raf = 0;
  let last = performance.now();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (!S.paused) update(dt);
    draw();
  }

  function update(dt) {
    S.time += dt;
    const sdt = dt * (S.phase === 'fly' ? S.speedMul : 1);

    // анимация положения
    let moving = false;
    for (const b of S.blocks) {
      const k = 1 - Math.pow(0.0005, dt);
      b.y += (b.r - b.y) * k;
      if (Math.abs(b.r - b.y) > 0.01) moving = true; else b.y = b.r;
      b.flash = Math.max(0, b.flash - dt * 5);
      b.shake = Math.max(0, b.shake - dt * 6);
    }
    for (const bo of S.bonuses) {
      const k = 1 - Math.pow(0.0005, dt);
      bo.y += (bo.r - bo.y) * k;
      if (Math.abs(bo.r - bo.y) > 0.01) moving = true; else bo.y = bo.r;
      bo.t += dt;
    }
    if (S.phase === 'shift' && !moving) checkAfterShift();

    if (S.phase === 'fly') {
      S.flyTime += dt;
      if (S.flyTime > RECALL_AFTER) recallBtn.classList.remove('sh-hide');
      // очередь
      if (S.toLaunch > 0) {
        S.launchTimer -= sdt;
        while (S.toLaunch > 0 && S.launchTimer <= 0) {
          launchBall();
          S.toLaunch--;
          S.launchTimer += LAUNCH_GAP;
        }
      }
      for (const ball of S.balls) {
        if (ball.state === 'fly') {
          ball.trail.push(ball.x, ball.y);
          if (ball.trail.length > 12) ball.trail.splice(0, 2);
        } else if (ball.trail.length) ball.trail.splice(0, 2);
        stepBall(ball, sdt);
      }
      // land-шарики, упавшие раньше чем определился nextCannonX — невозможно, но подстрахуемся
      if (S.toLaunch === 0 && S.balls.every((b) => b.state === 'done')) endTurn();
    }

    // частицы
    for (const p of S.particles) {
      p.life -= dt;
      p.vy += 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    S.particles = S.particles.filter((p) => p.life > 0);
    for (const r of S.rings) r.t += dt;
    S.rings = S.rings.filter((r) => r.t < 0.35);
    if (S.particles.length > 600) S.particles.splice(0, S.particles.length - 600);
    S.shakeT = Math.max(0, S.shakeT - dt);
  }

  // --- Рисование ---
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    let sx = 0, sy = 0;
    if (S.shakeT > 0) {
      const a = Math.min(1, S.shakeT) * 22;
      sx = rnd(-a, a); sy = rnd(-a, a);
    }
    g.save();
    g.translate(offX + sx, offY + sy);
    const s = scale;
    const fw = COLS * s, fh = FH * s;
    const lw = Math.max(2, s * 0.055); // толщина чёрной обводки

    // поле: белая карточка с жирной обводкой и жёсткой тенью
    roundRect(g, -6, -6 + 5, fw + 12, fh + 12, 22);
    g.fillStyle = INK; g.fill();
    roundRect(g, -6, -6, fw + 12, fh + 12, 22);
    g.fillStyle = '#ffffff'; g.fill();
    g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    g.save();
    roundRect(g, -4.5, -4.5, fw + 9, fh + 9, 20);
    g.clip();

    // сетка-точки
    g.fillStyle = 'rgba(17,17,17,.13)';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c <= COLS; c++) {
      g.beginPath(); g.arc(c * s, r * s, 1.4, 0, Math.PI * 2); g.fill();
    }

    // зона у пола
    const dangerY = (ROWS - 1) * s;
    const danger = S.blocks.some((b) => !b.dead && b.r >= ROWS - 2);
    g.fillStyle = danger ? `rgba(255,95,162,${0.14 + 0.1 * Math.sin(S.time * 8)})` : 'rgba(200,255,46,.22)';
    g.fillRect(-6, dangerY, fw + 12, fh - dangerY + 6);
    g.strokeStyle = danger ? '#ff5fa2' : INK;
    g.lineWidth = 2.5;
    g.setLineDash([8, 7]);
    g.beginPath(); g.moveTo(0, dangerY); g.lineTo(fw, dangerY); g.stroke();
    g.setLineDash([]);

    // бонусы
    for (const bo of S.bonuses) {
      if (bo.dead) continue;
      const cx = (bo.c + 0.5) * s, cy = (bo.y + 0.5) * s;
      const pulse = 1 + 0.09 * Math.sin(bo.t * 5);
      const rad = 0.25 * s * pulse;
      const col = { plus: '#c8ff2e', energy: '#4fb8ff', coin: '#ffd60a', boom: '#ff5fa2' }[bo.kind];
      // пульсирующее кольцо
      g.beginPath(); g.arc(cx, cy, rad + 5 + 2 * Math.sin(bo.t * 5), 0, Math.PI * 2);
      g.setLineDash([4, 4]); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(cx, cy + 3, rad, 0, Math.PI * 2);
      g.fillStyle = INK; g.fill();
      g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fillStyle = col; g.fill();
      g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (bo.kind === 'plus') {
        g.fillStyle = INK;
        g.font = `900 ${Math.round(s * 0.24)}px ${DISPLAY}`;
        g.fillText('+1', cx, cy + 1);
      } else {
        g.font = `${Math.round(s * 0.28)}px system-ui, sans-serif`;
        g.fillText({ energy: '⚡', coin: '🎁', boom: '💥' }[bo.kind], cx, cy + 1);
      }
    }

    // блоки
    for (const b of S.blocks) {
      if (b.dead) continue;
      const col = blockColor(b.hp, S.turn);
      const jx = b.shake > 0 ? rnd(-1, 1) * b.shake * 2.5 : 0;
      const jy = b.shake > 0 ? rnd(-1, 1) * b.shake * 2.5 : 0;
      const pop = 1 + b.shake * 0.07;
      const bw = (1 - GAP * 2) * s * pop;
      const bh = bw - 4;
      const x = (b.c + 0.5) * s - bw / 2 + jx;
      const y = (b.y + 0.5) * s - bw / 2 + jy - 1;
      const rr = s * 0.2;
      const press = b.flash * 2; // при ударе блок «вдавливается» в тень
      // жёсткая тень-сдвиг вниз
      roundRect(g, x, y + 4, bw, bh, rr);
      g.fillStyle = INK; g.fill();
      roundRect(g, x, y + press, bw, bh, rr);
      g.fillStyle = col; g.fill();
      g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
      // блик
      roundRect(g, x + bw * 0.14, y + press + bh * 0.1, bw * 0.28, bh * 0.1, bh * 0.05);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const dark = col === '#8c7bff' || col === '#ff5fa2';
      const txtCol = dark ? '#ffffff' : INK;
      const yy = y + press;
      if (b.letter) {
        // жёлтая буквенная плитка с чёрным контуром
        const tw = bw * 0.54, th = bh * 0.56;
        const tx = x + (bw - tw) / 2, ty = yy + bh * 0.1;
        roundRect(g, tx, ty + 2, tw, th, tw * 0.24);
        g.fillStyle = INK; g.fill();
        roundRect(g, tx, ty, tw, th, tw * 0.24);
        g.fillStyle = '#ffd60a'; g.fill();
        g.lineWidth = Math.max(1.5, lw * 0.8); g.strokeStyle = INK; g.stroke();
        g.fillStyle = INK;
        g.font = `900 ${Math.round(th * 0.62)}px ${DISPLAY}`;
        g.fillText(b.letter, tx + tw / 2, ty + th / 2 + 1);
        const digits = String(b.hp).length;
        g.font = `800 ${Math.round(bh * (digits > 3 ? 0.15 : 0.19))}px ${DISPLAY}`;
        g.fillStyle = txtCol;
        g.fillText(b.hp, x + bw / 2, yy + bh * 0.84);
      } else {
        const digits = String(b.hp).length;
        g.font = `900 ${Math.round(bh * (digits > 3 ? 0.24 : digits > 2 ? 0.3 : 0.38))}px ${DISPLAY}`;
        g.fillStyle = txtCol;
        g.fillText(b.hp, x + bw / 2, yy + bh / 2 + 2);
      }
      if (b.flash > 0) {
        roundRect(g, x, yy, bw, bh, rr);
        g.fillStyle = `rgba(255,255,255,${b.flash * 0.7})`; g.fill();
      }
    }

    // ударные волны
    for (const r of S.rings) {
      const k = r.t / 0.35;
      g.globalAlpha = 1 - k;
      g.beginPath(); g.arc(r.x * s, r.y * s, s * (0.3 + k * 0.6), 0, Math.PI * 2);
      g.lineWidth = 4 * (1 - k) + 1; g.strokeStyle = INK; g.stroke();
    }
    g.globalAlpha = 1;

    // частицы
    for (const p of S.particles) {
      g.globalAlpha = clamp(p.life / p.max, 0, 1);
      g.fillStyle = p.color;
      const ps = p.size * s;
      if (p.star) {
        g.save(); g.translate(p.x * s, p.y * s); g.rotate(p.life * 8);
        g.fillRect(-ps / 2, -ps / 6, ps, ps / 3); g.fillRect(-ps / 6, -ps / 2, ps / 3, ps);
        g.restore();
      } else {
        g.fillRect(p.x * s - ps / 2, p.y * s - ps / 2, ps, ps);
      }
    }
    g.globalAlpha = 1;

    // прицел
    if (S.phase === 'aim' && S.aiming && S.aimDir) {
      const end = raycast(S.aimDir);
      const sx0 = S.cannonX, sy0 = FLOOR;
      const len = Math.hypot(end.x - sx0, end.y - sy0);
      const stepD = 0.32;
      const off = (S.time * 1.2) % stepD;
      g.fillStyle = INK;
      for (let d = 0.4 + off; d < len; d += stepD) {
        const k = d / len;
        g.globalAlpha = 1 - 0.5 * k;
        g.beginPath();
        g.arc((sx0 + (end.x - sx0) * k) * s, (sy0 + (end.y - sy0) * k) * s, s * 0.05, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.beginPath(); g.arc(end.x * s, end.y * s, R * s, 0, Math.PI * 2);
      g.fillStyle = '#c8ff2e'; g.fill();
      g.strokeStyle = INK; g.lineWidth = 2; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
    }

    // шарики
    for (const ball of S.balls) {
      if (ball.state === 'done') continue;
      const t = ball.trail;
      for (let i = 0; i < t.length; i += 2) {
        const k = (i + 2) / (t.length + 2);
        g.globalAlpha = k * 0.55;
        g.fillStyle = '#c8ff2e';
        g.beginPath(); g.arc(t[i] * s, t[i + 1] * s, R * s * k, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      drawBall(ball.x * s, ball.y * s, R * s);
    }

    // пушка
    const cx = S.cannonX * s, cy = FLOOR * s;
    if (S.phase !== 'fly' || S.toLaunch > 0) {
      drawBall(cx, cy, R * s * 1.25);
    }
    if (S.phase === 'fly' && S.nextCannonX != null) {
      drawBall(S.nextCannonX * s, cy, R * s * 1.25);
    }
    const shownN = S.phase === 'fly' ? S.toLaunch : S.ballsCount;
    if (shownN > 0) {
      const label = '×' + shownN;
      g.font = `800 ${Math.round(s * 0.24)}px ${DISPLAY}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(label).width + s * 0.22, th = s * 0.36;
      const lx = clamp(cx, tw / 2 + 4, fw - tw / 2 - 4), ly = cy - R * s * 1.4 - th / 2 - 4;
      roundRect(g, lx - tw / 2, ly - th / 2 + 2, tw, th, th / 2);
      g.fillStyle = INK; g.fill();
      roundRect(g, lx - tw / 2, ly - th / 2, tw, th, th / 2);
      g.fillStyle = '#ffffff'; g.fill();
      g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK;
      g.fillText(label, lx, ly + 1);
    }

    g.restore(); // clip
    g.restore();
  }

  function drawBall(x, y, r) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#c8ff2e'; g.fill();
    g.lineWidth = Math.max(1.5, r * 0.32); g.strokeStyle = INK; g.stroke();
  }

  // --- Конец / выход ---
  function reward() {
    const r = {};
    if (collected.length) r.letters = collected.join('');
    if (energy) r.energy = energy;
    return r;
  }

  function saveBest() {
    const st = ctx.store.state;
    if (!st.stats) st.stats = { shooterBest: 0 };
    const isRecord = S.turn > (st.stats.shooterBest || 0);
    if (isRecord) st.stats.shooterBest = S.turn;
    ctx.store.commit();
    return isRecord;
  }

  function finish(title) {
    if (S.finished) return;
    S.finished = true;
    saveBest();
    ctx.finish(reward(), title);
  }

  let exitModal = null;
  function onExit() {
    if (S.finished || exitModal) return;
    if (S.phase === 'over') { finish('Собрано!'); return; }
    S.paused = true;
    S.aiming = false;
    S.aimDir = null;
    exitModal = modal([
      h('div.modal-title', 'Забрать буквы и выйти?'),
      collected.length
        ? h('div.sh-tiles', [...collected].sort().map((ch) => h('span.sh-tile', ch)))
        : h('p.muted.center', 'Пока ни одной буквы'),
      h('div.row',
        h('button.btn.btn-ghost', { onclick: () => { exitModal.close(); } }, 'Играть'),
        h('button.btn', { onclick: () => { exitModal.close(); finish('Собрано!'); } }, 'Забрать'),
      ),
    ], {
      onClose: () => {
        exitModal = null;
        if (!S.finished) { S.paused = false; last = performance.now(); }
      },
    });
  }

  function gameOver() {
    S.phase = 'over';
    speedBtn.classList.add('sh-hide');
    recallBtn.classList.add('sh-hide');
    vibe([40, 60, 40]);
    sfx('error');
    const isRecord = S.turn > best0;
    const takeBtn = h('button.btn.btn-big.sh-take', { onclick: () => finish('Собрано!') }, 'Забрать');
    const sorted = [...collected].sort();
    const box = h('div.sh-over-box',
      h('div.sh-over-title', 'Блоки дошли до низа'),
      h('div.sh-big', h('small', 'ХОД'), h('b', String(S.turn))),
      isRecord && best0 > 0 ? h('div.sh-record', 'Новый рекорд!') : null,
      h('div.sh-over-stats',
        h('div.sh-pill', h('small', 'рекорд'), h('b', String(Math.max(best0, S.turn)))),
        S.bestCombo >= 2 ? h('div.sh-pill', h('small', 'комбо'), h('b', '×' + S.bestCombo)) : null,
        energy ? h('div.sh-pill', '⚡ +' + energy) : null,
      ),
      sorted.length
        ? h('div.sh-tiles', sorted.map((ch, i) => h('span.sh-tile', { style: { animationDelay: Math.min(1.2, 0.25 + i * 0.04) + 's' } }, ch)))
        : h('p.sh-none', 'В этот раз без букв'),
      takeBtn,
    );
    wrap.append(h('div.sh-over', box));
    saveBest();
    if (isRecord && best0 > 0) setTimeout(() => { if (!S.finished) sfx('reward'); }, 350);
  }

  raf = requestAnimationFrame(frame);

  // --- Очистка ---
  return () => {
    S.finished = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    for (const el of flying) el.remove();
    flying.clear();
    if (exitModal) { const m = exitModal; exitModal = null; m.close(); }
  };
}
