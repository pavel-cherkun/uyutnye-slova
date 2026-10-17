// Мини-игра «Поиск предметов»: найди слова-цели на захламлённой сцене.

import { ITEMS, itemsByCat } from '../data/items.js';
import { h, toast, confetti, shuffle, pick, confirmDialog } from '../ui/common.js';

export const meta = {
  id: 'hidden',
  title: 'Поиск',
  emoji: '🔍',
  desc: 'Найди предметы на захламлённой сцене',
  cost: { energy: 6 },
  gives: 'предметы',
};

export const LOCATIONS = [
  { id: 'kitchen',    name: 'Кухня',    icon: '🍳', keys: 0, cats: ['dishes', 'food', 'drinks'],
    bg: 'linear-gradient(150deg, #ffe08a 0%, #ff9f6b 50%, #ff6f91 100%)' },
  { id: 'garden',     name: 'Сад',      icon: '🌻', keys: 1, cats: ['plants', 'nature'],
    bg: 'linear-gradient(160deg, #b8f5a0 0%, #4fd1a5 50%, #3fa9ff 100%)' },
  { id: 'wardrobe',   name: 'Гардероб', icon: '👗', keys: 2, cats: ['clothes', 'accessory'],
    bg: 'linear-gradient(150deg, #ffc2e2 0%, #ff6fb5 45%, #a66bff 100%)' },
  { id: 'attic',      name: 'Чердак',   icon: '🕯️', keys: 3, cats: ['decor', 'music', 'transport', 'fantasy'],
    bg: 'linear-gradient(160deg, #f5c78a 0%, #c0794a 45%, #6b3fa0 100%)' },
  { id: 'office',     name: 'Кабинет',  icon: '🖋️', keys: 3, cats: ['stationery', 'tech', 'tools'],
    bg: 'linear-gradient(150deg, #a8e6ff 0%, #6c8cff 50%, #7a5cff 100%)' },
  { id: 'livingroom', name: 'Гостиная', icon: '🛋️', keys: 4, cats: ['furniture', 'light', 'walldecor', 'pets'],
    bg: 'linear-gradient(160deg, #fff1a8 0%, #ffb36b 40%, #ff5f8f 75%, #9a5cff 100%)' },
];

const TIME = 90;          // секунд на сцену
const PENALTY = 5;        // штраф за промах
const TARGETS = 7;
const SCENE_MIN = 45, SCENE_MAX = 60;
const HINT_COST = 3; // энергии, если нет лупы
const HIT_PAD = 8;        // запас хитбокса, px

const BLOB_COLORS = ['#ffffff', '#ffc93c', '#ff4f8b', '#3fa9ff', '#2fcf98', '#a66bff', '#ff8a3d'];

const rnd = (a, b) => a + Math.random() * (b - a);
const normEmoji = (e) => e.replace(/️/g, '');
const cap = (w) => w.charAt(0) + w.slice(1).toLowerCase();

