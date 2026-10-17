// Мини-игра «Три в ряд».
// Логика поля (класс Board, levelConfig) не трогает DOM и проверяется в node.
// Рендер (mount) только проигрывает «шаги», которые возвращает логика.

import { itemsByCat, CATEGORIES, getItem, RARITY } from '../data/items.js';
import { h, toast, modal, confetti, confirmDialog, shuffle } from '../ui/common.js';
import { floatText } from '../ui/fx.js';
import { sfx, buzz } from '../ui/device.js';

export const meta = {
  id: 'match3',
  title: 'Три в ряд',
  emoji: '🍬',
  desc: 'Собирай ряды из предметов',
  cost: { energy: 5 },
  gives: 'ключи, предметы',
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

  /** Общий бустер: очистить набор клеток (спецфишки в нём срабатывают цепочкой), затем каскад. */
  blast(cells, effects = []) {
    const keys = new Set();
    for (const [r, c] of cells) if (this.get(r, c)) keys.add(key(r, c));
    if (!keys.size) return null;
    return this._cascade(this._phase(keys, [], 1, [], effects));
  }

  /** Бустер «Бомба»: взрыв 3×3 вокруг клетки. */
  bomb3(r, c) {
    if (!this.get(r, c)) return null;
    const cells = [];
    for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) cells.push([y, x]);
    return this.blast(cells, [{ kind: 'bomb', r, c, rad: 1 }]);
  }

  /** Бустер «Ножницы»: весь ряд. */
  clearRow(r, c = 0) {
    if (!this.get(r, c)) return null;
    return this.blast(Array.from({ length: this.size }, (_, x) => [r, x]), [{ kind: 'row', r, c }]);
  }

  /** Бустер «Топор»: весь столбец. */
  clearCol(c, r = 0) {
    if (!this.get(r, c)) return null;
    return this.blast(Array.from({ length: this.size }, (_, y) => [y, c]), [{ kind: 'col', r, c }]);
  }

  /** Бустер «Магнит»: все фишки типа фишки в клетке (по радуге — самого частого типа). */
  magnet(r, c) {
    const t = this.get(r, c);
    if (!t) return null;
    let type = t.type;
    if (t.special === 'rainbow') {
      const cnt = Array(this.ntypes).fill(0);
      for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) { const m = this.mt(y, x); if (m >= 0) cnt[m]++; }
      type = cnt.indexOf(Math.max(...cnt));
    }
    const cells = [[r, c]];
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) if (this.mt(y, x) === type) cells.push([y, x]);
    return this.blast(cells, [{ kind: 'magnet', r, c, type }]);
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

// Плоские «кислотные» цвета фишек: [заливка, тёмный оттенок для частиц]
const COLORS = [
  ['#ff5fa2', '#d6307a'], // розовый
  ['#ff7a1a', '#c95300'], // оранжевый
  ['#ffd60a', '#c9a400'], // жёлтый
  ['#c8ff2e', '#8fc400'], // лайм
  ['#4fb8ff', '#1f7fd0'], // голубой
  ['#8c7bff', '#5a46e0'], // фиолетовый
];

// Бустеры — инструменты из сумки. target: нужен тап по клетке; gen — «Нет …».
const BOOSTERS = [
  { id: 'МОЛОТОК', emoji: '🔨', name: 'Молоток', gen: 'молотка', target: true, hint: 'Тапни по фишке — разобью 🔨' },
  { id: 'БОМБА', emoji: '💣', name: 'Бомба', gen: 'бомбы', target: true, hint: 'Тапни по клетке — взрыв 3×3 💣' },
  { id: 'НОЖНИЦЫ', emoji: '✂️', name: 'Ножницы', gen: 'ножниц', target: true, hint: 'Тапни по клетке — срежу весь ряд ✂️' },
  { id: 'ТОПОР', emoji: '🪓', name: 'Топор', gen: 'топора', target: true, hint: 'Тапни по клетке — срублю весь столбец 🪓' },
  { id: 'МАГНИТ', emoji: '🧲', name: 'Магнит', gen: 'магнита', target: true, hint: 'Тапни по фишке — заберу все такие 🧲' },
  { id: 'КОМПАС', emoji: '🧭', name: 'Компас', gen: 'компаса', target: false },
];
const FX_MAX = 12; // одновременных частиц/вспышек на поле

const SPECIAL_NAME = { rocketH: 'РАКЕТА!', rocketV: 'РАКЕТА!', bomb: 'БОМБА!', rainbow: 'РАДУГА!' };
// Надписи каскада: чем длиннее цепочка, тем крупнее и безумнее
const COMBO = [
  null, null,
  { text: 'Отлично!', cls: 'm3-c1' },
  { text: 'Супер!', cls: 'm3-c2' },
  { text: 'МЕГА!', cls: 'm3-c3' },
  { text: 'БЕЗУМИЕ!', cls: 'm3-c4' },
];

