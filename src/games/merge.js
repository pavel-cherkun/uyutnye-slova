// Мини-игра «Мердж»: бесконечная песочница. Генераторы выдают вещи за ⚡,
// две одинаковые вещи сливаются в следующую по цепочке своей категории.

import { ITEMS, RARITY, RARITY_ORDER, getItem, CATEGORIES } from '../data/items.js';
import { openThemes, PLACES } from '../data/places.js';
import { h, toast, modal, confetti } from '../ui/common.js';
import { floatText, flyTo } from '../ui/fx.js';
import { sfx, buzz } from '../ui/device.js';
import { gainXP } from '../progression.js';

export const meta = {
  id: 'merge',
  title: 'Мердж',
  emoji: '✨',
  desc: 'Соединяй одинаковые вещи — получай круче',
  cost: { energy: 0 },
  gives: 'редкие предметы',
};

export const COLS = 6;
export const ROWS = 8;
export const SIZE = COLS * ROWS;
// Генераторы — по открытым темам (категории открытых мест), как в Поиске и Пасьянсе
const NO_MERGE = ['misc', 'essence'];
export function mergeCats(S) { return openThemes(S).filter((c) => !NO_MERGE.includes(c) && chainFor(c).length >= 3); }
const LEVEL1_CHANCE = 0.15;
const COMBO_WINDOW = 3000;
const IDLE_HINT = 5000;

// ---------- Логика (чистые функции, проверяются в node) ----------

const chainCache = new Map();

/** Цепочка категории: по редкости c→r→e→l, внутри редкости — по слову. Массив id. */
export function chainFor(cat, items = ITEMS) {
  if (items === ITEMS && chainCache.has(cat)) return chainCache.get(cat);
  const chain = items.filter((it) => it.cat === cat)
    .sort((a, b) => (RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)) || a.word.localeCompare(b.word, 'ru'))
    .map((it) => it.id);
  if (items === ITEMS) chainCache.set(cat, chain);
  return chain;
}

/** Уровень вещи: { cat, chain, index } или null, если вещь не участвует в мердже. */
export function levelOf(id) {
  if (!id) return null;
  const it = getItem(id);
  if (it.tier !== 1 || NO_MERGE.includes(it.cat) || !CATEGORIES[it.cat]) return null;
  const chain = chainFor(it.cat);
  const index = chain.indexOf(id);
  return index < 0 ? null : { cat: it.cat, chain, index };
}

/** Следующая вещь цепочки или null (последняя / не участвует). */
export function nextOf(id) {
  const lv = levelOf(id);
  if (!lv || lv.index >= lv.chain.length - 1) return null;
  return lv.chain[lv.index + 1];
}

export function canMerge(a, b) {
  return !!a && a === b && !!nextOf(a);
}

/** Индексы свободных клеток */
export function freeCells(cells) {
  const out = [];
  cells.forEach((c, i) => { if (!c) out.push(i); });
  return out;
}

/** Случайная свободная клетка или -1 */
export function randomFreeCell(cells, rng = Math.random) {
  const free = freeCells(cells);
  return free.length ? free[Math.floor(rng() * free.length)] : -1;
}

/** Что выдаёт генератор: уровень 0, иногда уровень 1 */
export function spawnId(cat, rng = Math.random) {
  const chain = chainFor(cat);
  const lvl = chain.length > 1 && rng() < LEVEL1_CHANCE ? 1 : 0;
  return chain[lvl];
}

/**
 * Ход: перетащить вещь из from в to.
 * Возвращает { type: 'merge'|'move'|'max'|'none', cells, result? } — cells новый массив (исходный не меняется).
 */
export function applyDrop(cells, from, to) {
  const a = cells[from], b = cells[to];
  if (from === to || !a || to < 0 || to >= cells.length) return { type: 'none', cells };
  if (!b) {
    const next = cells.slice(); next[to] = a; next[from] = null;
    return { type: 'move', cells: next };
  }
  if (a === b) {
    const result = nextOf(a);
    if (!result) return { type: 'max', cells };
    const next = cells.slice(); next[to] = result; next[from] = null;
    return { type: 'merge', cells: next, result };
  }
  return { type: 'none', cells };
}

