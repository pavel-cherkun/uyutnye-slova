// Мини-игра «Три в ряд».
// Логика поля (класс Board, levelConfig) не трогает DOM и проверяется в node.
// Рендер (mount) только проигрывает «шаги», которые возвращает логика.

import { itemsByCat, CATEGORIES, getItem, RARITY } from '../data/items.js';
import { h, toast, modal, confetti, confirmDialog, shuffle } from '../ui/common.js';

export const meta = {
  id: 'match3',
  title: 'Три в ряд',
  emoji: '🍬',
  desc: 'Собирай ряды из предметов',
  cost: { energy: 5 },
  gives: 'ключи, монеты, предметы',
};

export const SIZE = 8;
export const THEMES = ['food', 'plants', 'dishes', 'pets', 'nature', 'clothes', 'fantasy', 'music', 'sport', 'transport'];
const NTYPES = 6;

// ================= ЛОГИКА =================

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Детерминированная конфигурация уровня по его номеру. */
export function levelConfig(level) {
  const rng = mulberry32(level * 9973 + 17);
  const ti = Math.floor(rng() * THEMES.length);
  const cat = THEMES[ti];
  let items = shuffle(itemsByCat(cat), rng).slice(0, NTYPES);
  // если в категории мало предметов — добираем из соседних
  for (let k = 1; items.length < NTYPES && k < THEMES.length; k++) {
    const extra = shuffle(itemsByCat(THEMES[(ti + k) % THEMES.length]), rng)
      .filter((it) => !items.some((x) => x.id === it.id));
    items = items.concat(extra.slice(0, NTYPES - items.length));
  }
  const nGoals = level < 3 ? 2 : (rng() < 0.5 ? 2 : 3);
  // сложность растёт плавно: ~11 фишек на тип на 1-м уровне, потолок 30
  const per = Math.min(30, 10 + Math.floor(level * 1.2));
  const need = nGoals === 3 ? Math.max(9, Math.round(per * 0.65)) : per;
  const goalTypes = shuffle([0, 1, 2, 3, 4, 5], rng).slice(0, nGoals);
  const moves = Math.min(25, 18 + Math.floor(rng() * 5) + Math.floor(level / 6)); // 18..25
  return {
    level, cat, items,
    goals: goalTypes.map((type) => ({ type, need })),
    moves,
    seed: level * 7919 + 3,
  };
}

const key = (r, c) => r * 100 + c;
const unkey = (k) => [Math.floor(k / 100), k % 100];

export class Board {
  constructor(rng = Math.random, ntypes = NTYPES, size = SIZE) {
    this.rng = rng;
    this.ntypes = ntypes;
    this.size = size;
    this.nextId = 1;
    this.grid = [];
    this.fill();
  }

  newTile(type, special = null) {
    return { id: this.nextId++, type, special };
  }

  randType() { return Math.floor(this.rng() * this.ntypes); }

  get(r, c) {
    if (r < 0 || c < 0 || r >= this.size || c >= this.size) return null;
    return this.grid[r][c];
  }

  /** Тип для совпадений (-1 — радуга/пусто, не совпадает) */
  mt(r, c) {
    const t = this.get(r, c);
    return t && t.special !== 'rainbow' ? t.type : -1;
  }

  /** Начальное поле без готовых совпадений и с хотя бы одним ходом. */
  fill() {
    const S = this.size;
    for (let tries = 0; tries < 100; tries++) {
      this.grid = Array.from({ length: S }, () => Array(S).fill(null));
      for (let r = 0; r < S; r++) {
        for (let c = 0; c < S; c++) {
          const bad = new Set();
          if (c >= 2 && this.mt(r, c - 1) === this.mt(r, c - 2)) bad.add(this.mt(r, c - 1));
          if (r >= 2 && this.mt(r - 1, c) === this.mt(r - 2, c)) bad.add(this.mt(r - 1, c));
          const ok = [];
          for (let t = 0; t < this.ntypes; t++) if (!bad.has(t)) ok.push(t);
          this.grid[r][c] = this.newTile(ok[Math.floor(this.rng() * ok.length)]);
        }
      }
      if (this.findGroups().length === 0 && this.hasMoves()) return;
    }
  }

  /**
   * Все группы совпадений.
   * group: { type, cells:[[r,c]], special: null|'rocketH'|'rocketV'|'bomb'|'rainbow', pos:[r,c] }
   */
  findGroups(swapCells = []) {
    const S = this.size;
    const runs = [];
    for (let r = 0; r < S; r++) {
      let c = 0;
      while (c < S) {
        const ty = this.mt(r, c);
        let e = c + 1;
        if (ty >= 0) while (e < S && this.mt(r, e) === ty) e++;
        if (ty >= 0 && e - c >= 3) {
          const cells = [];
          for (let x = c; x < e; x++) cells.push([r, x]);
          runs.push({ dir: 'h', type: ty, cells });
        }
        c = e;
      }
    }
    for (let c = 0; c < S; c++) {
      let r = 0;
      while (r < S) {
        const ty = this.mt(r, c);
        let e = r + 1;
        if (ty >= 0) while (e < S && this.mt(e, c) === ty) e++;
        if (ty >= 0 && e - r >= 3) {
          const cells = [];
          for (let y = r; y < e; y++) cells.push([y, c]);
          runs.push({ dir: 'v', type: ty, cells });
        }
        r = e;
      }
    }
    if (!runs.length) return [];

    // объединяем пересекающиеся линии (union-find)
    const parent = runs.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const owner = new Map();
    runs.forEach((run, i) => {
      for (const [r, c] of run.cells) {
        const k = key(r, c);
        if (owner.has(k)) parent[find(i)] = find(owner.get(k));
        else owner.set(k, i);
      }
    });
    const byRoot = new Map();
    runs.forEach((run, i) => {
      const root = find(i);
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root).push(run);
    });

