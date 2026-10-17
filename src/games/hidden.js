// Мини-игра «Поиск предметов»: найди слова-цели на захламлённой сцене.
// Места открываются словами в Эрудите (см. data/places.js).
// Облегчено для слабых телефонов: без filter/теней на предметах, без бесконечных анимаций на сцене,
// хит-тест по координатам (pointerdown на всей сцене), раскладка повторяется до успеха и при resize.

import { ITEMS, itemsByCat } from '../data/items.js';
import { PLACES, openPlaces, unlockPlace } from '../data/places.js';
import { h, toast, confetti, shuffle, pick, confirmDialog } from '../ui/common.js';
import { sfx, buzz } from '../ui/device.js';

export const meta = {
  id: 'hidden',
  title: 'Поиск',
  emoji: '🔍',
  desc: 'Найди предметы на захламлённой сцене',
  cost: { energy: 6 },
  gives: 'предметы',
};

const TIME = 90;          // секунд на сцену
const PENALTY = 5;        // штраф за промах
const TARGETS = 7;
const SCENE_MIN = 45, SCENE_MAX = 60;
const HINT_COST = 3;      // энергии, если нет лупы
const HIT_PAD = 22;       // запас вокруг цели для тапа, px
const STREAK_WINDOW = 3000; // мс между находками, чтобы серия продолжалась
const STREAK_BONUS = 3;     // секунд за находку в серии ×3+
const LOW_TIME = 10;        // последние секунды: тиканье
const MAX_PARTICLES = 10;

// старые локации → новые места (перенос прогресса)
const OLD_TO_PLACE = { kitchen: 'КУХНЯ', garden: 'САД', wardrobe: 'ШКАФ', attic: 'ЧЕРДАК', office: 'ОФИС', livingroom: 'ГОСТИНАЯ' };

const BLOB_COLORS = ['#ffffff', '#ffd60a', '#ff5fa2', '#4fb8ff', '#c8ff2e', '#8c7bff', '#ff7a1a'];

const rnd = (a, b) => a + Math.random() * (b - a);
const normEmoji = (e) => e.replace(/️/g, '');
const cap = (w) => w.charAt(0) + w.slice(1).toLowerCase();
const sceneBg = (color) => `linear-gradient(160deg, #fff7d6 0%, ${color} 130%)`;

