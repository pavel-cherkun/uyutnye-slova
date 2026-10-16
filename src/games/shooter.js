// Мини-игра «Блоки» — стрелялка в стиле Ballz. Бесплатная, главный источник букв.

import { randomLetter } from '../data/letters.js';
import { h, modal, shuffle } from '../ui/common.js';

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
.sh-root { position:absolute; inset:0; display:flex; flex-direction:column; }
.sh-pill { display:flex; align-items:center; gap:4px; background:rgba(255,255,255,.9); border-radius:999px;
  padding:5px 11px; font-weight:900; font-size:14px; box-shadow:0 3px 0 rgba(43,29,74,.12); white-space:nowrap; }
.sh-pill.sh-bump { animation: sh-bump .35s; }
@keyframes sh-bump { 40% { transform: scale(1.3); } }
.sh-strip { display:flex; gap:4px; overflow-x:auto; padding:0 10px 6px; min-height:34px; align-items:center;
  scrollbar-width:none; -webkit-overflow-scrolling:touch; flex:none; }
.sh-strip::-webkit-scrollbar { display:none; }
.sh-strip .tile.sh-mini { width:22px; height:26px; font-size:14px; border-radius:6px; box-shadow:0 2px 0 #d9a92e; flex:none;
  animation: sh-pop .35s cubic-bezier(.3,1.8,.6,1); }
