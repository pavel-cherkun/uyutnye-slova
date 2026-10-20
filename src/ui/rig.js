// Общие инструменты рисования питомцев: пушистый силуэт с прядями, светотень, фактура, глаза.

export const INK = '#111';

export const S = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`;

export function prng(seed) { let x = seed % 2147483647 || 1; return () => (x = (x * 16807) % 2147483647) / 2147483647; }
export const f1 = (v) => Math.round(v * 10) / 10;

/** Плавная замкнутая кривая через точки (Catmull-Rom), равномерно пересэмплированная с шагом step */
export function resample(pts, step) {
  const dense = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < 12; k++) {
      const t = k / 12, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1].map((j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  let total = 0;
  const seg = dense.map((p, i) => { const q = dense[(i + 1) % dense.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); total += l; return l; });
  const cnt = Math.max(6, Math.round(total / step)), d = total / cnt, out = [];
  let acc = 0, i = 0;
  for (let k = 0; k < cnt; k++) {
    const target = k * d;
    while (acc + seg[i] < target) { acc += seg[i]; i = (i + 1) % dense.length; }
    const t = (target - acc) / (seg[i] || 1), p = dense[i], q = dense[(i + 1) % dense.length];
    out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
  }
  return out;
}
export const areaSign = (pts) => (pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) > 0 ? 1 : -1);

/** Силуэт с прядями. depth — длина пряди, lean — наклон (0 — симметрично), smooth — участки без прядей (индексы точек силуэта). */
export function furPath(pts, { step = 15, depth = 8, lean = 0.3, seed = 1, jitter = 0.4 } = {}) {
  const s = resample(pts, step), sg = areaSign(s), r = prng(seed);
  let d = `M${f1(s[0][0])} ${f1(s[0][1])}`;
  for (let i = 0; i < s.length; i++) {
    const a = s[i], b = s[(i + 1) % s.length];
    const tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1;
    const nx = (sg * ty) / L, ny = (-sg * tx) / L;
    const dep = depth * (1 - jitter + r() * jitter * 2);
    const u = 0.55 + lean * 0.35;
    const tip = [a[0] + tx * u + nx * dep, a[1] + ty * u + ny * dep];
    const c1 = [a[0] + tx * 0.1 + nx * dep * 0.85, a[1] + ty * 0.1 + ny * dep * 0.85];
    const c2 = [tip[0] - tx * 0.22, tip[1] - ty * 0.22];
    const c3 = [b[0] - tx * 0.18 + nx * dep * 0.1, b[1] - ty * 0.18 + ny * dep * 0.1];
    d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(tip[0])} ${f1(tip[1])}Q${f1(c3[0])} ${f1(c3[1])} ${f1(b[0])} ${f1(b[1])}`;
  }
  return d + 'Z';
}
export const ellipsePts = (cx, cy, rx, ry, n = 16, rot = 0) => Array.from({ length: n }, (_, i) => {
  const t = (i / n) * Math.PI * 2, c = Math.cos(rot), sn = Math.sin(rot), x = Math.cos(t) * rx, y = Math.sin(t) * ry;
  return [cx + x * c - y * sn, cy + x * sn + y * c];
});
export const inside = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
/** Штрихи фактуры шерсти внутри силуэта */
export function furStrokes(pts, n, seed, box) {
  const r = prng(seed), out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const x = box[0] + r() * (box[2] - box[0]), y = box[1] + r() * (box[3] - box[1]);
    if (!inside(pts, x, y)) continue;
    const w = 5 + r() * 4, h = 3 + r() * 3, k = (r() - 0.5) * 4;
    out.push(`M${f1(x - w)} ${f1(y + h)}Q${f1(x + k)} ${f1(y - h)} ${f1(x + w)} ${f1(y + h * 0.6)}`);
  }
  return out.join('');
}

/**
 * Пушистая часть с контуром и светотенью. id — для clipPath; light — сдвиг блика.
 * Слои: контур (толстая обводка) → тень (весь силуэт) → светлая часть (сдвинутая к свету, обрезанная) → блик.
 */
export function furPart(id, pts, opts = {}, { stroke = 6, light = [-4, -7], strokes = 0, box = null, seed = 3, inner = '' } = {}) {
  const d = furPath(pts, opts);
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath>
    <path d="${d}" class="ws" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round"/>
    <g clip-path="url(#${id})">
      <path d="${d}" class="wm" transform="translate(${light[0]} ${light[1]}) translate(${f1(cx)} ${f1(cy)}) scale(.97) translate(${f1(-cx)} ${f1(-cy)})"/>
      <path d="${d}" fill="#fff" opacity=".42" transform="translate(${light[0] * 2.4} ${light[1] * 2.4}) translate(${f1(cx)} ${f1(cy)}) scale(.86) translate(${f1(-cx)} ${f1(-cy)})"/>
      ${inner}
      ${strokes && box ? `<path d="${furStrokes(pts, strokes, seed, box)}" fill="none" class="wsl" stroke-width="2.6" stroke-linecap="round"/>` : ''}
    </g>`;
}


export const eye = (side, cx, cy, r, clip, lash) => `<g class="ll-eye ll-eye-${side}">
  <g class="ll-eo"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" ${S} stroke-width="4"/>
    <clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${r - 1.5}"/></clipPath>
    <g clip-path="url(#${clip})">
      <g class="ll-pupil">
        <circle cx="${cx}" cy="${cy + 1}" r="${f1(r * 0.66)}" fill="#3b2418"/>
        <circle cx="${cx}" cy="${cy + 1}" r="${f1(r * 0.4)}" fill="${INK}"/>
        <circle cx="${f1(cx - r * 0.28)}" cy="${f1(cy - r * 0.28)}" r="${f1(r * 0.22)}" fill="#fff"/>
        <circle cx="${f1(cx + r * 0.25)}" cy="${f1(cy + r * 0.32)}" r="${f1(r * 0.1)}" fill="#fff"/>
      </g>
      <path d="M${cx - r} ${f1(cy + r * 0.55)} Q${cx} ${f1(cy + r * 1.1)} ${cx + r} ${f1(cy + r * 0.55)} L${cx + r} ${cy + r} L${cx - r} ${cy + r} Z" fill="rgba(0,0,0,.08)"/>
      <rect class="ll-lid ws" x="${cx - r - 3}" y="${cy - r - 3}" width="${r * 2 + 6}" height="0" ${S} stroke-width="3.5"/>
    </g>
    <path d="M${f1(cx - r * 0.95)} ${f1(cy - r * 0.35)} Q${cx} ${f1(cy - r * 1.35)} ${f1(cx + r * 0.95)} ${f1(cy - r * 0.35)}" fill="none" ${S} stroke-width="5"/>
    ${lash > 0 ? `<path d="M${f1(cx + r * 0.8)} ${f1(cy - r * 0.62)} l6 -5 M${f1(cx + r * 0.95)} ${f1(cy - r * 0.25)} l7 -2" fill="none" ${S} stroke-width="3.5"/>`
      : `<path d="M${f1(cx - r * 0.8)} ${f1(cy - r * 0.62)} l-6 -5 M${f1(cx - r * 0.95)} ${f1(cy - r * 0.25)} l-7 -2" fill="none" ${S} stroke-width="3.5"/>`}
  </g>
  <path class="ll-eh" d="M${cx - r + 3} ${cy + 3} Q${cx} ${cy - r} ${cx + r - 3} ${cy + 3}"/>
  <path class="ll-es" d="M${cx - r + 3} ${cy - 2} Q${cx} ${cy + r * 0.7} ${cx + r - 3} ${cy - 2}"/></g>`;