const CSS = `
.ho-root { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; background:var(--paper); color:var(--ink); }
.ho-top .game-title { font-family:var(--display); font-weight:800; font-size:17px; letter-spacing:-.5px; text-transform:uppercase;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ho-pill { font-family:var(--display); font-weight:800; font-size:14px; background:#fff; border:2.5px solid var(--ink); border-radius:999px;
  padding:5px 11px; box-shadow:0 3px 0 var(--ink); white-space:nowrap; font-variant-numeric:tabular-nums; }
.ho-pill.bump { animation:ho-bump .4s ease-out; }

/* ---------- выбор места ---------- */
.ho-select { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:2px 14px calc(20px + var(--safe-bottom)); }
.ho-sel-title { font-family:var(--display); font-size:24px; font-weight:900; letter-spacing:-1px; text-transform:uppercase; margin:4px 2px 2px; }
.ho-sel-sub { display:flex; gap:6px; flex-wrap:wrap; margin:6px 0 12px; }
.ho-tag { font-weight:900; font-size:12px; background:#fff; border:2px solid var(--ink); border-radius:999px; padding:3px 10px; }
.ho-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.ho-loc { position:relative; border:2.5px solid var(--ink); border-radius:20px; min-height:88px; padding:10px 10px 9px; color:var(--ink); text-align:left;
  display:flex; flex-direction:column; justify-content:flex-end; gap:4px; box-shadow:0 4px 0 var(--ink); overflow:hidden; cursor:pointer;
  font:inherit; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
.ho-loc:active { transform:translateY(3px); box-shadow:0 1px 0 var(--ink); }
.ho-loc-ic { position:absolute; right:4px; top:2px; font-size:40px; line-height:1; transform:rotate(10deg); pointer-events:none; }
.ho-loc-name { position:relative; font-family:var(--display); font-size:15px; font-weight:900; letter-spacing:-.4px; text-transform:uppercase;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:4px; }
.ho-loc-go { position:relative; align-self:flex-start; font-family:var(--display); font-weight:800; font-size:10px; text-transform:uppercase;
  background:var(--ink); color:var(--lime); border-radius:999px; padding:3px 9px; letter-spacing:.5px; }
.ho-loc.locked { background:#d9d8d0 !important; color:#6b6b66; border-color:#8a8a84; box-shadow:0 4px 0 #8a8a84; }
.ho-loc.locked .ho-loc-ic { opacity:.35; filter:grayscale(1); }
.ho-loc-lock { position:relative; font-size:11px; font-weight:800; line-height:1.2; }
.ho-loc-lock b { color:var(--ink); }
.ho-loc.shake { animation:ho-shake .35s; }
@keyframes ho-shake { 20%,60% { transform:translateX(-5px); } 40%,80% { transform:translateX(5px); } }
@keyframes ho-bump { 40% { transform:scale(1.12); } }

/* ---------- таймер-полоска ---------- */
.ho-time { position:relative; flex:none; height:28px; margin:0 12px 10px; border:2.5px solid var(--ink); border-radius:999px; background:#fff;
  box-shadow:0 3px 0 var(--ink); overflow:hidden; }
.ho-time-fill { position:absolute; left:0; top:0; bottom:0; width:100%; border-right:2.5px solid var(--ink); transform-origin:left;
  background:repeating-linear-gradient(-45deg, var(--lime) 0 10px, #b5f000 10px 20px); }
.ho-time-num { position:absolute; inset:0; display:flex; align-items:center; padding-left:12px; font-family:var(--display); font-weight:800;
  font-size:15px; font-variant-numeric:tabular-nums; }
.ho-time.low .ho-time-fill { background:repeating-linear-gradient(-45deg, var(--pink) 0 10px, #ff3d8c 10px 20px); }
.ho-time.low .ho-time-num { color:#fff; text-shadow:0 2px 0 var(--ink); }
.ho-time.plus { animation:ho-bump .4s ease-out; }
.ho-time.minus { animation:ho-shake .3s; }

/* ---------- сцена ---------- */
.ho-scene { position:relative; flex:1; min-height:160px; margin:0 12px; border:3px solid var(--ink); border-radius:24px; overflow:hidden;
  box-shadow:0 5px 0 var(--ink); touch-action:none; -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color:transparent;
  -webkit-touch-callout:none; contain:layout paint; }
.ho-blob { position:absolute; border-radius:50%; pointer-events:none; }
.ho-it { position:absolute; left:0; top:0; line-height:1; pointer-events:none; white-space:nowrap; }
.ho-it.found { transition:transform .35s ease-in, opacity .35s ease-in; opacity:0; }
.ho-it.reveal { background:rgba(255,255,255,.9); border-radius:50%; box-shadow:0 0 0 3px var(--pink); }
.ho-burst { position:absolute; pointer-events:none; z-index:502; width:20px; height:20px; margin:-10px 0 0 -10px; border-radius:50%;
  border:4px solid var(--ink); background:var(--lime); animation:ho-burst .45s ease-out forwards; }
@keyframes ho-burst { from { transform:scale(.3); opacity:1; } to { transform:scale(4); opacity:0; } }
.ho-fly { position:fixed; left:0; top:0; z-index:120; pointer-events:none; line-height:1;
  transition:transform .5s cubic-bezier(.4,0,.4,1), opacity .15s .4s; }
.ho-miss { position:absolute; width:50px; height:50px; margin:-25px 0 0 -25px; border-radius:50%; pointer-events:none; z-index:500;
  border:3px solid var(--ink); background:rgba(255,95,162,.55); animation:ho-miss .45s ease-out forwards; }
@keyframes ho-miss { from { transform:scale(.3); } to { transform:scale(1.4); opacity:0; } }
.ho-minus { position:absolute; pointer-events:none; z-index:501; font-family:var(--display); font-weight:800; font-size:15px; color:#fff;
  background:var(--pink); border:2.5px solid var(--ink); border-radius:999px; padding:2px 9px; white-space:nowrap;
  transform:translate(-50%,-50%); animation:ho-up .8s ease-out forwards; }
@keyframes ho-up { 0% { transform:translate(-50%,-50%) scale(.6); } 100% { transform:translate(-50%,-180%); opacity:0; } }
.ho-spark { position:absolute; width:10px; height:10px; border-radius:3px; border:2px solid var(--ink); pointer-events:none; z-index:502;
  animation:ho-spark .55s ease-out forwards; }
@keyframes ho-spark { to { transform:translate(var(--dx), var(--dy)) rotate(200deg) scale(.3); opacity:0; } }
.ho-ring { position:absolute; left:0; top:0; pointer-events:none; z-index:503; }
.ho-ring i { display:block; width:100%; height:100%; border-radius:50%; border:4px solid var(--ink); box-shadow:0 0 0 5px var(--lime);
  animation:ho-ring .7s ease-in-out infinite alternate; }
@keyframes ho-ring { from { transform:scale(.85); } to { transform:scale(1.12); } }

/* серия */
.ho-streak { position:absolute; z-index:520; left:50%; top:12px; transform:translateX(-50%); pointer-events:none; display:none;
  font-family:var(--display); font-weight:900; font-size:22px; letter-spacing:-.5px; white-space:nowrap; color:var(--ink);
  background:var(--yellow); border:3px solid var(--ink); border-radius:999px; padding:4px 16px; box-shadow:0 4px 0 var(--ink); }
.ho-streak.on { display:block; }
.ho-streak.hot { background:var(--lime); }
.ho-streak.mega { background:var(--pink); color:#fff; text-shadow:0 2px 0 var(--ink); }
.ho-streak.pop { animation:ho-spop .4s ease-out; }
@keyframes ho-spop { 0% { transform:translateX(-50%) scale(.4); } 60% { transform:translateX(-50%) scale(1.15); } }
.ho-bonus { position:absolute; z-index:521; left:50%; top:58px; pointer-events:none; white-space:nowrap; font-family:var(--display); font-weight:800;
  font-size:14px; color:var(--lime); background:var(--ink); border-radius:999px; padding:4px 12px;
  transform:translateX(-50%); animation:ho-bonus 1.2s ease-out forwards; }
@keyframes ho-bonus { 0% { opacity:0; } 15% { opacity:1; } 75% { opacity:1; } 100% { transform:translateX(-50%) translateY(-20px); opacity:0; } }

/* финальный баннер */
.ho-win { position:absolute; inset:0; z-index:600; display:flex; align-items:center; justify-content:center; pointer-events:none;
  background:rgba(17,17,17,.35); }
.ho-win-b { font-family:var(--display); font-weight:900; font-size:34px; line-height:1; letter-spacing:-1.5px; text-align:center; color:var(--ink);
  background:var(--lime); border:4px solid var(--ink); border-radius:28px; padding:18px 22px 16px; box-shadow:0 8px 0 var(--ink);
  transform:rotate(-4deg); animation:ho-wpop .5s ease-out backwards; }
.ho-win-b small { display:block; font-size:13px; letter-spacing:2px; margin-top:8px; }
@keyframes ho-wpop { from { transform:scale(.3) rotate(-15deg); opacity:0; } }

/* ---------- панель слов ---------- */
.ho-panel { flex:none; display:flex; gap:10px; align-items:center; padding:12px 12px calc(12px + var(--safe-bottom)); }
.ho-words { flex:1; display:flex; flex-wrap:wrap; gap:6px; justify-content:center; }
.ho-word { position:relative; background:#fff; border:2.5px solid var(--ink); border-radius:14px; padding:4px 9px; font-weight:900; font-size:14px;
  box-shadow:0 3px 0 var(--ink); }
.ho-word.done { background:var(--lime); color:rgba(17,17,17,.55); text-decoration:line-through; text-decoration-color:var(--pink);
  text-decoration-thickness:3px; animation:ho-bump .4s ease-out; }
.ho-word .ho-wemo { display:none; margin-right:3px; }
.ho-word.done .ho-wemo { display:inline; }
.ho-hint { position:relative; width:56px; height:56px; border-radius:18px; font-size:26px; padding:0; flex:none; touch-action:manipulation;
  background:var(--yellow); border:3px solid var(--ink); box-shadow:0 4px 0 var(--ink); }
.ho-hint:active { transform:translateY(3px); box-shadow:0 1px 0 var(--ink); }
.ho-hint-n { position:absolute; right:-8px; top:-9px; background:var(--violet); color:#fff; font-family:var(--display); font-size:11px; font-weight:800;
  border:2px solid var(--ink); border-radius:999px; padding:1px 6px; white-space:nowrap; }
`;

