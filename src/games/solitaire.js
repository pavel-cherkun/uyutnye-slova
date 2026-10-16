// Мини-игра «Пасьянс в слова»: раскладывай карты-слова по стопкам категорий.
// Логика (раздача, ходы, отмена, подсказка, жадный решатель) отделена от рендера
// и не трогает DOM — её можно гонять в node.

import { ITEMS, CATEGORIES, getItem } from '../data/items.js';
import * as WORDS from '../data/words.js';
import { h, toast, confetti, modal, confirmDialog, shuffle } from '../ui/common.js';

export const meta = {
  id: 'solitaire',
  title: 'Пасьянс в слова',
  emoji: '🃏',
  desc: 'Раскладывай слова по категориям',
  cost: { energy: 4 },
  gives: 'карточки-слова, предметы',
};

// ======================================================================
// Логика
// ======================================================================

export const COLS = 4;
const UNDO_MAX = 3;
const EXTRA_MOVES = 10;
const EXTRA_COST = 3;
const MOVE_K = 1.6;        // лимит ходов = карт × MOVE_K
const MAX_LEN = 9;         // слова длиннее не помещаются на карту
const DEAL_TRIES = 40;     // сколько раздач перебрать в поисках решаемой
const MOVE_SLACK = 0.25;   // запас к ходам жадного решателя, доля от числа карт
const HISTORY_MAX = 60;

