// Мини-игра «Поиск предметов»: найди слова-цели на захламлённой сцене.

import { ITEMS, itemsByCat } from '../data/items.js';
import { h, toast, confetti, shuffle, pick, confirmDialog } from '../ui/common.js';
import { floatText } from '../ui/fx.js';
import { sfx, buzz } from '../ui/device.js';

export const meta = {
  id: 'hidden',
  title: 'Поиск',
  emoji: '🔍',
  desc: 'Найди предметы на захламлённой сцене',
  cost: { energy: 6 },
  gives: 'предметы',
};

// tile — цвет плитки на экране выбора; bg — фон сцены
export const LOCATIONS = [
  { id: 'kitchen',    name: 'Кухня',    icon: '🍳', keys: 0, cats: ['dishes', 'food', 'drinks'], tile: 'var(--orange)',
    bg: 'linear-gradient(150deg, #ffe36b 0%, #ffab5e 55%, #ff7aa8 100%)' },
  { id: 'garden',     name: 'Сад',      icon: '🌻', keys: 1, cats: ['plants', 'nature'], tile: 'var(--lime)',
    bg: 'linear-gradient(160deg, #e2ff8a 0%, #7fe3a8 50%, #66c7ff 100%)' },
  { id: 'wardrobe',   name: 'Гардероб', icon: '👗', keys: 2, cats: ['clothes', 'accessory'], tile: 'var(--pink)',
    bg: 'linear-gradient(150deg, #ffd0e8 0%, #ff8cc4 45%, #b49bff 100%)' },
  { id: 'attic',      name: 'Чердак',   icon: '🕯️', keys: 3, cats: ['decor', 'music', 'transport', 'fantasy'], tile: 'var(--yellow)',
    bg: 'linear-gradient(160deg, #ffe0a0 0%, #e0a070 45%, #9b7bff 100%)' },
  { id: 'office',     name: 'Кабинет',  icon: '🖋️', keys: 3, cats: ['stationery', 'tech', 'tools'], tile: 'var(--blue)',
    bg: 'linear-gradient(150deg, #c4efff 0%, #85b4ff 50%, #9c8bff 100%)' },
  { id: 'livingroom', name: 'Гостиная', icon: '🛋️', keys: 4, cats: ['furniture', 'light', 'walldecor', 'pets'], tile: 'var(--violet)',
    bg: 'linear-gradient(160deg, #fff4a8 0%, #ffbf7a 40%, #ff7aa8 75%, #a98bff 100%)' },
];

const TIME = 90;          // секунд на сцену
const PENALTY = 5;        // штраф за промах
const TARGETS = 7;
const SCENE_MIN = 45, SCENE_MAX = 60;
const HINT_COST = 3; // энергии, если нет лупы
const HIT_PAD = 8;        // запас хитбокса, px
const STREAK_WINDOW = 3000; // мс между находками, чтобы серия продолжалась
const STREAK_BONUS = 3;     // секунд за находку в серии ×3+
const LOW_TIME = 10;        // последние секунды: пульс и тиканье

const BLOB_COLORS = ['#ffffff', '#ffd60a', '#ff5fa2', '#4fb8ff', '#c8ff2e', '#8c7bff', '#ff7a1a'];

const rnd = (a, b) => a + Math.random() * (b - a);
const normEmoji = (e) => e.replace(/️/g, '');
const cap = (w) => w.charAt(0) + w.slice(1).toLowerCase();