    const swapKeys = new Set(swapCells.map(([r, c]) => key(r, c)));
    const groups = [];
    for (const gruns of byRoot.values()) {
      const cellKeys = new Set();
      for (const run of gruns) for (const [r, c] of run.cells) cellKeys.add(key(r, c));
      const longest = gruns.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      const maxLen = longest.cells.length;
      const hasH = gruns.some((x) => x.dir === 'h');
      const hasV = gruns.some((x) => x.dir === 'v');
      let special = null;
      if (maxLen >= 5) special = 'rainbow';
      else if (hasH && hasV) special = 'bomb';
      else if (maxLen === 4) special = longest.dir === 'h' ? 'rocketH' : 'rocketV';

      let pos = null;
      for (const k of cellKeys) if (swapKeys.has(k)) { pos = unkey(k); break; }
      if (!pos && special === 'bomb') {
        // клетка пересечения горизонтали и вертикали
        const hk = new Set();
        for (const run of gruns) if (run.dir === 'h') for (const [r, c] of run.cells) hk.add(key(r, c));
        for (const run of gruns) if (run.dir === 'v') for (const [r, c] of run.cells) if (hk.has(key(r, c))) pos = [r, c];
      }
      if (!pos) pos = longest.cells[Math.floor(longest.cells.length / 2)];
      groups.push({ type: longest.type, cells: [...cellKeys].map(unkey), special, pos });
    }
    return groups;
  }

  _swapRaw(a, b) {
    const t = this.grid[a[0]][a[1]];
    this.grid[a[0]][a[1]] = this.grid[b[0]][b[1]];
    this.grid[b[0]][b[1]] = t;
  }

  hasMoves() { return !!this.findMove(); }

  /** Любой результативный обмен [a, b] или null */
  findMove() {
    const S = this.size;
    for (let r = 0; r < S; r++) {
      for (let c = 0; c < S; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r2 = r + dr, c2 = c + dc;
          if (r2 >= S || c2 >= S) continue;
          const A = this.grid[r][c], B = this.grid[r2][c2];
          if (!A || !B) continue;
          if (A.special || B.special) return [[r, c], [r2, c2]];
          this._swapRaw([r, c], [r2, c2]);
          const ok = this.findGroups().length > 0;
          this._swapRaw([r, c], [r2, c2]);
          if (ok) return [[r, c], [r2, c2]];
        }
      }
    }
    return null;
  }

  /** Область действия спецфишки. effects пополняется описанием эффекта для рендера. */
  _area(tile, r, c, effects) {
    const S = this.size, out = [];
    if (tile.special === 'rocketH') {
      for (let x = 0; x < S; x++) out.push([r, x]);
      effects.push({ kind: 'row', r, c });
    } else if (tile.special === 'rocketV') {
      for (let y = 0; y < S; y++) out.push([y, c]);
      effects.push({ kind: 'col', r, c });
    } else if (tile.special === 'bomb') {
      for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) if (this.get(y, x)) out.push([y, x]);
      effects.push({ kind: 'bomb', r, c, rad: 1 });
    } else if (tile.special === 'rainbow') {
      // радуга, задетая взрывом: забирает самый частый тип
      const cnt = Array(this.ntypes).fill(0);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const t = this.mt(y, x); if (t >= 0) cnt[t]++; }
      const best = cnt.indexOf(Math.max(...cnt));
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (this.mt(y, x) === best) out.push([y, x]);
      effects.push({ kind: 'rainbow', r, c });
    }
    return out;
  }

  /**
   * Один шаг: очистка (с цепной реакцией спецфишек), создание спецфишек, падение, досыпка.
   * Возвращает описание шага для рендера.
   */
  _phase(clearKeys, creates = [], combo = 1, preTriggered = [], effects = [], upgrades = []) {
    const S = this.size, g = this.grid;
    const triggered = new Set(preTriggered);
    const queue = [...clearKeys];
    while (queue.length) {
      const [r, c] = unkey(queue.pop());
      const tile = g[r][c];
      if (!tile || !tile.special || triggered.has(tile.id)) continue;
      triggered.add(tile.id);
      for (const [y, x] of this._area(tile, r, c, effects)) {
        const k = key(y, x);
        if (!clearKeys.has(k)) { clearKeys.add(k); queue.push(k); }
      }
    }
    const cleared = [];
    for (const k of clearKeys) {
      const [r, c] = unkey(k);
      const tile = g[r][c];
      if (!tile) continue;
      cleared.push({ id: tile.id, type: tile.type, special: tile.special, r, c });
      g[r][c] = null;
    }
    const created = [];
    for (const cr of creates) {
      if (g[cr.r][cr.c]) continue;
      const tile = this.newTile(cr.type, cr.special);
      g[cr.r][cr.c] = tile;
      created.push({ tile: { ...tile }, r: cr.r, c: cr.c });
    }
    // падение
    const falls = [], spawns = [];
    for (let c = 0; c < S; c++) {
      let write = S - 1;
      for (let r = S - 1; r >= 0; r--) {
        if (!g[r][c]) continue;
        if (r !== write) {
          g[write][c] = g[r][c];
          g[r][c] = null;
          falls.push({ id: g[write][c].id, r: write, c, fromR: r });
        }
        write--;
      }
      const count = write + 1;
      for (let r = write; r >= 0; r--) {
        const tile = this.newTile(this.randType());
        g[r][c] = tile;
        spawns.push({ tile: { ...tile }, r, c, fromR: r - count });
      }
    }
    return { cleared, effects, created, falls, spawns, combo, upgrades };
  }

  _phaseFromGroups(groups, combo) {
    const clearKeys = new Set();
    const creates = [];
    for (const gr of groups) {
      for (const [r, c] of gr.cells) clearKeys.add(key(r, c));
      if (gr.special) creates.push({ r: gr.pos[0], c: gr.pos[1], type: gr.special === 'rainbow' ? -1 : gr.type, special: gr.special });
    }
    return this._phase(clearKeys, creates, combo);
  }

  /** Каскад после первого шага. Возвращает { steps, shuffled, moves? } */
  _cascade(first) {
    const steps = [first];
    let combo = first.combo;
    for (let guard = 0; guard < 60; guard++) {
      const groups = this.findGroups();
      if (!groups.length) break;
      combo++;
      steps.push(this._phaseFromGroups(groups, combo));
    }
    const res = { steps, shuffled: false };
    if (!this.hasMoves()) { res.shuffled = true; res.moves = this.reshuffle(); }
    return res;
  }

  /**
   * Попытка обмена соседних клеток.
   * null — клетки не соседние/пустые; { valid:false } — обмен ничего не даёт (поле не изменено);
   * { valid:true, steps, shuffled, moves } — ход сделан.
   */
  trySwap(a, b) {
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return null;
    const A = this.get(a[0], a[1]), B = this.get(b[0], b[1]);
    if (!A || !B) return null;
    this._swapRaw(a, b); // теперь A стоит в b, B — в a
    const S = this.size;

    // Радуга
    if (A.special === 'rainbow' || B.special === 'rainbow') {
      const clearKeys = new Set();
      const effects = [], upgrades = [];
      let pre = [];
      if (A.special === 'rainbow' && B.special === 'rainbow') {
        for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) clearKeys.add(key(r, c));
        effects.push({ kind: 'rainbow', r: b[0], c: b[1] }, { kind: 'bomb', r: b[0], c: b[1], rad: 8 });
        pre = [A.id, B.id];
      } else {
        const rb = A.special === 'rainbow' ? A : B;
        const other = rb === A ? B : A;
        const rbPos = rb === A ? b : a;
        clearKeys.add(key(rbPos[0], rbPos[1]));
        effects.push({ kind: 'rainbow', r: rbPos[0], c: rbPos[1] });
        pre = [rb.id];
        for (let r = 0; r < S; r++) {
          for (let c = 0; c < S; c++) {
            const t = this.grid[r][c];
            if (!t || t.special === 'rainbow' || t.type !== other.type) continue;
            clearKeys.add(key(r, c));
            // радуга + спецфишка: все фишки этого типа становятся такими же спецфишками
            if (other.special && !t.special) {
              t.special = other.special === 'bomb' ? 'bomb' : (this.rng() < 0.5 ? 'rocketH' : 'rocketV');
              upgrades.push({ id: t.id, special: t.special });
            }
          }
        }
      }
      return { valid: true, ...this._cascade(this._phase(clearKeys, [], 1, pre, effects, upgrades)) };
    }

    // Две спецфишки — мощная комбинация
    if (A.special && B.special) {
      const clearKeys = new Set([key(a[0], a[1]), key(b[0], b[1])]);
      const effects = [];
      const [r0, c0] = b;
      const bombs = (A.special === 'bomb') + (B.special === 'bomb');
      const addRow = (r) => { if (r < 0 || r >= S) return; for (let x = 0; x < S; x++) clearKeys.add(key(r, x)); effects.push({ kind: 'row', r, c: c0 }); };
      const addCol = (c) => { if (c < 0 || c >= S) return; for (let y = 0; y < S; y++) clearKeys.add(key(y, c)); effects.push({ kind: 'col', r: r0, c }); };
      if (bombs === 2) {
        for (let y = r0 - 2; y <= r0 + 2; y++) for (let x = c0 - 2; x <= c0 + 2; x++) if (this.get(y, x)) clearKeys.add(key(y, x));
        effects.push({ kind: 'bomb', r: r0, c: c0, rad: 2 });
      } else if (bombs === 1) {
        for (let d = -1; d <= 1; d++) { addRow(r0 + d); addCol(c0 + d); }
        effects.push({ kind: 'bomb', r: r0, c: c0, rad: 1 });
      } else {
        addRow(r0); addCol(c0);
      }
      return { valid: true, ...this._cascade(this._phase(clearKeys, [], 1, [A.id, B.id], effects)) };
    }

    const groups = this.findGroups([a, b]);
    if (groups.length) return { valid: true, ...this._cascade(this._phaseFromGroups(groups, 1)) };

    // Одна спецфишка без совпадения — всё равно срабатывает при обмене
    if (A.special || B.special) {
      const pos = A.special ? b : a;
      return { valid: true, ...this._cascade(this._phase(new Set([key(pos[0], pos[1])]), [], 1)) };
    }

    this._swapRaw(a, b);
    return { valid: false };
  }

  /** Бустер «Молоток»: уничтожить одну фишку. */
  hammer(r, c) {
    if (!this.get(r, c)) return null;
    return this._cascade(this._phase(new Set([key(r, c)]), [], 1));
  }

  /** Финальный салют: n случайных обычных фишек превращаются в ракеты, затем взрываются все спецфишки. */
  salute(n) {
    const S = this.size, normal = [], upgrades = [];
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) if (this.grid[r][c] && !this.grid[r][c].special) normal.push([r, c]);
    for (const [r, c] of shuffle(normal, this.rng).slice(0, n)) {
      const t = this.grid[r][c];
      t.special = this.rng() < 0.5 ? 'rocketH' : 'rocketV';
      upgrades.push({ id: t.id, special: t.special });
    }
    const clearKeys = new Set();
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) if (this.grid[r][c] && this.grid[r][c].special) clearKeys.add(key(r, c));
    if (!clearKeys.size) return { steps: [], shuffled: false };
    return this._cascade(this._phase(clearKeys, [], 1, [], [], upgrades));
  }

  /** Перемешивание, пока не будет ходов и не будет готовых совпадений. Возвращает [{id,r,c}]. */
  reshuffle() {
    const S = this.size;
    const tiles = [];
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) if (this.grid[r][c]) tiles.push(this.grid[r][c]);
    let ok = false;
    for (let tries = 0; tries < 200 && !ok; tries++) {
      const sh = shuffle(tiles, this.rng);
      let i = 0;
      for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) this.grid[r][c] = sh[i++];
      ok = this.findGroups().length === 0 && this.hasMoves();
    }
    if (!ok) {
      // крайний случай: перекрашиваем обычные фишки
      for (let tries = 0; tries < 200 && !ok; tries++) {
        for (let r = 0; r < S; r++) {
          for (let c = 0; c < S; c++) {
            const t = this.grid[r][c];
            if (t.special) continue;
            const bad = new Set();
            if (c >= 2 && this.mt(r, c - 1) === this.mt(r, c - 2)) bad.add(this.mt(r, c - 1));
            if (r >= 2 && this.mt(r - 1, c) === this.mt(r - 2, c)) bad.add(this.mt(r - 1, c));
            const opts = [];
            for (let x = 0; x < this.ntypes; x++) if (!bad.has(x)) opts.push(x);
            t.type = opts[Math.floor(this.rng() * opts.length)];
          }
        }
        ok = this.findGroups().length === 0 && this.hasMoves();
      }
    }
    const out = [];
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) out.push({ id: this.grid[r][c].id, type: this.grid[r][c].type, r, c });
    return out;
  }
}