/** Параметры уровня: K категорий, N слов в каждой, slots ячеек-стопок. */
export function levelParams(level) {
  const K = level <= 2 ? 3 : level <= 6 ? 4 : 5;
  const N = level <= 5 ? 4 : level <= 9 ? 5 : level <= 15 ? 6 : 7;
  // На первых уровнях ячеек хватает на все категории, дальше на одну меньше —
  // приходится закрывать стопки, чтобы освободить место.
  const slots = K <= 3 ? K : K - 1;
  return { K, N, slots };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ITEM_WORDS = new Set(ITEMS.map((it) => it.word));
function cardWordEntries() {
  const cw = WORDS.CARD_WORDS || {};
  return cw instanceof Map ? [...cw.entries()] : Object.entries(cw);
}

/** Все слова категории: предметы (с эмодзи) + карточки-слова (с иконкой категории). */
export function categoryWords(cat) {
  const out = [];
  const seen = new Set();
  for (const it of ITEMS) {
    if (it.cat !== cat || seen.has(it.word)) continue;
    seen.add(it.word);
    out.push({ word: it.word, emoji: it.emoji, item: true });
  }
  const icon = (CATEGORIES[cat] && CATEGORIES[cat].icon) || '🃏';
  for (const [w, c] of cardWordEntries()) {
    if (c !== cat || seen.has(w) || ITEM_WORDS.has(w)) continue;
    seen.add(w);
    out.push({ word: w, emoji: icon, item: false });
  }
  return out;
}

export function eligibleCategories(N, maxLen = MAX_LEN) {
  return Object.keys(CATEGORIES).filter((c) => c !== 'misc' && c !== 'essence'
    && categoryWords(c).filter((w) => w.word.length <= maxLen).length >= N);
}

function snap(g) {
  return JSON.stringify({
    cols: g.cols, stock: g.stock, waste: g.waste, found: g.found,
    done: g.done, closedAt: g.closedAt, moves: g.moves,
  });
}
function restore(g, s) { Object.assign(g, JSON.parse(s)); }

/** Копия партии без истории (карты общие — они неизменяемые). */
export function cloneGame(g) { return { ...g, ...JSON.parse(snap(g)), history: [] }; }

function dealWith(base, rng) {
  const ids = shuffle(Object.keys(base.cards), rng);
  const T = ids.length;
  const downs = T < 24 ? [0, 1, 2, 3] : [1, 2, 3, 4];
  const cols = downs.map((d) => ({ ids: ids.splice(0, d + 1), down: d }));
  return {
    ...base,
    cols,
    stock: ids,              // верх колоды — последний элемент
    waste: [],               // верх сброса — последний элемент
    found: Array(base.slots).fill(null), // { cat, ids: [catId, ...words] }
    done: [],
    closedAt: {},
    moves: 0,
    limit: Math.ceil(T * MOVE_K),
    history: [],
    undoLeft: UNDO_MAX,
    extraUsed: false,
  };
}

/** Новая партия уровня. Детерминированна по номеру уровня. */
export function newGame(level, opts = {}) {
  level = Math.max(1, level | 0);
  const p = levelParams(level);
  const seed = opts.seed ?? level; // seed — только для тестов: другие раздачи с параметрами этого уровня
  const rngCat = mulberry32(seed * 9973 + 17);
  let maxLen = MAX_LEN;
  let eligible = eligibleCategories(p.N, maxLen);
  if (eligible.length < p.K) { maxLen = 99; eligible = eligibleCategories(p.N, maxLen); }
  if (eligible.length < p.K) p.K = Math.max(1, eligible.length);
  if (p.slots > p.K) p.slots = p.K;
  const own = opts.own || null; // { cat: ['СЛОВО', ...] } — карточки игрока
  const cats = own ? Object.keys(own).slice(0, p.K) : shuffle(eligible, rngCat).slice(0, p.K);
  if (own) { p.K = cats.length; if (p.slots > p.K) p.slots = p.K; }

  const cards = {};
  const catWords = {};
  const used = new Set();
  let n = 0;
  for (const cat of cats) {
    const pool = shuffle(categoryWords(cat).filter((w) => !used.has(w.word)), rngCat);
    const short = pool.filter((w) => w.word.length <= maxLen);
    const long = pool.filter((w) => w.word.length > maxLen);
    const mine = own ? (own[cat] || []).filter((w) => !used.has(w)).slice(0, p.N)
      .map((w) => ({ word: w, emoji: CATEGORIES[cat].icon, item: false, own: true })) : [];
    const rest = [...short, ...long].filter((w) => !mine.some((m) => m.word === w.word));
    const chosen = [...mine, ...rest].slice(0, p.N);
    catWords[cat] = chosen;
    cards['k:' + cat] = { id: 'k:' + cat, kind: 'cat', cat, word: CATEGORIES[cat].name, emoji: CATEGORIES[cat].icon };
    for (const w of chosen) {
      used.add(w.word);
      const id = 'w' + (n++);
      cards[id] = { id, kind: 'word', cat, word: w.word, emoji: w.emoji, item: w.item, own: !!w.own };
    }
  }
  const base = { level, cats, N: p.N, slots: p.slots, cards, catWords };

  // Берём первую раздачу, которую жадный решатель проходит; лимит ходов — ~карт×1.6,
  // но не меньше, чем решателю нужно, плюс запас (жадный решатель много листает колоду).
  const T = Object.keys(cards).length;
  const tries = opts.tries ?? DEAL_TRIES;
  let g = null;
  for (let a = 0; a < tries; a++) {
    const d = dealWith(base, mulberry32(seed * 7919 + a * 104729 + 1));
    const sim = cloneGame(d);
    if (greedySolve(sim)) {
      g = d;
      g.solverMoves = sim.moves;
      g.limit = Math.max(Math.ceil(T * MOVE_K), sim.moves + Math.ceil(T * MOVE_SLACK));
      break;
    }
  }
  if (!g) {
    g = dealWith(base, mulberry32(seed * 7919 + 1));
    g.solverMoves = null;
    g.limit = Math.ceil(T * 2);
  }
  return g;
}

function seriesOf(g, src) {
  if (!src) return [];
  if (src.from === 'waste') return g.waste.length ? [g.waste[g.waste.length - 1]] : [];
  if (src.from !== 'col') return [];
  const c = g.cols[src.col];
  if (!c || src.idx < c.down || src.idx >= c.ids.length) return [];
  return c.ids.slice(src.idx);
}
export { seriesOf };

/** Можно ли положить серию src в dst ({to:'found', slot} | {to:'col', col}). */
export function canDrop(g, src, dst) {
  const s = seriesOf(g, src);
  if (!s.length || !dst) return false;
  const C = g.cards;
  const cat = C[s[0]].cat;
  if (s.some((id) => C[id].cat !== cat)) return false;
  if (dst.to === 'found') {
    if (!(dst.slot >= 0 && dst.slot < g.slots)) return false;
    const f = g.found[dst.slot];
    if (!f) {
      if (g.found.some((x) => x && x.cat === cat)) return false;
      return C[s[0]].kind === 'cat' && s.slice(1).every((id) => C[id].kind === 'word');
    }
    return f.cat === cat && s.every((id) => C[id].kind === 'word');
  }
  if (dst.to === 'col') {
    if (src.from === 'col' && src.col === dst.col) return false;
    const c = g.cols[dst.col];
    if (!c) return false;
    if (!c.ids.length) return true;
    return C[c.ids[c.ids.length - 1]].cat === cat;
  }
  return false;
}

export function targetsFor(g, src) {
  const out = [];
  for (let i = 0; i < g.slots; i++) if (canDrop(g, src, { to: 'found', slot: i })) out.push({ to: 'found', slot: i });
  for (let i = 0; i < g.cols.length; i++) if (canDrop(g, src, { to: 'col', col: i })) out.push({ to: 'col', col: i });
  return out;
}

/** Куда автоматически отправить серию по тапу. null — некуда. */
export function autoTarget(g, src) {
  for (let i = 0; i < g.slots; i++) if (g.found[i] && canDrop(g, src, { to: 'found', slot: i })) return { to: 'found', slot: i };
  for (let i = 0; i < g.slots; i++) if (!g.found[i] && canDrop(g, src, { to: 'found', slot: i })) return { to: 'found', slot: i };
  for (let i = 0; i < g.cols.length; i++) {
    if (g.cols[i].ids.length && canDrop(g, src, { to: 'col', col: i })) return { to: 'col', col: i };
  }
  // в пустую колонку — только если это что-то даёт: со сброса или чтобы открыть закрытую карту
  // (иначе тап по одной и той же карте гонял бы её туда-обратно)
  const sc = src.from === 'col' ? g.cols[src.col] : null;
  if (!sc || (sc.down > 0 && src.idx === sc.down)) {
    for (let i = 0; i < g.cols.length; i++) {
      if (!g.cols[i].ids.length && canDrop(g, src, { to: 'col', col: i })) return { to: 'col', col: i };
    }
  }
  return null;
}

function pushHistory(g) {
  g.history.push(snap(g));
  if (g.history.length > HISTORY_MAX) g.history.shift();
}

/**
 * Применить ход. Возвращает событие { moved, flipped, closed } или null, если ход недопустим.
 * closed = { cat, slot, ids } — стопка собрана и закрыта.
 */
export function applyMove(g, src, dst) {
  if (!canDrop(g, src, dst)) return null;
  pushHistory(g);
  const s = seriesOf(g, src);
  if (src.from === 'waste') g.waste.pop();
  else g.cols[src.col].ids.splice(src.idx);
  const ev = { moved: s, flipped: null, closed: null };
  if (dst.to === 'found') {
    let f = g.found[dst.slot];
    if (!f) f = g.found[dst.slot] = { cat: g.cards[s[0]].cat, ids: [] };
    f.ids.push(...s);
    const words = f.ids.filter((id) => g.cards[id].kind === 'word').length;
    if (words >= g.N) {
      g.done.push(f.cat);
      g.closedAt[f.cat] = dst.slot;
      ev.closed = { cat: f.cat, slot: dst.slot, ids: [...f.ids] };
      g.found[dst.slot] = null;
    }
  } else {
    g.cols[dst.col].ids.push(...s);
  }
  if (src.from === 'col') {
    const c = g.cols[src.col];
    if (c.ids.length && c.down >= c.ids.length) {
      c.down = c.ids.length - 1;
      ev.flipped = c.ids[c.ids.length - 1];
    }
    if (!c.ids.length) c.down = 0;
  }
  g.moves++;
  return ev;
}

/** Тап по колоде: открыть верхнюю карту или перевернуть сброс обратно. */
export function drawStock(g) {
  if (g.stock.length) {
    pushHistory(g);
    const id = g.stock.pop();
    g.waste.push(id);
    g.moves++;
    return { drew: id };
  }
  if (g.waste.length) {
    pushHistory(g);
    g.stock = g.waste.reverse();
    g.waste = [];
    g.moves++;
    return { recycled: true };
  }
  return null;
}

export function undo(g) {
  if (!g.history.length) return false;
  restore(g, g.history.pop());
  return true;
}

export const isWon = (g) => g.done.length >= g.cats.length;
export const movesLeft = (g) => Math.max(0, g.limit - g.moves);

/**
 * Полезный ход для подсказки / жадного решателя.
 * { src, dst } | { stock: true } | null
 */
export function findHint(g) {
  const wsrc = g.waste.length ? { from: 'waste' } : null;
  // 1. На стопку категорий
  const toFound = (src) => {
    for (let i = 0; i < g.slots; i++) if (canDrop(g, src, { to: 'found', slot: i })) return { to: 'found', slot: i };
    return null;
  };
  if (wsrc) { const d = toFound(wsrc); if (d) return { src: wsrc, dst: d }; }
  for (let c = 0; c < g.cols.length; c++) {
    const col = g.cols[c];
    for (let i = col.down; i < col.ids.length; i++) {
      const src = { from: 'col', col: c, idx: i };
      const d = toFound(src);
      if (d) return { src, dst: d };
    }
  }
  const toCol = (src, allowEmpty) => {
    for (let i = 0; i < g.cols.length; i++) if (g.cols[i].ids.length && canDrop(g, src, { to: 'col', col: i })) return { to: 'col', col: i };
    if (allowEmpty) for (let i = 0; i < g.cols.length; i++) if (!g.cols[i].ids.length && canDrop(g, src, { to: 'col', col: i })) return { to: 'col', col: i };
    return null;
  };
  // 2. Переложить открытую серию, чтобы открыть закрытую карту
  for (let c = 0; c < g.cols.length; c++) {
    const col = g.cols[c];
    if (col.down > 0 && col.ids.length) {
      const src = { from: 'col', col: c, idx: col.down };
      const d = toCol(src, true);
      if (d) return { src, dst: d };
    }
  }
  // 3. Со сброса в колонку
  if (wsrc) { const d = toCol(wsrc, true); if (d) return { src: wsrc, dst: d }; }
  // 4. Объединить колонки одной категории (освобождает колонку)
  for (let c = 0; c < g.cols.length; c++) {
    const col = g.cols[c];
    if (col.down === 0 && col.ids.length && (g.stock.length || g.waste.length)) {
      const src = { from: 'col', col: c, idx: 0 };
      const d = toCol(src, false);
      if (d) return { src, dst: d };
    }
  }
  // 5. Колода
  if (g.stock.length || g.waste.length) return { stock: true };
  return null;
}

/** Жадный решатель (мутирует g). true — пасьянс сошёлся. */
export function greedySolve(g, maxMoves = Infinity) {
  let stockRun = 0, cycle = 0;
  for (let step = 0; step < 3000; step++) {
    if (isWon(g)) return true;
    if (g.moves >= maxMoves) return false;
    const hint = findHint(g);
    if (!hint) return false;
    if (hint.stock) {
      if (stockRun === 0) cycle = g.stock.length + g.waste.length + 1;
      if (++stockRun > cycle) return false;
      drawStock(g);
    } else {
      stockRun = 0;
      applyMove(g, hint.src, hint.dst);
    }
  }
  return isWon(g);
}

/** Награда. rng — для случайностей (по умолчанию Math.random). */
export function buildReward(g, won, rng = Math.random, owned = {}) {
  // Собранная категория: твои карточки из неё «оживают» в предмет этой категории.
  // Чем больше своих карточек было в стопке — тем выше шанс на редкий предмет.
  const items = {};
  const spent = [];
  const add = (id) => { items[id] = (items[id] || 0) + 1; };
  const pickR = (arr) => arr[Math.floor(rng() * arr.length)];
  for (const cat of g.done) {
    const mine = (g.catWords[cat] || []).filter((w) => w.own);
    for (const w of mine) spent.push('card:' + w.word);
    const its = ITEMS.filter((it) => it.cat === cat);
    if (!its.length) continue;
    const roll = rng();
    const rar = mine.length >= 4 ? (roll < 0.35 ? 'e' : 'r') : mine.length >= 3 ? (roll < 0.5 ? 'r' : 'c') : 'c';
    let pool = its.filter((it) => it.rarity === rar);
    if (!pool.length) pool = its;
    const fresh = pool.filter((it) => !owned[it.id]); // сначала то, чего у игрока ещё нет
    add(pickR(fresh.length ? fresh : pool).id);
    if (won && mine.length >= 4 && rng() < 0.3) add(pickR(its).id);
  }
  const reward = { coins: won ? 10 + movesLeft(g) : 3 };
  if (won) reward.keys = 1;
  if (Object.keys(items).length) reward.items = items;
  return { reward, spent };
}

/** Карточки-слова игрока по категориям (только категории, где есть предметы). */
export function ownedCards(state, maxLen = MAX_LEN) {
  const by = {};
  for (const id of Object.keys(state.items)) {
    if (!id.startsWith('card:')) continue;
    const it = getItem(id);
    if (it.word.length > maxLen || !ITEMS.some((x) => x.cat === it.cat)) continue;
    (by[it.cat] ||= []).push(it.word);
  }
  return by;
}

export const MIN_OWN = 2;   // минимум своих карточек в категории
export const MIN_CATS = 2;  // минимум категорий

// ======================================================================
// Рендер
// ======================================================================

const PALETTE = {
  furniture: '#ff7a3d', light: '#f5b400', walldecor: '#ff4f8b', decor: '#b95cff',
  plants: '#22c55e', tech: '#3f8cff', dishes: '#12b5a5', music: '#7a5cff',
  pets: '#f2762e', bath: '#06b6d4', food: '#ef4444', drinks: '#b8641c',
  clothes: '#ec4899', accessory: '#d03fd9', tools: '#5f7691', stationery: '#2563eb',
  nature: '#16a34a', transport: '#0ea5e9', sport: '#7cc414', fantasy: '#9333ea',
};
const catColor = (c) => PALETTE[c] || '#7a5cff';

const CSS = `
#game-layer.so-root, .so-root { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden;
  background: radial-gradient(circle at 15% 10%, rgba(255,255,255,.35) 0 12%, transparent 13%),
    radial-gradient(circle at 90% 30%, rgba(255,201,60,.35) 0 9%, transparent 10%),
    radial-gradient(circle at 70% 85%, rgba(255,79,139,.3) 0 14%, transparent 15%),
    linear-gradient(165deg, #5be3c0 0%, #3fa9ff 45%, #8f6bff 80%, #ff6fb5 100%); }
.so-top .game-title { color:#fff; text-shadow:0 2px 0 rgba(43,29,74,.35); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.so-pill { font-weight:900; font-size:14px; background:rgba(255,255,255,.92); border-radius:999px; padding:6px 11px;
  box-shadow:0 3px 0 rgba(43,29,74,.15); white-space:nowrap; font-variant-numeric:tabular-nums; }
.so-pill.bump { animation:so-bump .35s; }
.so-pill.low { background:var(--pink); color:#fff; animation:so-throb .55s infinite alternate; }
@keyframes so-throb { to { transform:scale(1.1); } }
@keyframes so-bump { 40% { transform:scale(1.25); } }

.so-board { position:relative; flex:1; min-height:0; touch-action:none; overflow:hidden; }
.so-safe { position:absolute; width:0; height:env(safe-area-inset-bottom, 0px); visibility:hidden; }

.so-card { position:absolute; left:0; top:0; width:var(--w); height:var(--h); transform-origin:0 0;
  transition:transform .32s cubic-bezier(.3,1.3,.5,1), opacity .3s; will-change:transform; }
.so-card.drag { transition:none; }
.so-card.gone { transition:transform .5s cubic-bezier(.6,-.5,.7,1), opacity .5s .1s; opacity:0; pointer-events:none; }
.so-in { position:absolute; inset:0; border-radius:calc(var(--w) * .13); background:#fff; overflow:hidden;
  box-shadow:0 2px 0 rgba(43,29,74,.2), 0 5px 12px rgba(43,29,74,.22); }
.so-card.drag .so-in { box-shadow:0 10px 24px rgba(43,29,74,.4); transform:rotate(-3deg) scale(1.05); }
.so-face { position:absolute; inset:0; }
.so-own { position:absolute; top:24%; left:6%; font-size:15px; background:#fff; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,.2); }
.so-band { position:absolute; left:0; right:0; top:0; height:27%; background:var(--c);
  display:flex; align-items:flex-start; justify-content:center; padding-top:calc(var(--h) * .045); }
.so-w { color:#fff; font-weight:900; white-space:nowrap; line-height:1.05; font-size:calc(var(--w) * var(--k));
  text-shadow:0 1px 0 rgba(0,0,0,.25); letter-spacing:-.2px; }
.so-e { position:absolute; left:0; right:0; top:30%; bottom:6%; display:flex; align-items:center; justify-content:center;
  font-size:calc(var(--w) * .46); line-height:1; filter:drop-shadow(0 2px 2px rgba(43,29,74,.25)); }
.so-dot { position:absolute; right:6%; bottom:5%; width:16%; height:12%; border-radius:999px; background:var(--c); opacity:.8; }
.so-cat .so-in { background:radial-gradient(circle at 30% 18%, rgba(255,255,255,.6), transparent 55%), var(--c);
  box-shadow:inset 0 0 0 3px #fff, inset 0 0 0 5px #ffc93c, 0 2px 0 rgba(43,29,74,.2), 0 5px 12px rgba(43,29,74,.25); }
.so-cat .so-band { background:transparent; }
.so-cat .so-w { text-transform:uppercase; text-shadow:0 2px 0 rgba(43,29,74,.35); }
.so-cat .so-e { font-size:calc(var(--w) * .5); top:26%; bottom:16%; }
.so-tag { position:absolute; left:0; right:0; bottom:6%; text-align:center; color:#fff; font-weight:900;
  font-size:calc(var(--w) * .085); letter-spacing:.3px; white-space:nowrap; text-shadow:0 1px 0 rgba(43,29,74,.4); }
.so-back { position:absolute; inset:0; display:none; border-radius:inherit;
  background: radial-gradient(circle, #ffc93c 0 22%, transparent 24%) 0 0 / 14px 14px,
    radial-gradient(circle, rgba(255,255,255,.9) 0 14%, transparent 16%) 7px 7px / 14px 14px,
    repeating-linear-gradient(45deg, #ff4f8b 0 7px, #a66bff 7px 14px);
  box-shadow:inset 0 0 0 3px #fff, inset 0 0 0 5px rgba(43,29,74,.15); }
.so-back::after { content:'🃏'; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  font-size:calc(var(--w) * .3); background:#fff; border-radius:50%; width:calc(var(--w) * .44); height:calc(var(--w) * .44);
  display:flex; align-items:center; justify-content:center; box-shadow:0 2px 0 rgba(43,29,74,.2); }
.so-card.down .so-back { display:block; }
.so-card.down .so-face { visibility:hidden; }
.so-in.flip { animation:so-flip .38s cubic-bezier(.3,1.4,.6,1); }
@keyframes so-flip { 0% { transform:perspective(500px) rotateY(95deg) scale(1.08); } 100% { transform:perspective(500px) rotateY(0); } }
.so-in.shake { animation:so-shake .38s; }
@keyframes so-shake { 20%,60% { transform:translateX(-6px) rotate(-2deg); } 40%,80% { transform:translateX(6px) rotate(2deg); } }
.so-in.hint { animation:so-hint .5s ease-in-out 4 alternate; }
@keyframes so-hint { to { transform:translateY(-6px) scale(1.06); box-shadow:0 0 0 4px #ffc93c, 0 0 22px 6px rgba(255,201,60,.95); } }
.so-in.land { animation:so-land .35s .2s; }
@keyframes so-land { 40% { transform:scale(1.12); } }

.so-slot { position:absolute; border-radius:12px; border:3px dashed rgba(255,255,255,.85); background:rgba(255,255,255,.18);
  display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-weight:900;
  font-size:10px; letter-spacing:-.2px; overflow:hidden; text-align:center; text-shadow:0 1px 0 rgba(43,29,74,.35); line-height:1.15; transition:box-shadow .2s, background .2s; }
.so-slot b { font-size:22px; opacity:.85; }
.so-slot.ok, .so-zone.ok { background:rgba(255,255,255,.35); box-shadow:0 0 0 3px #ffe066, 0 0 18px 4px rgba(255,224,102,.8); border-color:#fff; }
.so-slot.hint, .so-zone.hint { animation:so-glow .5s ease-in-out 4 alternate; }
@keyframes so-glow { to { background:rgba(255,255,255,.45); box-shadow:0 0 0 4px #ffc93c, 0 0 22px 6px rgba(255,201,60,.95); } }
.so-count { position:absolute; z-index:450; transform:translate(-50%,-50%); background:var(--ink); color:#fff; font-weight:900;
  font-size:12px; border-radius:999px; padding:3px 8px; box-shadow:0 2px 0 rgba(0,0,0,.25), 0 0 0 2px #fff; white-space:nowrap;
  pointer-events:none; font-variant-numeric:tabular-nums; }
.so-count.bump { animation:so-cbump .4s cubic-bezier(.3,1.8,.6,1); }
@keyframes so-cbump { 40% { transform:translate(-50%,-50%) scale(1.5); } }
.so-zone { position:absolute; border-radius:12px; pointer-events:none; transition:box-shadow .2s, background .2s; }
.so-colbase { position:absolute; border-radius:12px; border:3px dashed rgba(255,255,255,.55); pointer-events:none; }
.so-stockbase { position:absolute; border-radius:12px; border:3px dashed rgba(255,255,255,.85); background:rgba(255,255,255,.2);
  display:flex; align-items:center; justify-content:center; color:#fff; font-size:30px; font-weight:900; text-shadow:0 2px 0 rgba(43,29,74,.3); }
.so-stockbase.hint { animation:so-glow .5s ease-in-out 4 alternate; }
.so-wastebase { position:absolute; border-radius:12px; border:3px dashed rgba(255,255,255,.4); pointer-events:none; }
.so-stockn { position:absolute; z-index:450; transform:translate(-50%,-50%); background:#fff; color:var(--ink); font-weight:900;
  font-size:12px; border-radius:999px; padding:3px 8px; box-shadow:0 2px 0 rgba(43,29,74,.25); pointer-events:none; }
.so-btns { position:absolute; display:flex; gap:10px; align-items:flex-end; z-index:460; }
.so-btn { position:relative; width:56px; height:56px; border-radius:50%; padding:0; font-size:24px; }
.so-btn-n { position:absolute; right:-4px; top:-6px; background:var(--violet); color:#fff; font-size:11px; font-weight:900;
  border-radius:999px; padding:2px 6px; box-shadow:0 2px 0 rgba(0,0,0,.2); }
.so-flash { position:absolute; z-index:470; pointer-events:none; border-radius:50%; transform:translate(-50%,-50%);
  background:radial-gradient(circle, #fff 0 20%, rgba(255,224,102,.9) 35%, rgba(255,79,139,.5) 55%, transparent 70%);
  animation:so-flash .7s ease-out forwards; }
@keyframes so-flash { from { transform:translate(-50%,-50%) scale(.2); opacity:1; } to { transform:translate(-50%,-50%) scale(2.2); opacity:0; } }
.so-pop { position:absolute; z-index:480; pointer-events:none; transform:translate(-50%,-50%); white-space:nowrap;
  background:#fff; color:var(--ink); font-weight:900; font-size:15px; border-radius:999px; padding:6px 12px;
  box-shadow:0 4px 0 rgba(43,29,74,.2), 0 0 0 3px var(--c); animation:so-pop 1.3s cubic-bezier(.3,1.6,.6,1) forwards; }
@keyframes so-pop { 0% { transform:translate(-50%,-50%) scale(.3); } 20% { transform:translate(-50%,-50%) scale(1.1); }
  30% { transform:translate(-50%,-50%) scale(1); } 80% { opacity:1; } 100% { transform:translate(-50%,-160%) scale(1); opacity:0; } }
.so-spark { position:absolute; z-index:475; width:10px; height:10px; border-radius:3px; pointer-events:none; animation:so-spark .75s ease-out forwards; }
@keyframes so-spark { to { transform:translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(.3); opacity:0; } }
.so-modal-text { text-align:center; margin:0; }
`;

const vibrate = (p) => { if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) { /* нет вибрации */ } };