/** Пара одинаковых вещей, которые можно слить: [i, j] или null */
export function findPair(cells) {
  const seen = new Map();
  for (let i = 0; i < cells.length; i++) {
    const id = cells[i];
    if (!canMerge(id, id)) continue;
    if (seen.has(id)) return [seen.get(id), i];
    seen.set(id, i);
  }
  return null;
}

/** Почистить сохранённое поле: ровно SIZE клеток, только известные вещи */
export function sanitizeCells(cells) {
  const out = new Array(SIZE).fill(null);
  if (Array.isArray(cells)) for (let i = 0; i < SIZE; i++) out[i] = levelOf(cells[i]) ? cells[i] : null;
  return out;
}

/** Энергия за продажу */
export const sellValue = (id) => 1 + (levelOf(id)?.index ?? 0);

// ----- Заряды генераторов: ограничивают «бесплатное» производство вещей -----
export const GEN_COST = 2;          // энергии за тап
export const GEN_MAX = 6;           // зарядов в генераторе
export const GEN_RECHARGE = 15 * 60 * 1000; // мс на один заряд
/** Текущие заряды генератора с учётом восстановления по времени. g = { charges, at } */
export function genCharges(g, now = Date.now()) {
  if (!g) return { charges: GEN_MAX, at: now };
  if (g.charges >= GEN_MAX) return { charges: GEN_MAX, at: now };
  const gained = Math.floor((now - g.at) / GEN_RECHARGE);
  const charges = Math.min(GEN_MAX, g.charges + gained);
  return { charges, at: charges >= GEN_MAX ? now : g.at + gained * GEN_RECHARGE };
}

// ---------- Стили ----------