const CSS = `
.ho-root { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; background:var(--paper);
  background-image:radial-gradient(rgba(17,17,17,.07) 1.2px, transparent 1.3px); background-size:18px 18px; color:var(--ink); }
.ho-top .game-title { font-family:var(--display); font-weight:800; font-size:17px; letter-spacing:-.5px; text-transform:uppercase;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ho-pill { font-family:var(--display); font-weight:800; font-size:14px; background:#fff; border:2.5px solid var(--ink); border-radius:999px;
  padding:5px 11px; box-shadow:0 3px 0 var(--ink); white-space:nowrap; font-variant-numeric:tabular-nums; }
.ho-pill.bump { animation:ho-bump .45s cubic-bezier(.3,1.8,.5,1); }

/* ---------- выбор локации ---------- */
.ho-select { flex:1; overflow-y:auto; padding:4px 16px calc(20px + var(--safe-bottom)); }
.ho-sel-title { font-family:var(--display); font-size:28px; font-weight:900; letter-spacing:-1px; text-transform:uppercase; margin:6px 2px 2px; }
.ho-sel-sub { display:flex; gap:6px; flex-wrap:wrap; margin:6px 0 16px; }
.ho-tag { font-weight:900; font-size:12px; background:#fff; border:2px solid var(--ink); border-radius:999px; padding:3px 10px; }
.ho-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.ho-loc { position:relative; border:3px solid var(--ink); border-radius:28px; min-height:150px; padding:14px; color:var(--ink); text-align:left;
  display:flex; flex-direction:column; justify-content:flex-end; gap:6px; box-shadow:0 6px 0 var(--ink); overflow:hidden; cursor:pointer;
  font:inherit; animation:ho-in .45s cubic-bezier(.2,1.5,.4,1) backwards; }
.ho-loc::before { content:''; position:absolute; inset:0; background:radial-gradient(circle at 30% 20%, rgba(255,255,255,.5), transparent 55%); pointer-events:none; }
.ho-loc:active { transform:translateY(4px) scale(.98); box-shadow:0 2px 0 var(--ink); }
.ho-loc-ic { position:absolute; right:-4px; top:-4px; font-size:70px; line-height:1; transform:rotate(12deg); filter:drop-shadow(0 4px 0 rgba(17,17,17,.25)); }
.ho-loc:not(.locked) .ho-loc-ic { animation:ho-bob 2.6s ease-in-out infinite; }
.ho-loc:nth-child(2n) .ho-loc-ic { animation-delay:-1.1s; }
.ho-loc-name { position:relative; z-index:2; font-family:var(--display); font-size:17px; font-weight:900; letter-spacing:-.5px; text-transform:uppercase; }
.ho-loc-go { position:relative; z-index:2; align-self:flex-start; font-family:var(--display); font-weight:800; font-size:11px; text-transform:uppercase;
  background:var(--ink); color:var(--lime); border-radius:999px; padding:4px 10px; letter-spacing:.5px; }
.ho-loc.locked::after { content:''; position:absolute; inset:0; pointer-events:none; z-index:1;
  background:repeating-linear-gradient(-45deg, rgba(243,242,234,.62) 0 12px, rgba(243,242,234,.42) 12px 24px); }
.ho-loc.locked.can::after { background:repeating-linear-gradient(-45deg, rgba(255,255,255,.18) 0 12px, transparent 12px 24px); }
.ho-loc.locked .ho-loc-ic { filter:grayscale(.6) opacity(.75); }
.ho-loc.locked.can .ho-loc-ic { filter:none; }
.ho-loc.locked.can { animation:ho-in .45s cubic-bezier(.2,1.5,.4,1) backwards, ho-wiggle 2.2s 1s ease-in-out infinite; }
.ho-lock { position:relative; z-index:2; align-self:flex-start; display:flex; align-items:center; gap:4px; background:#fff; color:var(--ink);
  font-family:var(--display); font-weight:800; border:2.5px solid var(--ink); border-radius:999px; padding:4px 10px; font-size:14px; box-shadow:0 3px 0 var(--ink); }
.ho-loc.can .ho-lock { background:var(--lime); }
.ho-loc.shake { animation:ho-shake .4s; }
@keyframes ho-shake { 20%,60% { transform:translateX(-6px); } 40%,80% { transform:translateX(6px); } }
@keyframes ho-in { from { transform:scale(.6); opacity:0; } }
@keyframes ho-bob { 50% { transform:rotate(4deg) translateY(-6px); } }
@keyframes ho-wiggle { 0%,85%,100% { transform:none; } 90% { transform:rotate(-2deg); } 95% { transform:rotate(2deg); } }

/* ---------- таймер-полоска ---------- */
.ho-time { position:relative; flex:none; height:30px; margin:0 12px 10px; border:2.5px solid var(--ink); border-radius:999px; background:#fff;
  box-shadow:0 3px 0 var(--ink); overflow:hidden; }
.ho-time-fill { position:absolute; left:0; top:0; bottom:0; width:100%; border-right:2.5px solid var(--ink);
  background:repeating-linear-gradient(-45deg, var(--lime) 0 10px, #b5f000 10px 20px); background-size:28.28px 28.28px;
  animation:ho-stripes 1s linear infinite; transition:width .15s linear; }
.ho-time-num { position:absolute; inset:0; display:flex; align-items:center; padding-left:12px; font-family:var(--display); font-weight:800;
  font-size:15px; font-variant-numeric:tabular-nums; }
.ho-time.low .ho-time-fill { background:repeating-linear-gradient(-45deg, var(--pink) 0 10px, #ff3d8c 10px 20px); background-size:28.28px 28.28px; }
.ho-time.low { animation:ho-throb .5s ease-in-out infinite alternate; }
.ho-time.low .ho-time-num { color:#fff; text-shadow:0 2px 0 var(--ink); }
.ho-time.plus { animation:ho-bump .5s cubic-bezier(.3,1.8,.5,1); }
.ho-time.minus { animation:ho-shake .35s; }
@keyframes ho-stripes { to { background-position:28.28px 0; } }
@keyframes ho-throb { to { transform:scale(1.04); box-shadow:0 3px 0 var(--ink), 0 0 0 4px rgba(255,95,162,.35); } }
@keyframes ho-bump { 40% { transform:scale(1.15) rotate(-2deg); } }

/* ---------- сцена ---------- */
.ho-scene { position:relative; flex:1; min-height:0; margin:0 12px; border:3px solid var(--ink); border-radius:26px; overflow:hidden;
  box-shadow:0 5px 0 var(--ink); touch-action:none; }
.ho-scene::after { content:''; position:absolute; inset:0; pointer-events:none; z-index:450; border-radius:22px;
  background-image:radial-gradient(rgba(17,17,17,.08) 1.2px, transparent 1.3px); background-size:16px 16px; }
.ho-blob { position:absolute; border-radius:50%; pointer-events:none; }
.ho-it { position:absolute; line-height:1; transform:translate(-50%,-50%) rotate(var(--r)); padding:2px;
  filter:drop-shadow(0 3px 0 rgba(17,17,17,.28)); transition:opacity .2s; }
.ho-it.found { animation:ho-boing .5s cubic-bezier(.3,1.8,.6,1) forwards; }
@keyframes ho-boing { 0% { transform:translate(-50%,-50%) rotate(var(--r)) scale(1); }
  35% { transform:translate(-50%,-50%) rotate(0) scale(1.75); } 55% { transform:translate(-50%,-50%) rotate(0) scale(1.35); }
  100% { transform:translate(-50%,-50%) rotate(0) scale(0); opacity:0; } }
.ho-burst { position:absolute; pointer-events:none; z-index:502; width:20px; height:20px; margin:-10px 0 0 -10px; border-radius:50%;
  border:4px solid var(--ink); background:var(--lime); animation:ho-burst .5s ease-out forwards; }
.ho-burst.b2 { background:transparent; border-color:#fff; animation-delay:.08s; animation-fill-mode:both; }
@keyframes ho-burst { from { transform:scale(.3); opacity:1; } to { transform:scale(5); opacity:0; border-width:1px; } }
.ho-fly { position:fixed; z-index:120; pointer-events:none; line-height:1; transform:translate(-50%,-50%);
  transition:left .55s cubic-bezier(.5,-0.4,.6,1), top .55s cubic-bezier(.3,0,.4,1.3), font-size .55s, opacity .15s .5s;
  filter:drop-shadow(0 3px 0 rgba(17,17,17,.35)); }
.ho-miss { position:absolute; width:56px; height:56px; margin:-28px 0 0 -28px; border-radius:50%; pointer-events:none; z-index:500;
  border:3px solid var(--ink); background:rgba(255,95,162,.55); animation:ho-miss .5s ease-out forwards; }
@keyframes ho-miss { from { transform:scale(.3); } to { transform:scale(1.5); opacity:0; } }
.ho-minus { position:absolute; pointer-events:none; z-index:501; font-family:var(--display); font-weight:800; font-size:15px; color:#fff;
  background:var(--pink); border:2.5px solid var(--ink); border-radius:999px; padding:2px 9px; box-shadow:0 3px 0 var(--ink); white-space:nowrap;
  transform:translate(-50%,-50%); animation:ho-up .85s ease-out forwards; }
@keyframes ho-up { 0% { transform:translate(-50%,-50%) scale(.5); } 20% { transform:translate(-50%,-80%) scale(1.15); }
  100% { transform:translate(-50%,-190%) scale(1); opacity:0; } }
.ho-spark { position:absolute; width:10px; height:10px; border-radius:3px; border:2px solid var(--ink); pointer-events:none; z-index:502;
  animation:ho-spark .65s cubic-bezier(.2,.8,.4,1) forwards; }
@keyframes ho-spark { to { transform:translate(var(--dx), var(--dy)) rotate(300deg) scale(.2); opacity:0; } }
.ho-ring { position:absolute; pointer-events:none; border-radius:50%; z-index:503; transform:translate(-50%,-50%);
  border:4px solid var(--ink); box-shadow:0 0 0 5px var(--lime), 0 0 0 8px var(--ink); animation:ho-ring .7s ease-in-out infinite alternate; }
@keyframes ho-ring { from { transform:translate(-50%,-50%) scale(.85); } to { transform:translate(-50%,-50%) scale(1.15); } }
.ho-scene.flash { animation:ho-flash .3s; }
@keyframes ho-flash { 50% { border-color:var(--pink); box-shadow:0 5px 0 var(--ink), inset 0 0 0 6px var(--pink); } }

/* серия */
.ho-streak { position:absolute; z-index:520; left:50%; top:12px; transform:translateX(-50%); pointer-events:none; display:none;
  font-family:var(--display); font-weight:900; font-size:22px; letter-spacing:-.5px; white-space:nowrap; color:var(--ink);
  background:var(--yellow); border:3px solid var(--ink); border-radius:999px; padding:4px 16px; box-shadow:0 4px 0 var(--ink); }
.ho-streak.on { display:block; }
.ho-streak.hot { background:var(--lime); font-size:24px; }
.ho-streak.mega { background:var(--pink); color:#fff; text-shadow:0 2px 0 var(--ink); font-size:26px; }
.ho-streak.pop { animation:ho-spop .45s cubic-bezier(.2,1.9,.4,1); }
.ho-streak.out { transition:opacity .3s, transform .3s; opacity:0; transform:translateX(-50%) scale(.7); }
@keyframes ho-spop { 0% { transform:translateX(-50%) scale(.3) rotate(-10deg); } 60% { transform:translateX(-50%) scale(1.25) rotate(3deg); } }
.ho-bonus { position:absolute; z-index:521; left:50%; top:58px; pointer-events:none; white-space:nowrap; font-family:var(--display); font-weight:800;
  font-size:14px; color:var(--lime); background:var(--ink); border:2.5px solid var(--ink); border-radius:999px; padding:4px 12px;
  transform:translateX(-50%); animation:ho-bonus 1.3s ease-out forwards; }
@keyframes ho-bonus { 0% { transform:translateX(-50%) scale(.4); opacity:0; } 15% { transform:translateX(-50%) scale(1.15); opacity:1; }
  75% { transform:translateX(-50%) translateY(-4px); opacity:1; } 100% { transform:translateX(-50%) translateY(-24px); opacity:0; } }

/* финальный баннер (без кнопок; анимация только «from», в конце всегда видно) */
.ho-win { position:absolute; inset:0; z-index:600; display:flex; align-items:center; justify-content:center; pointer-events:none;
  background:rgba(17,17,17,.35); }
.ho-win-b { font-family:var(--display); font-weight:900; font-size:34px; line-height:1; letter-spacing:-1.5px; text-align:center; color:var(--ink);
  background:var(--lime); border:4px solid var(--ink); border-radius:28px; padding:18px 22px 16px; box-shadow:0 8px 0 var(--ink);
  transform:rotate(-4deg); animation:ho-wpop .6s cubic-bezier(.2,1.8,.4,1) backwards; }
.ho-win-b small { display:block; font-size:13px; letter-spacing:2px; margin-top:8px; }
@keyframes ho-wpop { from { transform:scale(.2) rotate(-20deg); opacity:0; } }

/* ---------- панель слов ---------- */
.ho-panel { flex:none; display:flex; gap:10px; align-items:center; padding:12px 12px calc(12px + var(--safe-bottom)); }
.ho-words { flex:1; display:flex; flex-wrap:wrap; gap:6px; justify-content:center; }
.ho-word { position:relative; background:#fff; border:2.5px solid var(--ink); border-radius:14px; padding:4px 9px; font-weight:900; font-size:14px;
  box-shadow:0 3px 0 var(--ink); transition:background .25s, color .25s; }
.ho-word::after { content:''; position:absolute; left:5px; right:5px; top:50%; height:5px; margin-top:-2px; border-radius:3px; background:var(--pink);
  transform:scaleX(0) rotate(-3deg); transform-origin:left; transition:transform .3s cubic-bezier(.5,0,.3,1); opacity:.9; }
.ho-word.done { background:var(--lime); color:rgba(17,17,17,.6); animation:ho-wbump .45s cubic-bezier(.3,1.8,.5,1); }
.ho-word.done::after { transform:scaleX(1) rotate(-3deg); }
.ho-word .ho-wemo { display:none; margin-right:3px; }
.ho-word.done .ho-wemo { display:inline; }
@keyframes ho-wbump { 40% { transform:scale(1.25) rotate(-3deg); } }
.ho-hint { position:relative; width:56px; height:56px; border-radius:18px; font-size:26px; padding:0; flex:none;
  background:var(--yellow); border:3px solid var(--ink); box-shadow:0 4px 0 var(--ink); }
.ho-hint:active { transform:translateY(3px); box-shadow:0 1px 0 var(--ink); }
.ho-hint-n { position:absolute; right:-8px; top:-9px; background:var(--violet); color:#fff; font-family:var(--display); font-size:11px; font-weight:800;
  border:2px solid var(--ink); border-radius:999px; padding:1px 6px; white-space:nowrap; }
`;