/** Коэффициент размера шрифта слова относительно ширины карты. */
function fontK(word, cap = 0.215) { return Math.min(cap, 0.84 / (Math.max(3, word.length) * 0.62)).toFixed(4); }

function playGame(root, ctx, own) {
  const store = ctx.store;
  const progress = store.state.progress;
  const level = Math.max(1, (progress.solitaireLevel | 0) || 1);
  const g = newGame(level, { own });

  let alive = true;
  let over = false;
  let openModal = null;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };

  function finishWith(won) {
    const { reward, spent } = buildReward(g, won, Math.random, store.state.items);
    for (const id of spent) store.removeItem(id);
    ctx.finish(reward, won ? 'Пасьянс сошёлся!' : 'Ходы закончились');
  }

  root.classList.add('so-root');
  root.innerHTML = '';

  // ---------- Каркас ----------
  const exitBtn = h('button.btn-icon', '✕');
  const catsPill = h('div.so-pill');
  const movesPill = h('div.so-pill');
  const top = h('div.game-top.so-top', exitBtn, h('div.game-title', '🃏 Уровень ' + level), catsPill, movesPill);
  const board = h('div.so-board');
  const safeProbe = h('div.so-safe');
  board.append(safeProbe);
  root.append(h('style', CSS), top, board);

  const slotEls = [], countEls = [], zoneEls = [], colBaseEls = [];
  for (let i = 0; i < g.slots; i++) {
    const s = h('div.so-slot', h('b', '🃏'), 'сюда', h('br'), 'категорию');
    slotEls.push(s);
    const c = h('div.so-count');
    countEls.push(c);
    board.append(s, c);
  }
  for (let i = 0; i < COLS; i++) {
    const cb = h('div.so-colbase');
    const z = h('div.so-zone');
    colBaseEls.push(cb); zoneEls.push(z);
    board.append(cb, z);
  }
  const wasteBase = h('div.so-wastebase');
  const stockBase = h('div.so-stockbase', '↻');
  const stockN = h('div.so-stockn');
  const undoN = h('span.so-btn-n');
  const undoBtn = h('button.btn.btn-violet.so-btn', '↶', undoN);
  const hintBtn = h('button.btn.btn-yellow.so-btn', '💡');
  const btns = h('div.so-btns', undoBtn, hintBtn);
  board.append(wasteBase, stockBase, stockN, btns);

  // ---------- Карты ----------
  const els = new Map(); // id → { el, inner, x, y, s, down, gone, zt }
  function makeCard(id) {
    const c = g.cards[id];
    const isCat = c.kind === 'cat';
    const label = isCat ? c.word : c.word.toLowerCase();
    const face = h('div.so-face',
      h('div.so-band', h('div.so-w', { style: { '--k': fontK(label, isCat ? 0.17 : 0.215) } }, label)),
      h('div.so-e', c.emoji),
      isCat ? h('div.so-tag', '★ КАТЕГОРИЯ ★') : h('div.so-dot'),
      c.own ? h('div.so-own', '🎒') : null,
    );
    const inner = h('div.so-in', face, h('div.so-back'));
    const el = h('div.so-card' + (isCat ? '.so-cat' : '.so-word'), { style: { '--c': catColor(c.cat) } }, inner);
    el.dataset.id = id;
    board.append(el);
    return { el, inner, x: null, y: null, s: 1, down: null, gone: false, zt: null };
  }
  function cardRec(id) {
    let r = els.get(id);
    if (r && !r.gone) return r;
    if (r) r.el.remove();
    r = makeCard(id);
    els.set(id, r);
    return r;
  }
  function restartAnim(inner, cls) {
    inner.classList.remove('flip', 'shake', 'hint', 'land');
    void inner.offsetWidth;
    inner.classList.add(cls);
  }

  // ---------- Геометрия ----------
  let L = null;
  function computeLayout() {
    const W = board.clientWidth, H = board.clientHeight;
    if (!W || !H) return null;
    const pad = 10, gap = 8;
    const safe = safeProbe.offsetHeight || 0;
    let cw = Math.min(104, Math.floor((W - 2 * pad - gap * (COLS - 1)) / COLS));
    let out;
    for (;;) {
      const ch = Math.round(cw * 1.32);
      const S = g.slots;
      const fs = Math.min(0.86, ((W - 2 * pad - gap * (S - 1)) / S) / cw);
      const fw = cw * fs, fh = ch * fs;
      const fy = 6;
      const ty = fy + fh + 14;
      const by = H - safe - 10 - ch;
      const th = by - 10 - ty;
      out = { W, H, pad, gap, cw, ch, fs, fw, fh, fy, ty, by, th, S };
      if (th >= ch * 2.3 || cw <= 46) break;
      cw -= 3;
    }
    const gridW = COLS * out.cw + (COLS - 1) * gap;
    out.colX0 = (W - gridW) / 2;
    out.colX = (i) => out.colX0 + i * (out.cw + gap);
    const sw = out.S * out.fw + (out.S - 1) * gap;
    out.slotX = (i) => (W - sw) / 2 + i * (out.fw + gap);
    out.stockX = out.colX(COLS - 1);
    out.wasteX = out.colX(COLS - 2);
    return out;
  }
  function colOffsets(col) {
    const n = col.down, m = col.ids.length - col.down;
    let dOff = Math.round(L.ch * 0.13), uOff = Math.round(L.ch * 0.3);
    const need = (k1, k2) => n * k1 + Math.max(0, m - 1) * k2 + L.ch;
    if (need(dOff, uOff) > L.th) {
      dOff = Math.max(6, Math.min(dOff, Math.round(L.ch * 0.08)));
      if (m > 1) uOff = Math.max(Math.round(L.ch * 0.17), Math.floor((L.th - L.ch - n * dOff) / (m - 1)));
    }
    return { dOff, uOff };
  }
  function cardPos(id) {
    // ищем, где лежит карта
    for (let c = 0; c < g.cols.length; c++) {
      const col = g.cols[c];
      const i = col.ids.indexOf(id);
      if (i >= 0) {
        const { dOff, uOff } = colOffsets(col);
        const y = L.ty + Math.min(i, col.down) * dOff + Math.max(0, i - col.down) * uOff;
        return { x: L.colX(c), y, s: 1, z: 20 + i, down: i < col.down };
      }
    }
    let i = g.waste.indexOf(id);
    if (i >= 0) return { x: L.wasteX, y: L.by, s: 1, z: 20 + i, down: false };
    i = g.stock.indexOf(id);
    if (i >= 0) return { x: L.stockX, y: L.by - Math.min(i, 6) * 0.6, s: 1, z: 20 + i, down: true };
    for (let sl = 0; sl < g.slots; sl++) {
      const f = g.found[sl];
      if (!f) continue;
      i = f.ids.indexOf(id);
      if (i >= 0) return { x: L.slotX(sl), y: L.fy, s: L.fs, z: 100 + i, down: false };
    }
    return null;
  }
  function locate(id) {
    for (let c = 0; c < g.cols.length; c++) {
      const i = g.cols[c].ids.indexOf(id);
      if (i >= 0) return { from: 'col', col: c, idx: i, down: i < g.cols[c].down };
    }
    const wi = g.waste.indexOf(id);
    if (wi >= 0) return { from: 'waste', top: wi === g.waste.length - 1 };
    if (g.stock.includes(id)) return { from: 'stock' };
    return { from: 'found' };
  }

  function setBox(el, x, y, w, hh) {
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = hh + 'px';
  }

  // ---------- Рендер ----------
  let lastMovesShown = null;
  function render(opts = {}) {
    L = computeLayout();
    if (!L) return;
    board.style.setProperty('--w', L.cw + 'px');
    board.style.setProperty('--h', L.ch + 'px');

    for (let i = 0; i < g.slots; i++) {
      setBox(slotEls[i], L.slotX(i), L.fy, L.fw, L.fh);
      const f = g.found[i];
      const cnt = countEls[i];
      if (f) {
        const n = f.ids.filter((id) => g.cards[id].kind === 'word').length;
        const txt = n + '/' + g.N;
        if (cnt.textContent !== txt && cnt.style.display !== 'none') { cnt.classList.remove('bump'); void cnt.offsetWidth; cnt.classList.add('bump'); }
        cnt.textContent = txt;
        cnt.style.display = '';
        cnt.style.left = L.slotX(i) + L.fw / 2 + 'px';
        cnt.style.top = L.fy + L.fh + 2 + 'px';
      } else {
        cnt.style.display = 'none';
        cnt.textContent = '';
      }
    }
    for (let i = 0; i < COLS; i++) {
      setBox(colBaseEls[i], L.colX(i), L.ty, L.cw, L.ch);
      setBox(zoneEls[i], L.colX(i) - 3, L.ty - 3, L.cw + 6, L.by - 6 - L.ty);
    }
    setBox(wasteBase, L.wasteX, L.by, L.cw, L.ch);
    setBox(stockBase, L.stockX, L.by, L.cw, L.ch);
    stockBase.textContent = g.waste.length ? '↻' : '·';
    stockN.style.display = g.stock.length ? '' : 'none';
    stockN.textContent = g.stock.length;
    stockN.style.left = L.stockX + L.cw / 2 + 'px';
    stockN.style.top = L.by - 4 + 'px';
    btns.style.left = L.colX(0) + 'px';
    btns.style.top = L.by + L.ch - 56 + 'px';

    const placed = new Set();
    for (const id of Object.keys(g.cards)) {
      const p = cardPos(id);
      if (!p) continue;
      placed.add(id);
      const r = cardRec(id);
      const moved = r.x !== null && (Math.abs(r.x - p.x) > 0.5 || Math.abs(r.y - p.y) > 0.5);
      if (opts.instant || r.x === null) r.el.style.transition = 'none';
      r.el.style.transform = `translate(${p.x}px,${p.y}px) scale(${p.s})`;
      if (moved) {
        r.el.style.zIndex = 300 + p.z;
        clearTimeout(r.zt);
        r.zt = later(() => { r.el.style.zIndex = p.z; }, 340);
      } else r.el.style.zIndex = p.z;
      if (r.down !== null && r.down && !p.down) restartAnim(r.inner, 'flip');
      r.el.classList.toggle('down', p.down);
      r.down = p.down;
      if (moved && p.s !== 1 && !opts.instant) restartAnim(r.inner, 'land');
      r.x = p.x; r.y = p.y; r.s = p.s;
      if (r.el.style.transition === 'none') { void r.el.offsetWidth; r.el.style.transition = ''; }
    }
    // Карты из закрытых стопок: долетают до ячейки, потом схлопываются
    for (const [id, r] of els) {
      if (placed.has(id) || r.gone) continue;
      r.gone = true;
      const cat = g.cards[id].cat;
      const sl = g.closedAt[cat] ?? 0;
      const x = L.slotX(sl), y = L.fy;
      r.el.style.transform = `translate(${x}px,${y}px) scale(${L.fs})`;
      r.el.style.zIndex = 400;
      r.x = x; r.y = y;
      const idx = g.cards[id].kind === 'cat' ? 0 : 1;
      later(() => {
        if (!r.gone) return;
        r.el.classList.add('gone');
        const cx = x + L.fw / 2, cy = y + L.fh / 2;
        r.el.style.transform = `translate(${cx}px,${cy}px) scale(.05) rotate(${idx ? 200 : -200}deg)`;
      }, 330);
      later(() => { if (r.gone) { r.el.remove(); if (els.get(id) === r) els.delete(id); } }, 950);
    }

    // HUD
    const left = movesLeft(g);
    movesPill.textContent = '👣 ' + left;
    movesPill.classList.toggle('low', left <= 5 && !over);
    if (lastMovesShown !== null && left > lastMovesShown) { movesPill.classList.remove('bump'); void movesPill.offsetWidth; movesPill.classList.add('bump'); }
    lastMovesShown = left;
    catsPill.textContent = '✅ ' + g.done.length + '/' + g.cats.length;
    undoN.textContent = g.undoLeft;
    undoBtn.disabled = g.undoLeft <= 0;
  }

  // ---------- Эффекты ----------
  function sparks(x, y, color, n = 16) {
    const colors = [color, '#ffc93c', '#ff4f8b', '#3fa9ff', '#2fcf98', '#fff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
      const s = h('div.so-spark', { style: { left: x - 5 + 'px', top: y - 5 + 'px', background: colors[i % colors.length] } });
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      s.style.setProperty('--rot', Math.round(Math.random() * 540) + 'deg');
      board.append(s);
      later(() => s.remove(), 800);
    }
  }
  function celebrate(closed) {
    const cx = L.slotX(closed.slot) + L.fw / 2, cy = L.fy + L.fh / 2;
    const color = catColor(closed.cat);
    vibrate([10, 40, 20]);
    later(() => {
      const d = L.fw * 1.6;
      const fl = h('div.so-flash', { style: { left: cx + 'px', top: cy + 'px', width: d + 'px', height: d + 'px' } });
      board.append(fl);
      later(() => fl.remove(), 750);
      sparks(cx, cy, color);
      const br = board.getBoundingClientRect();
      confetti(br.left + cx, br.top + cy, 28);
      const cat = CATEGORIES[closed.cat];
      const pop = h('div.so-pop', { style: { left: cx + 'px', top: cy + L.fh * 0.7 + 'px', '--c': color } }, cat.icon + ' ' + cat.name + ' ✓');
      // не даём плашке уехать за край
      pop.style.left = Math.min(L.W - 70, Math.max(70, cx)) + 'px';
      board.append(pop);
      later(() => pop.remove(), 1350);
    }, 380);
  }
  function shake(ids) {
    vibrate([6, 30, 6]);
    for (const id of ids) { const r = els.get(id); if (r) restartAnim(r.inner, 'shake'); }
  }

  // ---------- Ходы ----------
  function doMove(src, dst) {
    const ev = applyMove(g, src, dst);
    if (!ev) return false;
    vibrate(8);
    render();
    if (ev.closed) celebrate(ev.closed);
    afterMove();
    return true;
  }
  function doDraw() {
    if (over) return;
    const ev = drawStock(g);
    if (!ev) { shake([]); return; }
    vibrate(8);
    render();
    afterMove();
  }
  function afterMove() {
    if (isWon(g)) return win();
    if (g.moves >= g.limit) outOfMoves();
  }
  function tapCard(id) {
    if (over) return;
    const loc = locate(id);
    if (loc.from === 'stock') return doDraw();
    if (loc.from === 'found') return;
    let src;
    if (loc.from === 'waste') {
      if (!loc.top) return;
      src = { from: 'waste' };
    } else {
      if (loc.down) return shake([id]);
      src = { from: 'col', col: loc.col, idx: loc.idx };
    }
    const dst = autoTarget(g, src);
    if (!dst) return shake(seriesOf(g, src));
    doMove(src, dst);
  }

  // ---------- Финал ----------
  function win() {
    over = true;
    progress.solitaireLevel = level + 1;
    store.commit();
    render();
    const br = board.getBoundingClientRect();
    later(() => confetti(br.left + br.width / 2, br.top + br.height * 0.35, 50), 450);
    later(() => confetti(br.left + br.width * 0.25, br.top + br.height * 0.5, 30), 700);
    later(() => confetti(br.left + br.width * 0.75, br.top + br.height * 0.5, 30), 900);
    vibrate([20, 60, 20, 60, 40]);
    later(() => finishWith(true), 1500);
  }
  function lose() {
    over = true;
    finishWith(false);
  }
  function outOfMoves() {
    over = true;
    render();
    later(() => {
      const left = g.cats.length - g.done.length;
      const content = [
        h('div.modal-title', 'Ходы закончились 😮'),
        h('p.so-modal-text.muted', `Осталось собрать ${left} ${left === 1 ? 'категорию' : left < 5 ? 'категории' : 'категорий'}.`),
      ];
      const finishBtn = h('button.btn.btn-ghost', 'Завершить');
      finishBtn.addEventListener('click', () => { m.close(); openModal = null; lose(); });
      if (!g.extraUsed) {
        const extraBtn = h('button.btn.btn-yellow', `+${EXTRA_MOVES} ходов за ${EXTRA_COST} ⚡`);
        extraBtn.addEventListener('click', () => {
          if (!store.spendEnergy(EXTRA_COST)) { toast('Не хватает энергии ⚡'); extraBtn.disabled = true; return; }
          g.extraUsed = true;
          g.limit += EXTRA_MOVES;
          over = false;
          m.close(); openModal = null;
          render();
          toast(`+${EXTRA_MOVES} ходов!`);
        });
        content.push(h('div.stack', extraBtn, finishBtn));
      } else {
        content.push(finishBtn);
      }
      const m = modal(content, { dismissable: false });
      openModal = m;
    }, 450);
  }

  // ---------- Кнопки ----------
  undoBtn.addEventListener('click', () => {
    if (over) return;
    if (g.undoLeft <= 0) { toast('Отмены закончились'); return; }
    if (!undo(g)) { toast('Нечего отменять'); return; }
    g.undoLeft--;
    vibrate(8);
    render();
  });
  hintBtn.addEventListener('click', () => {
    if (over) return;
    const hint = findHint(g);
    if (!hint) { toast('Ходов не видно — попробуй отменить'); return; }
    if (hint.stock) {
      if (g.stock.length) { const r = els.get(g.stock[g.stock.length - 1]); if (r) restartAnim(r.inner, 'hint'); }
      else { stockBase.classList.remove('hint'); void stockBase.offsetWidth; stockBase.classList.add('hint'); }
      toast(g.stock.length ? 'Открой карту из колоды' : 'Переверни колоду');
      return;
    }
    for (const id of seriesOf(g, hint.src)) { const r = els.get(id); if (r) restartAnim(r.inner, 'hint'); }
    let tEl;
    if (hint.dst.to === 'found') tEl = slotEls[hint.dst.slot];
    else tEl = zoneEls[hint.dst.col];
    tEl.classList.remove('hint'); void tEl.offsetWidth; tEl.classList.add('hint');
    later(() => tEl.classList.remove('hint'), 2100);
  });
  exitBtn.addEventListener('click', async () => {
    if (over) return;
    const ok = await confirmDialog('Выйти? Прогресс партии потеряется', 'Выйти');
    if (ok && alive) ctx.exit();
  });

  // ---------- Тап и перетаскивание ----------
  let press = null;
  const boardPoint = (e) => { const r = board.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function clearOk() {
    for (const s of slotEls) s.classList.remove('ok');
    for (const z of zoneEls) z.classList.remove('ok');
  }
  function onDown(e) {
    if (over || press || !L) return;
    if (e.target.closest('.so-btns')) return;
    if (e.target.closest('.so-stockbase')) { doDraw(); return; }
    const t = e.target.closest('.so-card');
    if (!t || t.classList.contains('gone')) return;
    const id = t.dataset.id;
    const loc = locate(id);
    let src = null;
    if (loc.from === 'col' && !loc.down) src = { from: 'col', col: loc.col, idx: loc.idx };
    else if (loc.from === 'waste' && loc.top) src = { from: 'waste' };
    const p = boardPoint(e);
    press = { id, src, x0: p.x, y0: p.y, drag: false, pid: e.pointerId, series: src ? seriesOf(g, src) : [], targets: [] };
    try { board.setPointerCapture(e.pointerId); } catch (er) { /* ничего */ }
  }
  function onMove(e) {
    if (!press || e.pointerId !== press.pid) return;
    const p = boardPoint(e);
    const dx = p.x - press.x0, dy = p.y - press.y0;
    if (!press.drag) {
      if (!press.src || Math.hypot(dx, dy) < 9) return;
      press.drag = true;
      press.targets = targetsFor(g, press.src);
      for (const d of press.targets) (d.to === 'found' ? slotEls[d.slot] : zoneEls[d.col]).classList.add('ok');
      press.series.forEach((id, i) => {
        const r = els.get(id);
        if (!r) return;
        r.el.classList.add('drag');
        r.el.style.zIndex = 900 + i;
      });
    }
    for (const id of press.series) {
      const r = els.get(id);
      if (r) r.el.style.transform = `translate(${r.x + dx}px,${r.y + dy}px) scale(${r.s})`;
    }
  }
  function dropTarget(pr, p) {
    const r0 = els.get(pr.series[0]);
    const cx = r0 ? r0.x + (p.x - pr.x0) + L.cw / 2 : p.x;
    const cy = r0 ? r0.y + (p.y - pr.y0) + L.ch * 0.3 : p.y;
    const pts = [{ x: cx, y: cy }, p];
    for (const pt of pts) {
      for (const d of pr.targets) {
        if (d.to === 'found') {
          const x = L.slotX(d.slot), pad = 12;
          if (pt.x >= x - pad && pt.x <= x + L.fw + pad && pt.y >= L.fy - pad && pt.y <= L.fy + L.fh + pad * 2) return d;
        } else {
          const x = L.colX(d.col), half = L.gap / 2;
          if (pt.x >= x - half && pt.x <= x + L.cw + half && pt.y >= L.ty - 24) return d;
        }
      }
    }
    return null;
  }
  function onUp(e) {
    if (!press || e.pointerId !== press.pid) return;
    const pr = press;
    press = null;
    try { board.releasePointerCapture(e.pointerId); } catch (er) { /* ничего */ }
    if (!pr.drag) { if (e.type === 'pointerup') tapCard(pr.id); return; }
    clearOk();
    for (const id of pr.series) { const r = els.get(id); if (r) r.el.classList.remove('drag'); }
    const dst = e.type === 'pointerup' ? dropTarget(pr, boardPoint(e)) : null;
    if (!(dst && !over && doMove(pr.src, dst))) render();
  }
  board.addEventListener('pointerdown', onDown);
  board.addEventListener('pointermove', onMove);
  board.addEventListener('pointerup', onUp);
  board.addEventListener('pointercancel', onUp);

  // ---------- Старт ----------
  const ro = new ResizeObserver(() => { if (!press) render({ instant: true }); });
  ro.observe(board);
  let started = false;
  const start = () => {
    if (!alive || started) return;
    render({ instant: true });
    if (!L) { later(start, 60); return; }
    started = true;
    // эффектная раздача: карты вылетают из колоды по очереди
    const order = [];
    for (let i = 0; i < 6; i++) for (let c = 0; c < COLS; c++) if (g.cols[c].ids[i]) order.push(g.cols[c].ids[i]);
    order.forEach((id, k) => {
      const r = els.get(id);
      if (!r) return;
      r.el.style.transition = 'none';
      r.el.style.transform = `translate(${L.stockX}px,${L.by}px) scale(1)`;
      r.el.classList.add('down');
      void r.el.offsetWidth;
      r.el.style.transition = '';
      later(() => {
        r.el.style.transform = `translate(${r.x}px,${r.y}px) scale(${r.s})`;
        if (!r.down) { r.el.classList.remove('down'); restartAnim(r.inner, 'flip'); } else r.el.classList.add('down');
      }, 120 + k * 55);
    });
  };
  requestAnimationFrame(start);
  later(start, 80); // если вкладка в фоне и rAF не приходит

  return () => {
    alive = false;
    ro.disconnect();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    board.removeEventListener('pointerdown', onDown);
    board.removeEventListener('pointermove', onMove);
    board.removeEventListener('pointerup', onUp);
    board.removeEventListener('pointercancel', onUp);
    if (openModal) { try { openModal.close(); } catch (e) { /* уже закрыто */ } openModal = null; }
  };
}