// ================= РЕНДЕР =================

const COLORS = [
  ['#ff8fb8', '#ff3d7f', '#c9215c'], // розовый
  ['#ffb877', '#ff7a1f', '#c95300'], // оранжевый
  ['#fff08a', '#ffc21c', '#c48e00'], // жёлтый
  ['#7af0c4', '#1fc98c', '#0f8a5f'], // зелёный
  ['#8fd0ff', '#2f97ff', '#1662c4'], // синий
  ['#c7a8ff', '#8a5cff', '#5a2fd0'], // фиолетовый
];

const CSS = `
.m3-root { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden;
  background: radial-gradient(circle at 20% 10%, #ffe3f1 0, transparent 45%), radial-gradient(circle at 90% 80%, #d8f4ff 0, transparent 50%), var(--bg); }
.m3-pill { background:#fff; border-radius:999px; padding:6px 12px; font-weight:900; font-size:15px;
  box-shadow:0 3px 0 rgba(43,29,74,.12); white-space:nowrap; display:flex; align-items:center; gap:4px; }
.m3-pill.m3-low { background:linear-gradient(180deg,#ff8fb8,var(--pink)); color:#fff; animation: m3-pulse 1s infinite; }
.m3-goals { display:flex; gap:8px; justify-content:center; padding:2px 10px 6px; flex-wrap:wrap; }
.m3-goal { display:flex; align-items:center; gap:6px; background:rgba(255,255,255,.92); border-radius:16px; padding:4px 12px 4px 4px;
  box-shadow:0 4px 0 rgba(43,29,74,.1); font-weight:900; font-size:18px; transition: transform .2s; }
.m3-goal .m3-gem { width:36px; height:36px; font-size:22px; position:relative; }
.m3-goal.m3-bump { animation: m3-bump .3s; }
.m3-goal.m3-done { background:linear-gradient(180deg,#7af0c4,var(--green)); color:#fff; }
.m3-theme { text-align:center; font-weight:800; font-size:13px; color:var(--ink-soft); margin-bottom:2px; }
.m3-wrap { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; position:relative; padding:4px 8px; }
.m3-board { position:relative; touch-action:none; overflow:hidden; border-radius:18px;
  background: linear-gradient(160deg, rgba(122,92,255,.28), rgba(255,79,139,.22));
  box-shadow: inset 0 0 0 3px rgba(255,255,255,.6), 0 8px 24px rgba(43,29,74,.18); }
.m3-board.m3-shake { animation: m3-shake .35s; }
.m3-board.m3-hammering { box-shadow: inset 0 0 0 4px var(--yellow), 0 0 0 4px rgba(255,201,60,.4), 0 8px 24px rgba(43,29,74,.18); }
.m3-cellbg { position:absolute; border-radius:22%; background:rgba(255,255,255,.35); }
.m3-tile { position:absolute; left:0; top:0; will-change:transform; z-index:2; }
.m3-gem { position:absolute; inset:7%; border-radius:30%; display:flex; align-items:center; justify-content:center;
  background: radial-gradient(circle at 32% 28%, var(--c1) 0, var(--c2) 60%, var(--c3) 100%);
  box-shadow: inset 0 -3px 0 rgba(0,0,0,.18), inset 0 3px 0 rgba(255,255,255,.55), 0 3px 4px rgba(43,29,74,.25);
  transition: transform .15s; line-height:1; }
.m3-gem .m3-em { filter: drop-shadow(0 2px 0 rgba(0,0,0,.2)); pointer-events:none; }
.m3-gem::after { content:''; position:absolute; left:16%; top:9%; width:38%; height:20%; border-radius:50%;
  background:rgba(255,255,255,.55); pointer-events:none; }
.m3-sel .m3-gem { transform: scale(1.15); box-shadow: 0 0 0 3px #fff, 0 0 14px 4px var(--c2); animation: m3-wiggle .6s infinite; }
.m3-hint .m3-gem { animation: m3-wiggle .5s 3; }
.m3-gem.m3-rocketH::before, .m3-gem.m3-rocketV::before { content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.55) 0 3px, transparent 3px 8px); }
.m3-gem.m3-rocketV::before { background: repeating-linear-gradient(90deg, rgba(255,255,255,.55) 0 3px, transparent 3px 8px); }
.m3-gem.m3-bomb { box-shadow: inset 0 0 0 3px #2b1d4a, inset 0 0 0 5px #fff, 0 0 12px 3px var(--c2); animation: m3-glowb 1s infinite alternate; }
.m3-gem.m3-rainbow { background: conic-gradient(#ff4f8b,#ffc93c,#2fcf98,#3fa9ff,#a66bff,#ff4f8b);
  box-shadow: 0 0 0 3px #fff, 0 0 16px 4px rgba(255,255,255,.9); animation: m3-spin 3s linear infinite; }
.m3-gem.m3-rainbow .m3-em { animation: m3-spin 3s linear infinite reverse; }
.m3-badge { position:absolute; right:-6%; bottom:-6%; font-size:.45em; background:#fff; border-radius:50%; width:1.5em; height:1.5em;
  display:flex; align-items:center; justify-content:center; box-shadow:0 2px 0 rgba(0,0,0,.2); color:var(--ink); font-weight:900; }
.m3-tile.m3-pop .m3-gem { animation: m3-pop .28s ease-in forwards; }
.m3-tile.m3-born .m3-gem { animation: m3-born .35s cubic-bezier(.3,1.7,.5,1); }
.m3-tile.m3-up .m3-gem { animation: m3-born .35s cubic-bezier(.3,1.7,.5,1); }
.m3-flash { position:absolute; border-radius:50%; pointer-events:none; z-index:3;
  background: radial-gradient(circle, #fff 0, rgba(255,255,255,.8) 30%, transparent 70%); animation: m3-flash .35s ease-out forwards; }
.m3-part { position:absolute; width:9px; height:9px; border-radius:3px; pointer-events:none; z-index:4;
  animation: m3-part .55s cubic-bezier(.2,.7,.4,1) forwards; }
.m3-beam { position:absolute; pointer-events:none; z-index:5; border-radius:999px;
  background: linear-gradient(90deg, transparent, #fff 20%, #ffe066 50%, #fff 80%, transparent); box-shadow:0 0 18px 6px rgba(255,224,102,.8); }
.m3-beam.m3-h { animation: m3-beamh .4s ease-out forwards; }
.m3-beam.m3-v { background: linear-gradient(180deg, transparent, #fff 20%, #ffe066 50%, #fff 80%, transparent); animation: m3-beamv .4s ease-out forwards; }
.m3-ring { position:absolute; border-radius:50%; pointer-events:none; z-index:5; border:6px solid #fff;
  box-shadow: 0 0 20px 6px rgba(255,138,61,.9), inset 0 0 20px 6px rgba(255,201,60,.8); animation: m3-ring .45s ease-out forwards; }
.m3-ring.m3-rb { border-color: transparent; background: conic-gradient(#ff4f8b,#ffc93c,#2fcf98,#3fa9ff,#a66bff,#ff4f8b); opacity:.8;
  -webkit-mask: radial-gradient(circle, transparent 45%, #000 47%); mask: radial-gradient(circle, transparent 45%, #000 47%); }
.m3-banner { position:absolute; left:50%; top:50%; z-index:20; pointer-events:none; white-space:nowrap;
  font-weight:900; font-size:min(30px, 7vw); color:#fff; letter-spacing:-.5px;
  -webkit-text-stroke: 1.5px var(--ink); text-shadow: 0 4px 0 var(--ink), 0 0 20px rgba(255,79,139,.9);
  animation: m3-banner 1.1s cubic-bezier(.3,1.6,.5,1) forwards; }
.m3-banner.m3-big { font-size:min(36px, 7.6vw); }
.m3-bottom { display:flex; gap:10px; align-items:center; justify-content:center; padding:6px 12px calc(10px + var(--safe-bottom)); }
.m3-hammer { display:flex; align-items:center; gap:6px; }
.m3-hammer.m3-on { background: linear-gradient(180deg,#fff08a,var(--yellow)); color:var(--ink); box-shadow:0 5px 0 #d79a00; animation: m3-pulse .8s infinite; }
.m3-hammer .m3-n { background:rgba(255,255,255,.35); border-radius:999px; padding:0 8px; font-size:14px; }
.m3-lose-goals { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
.m3-no-anim, .m3-no-anim * { transition:none !important; }
@keyframes m3-pop { 0% { transform:scale(1); filter:brightness(1); } 40% { transform:scale(1.35); filter:brightness(1.8); } 100% { transform:scale(0); opacity:0; filter:brightness(2); } }
@keyframes m3-born { 0% { transform:scale(0) rotate(-40deg); } 100% { transform:scale(1); } }
@keyframes m3-flash { 0% { transform:scale(.3); opacity:1; } 100% { transform:scale(1.6); opacity:0; } }
@keyframes m3-part { 0% { transform:translate(0,0) scale(1) rotate(0); opacity:1; } 100% { transform:translate(var(--dx),var(--dy)) scale(.2) rotate(var(--rot)); opacity:0; } }
@keyframes m3-beamh { 0% { transform:scaleX(0); opacity:1; } 60% { transform:scaleX(1); opacity:1; } 100% { transform:scaleX(1) scaleY(.2); opacity:0; } }
@keyframes m3-beamv { 0% { transform:scaleY(0); opacity:1; } 60% { transform:scaleY(1); opacity:1; } 100% { transform:scaleY(1) scaleX(.2); opacity:0; } }
@keyframes m3-ring { 0% { transform:scale(.2); opacity:1; } 100% { transform:scale(1); opacity:0; } }
@keyframes m3-shake { 0%,100% { transform:translate(0,0); } 20% { transform:translate(-7px,4px); } 40% { transform:translate(6px,-5px); } 60% { transform:translate(-5px,-3px); } 80% { transform:translate(4px,5px); } }
@keyframes m3-banner { 0% { transform:translate(-50%,-50%) scale(.3); opacity:0; } 25% { transform:translate(-50%,-50%) scale(1.1); opacity:1; } 75% { transform:translate(-50%,-60%) scale(1); opacity:1; } 100% { transform:translate(-50%,-90%) scale(.9); opacity:0; } }
@keyframes m3-bump { 50% { transform:scale(1.18); } }
@keyframes m3-pulse { 50% { transform:scale(1.07); } }
@keyframes m3-wiggle { 0%,100% { transform:scale(1.12) rotate(0); } 25% { transform:scale(1.12) rotate(-8deg); } 75% { transform:scale(1.12) rotate(8deg); } }
@keyframes m3-glowb { to { filter:brightness(1.25); } }
@keyframes m3-spin { to { transform: rotate(360deg); } }
`;