const CSS = `
.m3-root { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; color:var(--ink);
  background-color:var(--paper); background-image:radial-gradient(rgba(17,17,17,.07) 1.2px, transparent 1.3px); background-size:18px 18px; }
.m3-top { padding:calc(10px + var(--safe-top)) 14px 6px; gap:10px; }
.m3-title { display:flex; flex-direction:column; line-height:1; font-family:var(--display); }
.m3-title small { font-size:10px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--ink-soft); }
.m3-title b { font-size:24px; font-weight:900; letter-spacing:-1px; }
.m3-moves { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:66px; padding:5px 10px 4px;
  background:var(--ink); color:var(--lime); border:2.5px solid var(--ink); border-radius:18px; box-shadow:0 4px 0 rgba(17,17,17,.3); line-height:1; }
.m3-moves b { font-family:var(--display); font-weight:900; font-size:24px; letter-spacing:-1px; }
.m3-moves small { font-size:9px; font-weight:900; letter-spacing:1px; text-transform:uppercase; color:#fff; opacity:.75; margin-top:2px; }
.m3-moves.m3-tick { animation:m3-tick .35s cubic-bezier(.3,1.8,.5,1); }
.m3-moves.m3-low { background:#ff3b3b; color:#fff; box-shadow:0 4px 0 var(--ink); }
.m3-moves.m3-low small { opacity:1; }
.m3-goals { display:flex; gap:10px; justify-content:center; padding:6px 10px 2px; flex-wrap:wrap; }
.m3-goal { position:relative; display:flex; align-items:center; gap:7px; background:#fff; border:2.5px solid var(--ink); border-radius:18px;
  padding:4px 12px 4px 5px; box-shadow:0 4px 0 var(--ink); font-family:var(--display); font-weight:900; font-size:20px; letter-spacing:-.5px;
  transition:background .25s; }
.m3-goal .m3-gem { position:relative; inset:auto; width:34px; height:34px; font-size:20px; flex:none; }
.m3-goal.m3-bump { animation:m3-gbump .42s cubic-bezier(.3,1.8,.5,1); }
.m3-goal.m3-done { background:var(--lime); }
.m3-check { width:28px; height:28px; border-radius:50%; background:var(--ink); color:var(--lime); display:flex; align-items:center; justify-content:center;
  font-family:var(--font, inherit); font-size:17px; font-weight:900; animation:m3-checkin .55s cubic-bezier(.2,1.8,.4,1) both; }
.m3-theme { align-self:center; font-weight:900; font-size:12px; background:var(--ink); color:var(--lime); border-radius:99px; padding:3px 12px; margin-top:6px; }
.m3-wrap { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; position:relative; padding:6px 8px 12px; }
.m3-board { position:relative; touch-action:none; overflow:hidden; box-sizing:content-box; border:3px solid var(--ink); border-radius:22px;
  background:#fff; box-shadow:0 6px 0 var(--ink); }
.m3-board.m3-shake { animation:m3-shake .35s; }
.m3-board.m3-shake2 { animation:m3-shake2 .5s; }
.m3-root.m3-danger .m3-board { box-shadow:0 6px 0 var(--ink), 0 0 0 5px rgba(255,59,59,.5); }
.m3-board.m3-hammering { outline:4px dashed var(--orange); outline-offset:4px; }
.m3-cellbg { position:absolute; border-radius:24%; background:#f0eee3; }
.m3-cellbg.m3-alt { background:#e6e4d7; }
.m3-tile { position:absolute; left:0; top:0; will-change:transform; z-index:2; }
.m3-gem { position:absolute; inset:5% 7% 10% 7%; border-radius:28%; display:flex; align-items:center; justify-content:center;
  background:var(--c); border:2.5px solid var(--ink); box-shadow:0 3px 0 var(--ink), inset 0 -4px 0 rgba(0,0,0,.13);
  transition:transform .15s; line-height:1; }
.m3-gem .m3-em { position:relative; z-index:1; pointer-events:none; }
.m3-gem::after { content:''; position:absolute; left:13%; top:9%; width:30%; height:15%; border-radius:99px; background:rgba(255,255,255,.75); pointer-events:none; z-index:1; }
.m3-sel .m3-gem { transform:translateY(-3px) scale(1.1) rotate(-6deg); box-shadow:0 5px 0 var(--ink), 0 0 0 3px var(--lime), 0 0 0 5.5px var(--ink); }
.m3-hint .m3-gem { animation:m3-wiggle .5s 3; }
.m3-gem.m3-rocketH::before, .m3-gem.m3-rocketV::before { content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background:repeating-linear-gradient(0deg, rgba(17,17,17,.22) 0 3px, transparent 3px 8px); }
.m3-gem.m3-rocketV::before { background:repeating-linear-gradient(90deg, rgba(17,17,17,.22) 0 3px, transparent 3px 8px); }
.m3-gem.m3-bomb { box-shadow:0 3px 0 var(--ink), 0 0 0 3px #fff, 0 0 0 5px var(--ink); }
.m3-gem.m3-rainbow { overflow:hidden; background:#fff; }
.m3-gem.m3-rainbow::before { content:''; position:absolute; inset:-35%; pointer-events:none;
  background:conic-gradient(from 30deg, var(--pink), var(--orange), var(--yellow), var(--lime), var(--blue), var(--violet), var(--pink)); }
.m3-badge { position:absolute; right:-14%; bottom:-14%; z-index:2; font-size:.42em; background:var(--ink); color:var(--lime); border:1.5px solid var(--ink);
  border-radius:50%; width:1.6em; height:1.6em; display:flex; align-items:center; justify-content:center; font-weight:900; }
.m3-tile.m3-pop .m3-gem { animation:m3-pop .28s ease-in forwards; }
.m3-tile.m3-born .m3-gem, .m3-tile.m3-up .m3-gem { animation:m3-born .4s cubic-bezier(.3,1.7,.5,1); }
.m3-flash { position:absolute; border-radius:50%; pointer-events:none; z-index:3;
  background:radial-gradient(circle, #fff 0, rgba(200,255,46,.85) 35%, transparent 70%); animation:m3-flash .35s ease-out forwards; }
.m3-part { position:absolute; width:9px; height:9px; border-radius:3px; border:1.5px solid var(--ink); pointer-events:none; z-index:4;
  animation:m3-part .55s cubic-bezier(.2,.7,.4,1) forwards; }
.m3-beam { position:absolute; pointer-events:none; z-index:5; border-radius:999px; background:var(--lime); border:3px solid var(--ink);
  box-shadow:0 0 0 5px rgba(200,255,46,.5); will-change:transform; }
.m3-beam.m3-h { animation:m3-beamh .45s ease-out forwards; }
.m3-beam.m3-v { animation:m3-beamv .45s ease-out forwards; }
.m3-ring { position:absolute; border-radius:50%; pointer-events:none; z-index:5; border:5px solid var(--ink);
  box-shadow:inset 0 0 0 6px var(--lime), 0 0 0 6px var(--lime), 0 0 0 11px rgba(255,122,26,.55); animation:m3-ring .5s ease-out forwards; will-change:transform; }
.m3-ring.m3-mag { border-color:var(--ink); box-shadow:inset 0 0 0 5px var(--pink), 0 0 0 5px var(--blue); animation-direction:reverse; }
.m3-ring.m3-rb { border:0; box-shadow:none; background:conic-gradient(var(--pink), var(--orange), var(--yellow), var(--lime), var(--blue), var(--violet), var(--pink));
  -webkit-mask:radial-gradient(circle, transparent 44%, #000 46%); mask:radial-gradient(circle, transparent 44%, #000 46%); }
.m3-burst { position:absolute; pointer-events:none; z-index:6; border-radius:50%;
  background:repeating-conic-gradient(var(--lime) 0 12deg, transparent 12deg 30deg);
  -webkit-mask:radial-gradient(circle, #000 30%, transparent 70%); mask:radial-gradient(circle, #000 30%, transparent 70%);
  animation:m3-burst .6s ease-out forwards; }
.m3-tag { position:absolute; z-index:21; pointer-events:none; white-space:nowrap; font-family:var(--display); font-weight:900; font-size:13px;
  background:var(--ink); color:var(--lime); border-radius:99px; padding:3px 9px; animation:m3-tag .9s cubic-bezier(.2,1.4,.4,1) forwards; }
.m3-pts { position:absolute; z-index:21; pointer-events:none; white-space:nowrap; font-family:var(--display); font-weight:900; font-size:18px;
  background:#fff; color:var(--ink); border:2.5px solid var(--ink); border-radius:99px; padding:1px 9px; box-shadow:0 3px 0 var(--ink);
  animation:m3-tag .8s cubic-bezier(.2,1.4,.4,1) forwards; }
.m3-fly { position:fixed; z-index:60; pointer-events:none; font-size:24px; line-height:1;
  transition:transform .45s cubic-bezier(.5,-0.2,.6,1), opacity .45s; }
.m3-banner { position:absolute; left:50%; top:46%; z-index:20; pointer-events:none; white-space:nowrap; --rot:-4deg;
  font-family:var(--display); font-weight:900; letter-spacing:-1px; text-transform:uppercase; color:var(--ink); font-size:22px;
  background:#fff; border:3px solid var(--ink); border-radius:18px; padding:6px 16px; box-shadow:0 5px 0 var(--ink);
  animation:m3-banner 1.1s cubic-bezier(.3,1.6,.5,1) forwards; }
.m3-banner.m3-big { font-size:min(28px, 7vw); }
.m3-banner.m3-c1 { background:var(--lime); font-size:26px; }
.m3-banner.m3-c2 { background:var(--yellow); font-size:32px; padding:8px 18px; }
.m3-banner.m3-c3 { background:var(--orange); color:#fff; font-size:40px; padding:8px 20px; text-shadow:0 3px 0 var(--ink); box-shadow:0 7px 0 var(--ink); }
.m3-banner.m3-c4 { background:var(--pink); color:#fff; font-size:min(46px, 11vw); padding:10px 20px; text-shadow:0 3px 0 var(--ink);
  box-shadow:0 8px 0 var(--ink), 0 0 0 6px var(--lime), 0 8px 0 6px var(--ink); }
.m3-banner.m3-warn { background:#ff3b3b; color:#fff; text-shadow:0 2px 0 var(--ink); }
.m3-win { position:absolute; inset:0; z-index:30; pointer-events:none; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.m3-win-rays { position:absolute; width:900px; height:900px; left:50%; top:50%; margin:-450px 0 0 -450px; opacity:.55;
  background:repeating-conic-gradient(rgba(200,255,46,.9) 0 10deg, transparent 10deg 20deg); animation:m3-spin 16s linear both;
  -webkit-mask:radial-gradient(circle, #000 0 15%, transparent 55%); mask:radial-gradient(circle, #000 0 15%, transparent 55%); }
.m3-win-txt { position:relative; font-family:var(--display); font-weight:900; font-size:min(54px, 13vw); letter-spacing:-2px; color:var(--lime);
  background:var(--ink); border:4px solid var(--ink); border-radius:26px; padding:12px 24px 10px; box-shadow:0 8px 0 rgba(17,17,17,.35), 0 0 0 5px var(--lime);
  transform:rotate(-4deg); animation:m3-winin .6s cubic-bezier(.2,1.8,.4,1) both; }
.m3-win.m3-out { transition:opacity .3s; opacity:0; }
.m3-bottom { display:flex; gap:6px; align-items:stretch; justify-content:center; padding:2px 10px calc(10px + var(--safe-bottom)); }
.m3-bst { position:relative; flex:1 1 0; min-width:0; max-width:64px; height:52px; padding:0; display:flex; align-items:center; justify-content:center;
  background:#fff; color:var(--ink); border:2.5px solid var(--ink); border-radius:16px; box-shadow:0 4px 0 var(--ink); font:inherit;
  touch-action:manipulation; -webkit-tap-highlight-color:transparent; user-select:none; -webkit-user-select:none; transition:transform .08s; }
.m3-bst:active { transform:translateY(3px); box-shadow:0 1px 0 var(--ink); }
.m3-bst .m3-bem { font-size:25px; line-height:1; pointer-events:none; }
.m3-bst .m3-n { position:absolute; top:-8px; right:-6px; background:var(--ink); color:var(--lime); border-radius:999px; padding:1px 6px;
  font-family:var(--display); font-size:11px; font-weight:900; pointer-events:none; }
.m3-bst.m3-on { background:var(--yellow); transform:translateY(-4px); box-shadow:0 6px 0 var(--ink), 0 0 0 3px var(--lime), 0 0 0 5px var(--ink); }
.m3-bst.m3-empty { background:#ece9dc; border-color:rgba(17,17,17,.35); box-shadow:0 3px 0 rgba(17,17,17,.25); }
.m3-bst.m3-empty .m3-bem { opacity:.4; }
.m3-bst.m3-empty .m3-n { background:#bbb; color:#fff; }
.m3-modal { text-align:center; }
.m3-modal .modal-title { font-size:24px; text-transform:uppercase; }
.m3-modal .m3-sub { font-weight:800; color:var(--ink-soft); margin:2px 0 12px; }
.m3-modal .m3-lose-goals { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom:16px; }
.m3-modal .btn { opacity:1; margin-top:10px; font-family:var(--display); text-transform:uppercase; font-size:16px; }
@keyframes m3-pop { 0% { transform:scale(1); } 40% { transform:scale(1.35) rotate(8deg); } 100% { transform:scale(0) rotate(-20deg); opacity:0; } }
@keyframes m3-born { 0% { transform:scale(0) rotate(-40deg); } 100% { transform:scale(1); } }
@keyframes m3-flash { 0% { transform:scale(.3); opacity:1; } 100% { transform:scale(1.6); opacity:0; } }
@keyframes m3-part { 0% { transform:translate(0,0) scale(1) rotate(0); opacity:1; } 100% { transform:translate(var(--dx),var(--dy)) scale(.2) rotate(var(--rot)); opacity:0; } }
@keyframes m3-beamh { 0% { transform:scaleX(0); opacity:1; } 55% { transform:scaleX(1); opacity:1; } 100% { transform:scaleX(1) scaleY(.15); opacity:0; } }
@keyframes m3-beamv { 0% { transform:scaleY(0); opacity:1; } 55% { transform:scaleY(1); opacity:1; } 100% { transform:scaleY(1) scaleX(.15); opacity:0; } }
@keyframes m3-ring { 0% { transform:scale(.15); opacity:1; } 100% { transform:scale(1); opacity:0; } }
@keyframes m3-burst { 0% { transform:scale(.2) rotate(0); opacity:1; } 100% { transform:scale(1.4) rotate(60deg); opacity:0; } }
@keyframes m3-tag { 0% { transform:translate(-50%,-50%) scale(.3); opacity:0; } 25% { transform:translate(-50%,-80%) scale(1.15); opacity:1; } 70% { transform:translate(-50%,-110%) scale(1); opacity:1; } 100% { transform:translate(-50%,-150%) scale(.9); opacity:0; } }
@keyframes m3-shake { 0%,100% { transform:translate(0,0); } 25% { transform:translate(-4px,2px); } 50% { transform:translate(4px,-3px); } 75% { transform:translate(-3px,-2px); } }
@keyframes m3-shake2 { 0%,100% { transform:translate(0,0) rotate(0); } 15% { transform:translate(-9px,5px) rotate(-1.5deg); } 30% { transform:translate(8px,-6px) rotate(1.2deg); } 50% { transform:translate(-6px,-4px) rotate(-.8deg); } 70% { transform:translate(5px,6px) rotate(.6deg); } 85% { transform:translate(-3px,2px); } }
@keyframes m3-tick { 40% { transform:scale(1.18) rotate(-4deg); } }
@keyframes m3-banner { 0% { transform:translate(-50%,-50%) rotate(var(--rot)) scale(.2); opacity:0; } 22% { transform:translate(-50%,-50%) rotate(var(--rot)) scale(1.15); opacity:1; }
  35% { transform:translate(-50%,-50%) rotate(var(--rot)) scale(1); } 75% { transform:translate(-50%,-62%) rotate(var(--rot)) scale(1); opacity:1; } 100% { transform:translate(-50%,-90%) rotate(var(--rot)) scale(.85); opacity:0; } }
@keyframes m3-gbump { 40% { transform:scale(1.18) rotate(-5deg); } 70% { transform:scale(.96) rotate(2deg); } }
@keyframes m3-checkin { 0% { transform:scale(0) rotate(-120deg); } }
@keyframes m3-winin { 0% { transform:rotate(-30deg) scale(.1); } }
@keyframes m3-wiggle { 0%,100% { transform:translateY(-3px) scale(1.1) rotate(0); } 25% { transform:translateY(-3px) scale(1.1) rotate(-8deg); } 75% { transform:translateY(-3px) scale(1.1) rotate(8deg); } }
@keyframes m3-spin { to { transform:rotate(360deg); } }
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
  let boost = null; // активный бустер, ждущий тапа по клетке
  let lowWarned = false;
  let sel = null; // [r,c]
  let cell = 40;
  let openModal = null;
  let hintTimer = null;
  const goals = cfg.goals.map((g) => ({ ...g, left: g.need, el: null, num: null, closed: false }));
  const els = new Map(); // id тайла → элемент
  const timers = new Set();

  const wait = (ms) => new Promise((res) => { const t = setTimeout(() => { timers.delete(t); res(); }, ms); timers.add(t); });
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); };
  /** Убрать временный элемент эффекта через ms (таймер учитывается и снимается при выходе) */
  const drop = (el, ms) => { const t = setTimeout(() => { timers.delete(t); el.remove(); }, ms); timers.add(t); };
  let fxLive = 0; // сколько частиц/вспышек сейчас на поле (слабые телефоны: не больше FX_MAX)

  // ---------- Разметка ----------
  root.classList.add('m3-root');
  const style = h('style', CSS);
  const movesNum = h('b', String(movesLeft));
  const movesPill = h('div.m3-moves', movesNum, h('small', 'ходов'));
  const top = h('div.game-top.m3-top',
    h('button.btn-icon', { onclick: onExit, 'aria-label': 'Выйти' }, '✕'),
    h('div.game-title.m3-title', h('small', 'уровень'), h('b', String(level))),
    movesPill,
  );
  const goalsEl = h('div.m3-goals', goals.map((g) => {
    g.num = h('span', String(g.left));
    g.el = h('div.m3-goal', gemEl(g.type), g.num);
    return g.el;
  }));
  const themeEl = h('div.m3-theme', `🎁 цель ×2 · ${cfg.moves} ходов`);
  const boardEl = h('div.m3-board');
  const wrap = h('div.m3-wrap', boardEl);
  const boosts = BOOSTERS.map((b) => ({ ...b }));
  const bottom = h('div.m3-bottom.m3-boosts', boosts.map((b) => {
    b.n = h('span.m3-n');
    b.btn = h('button.m3-bst', { type: 'button', 'aria-label': b.name }, h('span.m3-bem', b.emoji), b.n);
    b.btn.addEventListener('pointerdown', (e) => { e.preventDefault(); onBoostBtn(b); });
    // клавиатура/доступность: click без указателя (detail === 0)
    b.btn.addEventListener('click', (e) => { if (e.detail === 0) onBoostBtn(b); });
    return b.btn;
  }));
  root.append(style, top, goalsEl, themeEl, wrap, bottom);
  updateBoosts();

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
    gem.style.setProperty('--c', COLORS[type % COLORS.length][0]);
    gem.append(h('span.m3-em', items[type].emoji));
    if (special) {
      gem.classList.add('m3-' + special);
      gem.append(h('span.m3-badge', special === 'bomb' ? '✸' : special === 'rocketH' ? '⇆' : '⇅'));
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
    el.style.fontSize = Math.round(cell * 0.5) + 'px';
  }

  function setPos(el, r, c, ms = 0, ease = 'cubic-bezier(.34,1.5,.64,1)') {
    el.style.transition = ms ? `transform ${ms}ms ${ease}` : 'none';
    el.style.transform = `translate(${c * cell}px, ${r * cell}px)`;
    el._r = r; el._c = c;
  }

  function layout() {
    const w = wrap.clientWidth - 16 - 6, hh = wrap.clientHeight - 18 - 12;
    const nc = Math.max(28, Math.floor(Math.min(w, hh) / SIZE));
    if (nc === cell && boardEl.childElementCount) return;
    cell = nc;
    boardEl.style.width = boardEl.style.height = cell * SIZE + 'px';
    boardEl.querySelectorAll('.m3-cellbg').forEach((e) => e.remove());
    const frag = document.createDocumentFragment();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        frag.append(h('div.m3-cellbg' + ((r + c) % 2 ? '.m3-alt' : ''), { style: { left: c * cell + 2 + 'px', top: r * cell + 2 + 'px', width: cell - 4 + 'px', height: cell - 4 + 'px' } }));
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
  later(() => { for (const el of els.values()) { el.classList.remove('m3-born'); el._gem.style.animationDelay = ''; } }, 800);
  later(() => banner(`Собери ${goals.map((g) => items[g.type].emoji).join(' ')}`, '', 1300), 350);

  // ---------- Эффекты ----------
  /** Центр клетки в координатах .m3-wrap (для надписей, которые не должны обрезаться полем) */
  function wpos(r, c) {
    return { x: boardEl.offsetLeft + 3 + (c + 0.5) * cell, y: boardEl.offsetTop + 3 + (r + 0.5) * cell };
  }
  /** Центр клетки на экране */
  function spos(r, c) {
    const rect = boardEl.getBoundingClientRect();
    return { x: rect.left + 3 + (c + 0.5) * cell, y: rect.top + 3 + (r + 0.5) * cell };
  }

  function banner(text, cls = '', ms = 1100) {
    const b = h('div.m3-banner' + (cls ? '.' + cls.split(' ').join('.') : ''), text);
    b.style.animationDuration = ms + 'ms';
    b.style.setProperty('--rot', (Math.random() * 10 - 5).toFixed(1) + 'deg');
    wrap.append(b);
    drop(b, ms + 50);
  }

  function wrapLabel(cls, text, x, y, ms = 900) {
    const t = h('div.' + cls, { style: { left: x + 'px', top: y + 'px' } }, text);
    wrap.append(t);
    drop(t, ms + 50);
  }

  function flash(r, c) {
    if (fxLive >= FX_MAX) return;
    fxLive++;
    const f = h('div.m3-flash', { style: { left: c * cell - cell * 0.2 + 'px', top: r * cell - cell * 0.2 + 'px', width: cell * 1.4 + 'px', height: cell * 1.4 + 'px' } });
    boardEl.append(f);
    later(() => fxLive--, 400);
    drop(f, 400);
  }

  function burst(r, c, scale = 3) {
    const d = cell * scale;
    const b = h('div.m3-burst', { style: { left: (c + 0.5) * cell - d / 2 + 'px', top: (r + 0.5) * cell - d / 2 + 'px', width: d + 'px', height: d + 'px' } });
    boardEl.append(b);
    drop(b, 650);
  }

  function particles(r, c, type, n) {
    const col = type >= 0 ? COLORS[type % COLORS.length] : ['#c8ff2e', '#ff5fa2', '#4fb8ff'];
    n = Math.min(n, FX_MAX - fxLive);
    for (let i = 0; i < n; i++) {
      fxLive++;
      const p = h('div.m3-part', { style: { left: c * cell + cell / 2 - 4 + 'px', top: r * cell + cell / 2 - 4 + 'px', background: col[i % col.length] } });
      const ang = Math.random() * Math.PI * 2, dist = cell * (0.6 + Math.random() * 0.9);
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.style.setProperty('--rot', Math.random() * 540 + 'deg');
      boardEl.append(p);
      later(() => fxLive--, 600);
      drop(p, 600);
    }
  }

  function shake(strong) {
    boardEl.classList.remove('m3-shake', 'm3-shake2'); void boardEl.offsetWidth;
    const cls = strong ? 'm3-shake2' : 'm3-shake';
    boardEl.classList.add(cls);
    later(() => boardEl.classList.remove(cls), strong ? 520 : 370);
  }

  function effect(e) {
    const full = cell * SIZE;
    if (e.kind === 'row') {
      const b = h('div.m3-beam.m3-h', { style: { left: '0px', top: e.r * cell + cell * 0.28 + 'px', width: full + 'px', height: cell * 0.44 + 'px', transformOrigin: (e.c + 0.5) * cell + 'px 50%' } });
      boardEl.append(b); drop(b, 500);
      shake(false);
    } else if (e.kind === 'col') {
      const b = h('div.m3-beam.m3-v', { style: { top: '0px', left: e.c * cell + cell * 0.28 + 'px', height: full + 'px', width: cell * 0.44 + 'px', transformOrigin: `50% ${(e.r + 0.5) * cell}px` } });
      boardEl.append(b); drop(b, 500);
      shake(false);
    } else if (e.kind === 'magnet') {
      const d = cell * 2.4;
      const ring = h('div.m3-ring.m3-mag', { style: { left: (e.c + 0.5) * cell - d / 2 + 'px', top: (e.r + 0.5) * cell - d / 2 + 'px', width: d + 'px', height: d + 'px' } });
      boardEl.append(ring); drop(ring, 550);
      shake(false);
    } else if (e.kind === 'bomb' || e.kind === 'rainbow') {
      const rad = e.kind === 'rainbow' ? 4 : (e.rad || 1) + 0.8;
      const d = cell * rad * 2;
      const ring = h('div.m3-ring' + (e.kind === 'rainbow' ? '.m3-rb' : ''), { style: { left: (e.c + 0.5) * cell - d / 2 + 'px', top: (e.r + 0.5) * cell - d / 2 + 'px', width: d + 'px', height: d + 'px' } });
      boardEl.append(ring); drop(ring, 550);
      if ((e.rad || 1) >= 0.5) burst(e.r, e.c, rad * 1.6);
      shake((e.rad || 1) >= 0.5);
    }
  }

  function closeGoal(g) {
    if (g.closed) return;
    g.closed = true;
    g.el.classList.add('m3-done');
    const check = h('span.m3-check', '✓');
    g.num.replaceWith(check);
    g.num = check;
    const r = g.el.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 2, 22); // со звуком победы
    floatText('Готово!', r.left + r.width / 2, r.top);
    buzz([15, 40, 15]);
  }

  function bumpGoal(g) {
    g.el.classList.remove('m3-bump'); void g.el.offsetWidth; g.el.classList.add('m3-bump');
  }

  /** Фишки летят из поля в цель; число на цели меняется, когда они долетают */
  function collect(cleared, maxFly = 4) {
    const per = new Map(); // goal → [cells]
    for (const cl of cleared) {
      if (cl.type < 0) continue;
      for (const g of goals) {
        if (g.type !== cl.type || g.left <= 0) continue;
        g.left--;
        if (!per.has(g)) per.set(g, []);
        per.get(g).push(cl);
      }
    }
    for (const [g, cells] of per) {
      const shown = g.left;
      const gr = g.el.getBoundingClientRect();
      const tx = gr.left + 22, ty = gr.top + gr.height / 2;
      cells.slice(0, maxFly).forEach((cl, i) => {
        const from = spos(cl.r, cl.c);
        const f = h('div.m3-fly', { style: { left: from.x - 12 + 'px', top: from.y - 12 + 'px' } }, items[g.type].emoji);
        document.body.append(f);
        later(() => {
          f.style.transform = `translate(${tx - from.x}px, ${ty - from.y}px) scale(.7)`;
          f.style.opacity = '.4';
        }, 20 + i * 40);
        drop(f, 520 + i * 40);
      });
      later(() => {
        if (shown <= 0) closeGoal(g);
        else { g.num.textContent = String(shown); bumpGoal(g); }
        floatText('+' + cells.length, gr.left + gr.width / 2, gr.top + 4);
        if (shown <= 0) bumpGoal(g);
      }, 470);
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
      sfx('coin'); buzz(10);
      await wait(380);
      if (!alive) return;
    }
    const combo = COMBO[Math.min(st.combo, COMBO.length - 1)];
    if (combo) banner(combo.text, combo.cls, st.combo >= 4 ? 1200 : 950);
    for (const e of st.effects) effect(e);

    // один звук на шаг — самый важный
    const big = st.effects.some((e) => e.kind === 'bomb' || e.kind === 'rainbow');
    const rocket = st.effects.some((e) => e.kind === 'row' || e.kind === 'col');
    if (big) { sfx('reward'); buzz([30, 30, 50]); }
    else if (rocket) { sfx('coin'); buzz(25); }
    else if (st.combo >= 3) { sfx('win'); buzz(15); }
    else if (st.combo === 2) { sfx('coin'); buzz(10); }
    else { sfx('tap'); if (st.cleared.length >= 4) buzz(10); }

    const many = st.cleared.length > 20;
    const mag = st.effects.some((e) => e.kind === 'magnet');
    collect(st.cleared, mag ? 10 : 4);
    let sx = 0, sy = 0;
    for (const cl of st.cleared) {
      const el = els.get(cl.id);
      sx += cl.r; sy += cl.c;
      flash(cl.r, cl.c);
      particles(cl.r, cl.c, cl.type, many ? 1 : 3);
      if (el) {
        els.delete(cl.id);
        el.style.zIndex = 3;
        el.classList.add('m3-pop');
        drop(el, 300);
      }
    }
    if (st.cleared.length >= 4) {
      const p = wpos(sx / st.cleared.length, sy / st.cleared.length);
      wrapLabel('m3-pts', '+' + st.cleared.length, p.x, p.y, 800);
    }
    await wait(st.effects.length ? 300 : 230);
    if (!alive) return;

    for (const cr of st.created) {
      const el = makeTile(cr.tile, cr.r, cr.c);
      el.classList.add('m3-born');
      burst(cr.r, cr.c, 2.6);
      flash(cr.r, cr.c);
      const p = wpos(cr.r, cr.c);
      wrapLabel('m3-tag', SPECIAL_NAME[cr.tile.special] || '✦', p.x, p.y - cell * 0.4, 900);
    }
    if (st.created.length) { sfx('win'); buzz([12, 30, 12]); }
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
      banner('Ходов нет — мешаем! 🔀', '', 1300);
      await wait(500);
      syncAll(450);
      await wait(500);
    }
  }

  // ---------- Ход ----------
  function updateMoves(tick = false) {
    movesNum.textContent = String(movesLeft);
    const low = movesLeft <= 3 && !ended;
    movesPill.classList.toggle('m3-low', low);
    root.classList.toggle('m3-danger', low);
    if (tick && !low) { movesPill.classList.remove('m3-tick'); void movesPill.offsetWidth; movesPill.classList.add('m3-tick'); }
    if (low && movesLeft > 0 && !lowWarned) {
      lowWarned = true;
      banner(`Осталось ${movesLeft} ${movesLeft === 1 ? 'ход' : 'хода'}!`, 'm3-warn', 1200);
      sfx('error'); buzz([30, 60, 30]);
    }
  }

  // ---------- Бустеры ----------
  function updateBoosts() {
    for (const b of boosts) {
      const n = store.itemCount(b.id);
      b.n.textContent = n > 0 ? '×' + n : '0';
      b.btn.classList.toggle('m3-empty', n <= 0);
      b.btn.classList.toggle('m3-on', boost === b);
    }
    if (boost && store.itemCount(boost.id) <= 0) setBoost(null);
  }

  function setBoost(b) {
    boost = b;
    for (const x of boosts) x.btn.classList.toggle('m3-on', x === b);
    boardEl.classList.toggle('m3-hammering', !!b);
  }

  function onBoostBtn(b) {
    if (!alive || ended) return;
    if (store.itemCount(b.id) <= 0) {
      sfx('error'); buzz(20);
      toast(`Нет ${b.gen}. Собери слово ${b.id} в Эрудите`, 2600);
      return;
    }
    if (busy) return;
    sfx('tap'); buzz(6);
    setSel(null);
    if (!b.target) { setBoost(null); useBooster(b, null); return; }
    if (boost === b) { setBoost(null); return; } // повторный тап — отмена
    setBoost(b);
    toast(b.hint, 1600);
  }

  async function useBooster(b, rc) {
    if (busy || ended) return;
    if (rc && !board.get(rc[0], rc[1])) return;
    if (!store.removeItem(b.id)) { updateBoosts(); return; }
    clearHint();
    busy = true;
    setBoost(null);
    setSel(null);
    updateBoosts();
    if (b.id === 'КОМПАС') {
      sfx('coin'); buzz([15, 30, 15]);
      banner('Перемешиваем! 🧭', 'm3-c1', 1000);
      board.reshuffle();
      await carousel();
      if (!alive) return;
      await afterTurn();
      return;
    }
    const [r, c] = rc;
    const t = board.get(r, c);
    const el = els.get(t.id);
    if (el) { el.classList.add('m3-sel'); await wait(120); if (!alive) return; el.classList.remove('m3-sel'); }
    let res = null;
    if (b.id === 'МОЛОТОК') {
      effect({ kind: 'bomb', r, c, rad: 0.2 });
      sfx('coin'); buzz(20);
      res = board.hammer(r, c);
    } else if (b.id === 'БОМБА') {
      res = board.bomb3(r, c);
    } else if (b.id === 'НОЖНИЦЫ') {
      res = board.clearRow(r, c);
    } else if (b.id === 'ТОПОР') {
      res = board.clearCol(c, r);
    } else if (b.id === 'МАГНИТ') {
      res = board.magnet(r, c);
      sfx('coin'); buzz([10, 20, 10]);
      // фишки притягиваются к магниту, потом улетают в цель
      const tx = c, ty = r;
      for (const cl of res.steps[0].cleared) {
        const e2 = els.get(cl.id);
        if (e2 && (cl.r !== r || cl.c !== c)) setPos(e2, cl.r + (ty - cl.r) * 0.55, cl.c + (tx - cl.c) * 0.55, 230, 'cubic-bezier(.5,0,.8,.6)');
      }
      await wait(240);
      if (!alive) return;
    }
    if (res) await playResult(res);
    if (!alive) return;
    await afterTurn();
  }

  /** Компас: фишки взлетают в карусель вокруг центра поля и раскладываются по новым местам */
  async function carousel() {
    const half = (SIZE * cell) / 2, R = half * 0.62;
    const list = [...els.values()];
    list.forEach((el, i) => {
      const ang = (i / list.length) * Math.PI * 2;
      el.style.transition = `transform 300ms cubic-bezier(.5,0,.3,1)`;
      el.style.transform = `translate(${half - cell / 2 + Math.cos(ang) * R}px, ${half - cell / 2 + Math.sin(ang) * R}px) rotate(${Math.round(ang * 57)}deg) scale(.7)`;
    });
    await wait(320);
    if (!alive) return;
    list.forEach((el, i) => {
      const ang = (i / list.length) * Math.PI * 2 + 1.6;
      el.style.transition = `transform 320ms linear`;
      el.style.transform = `translate(${half - cell / 2 + Math.cos(ang) * R}px, ${half - cell / 2 + Math.sin(ang) * R}px) rotate(${Math.round(ang * 57 + 90)}deg) scale(.7)`;
    });
    await wait(330);
    if (!alive) return;
    syncAll(420);
    await wait(440);
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
      sfx('error'); buzz(30);
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
    updateMoves(true);
    await playResult(res);
    if (!alive) return;
    await afterTurn();
  }

  async function afterTurn() {
    // дождаться, пока последние фишки долетят до целей
    await wait(goals.some((g) => g.left <= 0 && !g.closed) ? 500 : 0);
    if (!alive) return;
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
  function salvo(rect, rounds = 4) {
    for (let i = 0; i < rounds; i++) {
      later(() => confetti(rect.left + rect.width * (0.15 + Math.random() * 0.7), rect.top + rect.height * (0.2 + Math.random() * 0.4), 36), i * 260);
    }
  }

  async function win() {
    ended = true;
    busy = true;
    updateMoves();
    store.state.progress.match3Level = level + 1;
    store.commit();
    const reward = {
      keys: 1,
      items: Object.fromEntries(goals.map((g) => [items[g.type].id, 2])),
    };
    buzz([30, 50, 30, 50, 60]);
    sfx('reward');
    const rect = boardEl.getBoundingClientRect();
    const winEl = h('div.m3-win', h('div.m3-win-rays'), h('div.m3-win-txt', 'ПОБЕДА!'));
    root.append(winEl);
    salvo(rect, 5);
    await wait(1600);
    if (!alive) return;
    winEl.classList.add('m3-out');
    drop(winEl, 320);
    if (movesLeft > 0) {
      banner('Финальный салют! 🎆', 'm3-c1', 1200);
      await wait(700);
      if (!alive) return;
      const n = Math.min(movesLeft, 12);
      for (let i = 0; i < n; i++) { movesLeft--; updateMoves(); }
      await playResult(board.salute(n));
      if (!alive) return;
      salvo(rect, 3);
      await wait(700);
    }
    if (!alive) return;
    ctx.finish(reward, `Уровень ${level} пройден!`);
  }

  function lose() {
    ended = true;
    busy = true;
    updateMoves();
    sfx('error'); buzz([60, 40, 60]);
    const finishLose = () => ctx.finish({}, 'Ходы закончились');
    if (extraUsed) {
      banner('Ходы закончились 😿', 'm3-warn', 1300);
      return wait(1200).then(() => { if (alive) finishLose(); });
    }
    const left = goals.filter((g) => g.left > 0).map((g) => h('div.m3-goal', gemEl(g.type), String(g.left)));
    let m = null;
    const extraBtn = h('button.btn.btn-big', {
      onclick: () => {
        if (!store.spendEnergy(3)) { sfx('error'); toast('Не хватает энергии ⚡'); return; }
        extraUsed = true;
        movesLeft += 5;
        ended = false;
        updateMoves(true);
        openModal = null;
        m.close();
        banner('+5 ходов!', 'm3-c2', 1100);
        sfx('reward'); buzz([15, 30, 15]);
        busy = false;
        scheduleHint();
      },
    }, '+5 ходов за 3 ⚡');
    m = modal([
      h('div.modal-title', 'Ходы закончились'),
      h('div.m3-sub', 'Осталось совсем чуть-чуть:'),
      h('div.m3-lose-goals', left),
      extraBtn,
      h('button.btn.btn-ghost.btn-big', { onclick: () => { openModal = null; m.close(); finishLose(); } }, 'Завершить'),
    ], { dismissable: false });
    m.el.classList.add('m3-modal');
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
    const c = Math.floor((e.clientX - rect.left - 3) / cell);
    const r = Math.floor((e.clientY - rect.top - 3) / cell);
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
    return [r, c];
  }
  // Всё решается на pointerdown: выбор, обмен с выделенной соседней, бустер.
  // Свайп добирается в pointermove. pointerup только снимает выделение повторным тапом.
  function onDown(e) {
    if (ended || busy) return;
    const rc = cellAt(e);
    if (!rc) return;
    e.preventDefault();
    if (boost) { useBooster(boost, rc); return; }
    down = { r: rc[0], c: rc[1], x: e.clientX, y: e.clientY, used: false, id: e.pointerId, again: false };
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (sel) {
      if (sel[0] === rc[0] && sel[1] === rc[1]) { down.again = true; return; }
      if (Math.abs(sel[0] - rc[0]) + Math.abs(sel[1] - rc[1]) === 1) { down.used = true; doMove(sel, rc); return; }
    }
    sfx('tap');
    setSel(rc);
  }
  function onMove(e) {
    if (!down || down.used || down.id !== e.pointerId || boost) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
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
    if (!d.used && d.again && !busy) setSel(null);
  }
  const onCancel = () => { down = null; };
  boardEl.addEventListener('pointerdown', onDown);
  boardEl.addEventListener('pointermove', onMove);
  boardEl.addEventListener('pointerup', onUp);
  boardEl.addEventListener('pointercancel', onCancel);

  return () => {
    alive = false;
    clearTimeout(hintTimer);
    for (const t of timers) clearTimeout(t);
    timers.clear();
    document.querySelectorAll('.m3-fly').forEach((e) => e.remove());
    ro.disconnect();
    boardEl.removeEventListener('pointerdown', onDown);
    boardEl.removeEventListener('pointermove', onMove);
    boardEl.removeEventListener('pointerup', onUp);
    boardEl.removeEventListener('pointercancel', onCancel);
    if (openModal) { try { openModal.close(); } catch (e) { /* ignore */ } openModal = null; }
    root.classList.remove('m3-root', 'm3-danger');
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
.m3p-root { color:var(--ink); background-color:var(--paper); background-image:radial-gradient(rgba(17,17,17,.07) 1.2px, transparent 1.3px); background-size:18px 18px; }
.m3p { flex:1; overflow-y:auto; padding:2px 16px calc(18px + var(--safe-bottom)); display:flex; flex-direction:column; gap:14px; }
.m3p-lead { position:relative; background:var(--lime); border:2.5px solid var(--ink); border-radius:20px; box-shadow:0 4px 0 var(--ink); padding:12px 14px;
  display:flex; align-items:center; gap:10px; }
.m3p-lead b { font-family:var(--display); font-weight:900; font-size:16px; letter-spacing:-.4px; line-height:1.2; flex:1; }
.m3p-lead span { flex:none; background:var(--ink); color:var(--lime); font-family:var(--display); font-weight:900; font-size:12px; border-radius:99px; padding:4px 10px; transform:rotate(4deg); }
.m3p-sel { display:flex; gap:7px; justify-content:center; flex-wrap:wrap; }
.m3p-slot { width:48px; height:48px; border-radius:15px; background:rgba(255,255,255,.6); border:2.5px dashed rgba(17,17,17,.35);
  display:flex; align-items:center; justify-content:center; font-size:26px; }
.m3p-slot.on { background:var(--c); border:2.5px solid var(--ink); box-shadow:0 3px 0 var(--ink); animation:m3p-in .35s cubic-bezier(.2,1.8,.4,1); }
.m3p-go { font-family:var(--display); text-transform:uppercase; font-size:18px; }
.m3p-go:disabled { background:#fff; color:var(--ink-soft); filter:none; opacity:1; box-shadow:0 4px 0 rgba(17,17,17,.25); border-color:rgba(17,17,17,.35); }
.m3p-cap { font-family:var(--display); font-weight:800; font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:var(--ink-soft); margin-bottom:-6px; }
.m3p-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; }
.m3p-it { position:relative; border:2.5px solid var(--ink); background:#fff; border-radius:16px; padding:8px 2px 0; display:flex; flex-direction:column;
  align-items:center; gap:2px; box-shadow:0 4px 0 var(--ink); overflow:visible; color:var(--ink); font:inherit; transition:transform .12s; }
.m3p-it:active { transform:translateY(3px); box-shadow:0 1px 0 var(--ink); }
.m3p-it.on { background:var(--lime); transform:translateY(-2px); }
.m3p-it .e { font-size:30px; line-height:1.1; }
.m3p-it .w { font-size:10.5px; font-weight:900; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 3px; }
.m3p-it .band { align-self:stretch; height:7px; margin-top:4px; background:var(--rar); border-top:2px solid var(--ink); border-radius:0 0 13px 13px; }
.m3p-it .n { position:absolute; top:-8px; right:-6px; background:var(--ink); color:var(--lime); font-family:var(--display); font-size:11px; font-weight:900;
  border-radius:99px; padding:2px 7px; }
.m3p-it .ok { position:absolute; top:-8px; left:-6px; width:22px; height:22px; border-radius:50%; background:var(--ink); color:var(--lime);
  font-size:13px; font-weight:900; display:flex; align-items:center; justify-content:center; animation:m3p-in .3s cubic-bezier(.2,1.8,.4,1); }
.m3p-empty { text-align:center; padding:24px 16px; background:#fff; border:2.5px solid var(--ink); border-radius:24px; box-shadow:0 5px 0 var(--ink);
  display:flex; flex-direction:column; gap:12px; }
.m3p-empty b { font-family:var(--display); font-size:17px; }
@keyframes m3p-in { 0% { transform:scale(.3); } }
`;