const CSS = `
.ho-root { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; }
.ho-top .game-title { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ho-keys { font-weight:900; background:rgba(255,255,255,.9); border-radius:999px; padding:6px 12px; box-shadow:0 3px 0 rgba(43,29,74,.12); white-space:nowrap; }
.ho-timer { font-weight:900; font-size:16px; min-width:52px; text-align:center; background:rgba(255,255,255,.9); border-radius:999px; padding:6px 10px; box-shadow:0 3px 0 rgba(43,29,74,.12); font-variant-numeric:tabular-nums; }
.ho-timer.low { color:#fff; background:var(--pink); animation:ho-throb .5s infinite alternate; }
@keyframes ho-throb { to { transform:scale(1.12); } }

/* выбор локации */
.ho-select { flex:1; overflow-y:auto; padding:4px 14px calc(16px + var(--safe-bottom)); }
.ho-sel-title { font-size:24px; font-weight:900; margin:4px 2px 4px; }
.ho-sel-sub { margin:0 2px 12px; }
.ho-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.ho-loc { position:relative; border:0; border-radius:22px; min-height:128px; padding:12px; color:#fff; text-align:left;
  display:flex; flex-direction:column; justify-content:flex-end; box-shadow:0 6px 0 rgba(43,29,74,.18); overflow:hidden; cursor:pointer;
  transition:transform .1s; animation:ho-in .4s cubic-bezier(.3,1.6,.6,1) backwards; }
.ho-loc:active { transform:scale(.96); }
.ho-loc-ic { position:absolute; right:-6px; top:-6px; font-size:66px; transform:rotate(12deg); filter:drop-shadow(0 4px 4px rgba(0,0,0,.2)); }
.ho-loc-name { font-size:19px; font-weight:900; text-shadow:0 2px 0 rgba(0,0,0,.25); }
.ho-loc-info { font-size:12px; font-weight:800; opacity:.95; text-shadow:0 1px 0 rgba(0,0,0,.25); }
.ho-loc.locked .ho-loc-ic { filter:grayscale(.7) brightness(.8); }
.ho-loc.locked::after { content:''; position:absolute; inset:0; background:rgba(43,29,74,.35); }
.ho-lock { position:absolute; z-index:2; left:50%; top:42%; transform:translate(-50%,-50%); background:#fff; color:var(--ink);
  font-weight:900; border-radius:999px; padding:6px 12px; font-size:15px; box-shadow:0 4px 0 rgba(43,29,74,.2); white-space:nowrap; }
.ho-loc .ho-loc-name, .ho-loc .ho-loc-info { position:relative; z-index:2; }
.ho-loc.shake { animation:ho-shake .4s; }
@keyframes ho-shake { 20%,60% { transform:translateX(-6px); } 40%,80% { transform:translateX(6px); } }
@keyframes ho-in { from { transform:scale(.6); opacity:0; } }

/* игра */
.ho-bar { height:10px; margin:0 12px 8px; border-radius:999px; background:rgba(255,255,255,.6); overflow:hidden; box-shadow:inset 0 2px 3px rgba(0,0,0,.1); flex:none; }
.ho-bar-fill { height:100%; width:100%; border-radius:999px; background:linear-gradient(90deg, var(--green), var(--yellow), var(--orange)); transform-origin:left; transition:background .3s; }
.ho-bar-fill.low { background:linear-gradient(90deg, var(--pink), var(--orange)); }
.ho-scene { position:relative; flex:1; min-height:0; margin:0 10px; border-radius:22px; overflow:hidden;
  box-shadow:inset 0 0 0 4px rgba(255,255,255,.7), 0 6px 0 rgba(43,29,74,.15); touch-action:none; }
.ho-blob { position:absolute; border-radius:50%; pointer-events:none; }
.ho-it { position:absolute; line-height:1; transform:translate(-50%,-50%) rotate(var(--r)); padding:2px;
  filter:drop-shadow(0 3px 2px rgba(43,29,74,.35)); transition:opacity .2s; }
.ho-it.found { animation:ho-boing .45s cubic-bezier(.3,1.8,.6,1) forwards; }
@keyframes ho-boing { 0% { transform:translate(-50%,-50%) rotate(var(--r)) scale(1); }
  50% { transform:translate(-50%,-50%) rotate(0) scale(1.6); } 100% { transform:translate(-50%,-50%) rotate(0) scale(0); opacity:0; } }
.ho-fly { position:fixed; z-index:120; pointer-events:none; line-height:1; transform:translate(-50%,-50%);
  transition:left .6s cubic-bezier(.5,-0.4,.6,1), top .6s cubic-bezier(.3,0,.4,1.3), font-size .6s, opacity .2s .55s;
  filter:drop-shadow(0 4px 4px rgba(0,0,0,.3)); }
.ho-miss { position:absolute; width:56px; height:56px; margin:-28px 0 0 -28px; border-radius:50%; pointer-events:none;
  background:radial-gradient(circle, rgba(255,40,80,.85) 0%, rgba(255,40,80,.35) 50%, transparent 70%); animation:ho-miss .5s ease-out forwards; z-index:500; }
@keyframes ho-miss { from { transform:scale(.3); } to { transform:scale(1.6); opacity:0; } }
.ho-minus { position:absolute; pointer-events:none; font-weight:900; font-size:20px; color:#fff; z-index:501;
  text-shadow:0 2px 0 #c92e66, 0 0 6px #ff2850; transform:translate(-50%,-50%); animation:ho-up .8s ease-out forwards; }
@keyframes ho-up { to { transform:translate(-50%,-160%); opacity:0; } }
.ho-spark { position:absolute; width:9px; height:9px; border-radius:50%; pointer-events:none; z-index:502;
  animation:ho-spark .6s ease-out forwards; }
@keyframes ho-spark { to { transform:translate(var(--dx), var(--dy)) scale(.2); opacity:0; } }
.ho-ring { position:absolute; pointer-events:none; border-radius:50%; z-index:503; transform:translate(-50%,-50%);
  border:4px solid #fff; box-shadow:0 0 0 4px var(--pink), 0 0 18px 6px rgba(255,201,60,.9); animation:ho-ring .8s ease-in-out infinite alternate; }
@keyframes ho-ring { from { transform:translate(-50%,-50%) scale(.85); } to { transform:translate(-50%,-50%) scale(1.15); } }
.ho-scene.flash { animation:ho-flash .3s; }
@keyframes ho-flash { 50% { box-shadow:inset 0 0 0 6px rgba(255,40,80,.9), 0 6px 0 rgba(43,29,74,.15); } }

.ho-panel { flex:none; display:flex; gap:8px; align-items:center; padding:10px 10px calc(10px + var(--safe-bottom)); }
.ho-words { flex:1; display:flex; flex-wrap:wrap; gap:5px; justify-content:center; }
.ho-word { position:relative; background:#fff; border-radius:999px; padding:5px 10px; font-weight:900; font-size:14px;
  box-shadow:0 3px 0 rgba(43,29,74,.12); transition:background .3s, color .3s, transform .3s; }
.ho-word::after { content:''; position:absolute; left:8px; right:8px; top:50%; height:3px; border-radius:3px; background:var(--pink);
  transform:scaleX(0); transform-origin:left; transition:transform .35s .45s; }
.ho-word.done { background:#e6fff4; color:var(--ink-soft); animation:ho-bump .4s .5s; }
.ho-word.done::after { transform:scaleX(1); }
.ho-word .ho-wemo { display:none; margin-right:3px; }
.ho-word.done .ho-wemo { display:inline; }
@keyframes ho-bump { 40% { transform:scale(1.2); } }
.ho-hint { position:relative; width:54px; height:54px; border-radius:50%; font-size:26px; padding:0; flex:none; }
.ho-hint-n { position:absolute; right:-4px; top:-6px; background:var(--violet); color:#fff; font-size:11px; font-weight:900;
  border-radius:999px; padding:2px 6px; box-shadow:0 2px 0 rgba(0,0,0,.2); white-space:nowrap; }
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

  // ---------- Экран выбора локации ----------
  function showSelect() {
    const unlocked = progress.hiddenUnlocked;
    const keysPill = h('div.ho-keys', '🗝️ ' + store.state.keys);
    const top = h('div.game-top.ho-top',
      h('button.btn-icon', { onclick: () => { store.addEnergy(meta.cost.energy); ctx.exit(); } }, '✕'),
      h('div.game-title', '🔍 Поиск предметов'),
      keysPill,
    );
    const cards = LOCATIONS.map((loc, i) => {
      const open = unlocked.includes(loc.id);
      const card = h('button.ho-loc' + (open ? '' : '.locked'), { style: { background: loc.bg, animationDelay: i * 60 + 'ms' } },
        h('div.ho-loc-ic', loc.icon),
        open ? null : h('div.ho-lock', '🔒 ' + loc.keys + ' 🗝️'),
        h('div.ho-loc-name', loc.name),
        h('div.ho-loc-info', open ? 'Играть ▶' : 'Открыть за ' + loc.keys + ' 🗝️'),
      );
      card.addEventListener('click', () => {
        if (open) return startGame(loc);
        if (store.state.keys < loc.keys) {
          card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
          toast('Не хватает ключей. Ключи дают в игре Три в ряд', 2600);
          return;
        }
        if (!store.spendKeys(loc.keys)) return;
        if (!progress.hiddenUnlocked.includes(loc.id)) progress.hiddenUnlocked.push(loc.id);
        store.commit();
        const r = card.getBoundingClientRect();
        confetti(r.left + r.width / 2, r.top + r.height / 2, 30);
        toast(loc.icon + ' ' + loc.name + ' открыта!');
        showSelect();
      });
      return card;
    });
    setScreen(top, h('div.ho-select',
      h('div.ho-sel-title', 'Куда пойдём?'),
      h('p.ho-sel-sub.muted.small', '⏱ ' + TIME + ' сек · 🗝️ открывает новые места'),
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

    const timerEl = h('div.ho-timer', String(TIME));
    const exitBtn = h('button.btn-icon', '✕');
    const top = h('div.game-top.ho-top', exitBtn, h('div.game-title', loc.icon + ' ' + loc.name), timerEl);
    const barFill = h('div.ho-bar-fill');
    const bar = h('div.ho-bar', barFill);
    const scene = h('div.ho-scene', { style: { background: loc.bg } });
    const wordEls = {};
    const words = h('div.ho-words', targets.map((t) => {
      const el = h('div.ho-word', h('span.ho-wemo', t.emoji), cap(t.word));
      wordEls[t.id] = el;
      return el;
    }));
    const hintN = h('span.ho-hint-n');
    const hintBtn = h('button.btn.btn-yellow.ho-hint', '🔍', hintN);
    const panel = h('div.ho-panel', words, hintBtn);
    setScreen(top, bar, scene, panel);

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
          background: pick(BLOB_COLORS), opacity: rnd(.12, .3).toFixed(2),
          borderRadius: `${rnd(30, 70)}% ${rnd(30, 70)}% ${rnd(30, 70)}% ${rnd(30, 70)}%`,
          transform: `rotate(${rnd(0, 180)}deg)`,
        } }));
      }
      const N = sceneItems.length;
      let cols = Math.max(4, Math.round(Math.sqrt(N * W / H)));
      let rows = Math.ceil(N / cols);
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
      timerEl.textContent = '⏱ ' + s;
      timerEl.classList.toggle('low', timeLeft <= 15);
      barFill.style.transform = `scaleX(${Math.max(0, timeLeft / TIME)})`;
      barFill.classList.toggle('low', timeLeft <= 15);
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
    function sparks(x, y, n = 14) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = rnd(30, 80);
        const s = h('div.ho-spark', { style: { left: x - 4 + 'px', top: y - 4 + 'px', background: pick(BLOB_COLORS.slice(1)) } });
        s.style.setProperty('--dx', Math.cos(a) * d + 'px');
        s.style.setProperty('--dy', Math.sin(a) * d + 'px');
        scene.append(s);
        later(() => s.remove(), 650);
      }
    }
    function missFx(x, y) {
      const m = h('div.ho-miss', { style: { left: x + 'px', top: y + 'px' } });
      const t = h('div.ho-minus', { style: { left: x + 'px', top: y - 10 + 'px' } }, '−' + PENALTY + ' сек');
      scene.append(m, t);
      scene.classList.remove('flash'); void scene.offsetWidth; scene.classList.add('flash');
      later(() => { m.remove(); t.remove(); }, 850);
    }
    function flyToPanel(it) {
      const el = els[it.id];
      const from = el.getBoundingClientRect();
      const to = wordEls[it.id].getBoundingClientRect();
      const fly = h('div.ho-fly', { style: {
        left: from.left + from.width / 2 + 'px', top: from.top + from.height / 2 + 'px', fontSize: el.style.fontSize,
      } }, it.emoji);
      document.body.append(fly);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fly.style.left = to.left + 14 + 'px';
        fly.style.top = to.top + to.height / 2 + 'px';
        fly.style.fontSize = '16px';
        fly.style.opacity = '0';
      }));
      later(() => fly.remove(), 800);
    }

    function onFound(it) {
      found.add(it.id);
      const el = els[it.id];
      const r = el.getBoundingClientRect(), s = scene.getBoundingClientRect();
      sparks(r.left - s.left + r.width / 2, r.top - s.top + r.height / 2);
      flyToPanel(it);
      el.classList.add('found');
      el.style.zIndex = 400;
      el.style.pointerEvents = 'none';
      wordEls[it.id].classList.add('done');
      if (ring && ring.dataset.id === it.id) { ring.remove(); ring = null; }
      if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) { /* нет вибрации */ }
      if (found.size === targets.length) win();
    }

    function onTap(e) {
      if (over || paused) return;
      const p = localPoint(e);
      // Сначала ищем ненайденную цель под пальцем (с запасом), даже если её частично перекрыли.
      let best = null, bestD = Infinity;
      for (const t of targets) {
        if (found.has(t.id) || !els[t.id]) continue;
        const r = els[t.id].getBoundingClientRect();
        const sr = scene.getBoundingClientRect();
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
      if (navigator.vibrate) try { navigator.vibrate([20, 40, 20]); } catch (er) { /* нет вибрации */ }
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
        toast('Нужна лупа 🔍 — собери слово ЛУПА в Эрудите', 3200);
        return;
      }
      updateHint();
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
      const s = scene.getBoundingClientRect();
      confetti(s.left + s.width / 2, s.top + s.height / 2, 50);
      later(() => confetti(s.left + s.width * .25, s.top + s.height * .4, 30), 250);
      later(() => confetti(s.left + s.width * .75, s.top + s.height * .4, 30), 450);
      later(() => { over = false; end(true, 'Всё найдено!'); }, 1100);
    }

    function lose() {
      over = true;
      clearInterval(tick); tick = null;
      timeLeft = 0; renderTime();
      // показываем, где прятались ненайденные
      for (const t of targets) if (!found.has(t.id) && els[t.id]) {
        els[t.id].style.zIndex = 300;
        els[t.id].style.filter = 'drop-shadow(0 0 8px #fff) drop-shadow(0 0 4px #ff4f8b)';
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