export function mount(root, ctx) {
  const store = ctx.store;
  const state = store.state;

  // Перенос старого прогресса (локации за ключи → места) — один раз.
  if (!state.progress.hiddenPlacesMigrated) {
    const old = Array.isArray(state.progress.hiddenUnlocked) ? state.progress.hiddenUnlocked : [];
    for (const id of old) if (OLD_TO_PLACE[id]) unlockPlace(state, OLD_TO_PLACE[id]);
    openPlaces(state); // гарантирует state.progress.places
    state.progress.hiddenPlacesMigrated = true;
    store.commit();
  }

  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const clearLater = (t) => { if (t) { clearTimeout(t); timers.delete(t); } };
  const rafs = new Set();
  const raf = (fn) => { const id = requestAnimationFrame(() => { rafs.delete(id); fn(); }); rafs.add(id); return id; };
  let tick = null;
  let alive = true;
  let cleanupScene = null;

  root.classList.add('ho-root');
  root.innerHTML = '';
  const style = h('style', CSS);

  function setScreen(...nodes) {
    if (cleanupScene) { cleanupScene(); cleanupScene = null; }
    root.innerHTML = '';
    root.append(style, ...nodes);
  }
  const retrigger = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  // ---------- Экран выбора места ----------
  function showSelect() {
    const open = new Set(openPlaces(state).map((p) => p.word));
    const top = h('div.game-top.ho-top',
      h('button.btn-icon', { onclick: () => { store.addEnergy(meta.cost.energy); ctx.exit(); } }, '✕'),
      h('div.game-title', '🔍 Поиск'),
      h('div.ho-pill', '🏠 ' + open.size + '/' + PLACES.length),
    );
    const cards = PLACES.map((place) => {
      const isOpen = open.has(place.word);
      const lockText = 'Собери слово ' + place.word + ' в Эрудите';
      const card = h('button.ho-loc' + (isOpen ? '' : '.locked'),
        { style: isOpen ? { background: place.color } : null },
        h('div.ho-loc-ic', place.icon),
        h('div.ho-loc-name', (isOpen ? '' : '🔒 ') + cap(place.word)),
        isOpen ? h('div.ho-loc-go', 'Играть ▶')
          : h('div.ho-loc-lock', 'собери слово ', h('b', place.word), ' в Эрудите'),
      );
      card.addEventListener('click', () => {
        if (isOpen) { sfx('tap'); buzz(8); startGame(place); return; }
        retrigger(card, 'shake');
        sfx('error'); buzz(15);
        toast('🔒 ' + lockText, 2600);
      });
      return card;
    });
    setScreen(top, h('div.ho-select',
      h('div.ho-sel-title', 'Куда пойдём?'),
      h('div.ho-sel-sub', h('span.ho-tag', '⏱ ' + TIME + ' сек'), h('span.ho-tag', '🎯 ' + TARGETS + ' слов'), h('span.ho-tag', '🔥 серии = +время')),
      h('div.ho-grid', cards),
    ));
  }

  // ---------- Генерация сцены ----------
  function buildPool(place) {
    const seen = new Set();
    const uniq = (list) => list.filter((it) => {
      const k = normEmoji(it.emoji);
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    const own = uniq(shuffle(place.cats.flatMap((c) => itemsByCat(c))));
    const others = uniq(shuffle(ITEMS.filter((it) => it.emoji && !place.cats.includes(it.cat))));
    const total = Math.round(rnd(SCENE_MIN, SCENE_MAX));
    const ownCount = Math.min(own.length, Math.round(total * 0.75));
    const ownPart = own.slice(0, ownCount);
    const noise = others.slice(0, total - ownPart.length);
    const targets = shuffle(ownPart).slice(0, TARGETS);
    return { scene: shuffle([...ownPart, ...noise]), targets };
  }

  // ---------- Игра ----------
  function startGame(place) {
    const { scene: sceneItems, targets } = buildPool(place);
    const targetIds = new Set(targets.map((t) => t.id));
    const found = new Set();
    let timeLeft = TIME;
    let paused = false;
    let over = false;
    let ring = null;
    let streak = 0;
    let lastFoundAt = 0;
    let streakHide = null;
    let lastSec = TIME;
    let particles = 0;

    const countPill = h('div.ho-pill', '0/' + targets.length);
    const exitBtn = h('button.btn-icon', '✕');
    const top = h('div.game-top.ho-top', exitBtn, h('div.game-title', place.icon + ' ' + cap(place.word)), countPill);
    const timeFill = h('div.ho-time-fill');
    const timeNum = h('div.ho-time-num', '⏱ ' + TIME);
    const timeBar = h('div.ho-time', timeFill, timeNum);
    const streakEl = h('div.ho-streak');
    const scene = h('div.ho-scene', { style: { background: sceneBg(place.color) } }, streakEl);
    const wordEls = {};
    const words = h('div.ho-words', targets.map((t) => {
      const el = h('div.ho-word', h('span.ho-wemo', t.emoji), cap(t.word));
      wordEls[t.id] = el;
      return el;
    }));
    const hintN = h('span.ho-hint-n');
    const hintBtn = h('button.ho-hint', '🔍', hintN);
    const panel = h('div.ho-panel', words, hintBtn);
    setScreen(top, timeBar, scene, panel);

    const updateHint = () => {
      const n = store.itemCount('ЛУПА');
      hintN.textContent = n > 0 ? '×' + n : HINT_COST + '⚡';
    };
    updateHint();

    // ---- Раскладка ----
    // Позиции задаются в долях сцены (nx, ny), чтобы при resize просто пересчитать пиксели.
    const spots = {};  // id -> { nx, ny, size, rot, el, x, y }
    let blobs = [];
    let W = 0, H = 0;
    let built = false;

    function plan(w, hgt) {
      const N = sceneItems.length;
      const cols = Math.max(4, Math.round(Math.sqrt(N * w / hgt)));
      const rows = Math.ceil(N / cols);
      const cw = w / cols, ch = hgt / rows;
      const kSize = Math.max(.7, Math.min(1, Math.min(cw, ch) / 52));
      const cells = shuffle([...Array(cols * rows).keys()]).slice(0, N);
      sceneItems.forEach((it, i) => {
        const cell = cells[i];
        const cx = (cell % cols + 0.5) * cw, cy = (Math.floor(cell / cols) + 0.5) * ch;
        const isTarget = targetIds.has(it.id);
        const size = Math.round((isTarget ? rnd(32, 50) : rnd(26, 56)) * kSize);
        spots[it.id] = {
          nx: (cx + rnd(-.4, .4) * cw) / w, ny: (cy + rnd(-.4, .4) * ch) / hgt,
          size, rot: Math.round(rnd(-35, 35)), z: isTarget ? Math.round(rnd(25, 70)) : Math.round(rnd(1, 70)), el: null, x: 0, y: 0,
        };
      });
      blobs = Array.from({ length: 6 }, () => ({
        nx: Math.random(), ny: Math.random(), s: rnd(60, 170), k: rnd(.6, 1.3), c: pick(BLOB_COLORS), o: rnd(.15, .3).toFixed(2),
      }));
    }

    function build() {
      const frag = document.createDocumentFragment();
      for (const b of blobs) {
        b.el = h('div.ho-blob', { style: { width: b.s + 'px', height: b.s * b.k + 'px', background: b.c, opacity: b.o } });
        frag.append(b.el);
      }
      for (const it of sceneItems) {
        const sp = spots[it.id];
        sp.el = h('div.ho-it', { style: { fontSize: sp.size + 'px', zIndex: sp.z } }, it.emoji);
        frag.append(sp.el);
      }
      scene.append(frag);
      built = true;
    }

    function place_(sp) {
      if (!sp.el) return;
      const half = sp.size / 2 + 3;
      sp.x = Math.min(W - half, Math.max(half, sp.nx * W));
      sp.y = Math.min(H - half, Math.max(half, sp.ny * H));
      const scale = sp.el.classList.contains('found') ? ' scale(1.6)' : '';
      sp.el.style.transform = `translate(${sp.x}px,${sp.y}px) translate(-50%,-50%) rotate(${sp.rot}deg)${scale}`;
    }

    function positionAll() {
      for (const b of blobs) {
        if (b.el) b.el.style.transform = `translate(${b.nx * W - b.s / 2}px,${b.ny * H - b.s * b.k / 2}px)`;
      }
      for (const id in spots) place_(spots[id]);
      if (ring) placeRing();
    }

    function layout() {
      const w = scene.clientWidth, hgt = scene.clientHeight;
      if (!w || !hgt) return false;
      if (w === W && hgt === H && built) return true;
      W = w; H = hgt;
      if (!built) { plan(W, H); build(); }
      positionAll();
      return true;
    }

    // Повторяем на каждом кадре, пока у сцены нет размера (без лимита, пока игра на экране).
    const tryLayout = () => {
      if (!alive || !scene.isConnected) return;
      if (!layout()) raf(tryLayout);
    };
    raf(tryLayout);
    let resizeQueued = false;
    const onResize = () => {
      if (resizeQueued) return;
      resizeQueued = true;
      raf(() => { resizeQueued = false; tryLayout(); });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(onResize); ro.observe(scene); }

    // ---- Таймер ----
    function renderTime() {
      const s = Math.max(0, Math.ceil(timeLeft));
      timeNum.textContent = '⏱ ' + s;
      timeFill.style.transform = `scaleX(${Math.max(0, Math.min(1, timeLeft / TIME))})`;
      timeBar.classList.toggle('low', timeLeft <= LOW_TIME && timeLeft > 0);
      if (s !== lastSec) {
        if (s < lastSec && s <= LOW_TIME && s > 0 && !over) { sfx('tap'); if (s <= 3) buzz(6); }
        lastSec = s;
      }
    }
    renderTime();
    let last = performance.now();
    tick = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, (now - last) / 1000); // после сворачивания не «съедаем» время
      last = now;
      if (paused || over || !built) return;
      timeLeft -= dt;
      renderTime();
      if (timeLeft <= 0) lose();
    }, 200);

    // ---- Эффекты (короткие, с лимитом частиц) ----
    function addFx(el, ms) {
      if (particles >= MAX_PARTICLES) return false;
      particles++;
      scene.append(el);
      later(() => { el.remove(); particles--; }, ms);
      return true;
    }
    function sparks(x, y, n = 6) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = rnd(35, 80);
        const s = h('div.ho-spark', { style: { left: x - 5 + 'px', top: y - 5 + 'px', background: pick(BLOB_COLORS.slice(1)) } });
        s.style.setProperty('--dx', Math.cos(a) * d + 'px');
        s.style.setProperty('--dy', Math.sin(a) * d + 'px');
        if (!addFx(s, 600)) break;
      }
    }
    function burst(x, y) { addFx(h('div.ho-burst', { style: { left: x + 'px', top: y + 'px' } }), 500); }
    function missFx(x, y) {
      addFx(h('div.ho-miss', { style: { left: x + 'px', top: y + 'px' } }), 500);
      addFx(h('div.ho-minus', { style: { left: x + 'px', top: y - 10 + 'px' } }, '−' + PENALTY + ' сек'), 850);
      retrigger(timeBar, 'minus');
    }
    function flyToPanel(it, onArrive) {
      const sp = spots[it.id];
      const sr = scene.getBoundingClientRect();
      const to = wordEls[it.id].getBoundingClientRect();
      const fx = sr.left + sp.x, fy = sr.top + sp.y;
      const fly = h('div.ho-fly', { style: { fontSize: sp.size + 'px', transform: `translate(${fx}px,${fy}px) translate(-50%,-50%)` } }, it.emoji);
      document.body.append(fly);
      raf(() => raf(() => {
        const k = 18 / sp.size;
        fly.style.transform = `translate(${to.left + 16}px,${to.top + to.height / 2}px) translate(-50%,-50%) scale(${k})`;
        fly.style.opacity = '0';
      }));
      later(() => { fly.remove(); onArrive(); }, 520);
    }

    // ---- Серия ----
    function bumpStreak(now) {
      streak = now - lastFoundAt <= STREAK_WINDOW ? streak + 1 : 1;
      lastFoundAt = now;
      clearLater(streakHide); streakHide = null;
      if (streak < 2) { hideStreak(); return; }
      streakEl.className = 'ho-streak on' + (streak >= 5 ? ' mega' : streak >= 3 ? ' hot' : '');
      streakEl.textContent = streak >= 3 ? '×' + streak + ' СЕРИЯ!' : '×' + streak;
      retrigger(streakEl, 'pop');
      if (streak >= 3) {
        timeLeft = Math.min(TIME, timeLeft + STREAK_BONUS);
        renderTime();
        retrigger(timeBar, 'plus');
        const b = h('div.ho-bonus', '🔥 +' + STREAK_BONUS + ' сек');
        scene.append(b);
        later(() => b.remove(), 1250);
        sfx('win'); buzz([10, 30, 10, 30, 10]);
      } else {
        buzz([10, 30, 10]);
      }
      streakHide = later(() => { streakHide = null; hideStreak(); }, STREAK_WINDOW);
    }
    function hideStreak() { streakEl.className = 'ho-streak'; }
    function resetStreak() {
      streak = 0; lastFoundAt = 0;
      clearLater(streakHide); streakHide = null;
      hideStreak();
    }

    function onFound(it) {
      found.add(it.id);
      const sp = spots[it.id];
      burst(sp.x, sp.y);
      sparks(sp.x, sp.y);
      sfx('coin'); buzz(15);
      flyToPanel(it, () => {
        wordEls[it.id].classList.add('done');
        countPill.textContent = found.size + '/' + targets.length;
        retrigger(countPill, 'bump');
      });
      sp.el.classList.add('found');
      sp.el.style.zIndex = 400;
      place_(sp);
      if (ring && ring.dataset.id === it.id) { ring.remove(); ring = null; }
      if (found.size === targets.length) { hideStreak(); win(); return; }
      bumpStreak(performance.now());
    }

    // Хит-тест по координатам: ближайшая ненайденная цель в радиусе (размер/2 + запас).
    function onTap(e) {
      if (e.cancelable) e.preventDefault();
      if (over || paused || !built) return;
      if (e.isPrimary === false) return;
      const sr = scene.getBoundingClientRect();
      const px = e.clientX - sr.left, py = e.clientY - sr.top;
      let best = null, bestD = Infinity;
      for (const t of targets) {
        if (found.has(t.id)) continue;
        const sp = spots[t.id];
        if (!sp || !sp.el) continue;
        const d = Math.hypot(px - sp.x, py - sp.y);
        if (d <= sp.size / 2 + HIT_PAD && d < bestD) { bestD = d; best = t; }
      }
      if (best) { onFound(best); return; }
      timeLeft = Math.max(0, timeLeft - PENALTY);
      renderTime();
      missFx(px, py);
      resetStreak();
      sfx('error'); buzz([20, 40, 20]);
      if (timeLeft <= 0) lose();
    }
    scene.addEventListener('pointerdown', onTap);
    const noCtx = (e) => e.preventDefault();
    scene.addEventListener('contextmenu', noCtx);

    // ---- Подсказка ----
    function placeRing() {
      const sp = spots[ring.dataset.id];
      if (!sp) return;
      const d = sp.size + 24;
      ring.style.width = d + 'px'; ring.style.height = d + 'px';
      ring.style.transform = `translate(${sp.x - d / 2}px,${sp.y - d / 2}px)`;
    }
    hintBtn.addEventListener('click', () => {
      if (over || !built) return;
      const left = targets.filter((t) => !found.has(t.id) && spots[t.id] && spots[t.id].el);
      if (!left.length) return;
      if (ring && !found.has(ring.dataset.id)) { toast('Подсказка уже горит!'); return; }
      if (store.itemCount('ЛУПА') > 0) {
        store.removeItem('ЛУПА');
      } else if (!store.spendEnergy(HINT_COST)) {
        sfx('error');
        toast('Нужна лупа 🔍 — собери слово ЛУПА в Эрудите', 3200);
        return;
      }
      updateHint();
      sfx('tap'); buzz(10);
      const t = pick(left);
      ring = h('div.ho-ring', h('i'));
      ring.dataset.id = t.id;
      spots[t.id].el.style.zIndex = 300;
      placeRing();
      scene.append(ring);
    });

    // ---- Выход ----
    exitBtn.addEventListener('click', async () => {
      if (over) return;
      paused = true;
      const ok = await confirmDialog('Выйти? Найденное сохранится', 'Выйти');
      if (!alive || over) return;
      paused = false;
      last = performance.now();
      if (ok) end(false, 'Найдено ' + found.size + ' из ' + targets.length);
    });

    function foundReward() {
      const items = {};
      for (const id of found) items[id] = (items[id] || 0) + 1;
      return items;
    }

    function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

    function end(victory, title) {
      if (over) return;
      over = true;
      stopTick();
      const reward = { items: foundReward() };
      if (victory) {
        reward.energy = 2 + Math.round(Math.max(0, timeLeft) / 30);
        if (Math.random() < 0.25) reward.items['ЛУПА'] = (reward.items['ЛУПА'] || 0) + 1;
      }
      if (!Object.keys(reward.items).length) delete reward.items;
      ctx.finish(reward, title);
    }

    function win() {
      over = true; // блокируем тапы, пока играет праздник
      stopTick();
      timeBar.classList.remove('low');
      later(() => {
        if (!alive) return;
        const left = Math.max(0, Math.ceil(timeLeft));
        scene.append(h('div.ho-win', h('div.ho-win-b', 'ВСЁ', h('br'), 'НАЙДЕНО!', h('small', '⏱ ' + left + ' сек в запасе'))));
        sfx('reward'); buzz([20, 50, 20, 50, 60]);
        const s = scene.getBoundingClientRect();
        confetti(s.left + s.width / 2, s.top + s.height / 2, 30);
      }, 400);
      later(() => { over = false; end(true, 'Всё найдено!'); }, 1900);
    }

    function lose() {
      over = true;
      stopTick();
      timeLeft = 0; renderTime();
      timeBar.classList.remove('low');
      sfx('error'); buzz([40, 60, 40]);
      // показываем, где прятались ненайденные
      for (const t of targets) {
        const sp = spots[t.id];
        if (!found.has(t.id) && sp && sp.el) { sp.el.style.zIndex = 300; sp.el.classList.add('reveal'); }
      }
      later(() => { over = false; end(false, 'Время вышло'); }, 1200);
    }

    cleanupScene = () => {
      scene.removeEventListener('pointerdown', onTap);
      scene.removeEventListener('contextmenu', noCtx);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (ro) { ro.disconnect(); ro = null; }
    };
  }

  showSelect();

  return () => {
    alive = false;
    if (tick) { clearInterval(tick); tick = null; }
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const id of rafs) cancelAnimationFrame(id);
    rafs.clear();
    if (cleanupScene) { cleanupScene(); cleanupScene = null; }
    document.querySelectorAll('.ho-fly').forEach((n) => n.remove());
  };
}