.sh-strip-empty { font-size:12px; font-weight:800; color:var(--ink-soft); opacity:.8; }
@keyframes sh-pop { from { transform:scale(0); } }
.sh-wrap { flex:1; position:relative; min-height:0; overflow:hidden; }
.sh-wrap canvas { position:absolute; inset:0; touch-action:none; display:block; }
.sh-ctrl { position:absolute; bottom:calc(10px + var(--safe-bottom)); display:flex; gap:8px; z-index:2; }
.sh-ctrl.left { left:12px; } .sh-ctrl.right { right:12px; }
.sh-btn { border:0; border-radius:14px; padding:8px 12px; font-weight:900; font-size:15px; color:#fff;
  background:linear-gradient(180deg,#9a82ff,var(--violet)); box-shadow:0 4px 0 #5235d4; font-family:inherit;
  transition: transform .08s, box-shadow .08s, opacity .2s; }
.sh-btn:active { transform:translateY(3px); box-shadow:0 1px 0 #5235d4; }
.sh-btn.sh-orange { background:linear-gradient(180deg,#ffa766,var(--orange)); box-shadow:0 4px 0 #d4621a; }
.sh-btn.sh-hide { opacity:0; pointer-events:none; transform:scale(.8); }
.sh-fly { position:fixed; z-index:120; pointer-events:none; left:0; top:0; margin:0;
  transition: transform .65s cubic-bezier(.5,-0.3,.7,1), opacity .65s; }
.sh-float { position:absolute; z-index:3; pointer-events:none; font-weight:900; font-size:18px; color:#fff;
  text-shadow:0 2px 0 rgba(0,0,0,.35); transform:translate(-50%,-50%); animation: sh-float .9s ease-out forwards; white-space:nowrap; }
@keyframes sh-float { to { transform:translate(-50%,-160%); opacity:0; } }
.sh-over { position:absolute; inset:0; z-index:5; display:flex; align-items:center; justify-content:center; padding:18px;
  background:rgba(30,15,60,.6); animation: sh-fade .3s; }
@keyframes sh-fade { from { opacity:0; } }
.sh-over-box { background:#fff; border-radius:26px; padding:20px; width:100%; max-width:380px; display:flex; flex-direction:column;
  gap:12px; text-align:center; box-shadow:0 10px 0 rgba(0,0,0,.15); animation: sh-pop .4s cubic-bezier(.3,1.6,.6,1); max-height:100%; overflow-y:auto; }
.sh-over-title { font-size:22px; font-weight:900; }
.sh-over-emoji { font-size:52px; line-height:1; }
.sh-over-stats { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
.sh-over-stats .sh-pill { background:#fff6fb; box-shadow: inset 0 0 0 2px var(--line); }
.sh-over .letters-row { max-height:160px; overflow-y:auto; }
.sh-record { color:var(--pink); font-weight:900; animation: sh-bump .6s 2; }
`;

// ---------- Утилиты ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));

function blockColor(hp, turn) {
  // жёлтый → розовый → фиолетовый
  const t = clamp(hp / Math.max(4, turn * 1.6), 0, 1);
  const hue = (45 - t * 145 + 360) % 360;
  return {
    top: `hsl(${hue} 95% 68%)`,
    bot: `hsl(${hue} 88% 54%)`,
    edge: `hsl(${hue} 80% 38%)`,
    hue,
  };
}

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
    shakeT: 0,
    paused: false,
    finished: false,
    time: 0,
  };
  const collected = [];   // буквы сессии
  let arrived = 0;        // сколько букв «долетело» до счётчика
  let energy = 0;
  let coins = 0;
  const best0 = (ctx.store.state.stats && ctx.store.state.stats.shooterBest) || 0;

  // --- DOM ---
  const turnPill = h('div.sh-pill', 'Ход 1');
  const letterPill = h('div.sh-pill', '🔤 0');
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
      h('div.game-title', '🎯 Блоки'),
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
    try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* нет вибрации */ }
  }

  function hitBlock(b, dmg = 1) {
    if (b.dead) return;
    b.hp -= dmg;
    b.flash = 1;
    b.shake = 1;
    if (b.hp <= 0) destroyBlock(b);
  }

  function destroyBlock(b) {
    b.dead = true;
    grid[b.r * COLS + b.c] = null;
    const col = blockColor(b.max, S.turn);
    const cx = b.c + 0.5, cy = b.r + 0.5;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(2, 7);
      S.particles.push({
        x: cx + rnd(-0.3, 0.3), y: cy + rnd(-0.3, 0.3),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
        life: rnd(0.4, 0.8), max: 0.8, size: rnd(0.06, 0.14),
        color: Math.random() < 0.3 ? '#fff' : (b.letter && Math.random() < 0.4 ? '#ffe08a' : col.top),
      });
    }
    vibe(10);
    if (b.letter) {
      collected.push(b.letter);
      flyLetter(b.letter, cx, cy);
    }
  }

  function explode(c, r) {
    S.shakeT = 0.4;
    vibe(40);
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      const b = blockAt(c + dc, r + dr);
      if (b) { b.hp = 0; destroyBlock(b); }
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(3, 12);
      S.particles.push({
        x: c + 0.5, y: r + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(0.4, 0.9), max: 0.9, size: rnd(0.08, 0.2),
        color: ['#ffc93c', '#ff8a3d', '#ff4f8b', '#fff'][i % 4],
      });
    }
  }

  function pickBonus(bo) {
    bo.dead = true;
    const x = bo.c + 0.5, y = bo.r + 0.5;
    if (bo.kind === 'plus') { S.plusPending++; floatText('+1 ⚪', x, y); }
    else if (bo.kind === 'energy') { energy++; floatText('+1 ⚡', x, y); }
    else if (bo.kind === 'coin') { const n = rint(1, 3); coins += n; floatText('+' + n + ' 🪙', x, y); }
    else if (bo.kind === 'boom') { floatText('БУМ!', x, y); explode(bo.c, bo.r); }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      S.particles.push({ x, y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 0.4, max: 0.4, size: 0.07, color: '#fff' });
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
    const el = h('span.tile.sh-fly', ch);
    el.style.transform = `translate(${from.x - 17}px, ${from.y - 19}px) scale(1.2)`;
    document.body.append(el);
    flying.add(el);
    el.getBoundingClientRect(); // форсируем раскладку
    requestAnimationFrame(() => {
      el.style.transform = `translate(${to.left + to.width / 2 - 17}px, ${to.top + to.height / 2 - 19}px) scale(.5)`;
      el.style.opacity = '0.6';
    });
    setTimeout(() => {
      el.remove();
      flying.delete(el);
      if (S.finished) return;
      arrived++;
      letterPill.textContent = '🔤 ' + arrived;
      letterPill.classList.remove('sh-bump');
      void letterPill.offsetWidth;
      letterPill.classList.add('sh-bump');
      const empty = strip.querySelector('.sh-strip-empty');
      if (empty) empty.remove();
      strip.append(h('span.tile.sh-mini', ch));
      strip.scrollLeft = strip.scrollWidth;
    }, 680);
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
    speedBtn.classList.remove('sh-hide');
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
    turnPill.textContent = 'Ход ' + S.turn;
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
    if (S.particles.length > 600) S.particles.splice(0, S.particles.length - 600);
    S.shakeT = Math.max(0, S.shakeT - dt);
  }

  // --- Рисование ---
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    let sx = 0, sy = 0;
    if (S.shakeT > 0) {
      const a = S.shakeT * 18;
      sx = rnd(-a, a); sy = rnd(-a, a);
    }
    g.save();
    g.translate(offX + sx, offY + sy);
    const s = scale;
    const fw = COLS * s, fh = FH * s;

    // поле
    const bg = g.createLinearGradient(0, 0, 0, fh);
    bg.addColorStop(0, '#3a2468');
    bg.addColorStop(1, '#22143f');
    roundRect(g, -4, -4, fw + 8, fh + 8, 16);
    g.fillStyle = bg;
    g.fill();
    g.save();
    roundRect(g, -4, -4, fw + 8, fh + 8, 16);
    g.clip();

    // сетка-точки
    g.fillStyle = 'rgba(255,255,255,.06)';
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c <= COLS; c++) {
      g.beginPath(); g.arc(c * s, r * s, 1.5, 0, Math.PI * 2); g.fill();
    }

    // линия опасности
    const dangerY = (ROWS - 1) * s;
    const danger = S.blocks.some((b) => !b.dead && b.r >= ROWS - 2);
    g.strokeStyle = danger ? `rgba(255,79,139,${0.5 + 0.4 * Math.sin(S.time * 8)})` : 'rgba(255,255,255,.18)';
    g.lineWidth = 2;
    g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(0, dangerY); g.lineTo(fw, dangerY); g.stroke();
    g.setLineDash([]);

    // бонусы
    for (const bo of S.bonuses) {
      if (bo.dead) continue;
      const cx = (bo.c + 0.5) * s, cy = (bo.y + 0.5) * s;
      const pulse = 1 + 0.08 * Math.sin(bo.t * 5);
      const rad = 0.26 * s * pulse;
      const col = { plus: '#2fcf98', energy: '#3fa9ff', coin: '#ffc93c', boom: '#ff4f8b' }[bo.kind];
      g.beginPath(); g.arc(cx, cy, rad + 4, 0, Math.PI * 2);
      g.strokeStyle = col; g.globalAlpha = 0.35 + 0.25 * Math.sin(bo.t * 5); g.lineWidth = 3; g.stroke();
      g.globalAlpha = 1;
      g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fillStyle = col; g.fill();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (bo.kind === 'plus') {
        g.fillStyle = '#fff';
        g.font = `900 ${Math.round(s * 0.3)}px Nunito, system-ui, sans-serif`;
        g.fillText('+1', cx, cy + 1);
      } else {
        g.font = `${Math.round(s * 0.3)}px system-ui, sans-serif`;
        g.fillText({ energy: '⚡', coin: '🪙', boom: '💥' }[bo.kind], cx, cy + 1);
      }
    }

    // блоки
    for (const b of S.blocks) {
      if (b.dead) continue;
      const col = blockColor(b.hp, S.turn);
      const jx = b.shake > 0 ? rnd(-1, 1) * b.shake * 2.5 : 0;
      const jy = b.shake > 0 ? rnd(-1, 1) * b.shake * 2.5 : 0;
      const pop = 1 + b.shake * 0.06;
      const bw = (1 - GAP * 2) * s * pop;
      const x = (b.c + 0.5) * s - bw / 2 + jx;
      const y = (b.y + 0.5) * s - bw / 2 + jy;
      const rr = s * 0.16;
      // тень-«толщина»
      roundRect(g, x, y + 3, bw, bw, rr);
      g.fillStyle = col.edge; g.fill();
      const grd = g.createLinearGradient(0, y, 0, y + bw);
      grd.addColorStop(0, col.top); grd.addColorStop(1, col.bot);
      roundRect(g, x, y, bw, bw, rr);
      g.fillStyle = grd; g.fill();
      // блик
      roundRect(g, x + bw * 0.1, y + bw * 0.07, bw * 0.8, bw * 0.18, bw * 0.09);
      g.fillStyle = 'rgba(255,255,255,.28)'; g.fill();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (b.letter) {
        // плитка-буква как .tile
        const tw = bw * 0.62, th = bw * 0.66;
        const tx = x + (bw - tw) / 2, ty = y + bw * 0.1;
        roundRect(g, tx, ty + 2, tw, th, tw * 0.22);
        g.fillStyle = '#d9a92e'; g.fill();
        const tg = g.createLinearGradient(0, ty, 0, ty + th);
        tg.addColorStop(0, '#fff7d6'); tg.addColorStop(1, '#ffe08a');
        roundRect(g, tx, ty, tw, th, tw * 0.22);
        g.fillStyle = tg; g.fill();
        g.fillStyle = '#6b4300';
        g.font = `900 ${Math.round(th * 0.72)}px Nunito, system-ui, sans-serif`;
        g.fillText(b.letter, tx + tw / 2, ty + th / 2 + 1);
        // HP внизу
        const digits = String(b.hp).length;
        g.font = `900 ${Math.round(bw * (digits > 3 ? 0.17 : 0.21))}px Nunito, system-ui, sans-serif`;
        g.fillStyle = '#fff';
        g.strokeStyle = 'rgba(43,29,74,.45)'; g.lineWidth = 3;
        g.strokeText(b.hp, x + bw / 2, y + bw * 0.88);
        g.fillText(b.hp, x + bw / 2, y + bw * 0.88);
      } else {
        const digits = String(b.hp).length;
        g.font = `900 ${Math.round(bw * (digits > 3 ? 0.3 : digits > 2 ? 0.36 : 0.44))}px Nunito, system-ui, sans-serif`;
        g.fillStyle = '#fff';
        g.strokeStyle = 'rgba(43,29,74,.35)'; g.lineWidth = 4;
        g.strokeText(b.hp, x + bw / 2, y + bw / 2 + 2);
        g.fillText(b.hp, x + bw / 2, y + bw / 2 + 2);
      }
      if (b.flash > 0) {
        roundRect(g, x, y, bw, bw, rr);
        g.fillStyle = `rgba(255,255,255,${b.flash * 0.6})`; g.fill();
      }
    }

    // частицы
    for (const p of S.particles) {
      g.globalAlpha = clamp(p.life / p.max, 0, 1);
      g.fillStyle = p.color;
      const ps = p.size * s;
      g.fillRect(p.x * s - ps / 2, p.y * s - ps / 2, ps, ps);
    }
    g.globalAlpha = 1;

    // прицел
    if (S.phase === 'aim' && S.aiming && S.aimDir) {
      const end = raycast(S.aimDir);
      const sx0 = S.cannonX, sy0 = FLOOR;
      const len = Math.hypot(end.x - sx0, end.y - sy0);
      const stepD = 0.32;
      const off = (S.time * 1.2) % stepD;
      g.fillStyle = '#fff';
      for (let d = 0.4 + off; d < len; d += stepD) {
        const k = d / len;
        g.globalAlpha = 0.9 - 0.5 * k;
        g.beginPath();
        g.arc((sx0 + (end.x - sx0) * k) * s, (sy0 + (end.y - sy0) * k) * s, s * 0.045, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 0.5;
      g.beginPath(); g.arc(end.x * s, end.y * s, R * s, 0, Math.PI * 2);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      g.globalAlpha = 1;
    }

    // шарики
    for (const ball of S.balls) {
      if (ball.state === 'done') continue;
      const t = ball.trail;
      for (let i = 0; i < t.length; i += 2) {
        const k = (i + 2) / (t.length + 2);
        g.globalAlpha = k * 0.45;
        g.fillStyle = '#ffb3d0';
        g.beginPath(); g.arc(t[i] * s, t[i + 1] * s, R * s * k, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      drawBall(ball.x * s, ball.y * s, R * s);
    }

    // пушка
    const cx = S.cannonX * s, cy = FLOOR * s;
    if (S.phase !== 'fly' || S.toLaunch > 0) {
      drawBall(cx, cy, R * s * 1.15);
    }
    if (S.phase === 'fly' && S.nextCannonX != null) {
      drawBall(S.nextCannonX * s, cy, R * s * 1.15);
    }
    const shownN = S.phase === 'fly' ? S.toLaunch : S.ballsCount;
    if (shownN > 0) {
      g.font = `900 ${Math.round(s * 0.3)}px Nunito, system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillStyle = '#fff';
      g.fillText('×' + shownN, clamp(cx, s * 0.4, fw - s * 0.4), cy - R * s * 1.6);
    }

    g.restore(); // clip
    g.restore();
  }

  function drawBall(x, y, r) {
    const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#ff7fb0');
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = grd; g.fill();
  }

  // --- Конец / выход ---
  function reward() {
    const r = {};
    if (collected.length) r.letters = collected.join('');
    if (energy) r.energy = energy;
    if (coins) r.coins = coins;
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
        ? h('div.letters-row', [...collected].sort().map((ch) => h('span.tile', ch)))
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
    vibe(60);
    const isRecord = S.turn > best0;
    const box = h('div.sh-over-box',
      h('div.sh-over-emoji', '🧱'),
      h('div.sh-over-title', 'Блоки дошли до низа'),
      h('div.sh-over-stats',
        h('div.sh-pill', 'Ход ' + S.turn),
        h('div.sh-pill', '🏆 ' + Math.max(best0, S.turn)),
        energy ? h('div.sh-pill', '⚡ +' + energy) : null,
        coins ? h('div.sh-pill', '🪙 +' + coins) : null,
      ),
      isRecord && best0 > 0 ? h('div.sh-record', 'Новый рекорд!') : null,
      collected.length
        ? h('div.letters-row', [...collected].sort().map((ch) => h('span.tile', ch)))
        : h('p.muted', 'В этот раз без букв'),
      h('button.btn.btn-big', { onclick: () => finish('Собрано!') }, 'Забрать'),
    );
    wrap.append(h('div.sh-over', box));
    saveBest();
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