function playLevel(root, ctx, chosen) {
  const store = ctx.store;
  const level = (store.state.progress && store.state.progress.match3Level) || 1;
  const cfg = withItems(levelConfig(level), chosen);
  const board = new Board(mulberry32(cfg.seed));
  const items = cfg.items;

  let alive = true;
  let busy = false;
  let ended = false;
  let movesLeft = cfg.moves;
  let extraUsed = false;
  let hammerMode = false;
  let sel = null; // [r,c]
  let cell = 40;
  let openModal = null;
  let hintTimer = null;
  const goals = cfg.goals.map((g) => ({ ...g, left: g.need, el: null, num: null }));
  const els = new Map(); // id тайла → элемент

  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* нет вибро */ } };

  // ---------- Разметка ----------
  root.classList.add('m3-root');
  const style = h('style', CSS);
  const movesPill = h('div.m3-pill', '👣 ', h('span', String(movesLeft)));
  const top = h('div.game-top',
    h('button.btn-icon', { onclick: onExit, 'aria-label': 'Выйти' }, '✕'),
    h('div.game-title', `Уровень ${level}`),
    movesPill,
  );
  const goalsEl = h('div.m3-goals', goals.map((g) => {
    g.num = h('span', String(g.left));
    g.el = h('div.m3-goal', gemEl(g.type), g.num);
    return g.el;
  }));
  const themeEl = h('div.m3-theme', `🎒 Фишки — твои предметы · собери за ${cfg.moves} ходов, получишь их ×2`);
  const boardEl = h('div.m3-board');
  const wrap = h('div.m3-wrap', boardEl);
  const hammerBtn = h('button.btn.btn-orange.m3-hammer', { onclick: onHammer });
  const bottom = h('div.m3-bottom', hammerBtn);
  root.append(style, top, goalsEl, themeEl, wrap, bottom);
  updateHammer();

  function gemEl(type, special) {
    const gem = h('div.m3-gem');
    paintGem(gem, type, special);
    return gem;
  }

  function paintGem(gem, type, special) {
    gem.className = 'm3-gem';
    gem.innerHTML = '';
    if (special === 'rainbow') {
      gem.classList.add('m3-rainbow');
      gem.append(h('span.m3-em', '🌈'));
      return;
    }
    const col = COLORS[type % COLORS.length];
    gem.style.setProperty('--c1', col[0]);
    gem.style.setProperty('--c2', col[1]);
    gem.style.setProperty('--c3', col[2]);
    gem.append(h('span.m3-em', items[type].emoji));
    if (special) {
      gem.classList.add('m3-' + special);
      gem.append(h('span.m3-badge', special === 'bomb' ? '💣' : special === 'rocketH' ? '⇆' : '⇅'));
    }
  }

  function makeTile(tile, r, c) {
    const gem = gemEl(tile.type, tile.special);
    const el = h('div.m3-tile', gem);
    el._gem = gem;
    el._t = { ...tile };
    sizeTile(el);
    setPos(el, r, c);
    boardEl.append(el);
    els.set(tile.id, el);
    return el;
  }

  function sizeTile(el) {
    el.style.width = cell + 'px';
    el.style.height = cell + 'px';
    el.style.fontSize = Math.round(cell * 0.56) + 'px';
  }

  function setPos(el, r, c, ms = 0, ease = 'cubic-bezier(.34,1.5,.64,1)') {
    el.style.transition = ms ? `transform ${ms}ms ${ease}` : 'none';
    el.style.transform = `translate(${c * cell}px, ${r * cell}px)`;
    el._r = r; el._c = c;
  }

  function layout() {
    const w = wrap.clientWidth - 16, hh = wrap.clientHeight - 8;
    const nc = Math.max(28, Math.floor(Math.min(w, hh) / SIZE));
    if (nc === cell && boardEl.childElementCount) return;
    cell = nc;
    boardEl.style.width = boardEl.style.height = cell * SIZE + 'px';
    boardEl.querySelectorAll('.m3-cellbg').forEach((e) => e.remove());
    const frag = document.createDocumentFragment();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        frag.append(h('div.m3-cellbg', { style: { left: c * cell + 2 + 'px', top: r * cell + 2 + 'px', width: cell - 4 + 'px', height: cell - 4 + 'px' } }));
      }
    }
    boardEl.prepend(frag);
    for (const el of els.values()) { sizeTile(el); setPos(el, el._r, el._c); }
  }

  function syncAll(ms = 0) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const t = board.grid[r][c];
        if (!t) continue;
        let el = els.get(t.id);
        if (!el) el = makeTile(t, r, c);
        if (el._t.type !== t.type || el._t.special !== t.special) { paintGem(el._gem, t.type, t.special); el._t = { ...t }; }
        setPos(el, r, c, ms, 'cubic-bezier(.5,0,.3,1.2)');
      }
    }
  }

  const ro = new ResizeObserver(() => { if (alive) layout(); });
  ro.observe(wrap);
  layout();
  syncAll(0);
  // эффектное появление поля
  for (const el of els.values()) {
    el.classList.add('m3-born');
    el._gem.style.animationDelay = (el._r * 30 + el._c * 15) + 'ms';
  }
  setTimeout(() => { for (const el of els.values()) { el.classList.remove('m3-born'); el._gem.style.animationDelay = ''; } }, 800);
  setTimeout(() => alive && banner(`Собери ${goals.map((g) => items[g.type].emoji).join(' ')}!`), 350);

  // ---------- Эффекты ----------
  function banner(text, big = false, ms = 1100) {
    const b = h('div.m3-banner' + (big ? '.m3-big' : ''), text);
    b.style.animationDuration = ms + 'ms';
    wrap.append(b);
    setTimeout(() => b.remove(), ms + 50);
  }

  function flash(r, c, type) {
    const f = h('div.m3-flash', { style: { left: c * cell - cell * 0.2 + 'px', top: r * cell - cell * 0.2 + 'px', width: cell * 1.4 + 'px', height: cell * 1.4 + 'px' } });
    boardEl.append(f);
    setTimeout(() => f.remove(), 400);
  }

  function particles(r, c, type, n) {
    const col = type >= 0 ? COLORS[type % COLORS.length] : ['#fff', '#ffc93c', '#ff4f8b'];
    for (let i = 0; i < n; i++) {
      const p = h('div.m3-part', { style: { left: c * cell + cell / 2 - 4 + 'px', top: r * cell + cell / 2 - 4 + 'px', background: col[i % 3] } });
      const ang = Math.random() * Math.PI * 2, dist = cell * (0.6 + Math.random() * 0.9);
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.style.setProperty('--rot', Math.random() * 540 + 'deg');
      boardEl.append(p);
      setTimeout(() => p.remove(), 600);
    }
  }

  function effect(e) {
    const full = cell * SIZE;
    if (e.kind === 'row') {
      const b = h('div.m3-beam.m3-h', { style: { left: '0px', top: e.r * cell + cell * 0.3 + 'px', width: full + 'px', height: cell * 0.4 + 'px', transformOrigin: (e.c + 0.5) * cell + 'px 50%' } });
      boardEl.append(b); setTimeout(() => b.remove(), 450);
    } else if (e.kind === 'col') {
      const b = h('div.m3-beam.m3-v', { style: { top: '0px', left: e.c * cell + cell * 0.3 + 'px', height: full + 'px', width: cell * 0.4 + 'px', transformOrigin: `50% ${(e.r + 0.5) * cell}px` } });
      boardEl.append(b); setTimeout(() => b.remove(), 450);
    } else if (e.kind === 'bomb' || e.kind === 'rainbow') {
      const rad = e.kind === 'rainbow' ? 4 : (e.rad || 1) + 0.8;
      const d = cell * rad * 2;
      const ring = h('div.m3-ring' + (e.kind === 'rainbow' ? '.m3-rb' : ''), { style: { left: (e.c + 0.5) * cell - d / 2 + 'px', top: (e.r + 0.5) * cell - d / 2 + 'px', width: d + 'px', height: d + 'px' } });
      boardEl.append(ring); setTimeout(() => ring.remove(), 500);
      boardEl.classList.remove('m3-shake'); void boardEl.offsetWidth; boardEl.classList.add('m3-shake');
      setTimeout(() => boardEl.classList.remove('m3-shake'), 400);
    }
  }

  function countGoal(type) {
    for (const g of goals) {
      if (g.type !== type || g.left <= 0) continue;
      g.left--;
      g.num.textContent = g.left > 0 ? String(g.left) : '✓';
      if (g.left === 0) g.el.classList.add('m3-done');
      g.el.classList.remove('m3-bump'); void g.el.offsetWidth; g.el.classList.add('m3-bump');
    }
  }

  async function playStep(st) {
    if (!alive) return;
    if (st.upgrades && st.upgrades.length) {
      for (const u of st.upgrades) {
        const el = els.get(u.id);
        if (!el) continue;
        el._t.special = u.special;
        paintGem(el._gem, el._t.type, u.special);
        el.classList.remove('m3-up'); void el.offsetWidth; el.classList.add('m3-up');
      }
      vibrate(10);
      await wait(380);
      if (!alive) return;
    }
    if (st.combo >= 2) banner(`Комбо ×${st.combo}!`, st.combo >= 4, 900);
    for (const e of st.effects) effect(e);
    if (st.effects.length || st.cleared.length >= 4) vibrate(st.effects.some((e) => e.kind !== 'row' && e.kind !== 'col') ? 25 : 10);
    const many = st.cleared.length > 20;
    for (const cl of st.cleared) {
      const el = els.get(cl.id);
      if (cl.type >= 0) countGoal(cl.type);
      flash(cl.r, cl.c, cl.type);
      particles(cl.r, cl.c, cl.type, many ? 3 : 6);
      if (el) {
        els.delete(cl.id);
        el.style.zIndex = 3;
        el.classList.add('m3-pop');
        setTimeout(() => el.remove(), 300);
      }
    }
    await wait(st.effects.length ? 300 : 230);
    if (!alive) return;

    for (const cr of st.created) {
      const el = makeTile(cr.tile, cr.r, cr.c);
      el.classList.add('m3-born');
    }
    for (const sp of st.spawns) makeTile(sp.tile, sp.fromR, sp.c);
    void boardEl.offsetWidth; // зафиксировать стартовые позиции
    let maxMs = 0;
    for (const f of st.falls) {
      const el = els.get(f.id);
      if (!el) continue;
      const ms = Math.min(520, 220 + (f.r - f.fromR) * 45);
      maxMs = Math.max(maxMs, ms);
      setPos(el, f.r, f.c, ms);
    }
    for (const sp of st.spawns) {
      const el = els.get(sp.tile.id);
      const ms = Math.min(560, 240 + (sp.r - sp.fromR) * 45);
      maxMs = Math.max(maxMs, ms);
      setPos(el, sp.r, sp.c, ms);
    }
    await wait(maxMs * 0.85 + 20);
    for (const el of els.values()) el.classList.remove('m3-born', 'm3-up');
  }

  async function playResult(res) {
    for (const st of res.steps) {
      await playStep(st);
      if (!alive) return;
    }
    if (res.shuffled) {
      banner('Ходов нет — перемешиваем! 🔀', false, 1300);
      await wait(500);
      syncAll(450);
      await wait(500);
    }
  }

  // ---------- Ход ----------
  function updateMoves() {
    movesPill.lastChild.textContent = String(movesLeft);
    movesPill.classList.toggle('m3-low', movesLeft <= 5 && !ended);
  }

  function updateHammer() {
    const n = store.itemCount('МОЛОТОК');
    hammerBtn.innerHTML = '';
    hammerBtn.append('🔨 Молоток', h('span.m3-n', n > 0 ? '×' + n : 'нет'));
    hammerBtn.disabled = n <= 0;
    if (n <= 0 && hammerMode) setHammer(false);
  }

  function setHammer(on) {
    hammerMode = on;
    hammerBtn.classList.toggle('m3-on', on);
    boardEl.classList.toggle('m3-hammering', on);
  }

  function onHammer() {
    if (busy || ended) return;
    if (store.itemCount('МОЛОТОК') <= 0) return;
    setSel(null);
    setHammer(!hammerMode);
    if (hammerMode) toast('Тапни по фишке, чтобы разбить её 🔨');
  }

  function setSel(rc) {
    if (sel) { const t = board.get(sel[0], sel[1]); const el = t && els.get(t.id); if (el) el.classList.remove('m3-sel'); }
    sel = rc;
    if (sel) { const t = board.get(sel[0], sel[1]); const el = t && els.get(t.id); if (el) el.classList.add('m3-sel'); }
  }

  function allDone() { return goals.every((g) => g.left <= 0); }

  async function doMove(a, b) {
    if (busy || ended) return;
    const A = board.get(a[0], a[1]), B = board.get(b[0], b[1]);
    if (!A || !B) return;
    clearHint();
    busy = true;
    setSel(null);
    const elA = els.get(A.id), elB = els.get(B.id);
    const res = board.trySwap(a, b);
    if (!res) { busy = false; return; }
    elA.style.zIndex = 3;
    setPos(elA, b[0], b[1], 180, 'ease-in-out');
    setPos(elB, a[0], a[1], 180, 'ease-in-out');
    await wait(190);
    if (!alive) return;
    if (!res.valid) {
      setPos(elA, a[0], a[1], 200, 'cubic-bezier(.34,1.6,.64,1)');
      setPos(elB, b[0], b[1], 200, 'cubic-bezier(.34,1.6,.64,1)');
      await wait(210);
      elA.style.zIndex = '';
      busy = false;
      scheduleHint();
      return;
    }
    elA.style.zIndex = '';
    movesLeft--;
    updateMoves();
    await playResult(res);
    if (!alive) return;
    await afterTurn();
  }

  async function doHammer(r, c) {
    if (busy || ended) return;
    if (!board.get(r, c)) return;
    if (!store.removeItem('МОЛОТОК')) { updateHammer(); return; }
    clearHint();
    busy = true;
    setHammer(false);
    updateHammer();
    const t = board.get(r, c);
    const el = els.get(t.id);
    if (el) { el.classList.add('m3-sel'); await wait(150); }
    effect({ kind: 'bomb', r, c, rad: 0.2 });
    vibrate(20);
    const res = board.hammer(r, c);
    await playResult(res);
    if (!alive) return;
    await afterTurn();
  }

  async function afterTurn() {
    if (allDone()) { await win(); return; }
    if (movesLeft <= 0) { await lose(); return; }
    busy = false;
    scheduleHint();
  }

  // Подсказка: через 6 секунд бездействия покачиваем возможный ход
  function clearHint() {
    clearTimeout(hintTimer);
    boardEl.querySelectorAll('.m3-hint').forEach((e) => e.classList.remove('m3-hint'));
  }
  function scheduleHint() {
    clearHint();
    hintTimer = setTimeout(() => {
      if (!alive || busy || ended) return;
      const mv = board.findMove();
      if (!mv) return;
      for (const [r, c] of mv) { const el = els.get(board.get(r, c).id); if (el) el.classList.add('m3-hint'); }
    }, 6000);
  }
  scheduleHint();

  // ---------- Итоги ----------
  async function win() {
    ended = true;
    busy = true;
    updateMoves();
    store.state.progress.match3Level = level + 1;
    store.commit();
    const reward = {
      keys: 1,
      coins: 15 + movesLeft * 3,
      items: Object.fromEntries(goals.map((g) => [items[g.type].id, 2])),
    };
    vibrate([20, 40, 20]);
    const rect = boardEl.getBoundingClientRect();
    confetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 50);
    banner('Уровень пройден! 🎉', true, 1400);
    await wait(1300);
    if (!alive) return;
    if (movesLeft > 0) {
      banner('Финальный салют! 🎆', true, 1200);
      await wait(700);
      if (!alive) return;
      const n = Math.min(movesLeft, 12);
      for (let i = 0; i < n; i++) { movesLeft--; updateMoves(); }
      await playResult(board.salute(n));
      if (!alive) return;
      confetti(rect.left + rect.width / 2, rect.top + rect.height / 3, 40);
      await wait(400);
    }
    if (!alive) return;
    ctx.finish(reward, `Уровень ${level} пройден!`);
  }

  function lose() {
    ended = true;
    busy = true;
    updateMoves();
    const finishLose = () => ctx.finish({ coins: 5 }, 'Ходы закончились');
    if (extraUsed) {
      banner('Ходы закончились 😿', true, 1200);
      return wait(1100).then(() => { if (alive) finishLose(); });
    }
    const left = goals.filter((g) => g.left > 0).map((g) => h('div.m3-goal', gemEl(g.type), String(g.left)));
    let m = null;
    const extraBtn = h('button.btn.btn-green.btn-big', {
      onclick: () => {
        if (!store.spendEnergy(3)) { toast('Не хватает энергии ⚡'); return; }
        extraUsed = true;
        movesLeft += 5;
        ended = false;
        updateMoves();
        openModal = null;
        m.close();
        banner('+5 ходов! 💪', true, 1000);
        busy = false;
        scheduleHint();
      },
    }, '+5 ходов за 3 ⚡');
    m = modal([
      h('div.modal-title', 'Ходы закончились 😿'),
      h('p.muted.center', 'Осталось собрать совсем чуть-чуть:'),
      h('div.m3-lose-goals', left),
      extraBtn,
      h('button.btn.btn-ghost.btn-big', { onclick: () => { openModal = null; m.close(); finishLose(); } }, 'Завершить'),
    ], { dismissable: false });
    openModal = m;
  }

  async function onExit() {
    const ok = await confirmDialog('Выйти? Прогресс уровня потеряется', 'Выйти');
    if (ok && alive) ctx.exit();
  }

  // ---------- Ввод ----------
  let down = null; // { r, c, x, y, used }
  function cellAt(e) {
    const rect = boardEl.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / cell);
    const r = Math.floor((e.clientY - rect.top) / cell);
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
    return [r, c];
  }
  function onDown(e) {
    if (busy || ended) return;
    const rc = cellAt(e);
    if (!rc) return;
    down = { r: rc[0], c: rc[1], x: e.clientX, y: e.clientY, used: false, id: e.pointerId };
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onMove(e) {
    if (!down || down.used || down.id !== e.pointerId || hammerMode) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) return;
    down.used = true;
    const [dr, dc] = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
    const b = [down.r + dr, down.c + dc];
    if (b[0] < 0 || b[1] < 0 || b[0] >= SIZE || b[1] >= SIZE) return;
    doMove([down.r, down.c], b);
  }
  function onUp(e) {
    if (!down || down.id !== e.pointerId) return;
    const d = down;
    down = null;
    if (d.used || busy || ended) return;
    const rc = [d.r, d.c];
    if (hammerMode) { doHammer(rc[0], rc[1]); return; }
    if (sel) {
      if (sel[0] === rc[0] && sel[1] === rc[1]) { setSel(null); return; }
      if (Math.abs(sel[0] - rc[0]) + Math.abs(sel[1] - rc[1]) === 1) { doMove(sel, rc); return; }
    }
    setSel(rc);
  }
  const onCancel = () => { down = null; };
  boardEl.addEventListener('pointerdown', onDown);
  boardEl.addEventListener('pointermove', onMove);
  boardEl.addEventListener('pointerup', onUp);
  boardEl.addEventListener('pointercancel', onCancel);

  return () => {
    alive = false;
    clearTimeout(hintTimer);
    ro.disconnect();
    boardEl.removeEventListener('pointerdown', onDown);
    boardEl.removeEventListener('pointermove', onMove);
    boardEl.removeEventListener('pointerup', onUp);
    boardEl.removeEventListener('pointercancel', onCancel);
    if (openModal) { try { openModal.close(); } catch (e) { /* ignore */ } openModal = null; }
    root.classList.remove('m3-root');
  };
}