// ---------- Вход: колода из твоих карточек-слов ----------
export function mount(root, ctx) {
  const store = ctx.store;
  const level = Math.max(1, (store.state.progress.solitaireLevel | 0) || 1);
  const { K } = levelParams(level);
  const by = ownedCards(store.state);
  const cats = Object.keys(by).filter((c) => by[c].length >= MIN_OWN)
    .sort((a, b) => by[b].length - by[a].length).slice(0, K);

  if (cats.length < MIN_CATS) {
    const refund = () => { store.addEnergy(meta.cost.energy); ctx.exit(); };
    const best = Object.entries(by).sort((a, b) => b[1].length - a[1].length).slice(0, 4)
      .map(([c, ws]) => `${CATEGORIES[c].icon} ${CATEGORIES[c].name}: ${ws.length}`).join(' · ');
    root.append(
      h('style', `.so-need { margin: 0 14px; padding: 22px 16px; background:#fff; border-radius:22px; box-shadow: var(--shadow); text-align:center; display:flex; flex-direction:column; gap:12px; }`),
      h('div.game-top', h('button.btn-icon', { onclick: refund }, '✕'), h('div.game-title', '🃏 Пасьянс в слова')),
      h('div.so-need',
        h('div', { style: { fontSize: '54px' } }, '🃏'),
        h('b', `Колода собирается из твоих карточек-слов: нужно по ${MIN_OWN} карточки хотя бы в ${MIN_CATS} категориях`),
        h('div.small.muted', best ? 'Сейчас: ' + best : 'Карточек пока нет.'),
        h('div.small', 'Составляй в «Эрудите» конкретные слова: СТОЛ, КОМОД, ЛИЛИЯ, ШАРФ… Собранная категория превратится в настоящий предмет. Энергию вернём.'),
        h('button.btn', { onclick: refund }, 'Понятно'),
      ),
    );
    return () => {};
  }
  const own = Object.fromEntries(cats.map((c) => [c, by[c]]));
  return playGame(root, ctx, own);
}