const CSS = `
.mg-root { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; background:var(--paper); color:var(--ink);
  background-image:radial-gradient(rgba(17,17,17,.07) 1.2px, transparent 1.3px); background-size:18px 18px; user-select:none; -webkit-user-select:none; }
.mg-top .game-title { font-family:var(--display); font-weight:800; font-size:17px; letter-spacing:-.5px; text-transform:uppercase; white-space:nowrap; }
.mg-pill { font-family:var(--display); font-weight:800; font-size:14px; background:var(--lime); border:2.5px solid var(--ink); border-radius:999px;
  padding:5px 11px; box-shadow:0 3px 0 var(--ink); white-space:nowrap; font-variant-numeric:tabular-nums; }
.mg-pill.bump { animation:mg-bump .45s cubic-bezier(.3,1.8,.5,1); }

.mg-gens { display:flex; gap:8px; overflow-x:auto; padding:9px 14px 12px; flex-shrink:0; scrollbar-width:none; }
.mg-gens::-webkit-scrollbar { display:none; }
.mg-gen { flex:0 0 auto; width:64px; height:64px; border:var(--bd); border-radius:18px; background:#fff; box-shadow:0 4px 0 var(--ink);
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0; position:relative; font:inherit; color:var(--ink); padding:0; cursor:pointer; }
.mg-gen:nth-child(6n+1) { background:#ffd9d0; } .mg-gen:nth-child(6n+2) { background:#e4dcff; } .mg-gen:nth-child(6n+3) { background:#e2ffb0; }
.mg-gen:nth-child(6n+4) { background:#d4efff; } .mg-gen:nth-child(6n+5) { background:#fff1a8; } .mg-gen:nth-child(6n+6) { background:#ffd4ea; }
.mg-gen:active { transform:translateY(3px); box-shadow:0 1px 0 var(--ink); }
.mg-gen-ic { font-size:28px; line-height:1; }
.mg-gen-ch { font-family: var(--display); font-size: 10px; font-weight: 800; }
.mg-gen.empty { filter: grayscale(.8); opacity: .65; }
.mg-gen.mg-lock { background: #f1f0ea !important; border-style: dashed; }
.mg-gen-cost { position:absolute; right:-6px; top:-7px; font-family:var(--display); font-weight:800; font-size:10px; background:var(--ink); color:var(--lime);
  border-radius:99px; padding:2px 6px; }
.mg-gen-name { font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:.3px; margin-top:2px; }
.mg-gen.shake { animation:mg-shake .4s; }
.mg-gen.puff { animation:mg-puff .3s cubic-bezier(.3,1.8,.5,1); }

.mg-wrap { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:0 10px; }
.mg-board { display:grid; gap:4px; padding:6px; background:#fff; border:3px solid var(--ink); border-radius:22px; box-shadow:0 6px 0 var(--ink); touch-action:none; }
.mg-cell { position:relative; border-radius:12px; background:#f1efe4; box-shadow:inset 0 2px 0 rgba(17,17,17,.06); }
.mg-cell.over { background:#e6e3d4; outline:2.5px dashed var(--ink); outline-offset:-2px; }
.mg-cell.over.ok { background:var(--lime); }
.mg-tile { position:absolute; inset:0; border:2.5px solid var(--ink); border-radius:12px; background:#fff;
  box-shadow:inset 0 -6px 0 var(--rar), 0 2px 0 var(--ink); display:flex; align-items:center; justify-content:center; line-height:1; touch-action:none; }
.mg-tile .em { pointer-events:none; transform:translateY(-2px); }
.mg-tile .lv { position:absolute; left:3px; top:2px; font-family:var(--display); font-weight:800; font-size:9px; opacity:.55; pointer-events:none; }
.mg-tile.sel { outline:3px solid var(--violet); outline-offset:2px; z-index:2; }
.mg-tile.lift { opacity:.3; }
.mg-tile.rar-e, .mg-tile.rar-l { animation:mg-glow 1.6s ease-in-out infinite; }
.mg-tile.pop { animation:mg-pop .45s cubic-bezier(.2,1.9,.4,1); }
.mg-tile.drop { animation:mg-drop .4s cubic-bezier(.3,1.6,.5,1); }
.mg-tile.wob { animation:mg-wob .9s ease-in-out infinite; }
.mg-new { position:absolute; right:-6px; top:-8px; z-index:3; font-family:var(--display); font-weight:900; font-size:8px; background:var(--pink); color:#fff;
  border:2px solid var(--ink); border-radius:99px; padding:1px 4px; pointer-events:none; }

.mg-ghost { position:fixed; z-index:150; pointer-events:none; transform:translate(-50%,-50%) scale(1.15); border:2.5px solid var(--ink); border-radius:12px;
  background:#fff; box-shadow:inset 0 -6px 0 var(--rar), 0 8px 0 rgba(17,17,17,.35); display:flex; align-items:center; justify-content:center; line-height:1; }
.mg-ghost.suck { transition:transform .13s ease-in, opacity .13s; transform:translate(-50%,-50%) scale(.4); opacity:.4; }
.mg-ring { position:fixed; z-index:140; pointer-events:none; border-radius:50%; border:5px solid var(--rar); transform:translate(-50%,-50%) scale(.3);
  transition:transform .5s cubic-bezier(.2,.8,.3,1), opacity .5s; }
.mg-spark { position:fixed; z-index:141; pointer-events:none; width:9px; height:9px; border-radius:3px; border:1.5px solid var(--ink);
  transition:transform .55s cubic-bezier(.2,.8,.3,1), opacity .55s; }
.mg-big { position:fixed; left:50%; top:40%; z-index:160; pointer-events:none; transform:translate(-50%,-50%) rotate(-6deg);
  font-family:var(--display); font-weight:900; font-size:46px; letter-spacing:-2px; text-transform:uppercase; color:var(--rar);
  -webkit-text-stroke:2px var(--ink); text-shadow:0 5px 0 var(--ink); white-space:nowrap; animation:mg-bigin .5s cubic-bezier(.2,1.8,.4,1); }
.mg-combo { position:fixed; z-index:160; pointer-events:none; transform:translate(-50%,-50%) rotate(-4deg); font-family:var(--display); font-weight:900;
  font-size:22px; background:var(--yellow); border:2.5px solid var(--ink); border-radius:12px; padding:2px 10px; box-shadow:0 3px 0 var(--ink);
  white-space:nowrap; animation:mg-bigin .35s cubic-bezier(.2,1.8,.4,1); }

.mg-bottom { flex-shrink:0; padding:10px 12px calc(12px + var(--safe-bottom, 0px)); display:flex; flex-direction:column; gap:8px; }
.mg-info { min-height:58px; background:#fff; border:var(--bd); border-radius:18px; box-shadow:0 4px 0 var(--ink); padding:8px 12px;
  display:flex; align-items:center; gap:10px; }
.mg-info-em { font-size:36px; line-height:1; flex-shrink:0; }
.mg-info-body { display:flex; flex-direction:column; gap:3px; min-width:0; }
.mg-info-name { font-family:var(--display); font-weight:800; font-size:15px; letter-spacing:-.3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.mg-info-next { font-size:12px; font-weight:800; color:var(--ink-soft); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mg-hint { font-size:13px; font-weight:800; line-height:1.3; }
.mg-actions { display:flex; gap:8px; }
.mg-actions .btn { flex:1; min-height:46px; padding:8px 10px; font-size:14px; white-space:nowrap; }
.mg-actions .mg-bag { flex:0 0 auto; }

.mg-list { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; }
.mg-li { position:relative; aspect-ratio:1; border:2.5px solid var(--ink); border-radius:14px; background:#fff; box-shadow:inset 0 -6px 0 var(--rar), 0 3px 0 var(--ink);
  font-size:30px; display:flex; align-items:center; justify-content:center; padding:0; cursor:pointer; }
.mg-li:active { transform:translateY(2px); }
.mg-li-n { position:absolute; right:-5px; top:-6px; font-family:var(--display); font-weight:800; font-size:11px; background:var(--ink); color:var(--lime);
  border-radius:99px; padding:1px 6px; }
.mg-mtitle { font-family:var(--display); font-weight:900; font-size:20px; text-transform:uppercase; text-align:center; letter-spacing:-.5px; }
.mg-empty { text-align:center; font-weight:800; color:var(--ink-soft); padding:10px 0; }

@keyframes mg-bump { 40% { transform:scale(1.25); } }
@keyframes mg-shake { 20%,60% { transform:translateX(-6px) rotate(-4deg); } 40%,80% { transform:translateX(6px) rotate(4deg); } }
@keyframes mg-puff { 50% { transform:scale(.88); } }
@keyframes mg-pop { 0% { transform:scale(.35); } 60% { transform:scale(1.2); } 100% { transform:scale(1); } }
@keyframes mg-drop { 0% { transform:translateY(-40px) scale(.6); } 100% { transform:none; } }
@keyframes mg-wob { 0%,100% { transform:rotate(0); } 25% { transform:rotate(-8deg) scale(1.06); } 75% { transform:rotate(8deg) scale(1.06); } }
@keyframes mg-glow { 50% { box-shadow:inset 0 -6px 0 var(--rar), 0 2px 0 var(--ink), 0 0 14px 3px var(--rar); } }
@keyframes mg-bigin { 0% { transform:translate(-50%,-50%) scale(.3) rotate(-20deg); } 100% { transform:translate(-50%,-50%) rotate(-6deg); } }
`;