// ---------- Фишки из сумки ----------
// Игрок приносит 3–6 своих предметов: они становятся фишками, цели выбираются среди них,
// за каждую выполненную цель — +2 этого предмета. Недостающие типы — «пустышки» без награды.
const FILLERS = [
  { id: null, word: 'КАМЕШЕК', emoji: '🪨', filler: true },
  { id: null, word: 'ПУЗЫРЬ', emoji: '🫧', filler: true },
  { id: null, word: 'ЛИСТИК', emoji: '🍂', filler: true },
];
export const MIN_PICK = 3;

export function withItems(cfg, chosen) {
  const rng = mulberry32(cfg.seed + chosen.length * 31);
  const items = [...chosen, ...FILLERS].slice(0, NTYPES);
  const nGoals = Math.min(cfg.goals.length, chosen.length);
  const need = cfg.goals[0].need;
  const goalTypes = shuffle([...chosen.keys()], rng).slice(0, nGoals);
  return { ...cfg, items, goals: goalTypes.map((type) => ({ type, need })) };
}

/** Предметы из сумки, которые годятся в фишки (ярус 1, по убыванию количества) */
export function bagCandidates(state) {
  return Object.entries(state.items)
    .map(([id, n]) => ({ it: getItem(id), n }))
    .filter(({ it }) => it.tier === 1)
    // инструменты-бустеры — в конец, чтобы по умолчанию фишками становились вещи
    .sort((a, b) => (a.it.cat === 'tools') - (b.it.cat === 'tools') || b.n - a.n || a.it.word.localeCompare(b.it.word));
}