export function mount(root, ctx) {
  const store = ctx.store;
  const level = store.state.progress.match3Level || 1;
  const cands = bagCandidates(store.state);
  const refund = () => { store.addEnergy(meta.cost.energy); ctx.exit(); };
  let cleanup = null;

  root.classList.add('m3p-root');
  root.append(h('style', PICK_CSS), h('div.game-top.m3-top',
    h('button.btn-icon', { onclick: refund, 'aria-label': 'Выйти' }, '✕'),
    h('div.game-title', { style: { fontFamily: 'var(--display)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-.5px' } }, `🍬 Уровень ${level}`),
  ));
  const body = h('div.m3p');
  root.append(body);

  if (cands.length < MIN_PICK) {
    body.append(h('div.m3p-empty',
      h('div', { style: { fontSize: '54px' } }, '🎒'),
      h('b', `Нужно хотя бы ${MIN_PICK} разных предмета`),
      h('div.small.muted', `У тебя ${cands.length}. Предметы дают «Пасьянс» (из карточек-слов), «Поиск» и «Эрудит». Энергию вернём.`),
      h('button.btn.btn-big', { onclick: refund }, 'Понятно'),
    ));
    return () => { root.classList.remove('m3p-root'); };
  }

  let picked = cands.slice(0, NTYPES).map((c) => c.it.id);
  const selEl = h('div.m3p-sel');
  const gridEl = h('div.m3p-grid');
  const go = h('button.btn.btn-big.m3p-go', { onclick: start }, 'Играть ▶');

  body.append(
    h('div.m3p-lead', h('b', 'Выбери 3–6 вещей для фишек'), h('span', 'цель ×2')),
    selEl, go, h('div.m3p-cap', 'Сумка'), gridEl,
  );

  function render() {
    selEl.replaceChildren(...Array.from({ length: NTYPES }, (_, i) => {
      const id = picked[i];
      return h('div.m3p-slot' + (id ? '.on' : ''), { style: { '--c': COLORS[i][0] } }, id ? getItem(id).emoji : '');
    }));
    gridEl.replaceChildren(...cands.map(({ it, n }) => {
      const on = picked.includes(it.id);
      return h('button.m3p-it' + (on ? '.on' : ''), {
        style: { '--rar': RARITY[it.rarity].color },
        onclick: () => {
          if (picked.includes(it.id)) { picked = picked.filter((x) => x !== it.id); sfx('tap'); }
          else if (picked.length < NTYPES) { picked.push(it.id); sfx('tap'); buzz(6); }
          else { sfx('error'); toast('Максимум 6 предметов'); }
          render();
        },
      }, h('span.e', it.emoji), h('span.w', it.word.toLowerCase()), h('span.band'), h('span.n', n), on ? h('span.ok', '✓') : null);
    }));
    go.disabled = picked.length < MIN_PICK;
    go.textContent = picked.length < MIN_PICK ? `Выбери ещё ${MIN_PICK - picked.length}` : 'Играть ▶';
  }

  function start() {
    const chosen = picked.map((id) => getItem(id));
    sfx('coin'); buzz(12);
    root.classList.remove('m3p-root');
    root.replaceChildren();
    cleanup = playLevel(root, ctx, chosen);
  }

  render();
  return () => { root.classList.remove('m3p-root'); cleanup && cleanup(); };
}