const cap = (w) => w.charAt(0) + w.slice(1).toLowerCase();
const rarVar = (r) => `var(--r-${r})`;

// ---------- Игра ----------

export function mount(root, ctx) {
  const store = ctx.store;
  const S = store.state;
  S.progress.merge = S.progress.merge || {};
  let cells = sanitizeCells(S.progress.merge.cells);
  S.progress.merge.cells = cells;

  root.classList.add('mg-root');
  root.innerHTML = '';
  root.append(h('style', CSS));

  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const retrigger = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  let sel = -1;
  let combo = 0, lastMerge = 0;
  let cellPx = 48;

  function save() {
    S.progress.merge.cells = cells;
    store.commit();
  }

  // ----- Верх -----
  const energyPill = h('div.mg-pill', '⚡' + S.energy);
  let shownEnergy = S.energy;
  const top = h('div.game-top.mg-top',
    h('button.btn-icon', { onclick: () => { save(); ctx.exit(); } }, '✕'),
    h('div.game-title', '✨ Мердж'),
    energyPill,
  );
  function updEnergy() {
    if (S.energy !== shownEnergy) { shownEnergy = S.energy; energyPill.textContent = '⚡' + S.energy; retrigger(energyPill, 'bump'); }
  }
  const unsub = store.subscribe ? store.subscribe(updEnergy) : null;

  // ----- Генераторы -----
  const cats = mergeCats(S);
  const left = PLACES.length - (S.progress.places || []).length;
  const gens = h('div.mg-gens', ...cats.map((cat) => {
    const b = h('button.mg-gen', { 'data-cat': cat },
      h('span.mg-gen-ic', CATEGORIES[cat].icon), h('span.mg-gen-name', CATEGORIES[cat].name), h('span.mg-gen-cost', GEN_COST + '⚡'), h('span.mg-gen-ch'));
    b.addEventListener('click', () => generate(cat, b));
    return b;
  }), left > 0 ? h('button.mg-gen.mg-lock', { onclick: () => toast('Новые генераторы — это новые темы. Собери в Эрудите название места: САД, ЛЕС, КАФЕ, ШКАФ…', 3600) },
    h('span.mg-gen-ic', '🔒'), h('span.mg-gen-name', 'ещё темы')) : null);
  const genState = () => ((S.progress.merge ||= { cells: [] }).gens ||= {});
  function updGens() {
    const now = Date.now();
    for (const b of gens.children) {
      if (!b.dataset.cat) continue;
      const g = genCharges(genState()[b.dataset.cat], now);
      const ch = b.querySelector('.mg-gen-ch');
      if (g.charges > 0) { ch.textContent = `${g.charges}/${GEN_MAX}`; b.classList.remove('empty'); }
      else { ch.textContent = '⏳' + Math.ceil((g.at + GEN_RECHARGE - now) / 60000) + 'м'; b.classList.add('empty'); }
    }
  }
  updGens();
  const genTimer = setInterval(updGens, 20000);

  // ----- Поле -----
  const board = h('div.mg-board');
  const cellEls = [];
  for (let i = 0; i < SIZE; i++) { const c = h('div.mg-cell', { 'data-i': i }); cellEls.push(c); board.append(c); }
  const wrap = h('div.mg-wrap', board);

  // ----- Низ -----
  const info = h('div.mg-info');
  const actions = h('div.mg-actions');
  const bottom = h('div.mg-bottom', info, actions);

  root.append(top, gens, wrap, bottom);

  function layout() {
    const w = wrap.clientWidth - 20, hh = wrap.clientHeight - 8;
    const pad = 12 + 6, gap = 4;
    const byW = (Math.min(w, 460) - pad - gap * (COLS - 1)) / COLS;
    const byH = (hh - pad - gap * (ROWS - 1)) / ROWS;
    cellPx = Math.max(28, Math.floor(Math.min(byW, byH, 70)));
    board.style.gridTemplateColumns = `repeat(${COLS}, ${cellPx}px)`;
    board.style.gridAutoRows = cellPx + 'px';
    board.style.fontSize = Math.round(cellPx * 0.58) + 'px';
  }
  const ro = new ResizeObserver(layout);
  ro.observe(wrap);
  layout();

  function tileEl(id, i) {
    const it = getItem(id);
    const lv = levelOf(id);
    return h('div.mg-tile.rar-' + it.rarity + (i === sel ? '.sel' : ''), { 'data-i': i, style: { '--rar': rarVar(it.rarity) } },
      h('span.em', it.emoji), h('span.lv', String((lv?.index ?? 0) + 1)));
  }
  function renderCell(i, anim) {
    const c = cellEls[i];
    c.innerHTML = '';
    if (cells[i]) {
      const t = tileEl(cells[i], i);
      if (anim) t.classList.add(anim);
      c.append(t);
      return t;
    }
    return null;
  }
  function renderAll() { for (let i = 0; i < SIZE; i++) renderCell(i); }
  const tileAt = (i) => cellEls[i].querySelector('.mg-tile');
  function cellCenter(i) {
    const r = cellEls[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // ----- Панель выбора -----
  function renderPanel() {
    info.innerHTML = ''; actions.innerHTML = '';
    const bagBtn = h('button.btn.btn-ghost.mg-bag', { onclick: openBag }, sel >= 0 ? '🎒' : '🎒 Из сумки');
    if (sel < 0 || !cells[sel]) {
      sel = -1;
      info.append(h('div.mg-hint', `Тапни генератор (${GEN_COST}⚡) и тащи одинаковые вещи друг на друга — получится вещь круче.`));
      actions.append(bagBtn);
      return;
    }
    const id = cells[sel];
    const it = getItem(id);
    const nx = nextOf(id);
    info.append(
      h('div.mg-info-em', it.emoji),
      h('div.mg-info-body',
        h('div.mg-info-name', cap(it.word), h('span.rar-tag', { style: { '--rar': rarVar(it.rarity) } }, RARITY[it.rarity].name)),
        h('div.mg-info-next', nx ? `→ следующая: ${getItem(nx).emoji} ${cap(getItem(nx).word)}` : '★ Максимум цепочки'),
      ),
    );
    actions.append(bagBtn,
      h('button.btn.btn-green', { onclick: toBag }, '📦 В сумку'),
      h('button.btn.btn-ghost', { onclick: sell }, '🗑 Убрать'),
    );
  }
  function select(i) {
    const prev = sel;
    sel = i;
    if (prev >= 0) tileAt(prev)?.classList.remove('sel');
    if (sel >= 0) tileAt(sel)?.classList.add('sel');
    renderPanel();
  }

  function toBag() {
    if (sel < 0 || !cells[sel]) return;
    const i = sel, id = cells[i];
    const from = cellCenter(i);
    cells[i] = null;
    sel = -1;
    renderCell(i);
    store.addItem(id);
    save();
    sfx('reward'); buzz(8);
    renderPanel();
    flyTo(getItem(id).emoji, from, '.mg-bag');
    bump();
  }
  function sell() {
    if (sel < 0 || !cells[sel]) return;
    const i = sel, id = cells[i];
    const at = cellCenter(i);
    cells[i] = null;
    sel = -1;
    renderCell(i);
    // без энергии взамен: иначе генератор + продажа = бесконечная энергия
    save();
    sfx('tap'); buzz(8);
    renderPanel();
    bump();
  }

  // ----- Генерация -----
  function generate(cat, btn) {
    bump();
    const free = randomFreeCell(cells);
    if (free < 0) { toast('Поле заполнено — забери что-нибудь в сумку'); sfx('error'); retrigger(btn, 'shake'); return; }
    const gs = genState();
    let g = genCharges(gs[cat]);
    // пустой генератор можно зарядить эссенцией (абстрактные слова из Эрудита)
    if (g.charges <= 0) {
      const ess = Object.keys(S.items).find((id) => id.startsWith('ess:') && S.items[id] > 0);
      if (ess && store.removeItem(ess)) {
        g = { charges: 1, at: g.at };
        toast(`✨ «${ess.slice(4).toLowerCase()}» зарядила генератор`);
      }
    }
    if (g.charges <= 0) {
      toast(`Генератор отдыхает — заряд через ${Math.ceil((g.at + GEN_RECHARGE - Date.now()) / 60000)} мин. Или заряди эссенцией ✨: собери в Эрудите слово-чувство — МЕЧТА, РАДОСТЬ, СМЕХ`, 3600); sfx('error'); retrigger(btn, 'shake'); return;
    }
    if (!store.spendEnergy(GEN_COST)) {
      toast('Нужна ⚡ — сожги лишнее в печи'); sfx('error'); buzz([20, 40, 20]); retrigger(btn, 'shake'); return;
    }
    gs[cat] = { charges: g.charges - 1, at: g.charges >= GEN_MAX ? Date.now() : g.at };
    updGens();
    updEnergy();
    cells[free] = spawnId(cat);
    save();
    renderCell(free, 'drop');
    retrigger(btn, 'puff');
    sfx('tap'); buzz(6);
  }

  // ----- Из сумки -----
  function openBag() {
    bump();
    const listEl = h('div.mg-list');
    const m = modal([
      h('div.mg-mtitle', '🎒 Из сумки'),
      listEl,
      h('button.btn.btn-dark', { onclick: () => m.close() }, 'Готово'),
    ]);
    function fill() {
      listEl.innerHTML = '';
      const ids = Object.keys(S.items).filter((id) => !id.startsWith('card:') && !id.startsWith('ess:') && S.items[id] > 0 && levelOf(id))
        .sort((a, b) => getItem(a).cat.localeCompare(getItem(b).cat) || levelOf(a).index - levelOf(b).index);
      if (!ids.length) { listEl.style.display = 'block'; listEl.append(h('div.mg-empty', 'Подходящих вещей в сумке нет')); return; }
      listEl.style.display = '';
      for (const id of ids) {
        const it = getItem(id);
        listEl.append(h('button.mg-li', { style: { '--rar': rarVar(it.rarity) }, title: cap(it.word), onclick: () => {
          const free = randomFreeCell(cells);
          if (free < 0) { toast('Поле заполнено — забери что-нибудь в сумку'); sfx('error'); return; }
          if (!store.removeItem(id)) return;
          cells[free] = id;
          save();
          renderCell(free, 'drop');
          sfx('tap'); buzz(6);
          fill();
        } }, it.emoji, h('span.mg-li-n', '×' + S.items[id])));
      }
    }
    fill();
  }

  // ----- Слияние и эффекты -----
  function burst(at, color, n = 12) {
    const ring = h('div.mg-ring', { style: { left: at.x + 'px', top: at.y + 'px', width: cellPx * 1.6 + 'px', height: cellPx * 1.6 + 'px', '--rar': color } });
    document.body.append(ring);
    requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.transform = 'translate(-50%,-50%) scale(1.6)'; ring.style.opacity = '0'; }));
    later(() => ring.remove(), 560);
    const colors = [color, 'var(--lime)', 'var(--yellow)', 'var(--pink)', '#fff'];
    for (let k = 0; k < n; k++) {
      const p = h('div.mg-spark', { style: { left: at.x - 4 + 'px', top: at.y - 4 + 'px', background: colors[k % colors.length] } });
      document.body.append(p);
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.5, d = cellPx * (0.8 + Math.random() * 0.9);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        p.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) rotate(${Math.random() * 360}deg) scale(.4)`;
        p.style.opacity = '0';
      }));
      later(() => p.remove(), 600);
    }
  }
  function bigText(text, color) {
    const el = h('div.mg-big', { style: { '--rar': color } }, text);
    document.body.append(el);
    later(() => el.remove(), 1300);
  }
  function comboText(n, at) {
    const el = h('div.mg-combo', { style: { left: at.x + 'px', top: at.y - cellPx * 0.9 + 'px' } }, n >= 3 ? `×${n} КОМБО!` : `×${n}`);
    document.body.append(el);
    later(() => el.remove(), 900);
  }

  function doMerge(to, result) {
    const it = getItem(result);
    const lv = levelOf(result);
    const at = cellCenter(to);
    const color = rarVar(it.rarity);
    const t = renderCell(to, 'pop');
    burst(at, color, it.rarity === 'c' ? 10 : 16);
    sfx('coin'); buzz(10);
    const now = Date.now();
    combo = now - lastMerge <= COMBO_WINDOW ? combo + 1 : 1;
    lastMerge = now;
    if (combo >= 2) comboText(combo, at);
    if (!S.dex[result]) {
      S.dex[result] = 1;
      if (t) {
        const badge = h('span.mg-new', 'НОВОЕ');
        t.append(badge);
        later(() => badge.remove(), 3500);
      }
    }
    if (it.rarity === 'e' || it.rarity === 'l') {
      bigText(it.rarity === 'l' ? 'ЛЕГЕНДА!' : 'ЭПИК!', color);
      confetti(at.x, at.y, it.rarity === 'l' ? 50 : 32); // confetti сам играет sfx('win')
      buzz([20, 40, 30]);
    }
    save();
    gainXP(2 + lv.index * 2, { x: at.x, y: at.y - cellPx * 0.5 });
  }

  function drop(from, to, ghost) {
    const res = applyDrop(cells, from, to);
    const finish = () => { ghost?.remove(); };
    if (res.type === 'merge') {
      if (ghost) {
        const c = cellCenter(to);
        ghost.style.left = c.x + 'px'; ghost.style.top = c.y + 'px';
        ghost.classList.add('suck');
        const tt = tileAt(to); if (tt) tt.style.transform = 'scale(.75)';
      }
      cells = res.cells;
      later(() => {
        finish();
        renderCell(from);
        sel = to;
        doMerge(to, res.result);
        renderPanel();
      }, ghost ? 130 : 0);
      return;
    }
    finish();
    if (res.type === 'move') {
      cells = res.cells;
      renderCell(from);
      if (sel === from) sel = to;
      renderCell(to, 'pop');
      save();
      sfx('tap');
      renderPanel();
      return;
    }
    tileAt(from)?.classList.remove('lift');
    if (res.type === 'max') { toast('Максимум!'); sfx('error'); retrigger(tileAt(to), 'pop'); }
  }

  // ----- Перетаскивание -----
  let drag = null; // { i, x0, y0, id, pid, ghost, over }
  const cellFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.('.mg-cell');
    return el && board.contains(el) ? +el.dataset.i : -1;
  };
  function setOver(i) {
    if (drag.over === i) return;
    if (drag.over >= 0) cellEls[drag.over].classList.remove('over', 'ok');
    drag.over = i;
    if (i >= 0 && i !== drag.i) {
      cellEls[i].classList.add('over');
      if (!cells[i] || canMerge(cells[i], drag.id)) cellEls[i].classList.add('ok');
    }
  }
  function onDown(e) {
    if (drag) return;
    const tile = e.target.closest('.mg-tile');
    bump();
    if (!tile) { if (e.target.closest('.mg-cell')) select(-1); return; }
    const i = +tile.dataset.i;
    drag = { i, x0: e.clientX, y0: e.clientY, id: cells[i], pid: e.pointerId, ghost: null, over: -1 };
    try { board.setPointerCapture(e.pointerId); } catch { /* ок */ }
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 7) return;
      const it = getItem(drag.id);
      drag.ghost = h('div.mg-ghost', { style: { width: cellPx + 'px', height: cellPx + 'px', fontSize: Math.round(cellPx * 0.58) + 'px', '--rar': rarVar(it.rarity) } }, it.emoji);
      document.body.append(drag.ghost);
      tileAt(drag.i)?.classList.add('lift');
      sfx('tap');
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    setOver(cellFromPoint(e.clientX, e.clientY));
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    if (d.over >= 0) cellEls[d.over].classList.remove('over', 'ok');
    drag = null;
    if (!d.ghost) { select(sel === d.i ? -1 : d.i); sfx('tap'); return; }
    const to = e.type === 'pointercancel' ? -1 : cellFromPoint(e.clientX, e.clientY);
    if (to < 0 || to === d.i) { d.ghost.remove(); tileAt(d.i)?.classList.remove('lift'); return; }
    drop(d.i, to, d.ghost);
    bump();
  }
  board.addEventListener('pointerdown', onDown);
  board.addEventListener('pointermove', onMove);
  board.addEventListener('pointerup', onUp);
  board.addEventListener('pointercancel', onUp);

  // ----- Подсказка пар после простоя -----
  let idleT = null;
  let wobbling = [];
  function clearWob() { wobbling.forEach((i) => tileAt(i)?.classList.remove('wob')); wobbling = []; }
  function bump() {
    clearWob();
    clearTimeout(idleT);
    idleT = setTimeout(() => {
      if (drag) return bump();
      const pair = findPair(cells);
      if (pair) { wobbling = pair; pair.forEach((i) => tileAt(i)?.classList.add('wob')); }
    }, IDLE_HINT);
  }

  renderAll();
  renderPanel();
  bump();

  return () => {
    clearInterval(genTimer);
    clearTimeout(idleT);
    timers.forEach(clearTimeout);
    ro.disconnect();
    unsub && unsub();
    drag?.ghost?.remove();
    document.querySelectorAll('.mg-ghost, .mg-ring, .mg-spark, .mg-big, .mg-combo').forEach((el) => el.remove());
    save();
  };
}