const PICK_CSS = `
.m3p { flex: 1; overflow-y: auto; padding: 0 14px calc(16px + var(--safe-bottom)); display: flex; flex-direction: column; gap: 12px; }
.m3p-lead { background: rgba(255,255,255,.75); border-radius: 16px; padding: 10px 12px; font-size: 14px; font-weight: 700; line-height: 1.4; }
.m3p-sel { display: flex; gap: 6px; justify-content: center; min-height: 56px; flex-wrap: wrap; }
.m3p-slot { width: 50px; height: 50px; border-radius: 14px; background: rgba(255,255,255,.5); outline: 2px dashed rgba(122,92,255,.4); outline-offset: -3px; display: flex; align-items: center; justify-content: center; font-size: 30px; }
.m3p-slot.on { background: #fff; outline: 0; box-shadow: 0 3px 0 rgba(43,29,74,.12); animation: pop .25s; }
.m3p-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.m3p-it { position: relative; border: 0; background: #fff; border-radius: 14px; padding: 8px 2px 6px; display: flex; flex-direction: column; align-items: center; gap: 2px; box-shadow: inset 0 0 0 2px var(--rar), 0 3px 0 rgba(43,29,74,.08); }
.m3p-it.on { background: #e9fff5; box-shadow: inset 0 0 0 3px var(--green), 0 3px 0 rgba(43,29,74,.08); transform: translateY(-2px); }
.m3p-it .e { font-size: 30px; line-height: 1.1; }
.m3p-it .w { font-size: 10.5px; font-weight: 800; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 3px; }
.m3p-it .n { position: absolute; top: -5px; right: -4px; background: var(--pink); color: #fff; font-size: 11px; font-weight: 900; border-radius: 99px; padding: 1px 6px; }
.m3p-empty { text-align: center; padding: 24px 12px; background: #fff; border-radius: 20px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 12px; }
`;