export function mount(root, ctx) {
  const store = ctx.store;
  const progress = store.state.progress;
  if (!Array.isArray(progress.hiddenUnlocked)) progress.hiddenUnlocked = ['kitchen'];

  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  let tick = null;
  let alive = true;
  let cleanupScene = null;

  root.classList.add('ho-root');
  root.innerHTML = '';
  const style = h('style', CSS);

  function setScreen(...nodes) {
    root.innerHTML = '';
    root.append(style, ...nodes);
  }
  const retrigger = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  // ---------- Экран выбора локации ----------
  function showSelect() {
    const unlocked = progress.hiddenUnlocked;
    const keysPill = h('div.ho-pill', '🗝️ ' + store.state.keys);
    const top = h('div.game-top.ho-top',
      h('button.btn-icon', { onclick: () => { store.addEnergy(meta.cost.energy); ctx.exit(); } }, '✕'),
      h('div.game-title', '🔍 Поиск'),
      keysPill,
    );
    const cards = LOCATIONS.map((loc, i) => {
      const open = unlocked.includes(loc.id);
      const can = !open && store.state.keys >= loc.keys;
      const card = h('button.ho-loc' + (open ? '' : '.locked') + (can ? '.can' : ''),
        { style: { background: loc.tile, animationDelay: i * 70 + 'ms' } },
        h('div.ho-loc-ic', loc.icon),
        h('div.ho-loc-name', loc.name),
        open ? h('div.ho-loc-go', 'Играть ▶') : h('div.ho-lock', '🔒 ' + loc.keys + ' 🗝️'),
      );
      card.addEventListener('click', () => {
        if (open) { sfx('tap'); buzz(8); return startGame(loc); }
        if (store.state.keys < loc.keys) {
          retrigger(card, 'shake');
          sfx('error'); buzz([20, 40, 20]);
          toast('Не хватает ключей. Ключи дают в игре Три в ряд', 2600);
          return;
        }
        if (!store.spendKeys(loc.keys)) return;
        if (!progress.hiddenUnlocked.includes(loc.id)) progress.hiddenUnlocked.push(loc.id);
        store.commit();
        const r = card.getBoundingClientRect();
        sfx('reward'); buzz([10, 40, 10, 40, 30]);
        confetti(r.left + r.width / 2, r.top + r.height / 2, 30);
        toast(loc.icon + ' ' + loc.name + ' открыта!');
        showSelect();
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
  function buildPool(loc) {
    const seen = new Set();
    const uniq = (list) => list.filter((it) => {
      const k = normEmoji(it.emoji);
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    const own = uniq(shuffle(loc.cats.flatMap((c) => itemsByCat(c))));
    const others = uniq(shuffle(ITEMS.filter((it) => !loc.cats.includes(it.cat))));
    const total = Math.round(rnd(SCENE_MIN, SCENE_MAX));
    const ownCount = Math.min(own.length, Math.round(total * 0.75));
    const ownPart = own.slice(0, ownCount);
    const noise = others.slice(0, total - ownPart.length);
    const targets = shuffle(ownPart).slice(0, TARGETS);
    return { scene: shuffle([...ownPart, ...noise]), targets };
  }

  // ---------- Игра ----------
  function startGame(loc) {
    const { scene: sceneItems, targets } = buildPool(loc);
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

    const countPill = h('div.ho-pill', '0/' + targets.length);
    const exitBtn = h('button.btn-icon', '✕');
    const top = h('div.game-top.ho-top', exitBtn, h('div.game-title', loc.icon + ' ' + loc.name), countPill);
    const timeFill = h('div.ho-time-fill');
    const timeNum = h('div.ho-time-num', '⏱ ' + TIME);
    const timeBar = h('div.ho-time', timeFill, timeNum);
    const streakEl = h('div.ho-streak');
    const scene = h('div.ho-scene', { style: { background: loc.bg } }, streakEl);
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

    // Раскладка: сетка с джиттером
    const els = {};
    function layout() {
      const W = scene.clientWidth, H = scene.clientHeight;
      if (!W || !H) return false;
      // декоративные пятна
      for (let i = 0; i < 14; i++) {
        const s = rnd(40, 160);
        scene.append(h('div.ho-blob', { style: {
          width: s + 'px', height: s * rnd(.6, 1.3) + 'px',
          left: rnd(-s / 2, W - s / 2) + 'px', top: rnd(-s / 2, H - s / 2) + 'px',
          background: pick(BLOB_COLORS), opacity: rnd(.14, .32).toFixed(2),
          borderRadius: `${rnd(30, 70)}% ${rnd(30, 70)}% ${rnd(30, 70)}% ${rnd(30, 70)}%`,
          transform: `rotate(${rnd(0, 180)}deg)`,
        } }));
      }
      const N = sceneItems.length;
      const cols = Math.max(4, Math.round(Math.sqrt(N * W / H)));
      const rows = Math.ceil(N / cols);
      const cw = W / cols, ch = H / rows;
      const cellMin = Math.min(cw, ch);
      // размеры зависят от клетки, чтобы всё помещалось на маленьких экранах
      const kSize = Math.min(1, cellMin / 52);
      const cells = shuffle([...Array(cols * rows).keys()]).slice(0, N);
      // цели не должны быть самыми мелкими и не должны быть полностью закрыты
      sceneItems.forEach((it, i) => {
        const cell = cells[i];
        const cx = (cell % cols + 0.5) * cw, cy = (Math.floor(cell / cols) + 0.5) * ch;
        const isTarget = targetIds.has(it.id);
        const size = Math.round((isTarget ? rnd(32, 50) : rnd(26, 58)) * Math.max(.7, kSize));
        const half = size / 2 + 3;
        const x = Math.min(W - half, Math.max(half, cx + rnd(-.45, .45) * cw));
        const y = Math.min(H - half, Math.max(half, cy + rnd(-.45, .45) * ch));
        const el = h('div.ho-it', { style: {
          left: x + 'px', top: y + 'px', fontSize: size + 'px',
          zIndex: isTarget ? Math.round(rnd(25, 70)) : Math.round(rnd(1, 70)),
        } }, it.emoji);
        el.style.setProperty('--r', Math.round(rnd(-40, 40)) + 'deg');
        el.dataset.id = it.id;
        els[it.id] = el;
        scene.append(el);
      });
      return true;
    }

    let layoutTries = 0;
    const tryLayout = () => {
      if (!alive || layout()) return;
      if (++layoutTries < 30) later(tryLayout, 50);
    };
    requestAnimationFrame(tryLayout);

    // Таймер
    function renderTime() {
      const s = Math.max(0, Math.ceil(timeLeft));
      timeNum.textContent = '⏱ ' + s;
      timeFill.style.width = Math.max(0, Math.min(1, timeLeft / TIME)) * 100 + '%';
      timeBar.classList.toggle('low', timeLeft <= LOW_TIME && timeLeft > 0);
      // тиканье в последние секунды
      if (s !== lastSec) {
        if (s < lastSec && s <= LOW_TIME && s > 0 && !over) { sfx('tap'); if (s <= 3) buzz(6); }
        lastSec = s;
      }
    }
    renderTime();
    let last = performance.now();
    tick = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (paused || over) return;
      timeLeft -= dt;
      renderTime();
      if (timeLeft <= 0) lose();
    }, 100);

    // Эффекты
    function localPoint(e) {
      const r = scene.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function sparks(x, y, n = 16) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = rnd(35, 90);
        const s = h('div.ho-spark', { style: { left: x - 5 + 'px', top: y - 5 + 'px', background: pick(BLOB_COLORS.slice(1)) } });
        s.style.setProperty('--dx', Math.cos(a) * d + 'px');
        s.style.setProperty('--dy', Math.sin(a) * d + 'px');
        scene.append(s);
        later(() => s.remove(), 700);
      }
    }
    function burst(x, y) {
      const a = h('div.ho-burst', { style: { left: x + 'px', top: y + 'px' } });
      const b = h('div.ho-burst.b2', { style: { left: x + 'px', top: y + 'px' } });
      scene.append(a, b);
      later(() => { a.remove(); b.remove(); }, 650);
    }
    function missFx(x, y) {
      const m = h('div.ho-miss', { style: { left: x + 'px', top: y + 'px' } });
      const t = h('div.ho-minus', { style: { left: x + 'px', top: y - 10 + 'px' } }, '−' + PENALTY + ' сек');
      scene.append(m, t);
      retrigger(scene, 'flash');
      retrigger(timeBar, 'minus');
      later(() => { m.remove(); t.remove(); }, 900);
    }
    function flyToPanel(it, onArrive) {
      const el = els[it.id];
      const from = el.getBoundingClientRect();
      const to = wordEls[it.id].getBoundingClientRect();
      const fly = h('div.ho-fly', { style: {
        left: from.left + from.width / 2 + 'px', top: from.top + from.height / 2 + 'px', fontSize: el.style.fontSize,
      } }, it.emoji);
      document.body.append(fly);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fly.style.left = to.left + 16 + 'px';
        fly.style.top = to.top + to.height / 2 + 'px';
        fly.style.fontSize = '18px';
        fly.style.opacity = '0';
      }));
      later(() => { fly.remove(); onArrive(); }, 560);
    }

    // Серия быстрых находок
    function bumpStreak(now) {
      streak = now - lastFoundAt <= STREAK_WINDOW ? streak + 1 : 1;
      lastFoundAt = now;
      if (streakHide) { clearTimeout(streakHide); timers.delete(streakHide); streakHide = null; }
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
        later(() => b.remove(), 1350);
        sfx('win'); buzz([10, 30, 10, 30, 10]);
      } else {
        buzz([10, 30, 10]);
      }
      // серия «остывает», если долго нет находок
      streakHide = later(() => { streakHide = null; hideStreak(); }, STREAK_WINDOW);
    }
    function hideStreak() {
      if (!streakEl.classList.contains('on')) return;
      streakEl.classList.add('out');
      later(() => { if (streakEl.classList.contains('out')) streakEl.className = 'ho-streak'; }, 320);
    }
    function resetStreak() {
      streak = 0; lastFoundAt = 0;
      if (streakHide) { clearTimeout(streakHide); timers.delete(streakHide); streakHide = null; }
      hideStreak();
    }

    function onFound(it) {
      found.add(it.id);
      const el = els[it.id];
      const r = el.getBoundingClientRect(), s = scene.getBoundingClientRect();
      const x = r.left - s.left + r.width / 2, y = r.top - s.top + r.height / 2;
      burst(x, y);
      sparks(x, y);
      sfx('coin'); buzz(15);
      flyToPanel(it, () => {
        wordEls[it.id].classList.add('done');
        countPill.textContent = found.size + '/' + targets.length;
        retrigger(countPill, 'bump');
      });
      el.classList.add('found');
      el.style.zIndex = 400;
      el.style.pointerEvents = 'none';
      if (ring && ring.dataset.id === it.id) { ring.remove(); ring = null; }
      if (found.size === targets.length) { hideStreak(); win(); return; }
      bumpStreak(performance.now());
    }

    function onTap(e) {
      if (over || paused) return;
      const p = localPoint(e);
      // Сначала ищем ненайденную цель под пальцем (с запасом), даже если её частично перекрыли.
      let best = null, bestD = Infinity;
      const sr = scene.getBoundingClientRect();
      for (const t of targets) {
        if (found.has(t.id) || !els[t.id]) continue;
        const r = els[t.id].getBoundingClientRect();
        const l = r.left - sr.left - HIT_PAD, tp = r.top - sr.top - HIT_PAD;
        const rr = r.right - sr.left + HIT_PAD, b = r.bottom - sr.top + HIT_PAD;
        if (p.x >= l && p.x <= rr && p.y >= tp && p.y <= b) {
          const d = Math.hypot(p.x - (l + rr) / 2, p.y - (tp + b) / 2);
          if (d < bestD) { bestD = d; best = t; }
        }
      }
      if (best) return onFound(best);
      timeLeft = Math.max(0, timeLeft - PENALTY);
      renderTime();
      missFx(p.x, p.y);
      resetStreak();
      sfx('error'); buzz([20, 40, 20]);
      if (timeLeft <= 0) lose();
    }
    scene.addEventListener('pointerdown', onTap);

    // Подсказка
    hintBtn.addEventListener('click', () => {
      if (over) return;
      const left = targets.filter((t) => !found.has(t.id) && els[t.id]);
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
      const el = els[t.id];
      const r = el.getBoundingClientRect(), s = scene.getBoundingClientRect();
      const d = Math.max(r.width, r.height) + 22;
      ring = h('div.ho-ring', { style: {
        left: r.left - s.left + r.width / 2 + 'px', top: r.top - s.top + r.height / 2 + 'px', width: d + 'px', height: d + 'px',
      } });
      ring.dataset.id = t.id;
      el.style.zIndex = 300;
      scene.append(ring);
    });

    // Выход
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

    function end(victory, title) {
      if (over) return;
      over = true;
      clearInterval(tick); tick = null;
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
      clearInterval(tick); tick = null;
      timeBar.classList.remove('low');
      later(() => {
        if (!alive) return;
        const left = Math.max(0, Math.ceil(timeLeft));
        scene.append(h('div.ho-win', h('div.ho-win-b', 'ВСЁ', h('br'), 'НАЙДЕНО!', h('small', '⏱ ' + left + ' сек в запасе'))));
        sfx('reward'); buzz([20, 50, 20, 50, 60]);
        const s = scene.getBoundingClientRect();
        confetti(s.left + s.width / 2, s.top + s.height / 2, 50);
        later(() => confetti(s.left + s.width * .25, s.top + s.height * .35, 35), 250);
        later(() => confetti(s.left + s.width * .75, s.top + s.height * .35, 35), 450);
        later(() => confetti(s.left + s.width / 2, s.top + s.height * .2, 30), 700);
      }, 450);
      later(() => { over = false; end(true, 'Всё найдено!'); }, 2100);
    }

    function lose() {
      over = true;
      clearInterval(tick); tick = null;
      timeLeft = 0; renderTime();
      timeBar.classList.remove('low');
      sfx('error'); buzz([40, 60, 40]);
      // показываем, где прятались ненайденные
      for (const t of targets) if (!found.has(t.id) && els[t.id]) {
        els[t.id].style.zIndex = 300;
        els[t.id].style.filter = 'drop-shadow(0 0 0 #111) drop-shadow(0 0 6px #fff) drop-shadow(0 0 4px #ff5fa2)';
      }
      later(() => { over = false; end(false, 'Время вышло'); }, 1200);
    }

    cleanupScene = () => scene.removeEventListener('pointerdown', onTap);
  }

  showSelect();

  return () => {
    alive = false;
    if (tick) clearInterval(tick);
    for (const t of timers) clearTimeout(t);
    timers.clear();
    if (cleanupScene) cleanupScene();
    document.querySelectorAll('.ho-fly').forEach((n) => n.remove());
  };
}