export function mount(root, ctx) {
  const store = ctx.store;
  const level = store.state.progress.match3Level || 1;
  const cands = bagCandidates(store.state);
  const refund = () => { store.addEnergy(meta.cost.energy); ctx.exit(); };
  let cleanup = null;

  root.append(h('style', PICK_CSS), h('div.game-top',
    h('button.btn-icon', { onclick: refund, 'aria-label': 'Выйти' }, '✕'),
    h('div.game-title', `🍬 Уровень ${level}`),
  ));
  const body = h('div.m3p');
  root.append(body);

  if (cands.length < MIN_PICK) {
    body.append(h('div.m3p-empty',
      h('div', { style: { fontSize: '54px' } }, '🎒'),
      h('b', `Нужно хотя бы ${MIN_PICK} разных предмета`),
      h('div.small.muted', `У тебя ${cands.length}. Предметы дают «Пасьянс» (из карточек-слов), «Поиск» и «Эрудит». Энергию вернём.`),
      h('button.btn', { onclick: refund }, 'Понятно'),
    ));
    return () => {};
  }

  let picked = cands.slice(0, NTYPES).map((c) => c.it.id);
  const selEl = h('div.m3p-sel');
  const gridEl = h('div.m3p-grid');
  const go = h('button.btn.btn-big.btn-green', { onclick: start }, 'Играть ▶');

  body.append(
    h('div.m3p-lead', 'Выбери от 3 до 6 своих предметов — они станут фишками. Предметы не тратятся: за каждую выполненную цель получишь ещё 2 таких же. Плюс ключ 🗝️ для «Поиска».'),
    selEl, go, gridEl,
  );

  function render() {
    selEl.replaceChildren(...Array.from({ length: NTYPES }, (_, i) => {
      const id = picked[i];
      return h('div.m3p-slot' + (id ? '.on' : ''), id ? getItem(id).emoji : '');
    }));
    gridEl.replaceChildren(...cands.map(({ it, n }) => h('button.m3p-it' + (picked.includes(it.id) ? '.on' : ''), {
      style: { '--rar': RARITY[it.rarity].color },
      onclick: () => {
        if (picked.includes(it.id)) picked = picked.filter((x) => x !== it.id);
        else if (picked.length < NTYPES) picked.push(it.id);
        else toast('Максимум 6 предметов');
        render();
      },
    }, h('span.e', it.emoji), h('span.w', it.word.toLowerCase()), h('span.n', n))));
    go.disabled = picked.length < MIN_PICK;
    go.textContent = picked.length < MIN_PICK ? `Выбери ещё ${MIN_PICK - picked.length}` : 'Играть ▶';
  }

  function start() {
    const chosen = picked.map((id) => getItem(id));
    root.replaceChildren();
    cleanup = playLevel(root, ctx, chosen);
  }

  render();
  return () => { cleanup && cleanup(); };
}
