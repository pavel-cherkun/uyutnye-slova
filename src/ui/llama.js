// Живая лама для экрана питомца: SVG из частей и одна rAF-петля (только пока лама на экране).
// Вид в три четверти, пушистая шерсть с тенями, большие глаза со зрачками, которые следят за пальцем.
// Её можно гладить, тыкать (если часто — плюнет), кормить, расчёсывать; ночью спит.
// Гардероб (шерсть, головной убор, очки, шея, попона) рисуется отдельными слоями.

import { sfx, buzz } from './device.js';

const INK = '#111';
let uid = 0;

// ---------- Шерсть ----------
export const WOOL = {
  cream: ['#fff6e6', '#e8d3b4'],
  snow: ['#ffffff', '#d9dee6'],
  caramel: ['#f2c79a', '#d29a68'],
  rose: ['#ffd0e0', '#eba1bd'],
  ash: ['#e6e2dc', '#b9b3aa'],
  mint: ['#d4f5e2', '#9ed6b8'],
  lavender: ['#e6dbff', '#b8a5ee'],
  choco: ['#a9714c', '#7a4e33'],
};

// ---------- Гардероб: что есть и какое слово нужно набрать, чтобы получить ----------
export const WARDROBE = [
  { slot: 'wool', id: 'cream', word: '', name: 'Сливки', icon: '🤍' },
  { slot: 'wool', id: 'snow', word: 'СНЕГ', name: 'Снег', icon: '❄️' },
  { slot: 'wool', id: 'caramel', word: 'КАРАМЕЛЬ', name: 'Карамель', icon: '🍮' },
  { slot: 'wool', id: 'rose', word: 'РОЗА', name: 'Роза', icon: '🌸' },
  { slot: 'wool', id: 'ash', word: 'ПЕПЕЛ', name: 'Пепел', icon: '🩶' },
  { slot: 'wool', id: 'mint', word: 'МЯТА', name: 'Мята', icon: '🌿' },
  { slot: 'wool', id: 'lavender', word: 'ЛАВАНДА', name: 'Лаванда', icon: '💜' },
  { slot: 'wool', id: 'choco', word: 'ШОКОЛАД', name: 'Шоколад', icon: '🍫' },
  { slot: 'head', id: 'chullo', word: 'ШАПКА', name: 'Шапка', icon: '🧶' },
  { slot: 'head', id: 'bandana', word: 'БАНДАНА', name: 'Бандана', icon: '🏴‍☠️' },
  { slot: 'head', id: 'cap', word: 'КЕПКА', name: 'Кепка', icon: '🧢' },
  { slot: 'head', id: 'sunhat', word: 'ШЛЯПА', name: 'Шляпа', icon: '👒' },
  { slot: 'head', id: 'tophat', word: 'ЦИЛИНДР', name: 'Цилиндр', icon: '🎩' },
  { slot: 'head', id: 'crown', word: 'КОРОНА', name: 'Корона', icon: '👑' },
  { slot: 'head', id: 'bow', word: 'БАНТ', name: 'Бант', icon: '🎀' },
  { slot: 'head', id: 'wreath', word: 'ВЕНОК', name: 'Венок', icon: '🌼' },
  { slot: 'eyes', id: 'round', word: 'ОЧКИ', name: 'Очки', icon: '👓' },
  { slot: 'eyes', id: 'sun', word: 'ТЕНЬ', name: 'Тёмные', icon: '🕶️' },
  { slot: 'eyes', id: 'heart', word: 'СЕРДЦЕ', name: 'Сердечки', icon: '💕' },
  { slot: 'eyes', id: 'pixel', word: 'ПИКСЕЛЬ', name: 'Пиксели', icon: '😎' },
  { slot: 'neck', id: 'bell', word: 'КОЛОКОЛ', name: 'Колокольчик', icon: '🔔' },
  { slot: 'neck', id: 'scarf', word: 'ШАРФ', name: 'Шарф', icon: '🧣' },
  { slot: 'neck', id: 'bowtie', word: 'БАБОЧКА', name: 'Бабочка', icon: '🎗️' },
  { slot: 'neck', id: 'beads', word: 'БУСЫ', name: 'Бусы', icon: '📿' },
  { slot: 'back', id: 'popona', word: 'ПОПОНА', name: 'Попона', icon: '🟥' },
  { slot: 'back', id: 'plaid', word: 'ПЛЕД', name: 'Плед', icon: '🟩' },
  { slot: 'back', id: 'rainbow', word: 'РАДУГА', name: 'Радуга', icon: '🌈' },
];
export const SLOTS = [
  { id: 'wool', name: 'Шерсть', icon: '🧶' },
  { id: 'head', name: 'Голова', icon: '🎩' },
  { id: 'eyes', name: 'Очки', icon: '👓' },
  { id: 'neck', name: 'Шея', icon: '🧣' },
  { id: 'back', name: 'Спина', icon: '🟥' },
];

// ---------- Рисунок ----------
// пушистая часть: чёрные круги побольше (контур), круги тени, сверху сдвинутые светлые круги (блик)
const blob = (cs) =>
  cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 6}" fill="${INK}"/>`).join('') +
  cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" class="ws"/>`).join('') +
  cs.filter(([, , r]) => r > 8).map(([x, y, r]) => `<circle cx="${x - 3}" cy="${y - 5}" r="${r - 6}" class="wm"/>`).join('');

const BODY = [
  [116, 175, 30], [114, 148, 28], [104, 196, 26], [98, 215, 22], // шея и грудь
  [150, 215, 40], [192, 210, 42], [230, 204, 32], [124, 230, 30], [160, 246, 30], [206, 246, 30], [242, 228, 24], [176, 186, 30], [216, 184, 26],
];
const HEAD = [[114, 86, 42], [80, 98, 14], [150, 96, 13], [96, 118, 14], [132, 116, 14]];
const TUFT = [[98, 48, 13], [114, 42, 15], [130, 46, 13], [142, 54, 9], [86, 56, 9], [106, 56, 10], [124, 57, 10]];
const TAIL = [[262, 176, 15], [276, 165, 11], [272, 190, 10]];

const S = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`;
const leg = (cx, top, cls) =>
  `<rect x="${cx - 13}" y="${top}" width="26" height="${296 - top}" rx="11" class="${cls}" ${S} stroke-width="5"/>` +
  `<path d="M${cx - 14} 292 L${cx + 14} 292 L${cx + 9} 311 L${cx - 9} 311 Z" fill="#8a5a3a" ${S} stroke-width="5"/>`;

const eye = (side, cx, cy, r, clip) => `<g class="ll-eye ll-eye-${side}">
  <g class="ll-eo"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" ${S} stroke-width="4.5"/>
    <clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${r - 2}"/></clipPath>
    <g clip-path="url(#${clip})">
      <g class="ll-pupil"><circle cx="${cx}" cy="${cy}" r="${r * 0.52}" fill="${INK}"/><circle cx="${cx - 3}" cy="${cy - 3.5}" r="${r * 0.17}" fill="#fff"/></g>
      <rect class="ll-lid wm" x="${cx - r - 3}" y="${cy - r - 3}" width="${r * 2 + 6}" height="0" ${S} stroke-width="3.5"/>
    </g></g>
  <path class="ll-eh" d="M${cx - r + 3} ${cy + 3} Q${cx} ${cy - r} ${cx + r - 3} ${cy + 3}"/>
  <path class="ll-es" d="M${cx - r + 3} ${cy - 2} Q${cx} ${cy + r * 0.7} ${cx + r - 3} ${cy - 2}"/></g>`;

const DIRT = [[170, 236, 12, 7], [210, 218, 9, 6], [140, 252, 8, 5], [236, 198, 7, 4], [120, 204, 6, 4], [118, 286, 7, 5], [212, 288, 7, 5], [192, 248, 6, 4], [86, 104, 5, 3]];

function svgMarkup(n) {
  return `<svg class="ll" viewBox="0 -14 300 334" data-eyes="open">
<ellipse cx="165" cy="312" rx="112" ry="10" fill="rgba(0,0,0,.14)"/>
<g class="ll-all">
  ${leg(144, 232, 'ws')}${leg(240, 228, 'ws')}
  <g class="ll-tail">${blob(TAIL)}</g>
  ${leg(118, 236, 'wm')}${leg(212, 236, 'wm')}
  <g class="ll-body">${blob(BODY)}
    <path d="M150 232 q7 7 14 0 M192 240 q7 7 14 0 M228 222 q6 6 12 0 M110 216 q6 6 12 0 M176 206 q6 6 12 0" fill="none" class="wsl" stroke-width="3.5" stroke-linecap="round"/>
  </g>
  <g class="ll-dirt">${DIRT.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#8a5a32" opacity="0"/>`).join('')}</g>
  <g class="ll-slot-back"></g>
  <g class="ll-slot-neck"></g>
  <g class="ll-head">
    <g class="ll-ear-r"><g transform="translate(140 56) rotate(18)"><path d="M-12 0 C-17 -24 -10 -50 0 -62 C10 -50 17 -24 12 0 Z" class="ws" ${S} stroke-width="5"/>
      <path d="M-5 -8 C-8 -26 -5 -42 0 -50 C5 -42 8 -26 5 -8 Z" fill="#f59ab4"/></g></g>
    <g class="ll-ear-l"><g transform="translate(86 60) rotate(-20)"><path d="M-12 0 C-17 -24 -10 -50 0 -62 C10 -50 17 -24 12 0 Z" class="wm" ${S} stroke-width="5"/>
      <path d="M-5 -8 C-8 -26 -5 -42 0 -50 C5 -42 8 -26 5 -8 Z" fill="#ffb3c7"/></g></g>
    ${blob(HEAD)}
    <ellipse class="ll-cheek" cx="78" cy="108" rx="8" ry="5" fill="#ff8fb0"/><ellipse class="ll-cheek" cx="150" cy="106" rx="7" ry="5" fill="#ff8fb0"/>
    ${eye('l', 94, 86, 17, 'llc' + n + 'a')}${eye('r', 136, 84, 15, 'llc' + n + 'b')}
    <ellipse cx="112" cy="117" rx="25" ry="19" class="wm" ${S} stroke-width="4.5"/>
    <path d="M101 106 Q112 100 123 106 Q118 114 112 113 Q106 114 101 106 Z" fill="${INK}"/>
    <path d="M112 112 L112 121" fill="none" ${S} stroke-width="3.5"/>
    <path class="ll-mouth" d="" fill="none" ${S} stroke-width="4"/>
    <g class="ll-open"><path d="M96 124 Q112 166 128 124 Z" fill="${INK}" ${S} stroke-width="3"/>
      <ellipse cx="112" cy="140" rx="8" ry="5.5" fill="#ff7f9e"/>
      <rect x="104" y="123" width="7.5" height="8" rx="1.5" fill="#fff" ${S} stroke-width="2"/><rect x="112.5" y="123" width="7.5" height="8" rx="1.5" fill="#fff" ${S} stroke-width="2"/></g>
    <g class="ll-tuft">${blob(TUFT)}</g>
    <g class="ll-brows"><path class="ll-bl" d="" fill="none" ${S} stroke-width="5"/><path class="ll-br" d="" fill="none" ${S} stroke-width="5"/></g>
    <g class="ll-slot-eyes"></g>
    <g class="ll-slot-head"></g>
  </g>
</g></svg>`;
}

// ---------- Вещи ----------
const RED = '#e8344e', LIME = '#c8ff2e', GOLD = '#ffd23f', PINK = '#ff5fa2', BLUE = '#2f8fff';
const heart = (cx, cy, s) => `M${cx} ${cy + s * 0.9} C${cx - s * 1.6} ${cy - s * 0.1} ${cx - s * 0.9} ${cy - s * 1.3} ${cx} ${cy - s * 0.45} C${cx + s * 0.9} ${cy - s * 1.3} ${cx + s * 1.6} ${cy - s * 0.1} ${cx} ${cy + s * 0.9} Z`;
const BLANKET = 'M148 170 Q194 156 240 168 L242 236 Q196 248 150 240 Z';
const tassels = () => [156, 172, 188, 204, 220, 236].map((x, i) => `<circle cx="${x}" cy="${243 - i * 0.6 + (x > 196 ? -2 : 2)}" r="4.5" fill="${GOLD}" ${S} stroke-width="2.5"/>`).join('');

function pixelGlasses() {
  const px = 6, out = [];
  const row = (y, x0, x1, white = []) => { for (let x = x0; x <= x1; x += px) out.push(`<rect x="${x}" y="${y}" width="${px + 0.4}" height="${px + 0.4}" fill="${white.includes(x) ? '#fff' : INK}"/>`); };
  row(72, 64, 160);
  row(78, 72, 114, [78, 84]); row(84, 72, 114, [84, 90]); row(90, 78, 108);
  row(78, 120, 156, [126, 132]); row(84, 120, 156, [132, 138]); row(90, 126, 150);
  return out.join('');
}

const ITEM_SVG = {
  head: {
    chullo: () => `<path d="M66 76 Q62 22 114 18 Q166 20 162 72 Q114 58 66 76 Z" fill="${RED}" ${S} stroke-width="5"/>
      <path d="M76 46 L86 36 L96 46 L106 36 L116 46 L126 36 L136 46 L146 36 L154 44" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
      <path d="M65 66 Q114 48 163 62 L162 72 Q114 58 66 76 Z" fill="${LIME}" ${S} stroke-width="4"/>
      <path d="M66 70 L62 104 Q70 110 80 100 L80 68 Z" fill="${RED}" ${S} stroke-width="4"/>
      <path d="M162 66 L166 98 Q158 106 150 96 L150 64 Z" fill="${RED}" ${S} stroke-width="4"/>
      <path d="M70 106 L68 124 M160 102 L162 120" ${S} stroke-width="3"/>
      <circle cx="68" cy="128" r="6" fill="${GOLD}" ${S} stroke-width="3"/><circle cx="162" cy="124" r="6" fill="${GOLD}" ${S} stroke-width="3"/>
      <circle cx="114" cy="15" r="10" fill="${GOLD}" ${S} stroke-width="4"/>`,
    bandana: () => `<path d="M160 60 L192 46 L186 70 Z" fill="${RED}" ${S} stroke-width="4"/><path d="M160 68 L188 90 L170 94 Z" fill="${RED}" ${S} stroke-width="4"/>
      <path d="M66 64 Q114 30 162 56 L162 72 Q114 48 66 80 Z" fill="${RED}" ${S} stroke-width="5"/>
      ${[[84, 62], [100, 52], [118, 48], [136, 50], [150, 57]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff"/>`).join('')}`,
    cap: () => `<path d="M74 60 Q74 20 116 20 Q156 22 156 58 Q114 46 74 60 Z" fill="${LIME}" ${S} stroke-width="5"/>
      <path d="M116 22 Q112 40 100 54" fill="none" ${S} stroke-width="3"/>
      <path d="M82 58 Q52 58 36 72 Q66 80 102 60 Z" fill="${LIME}" ${S} stroke-width="5"/><circle cx="116" cy="20" r="5" fill="${INK}"/>`,
    sunhat: () => `<ellipse cx="114" cy="48" rx="64" ry="14" fill="#f3d38b" ${S} stroke-width="5"/>
      <path d="M84 48 Q84 14 114 14 Q144 14 144 48 Z" fill="#f3d38b" ${S} stroke-width="5"/>
      <path d="M85 40 Q114 34 143 40 L144 48 Q114 42 84 48 Z" fill="${PINK}" ${S} stroke-width="3"/>
      <circle cx="140" cy="40" r="7" fill="#fff" ${S} stroke-width="3"/><circle cx="140" cy="40" r="3" fill="${GOLD}"/>`,
    tophat: () => `<rect x="86" y="-12" width="56" height="52" rx="6" fill="${INK}"/><rect x="86" y="24" width="56" height="10" fill="${PINK}"/>
      <rect x="93" y="-6" width="6" height="26" rx="3" fill="#444"/><ellipse cx="114" cy="40" rx="42" ry="9" fill="${INK}"/>`,
    crown: () => `<path d="M86 46 L88 12 L102 28 L114 4 L126 28 L140 12 L142 46 Z" fill="${GOLD}" ${S} stroke-width="5"/>
      <circle cx="114" cy="34" r="5" fill="${PINK}" ${S} stroke-width="2.5"/><circle cx="96" cy="38" r="3.5" fill="${LIME}" ${S} stroke-width="2"/><circle cx="132" cy="38" r="3.5" fill="${LIME}" ${S} stroke-width="2"/>`,
    bow: () => `<path d="M142 44 L120 28 L122 60 Z" fill="${PINK}" ${S} stroke-width="4"/><path d="M142 44 L164 28 L162 60 Z" fill="${PINK}" ${S} stroke-width="4"/>
      <circle cx="142" cy="44" r="7" fill="${PINK}" ${S} stroke-width="4"/>`,
    wreath: () => [[72, 66], [80, 50], [94, 40], [110, 35], [126, 36], [142, 42], [154, 54], [160, 68]].map(([x, y], i) =>
      `<ellipse cx="${x + 6}" cy="${y + 4}" rx="7" ry="4" fill="#3fb950" ${S} stroke-width="2.5"/>
       <circle cx="${x}" cy="${y}" r="7.5" fill="${[PINK, GOLD, '#fff', LIME][i % 4]}" ${S} stroke-width="3"/><circle cx="${x}" cy="${y}" r="2.5" fill="${i % 4 === 1 ? '#ff7a1a' : GOLD}"/>`).join(''),
  },
  eyes: {
    round: () => `<circle cx="94" cy="86" r="21" fill="rgba(255,255,255,.22)" ${S} stroke-width="4.5"/><circle cx="136" cy="84" r="19" fill="rgba(255,255,255,.22)" ${S} stroke-width="4.5"/>
      <path d="M115 84 Q116 79 117 84 M73 84 L62 78" fill="none" ${S} stroke-width="4"/>`,
    sun: () => `<path d="M70 74 L160 72" ${S} stroke-width="5"/>
      <path d="M72 74 L118 74 L116 92 Q112 105 95 105 Q78 105 74 92 Z" fill="${INK}" ${S} stroke-width="3"/>
      <path d="M120 74 L158 72 L156 90 Q152 102 138 102 Q124 102 121 90 Z" fill="${INK}" ${S} stroke-width="3"/>
      <path d="M80 80 L90 80 M127 79 L135 79" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`,
    heart: () => `<path d="${heart(94, 86, 19)}" fill="${PINK}" fill-opacity=".9" ${S} stroke-width="4"/><path d="${heart(136, 84, 17)}" fill="${PINK}" fill-opacity=".9" ${S} stroke-width="4"/>
      <path d="M113 80 Q115 76 118 80" fill="none" ${S} stroke-width="3.5"/>`,
    pixel: pixelGlasses,
  },
  neck: {
    scarf: () => `<path d="M128 162 L134 204 L150 200 L144 158 Z" fill="${RED}" ${S} stroke-width="5"/>
      <path d="M136 204 L136 212 M142 203 L143 211 M148 202 L149 209" ${S} stroke-width="3"/>
      <path d="M82 140 Q114 160 150 138 L152 156 Q114 180 80 158 Z" fill="${RED}" ${S} stroke-width="5"/>
      <path d="M96 151 L94 165 M114 155 L114 171 M132 151 L134 165" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
    bell: () => `<path d="M84 146 Q114 164 150 144 L150 154 Q114 174 84 156 Z" fill="#8a5a3a" ${S} stroke-width="4"/>
      <g class="ll-bell"><path d="M104 166 Q104 180 99 187 L129 187 Q124 180 124 166 Q114 156 104 166 Z" fill="${GOLD}" ${S} stroke-width="4"/>
      <circle cx="114" cy="190" r="4" fill="${INK}"/><path d="M108 168 Q107 176 105 181" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".8"/></g>`,
    bowtie: () => `<path d="M114 164 L92 150 L92 178 Z" fill="${BLUE}" ${S} stroke-width="4"/><path d="M114 164 L136 150 L136 178 Z" fill="${BLUE}" ${S} stroke-width="4"/>
      <circle cx="114" cy="164" r="7" fill="${BLUE}" ${S} stroke-width="4"/>`,
    beads: () => Array.from({ length: 8 }, (_, i) => {
      const x = 86 + i * 8.6, y = 150 + 16 * Math.sin(Math.PI * (x - 86) / 60);
      return `<circle cx="${x}" cy="${y}" r="6.5" fill="${[PINK, GOLD, LIME, '#4fd1ff'][i % 4]}" ${S} stroke-width="3"/>`;
    }).join(''),
  },
  back: {
    popona: () => `<path d="${BLANKET}" fill="${RED}" ${S} stroke-width="5"/>
      <path d="M162 180 Q194 172 228 180 L229 226 Q196 234 163 228 Z" fill="none" stroke="#fff" stroke-width="4"/>
      <path d="M176 191 Q194 187 215 191 L215 216 Q196 220 177 216 Z" fill="none" stroke="#fff" stroke-width="4"/>
      <rect x="190" y="198" width="12" height="12" fill="#fff"/>${tassels()}`,
    plaid: (n) => `<clipPath id="llb${n}"><path d="${BLANKET}"/></clipPath><path d="${BLANKET}" fill="${LIME}"/>
      <g clip-path="url(#llb${n})" fill="${INK}" opacity=".85"><rect x="140" y="188" width="110" height="7"/><rect x="140" y="214" width="110" height="7"/>
      <rect x="174" y="150" width="7" height="100"/><rect x="210" y="150" width="7" height="100"/></g>
      <path d="${BLANKET}" fill="none" ${S} stroke-width="5"/>${tassels()}`,
    rainbow: (n) => `<clipPath id="llb${n}"><path d="${BLANKET}"/></clipPath>
      <g clip-path="url(#llb${n})">${[PINK, GOLD, LIME, '#4fd1ff', '#8c7bff'].map((c, i) => `<rect x="${146 + i * 19.5}" y="150" width="20" height="100" fill="${c}"/>`).join('')}</g>
      <path d="${BLANKET}" fill="none" ${S} stroke-width="5"/>${tassels()}`,
  },
};

const MOUTH = {
  smile: 'M98 123 Q105 130 112 123 Q119 130 126 123',
  sad: 'M100 130 Q112 121 124 130',
  flat: 'M101 126 L123 126',
  small: 'M106 125 Q112 129 118 125',
};
const BROW = {
  sad: ['M80 66 L104 58', 'M126 57 L148 64'],
  angry: ['M80 58 L104 67', 'M126 66 L148 57'],
};

let cssDone = false;
function injectCSS() {
  if (cssDone) return;
  cssDone = true;
  document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
}

function spring(k = 0.14, d = 0.74) {
  return { x: 0, v: 0, t: 0, step() { this.v = (this.v + (this.t - this.x) * k) * d; this.x += this.v; return this.x; } };
}
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Отрисовать вещь отдельно — для иконок гардероба */
export function itemPreview(slot, id) {
  if (slot === 'wool') return null;
  const n = ++uid;
  const vb = { head: '30 -20 170 110', eyes: '56 58 116 56', neck: '72 130 90 90', back: '140 150 110 100' }[slot];
  return `<svg viewBox="${vb}" class="ll-ico">${ITEM_SVG[slot][id](n)}</svg>`;
}

/**
 * Создать ламу. Колбэки: onPet() — порция поглаживания, onPoke() — тыкнули, onWake() — разбудили,
 * onSpit() — плюнула. opts.still — без реакции на касания (превью в гардеробе).
 */
export function createLlama({ onPet, onPoke, onWake, onSpit, still = false } = {}) {
  injectCSS();
  const n = ++uid;
  const wrap = document.createElement('div');
  wrap.className = 'll-wrap';
  wrap.innerHTML = svgMarkup(n) + '<div class="ll-fx"></div><div class="ll-say"></div>';
  const svg = wrap.querySelector('svg');
  const q = (s) => svg.querySelector(s);
  const P = {
    all: q('.ll-all'), body: q('.ll-body'), head: q('.ll-head'), earL: q('.ll-ear-l'), earR: q('.ll-ear-r'), tail: q('.ll-tail'),
    pupL: q('.ll-eye-l .ll-pupil'), pupR: q('.ll-eye-r .ll-pupil'), lidL: q('.ll-eye-l .ll-lid'), lidR: q('.ll-eye-r .ll-lid'),
    bl: q('.ll-bl'), br: q('.ll-br'), mouth: q('.ll-mouth'), open: q('.ll-open'), cheeks: [...svg.querySelectorAll('.ll-cheek')],
    dirt: [...svg.querySelectorAll('.ll-dirt ellipse')], bell: null,
    slot: { head: q('.ll-slot-head'), eyes: q('.ll-slot-eyes'), neck: q('.ll-slot-neck'), back: q('.ll-slot-back') },
  };
  const fxEl = wrap.querySelector('.ll-fx');
  const bubble = wrap.querySelector('.ll-say');

  // ---------- состояние ----------
  const look = { x: spring(0.16, 0.7), y: spring(0.16, 0.7) };
  const tilt = spring(0.1, 0.78), earL = spring(0.18, 0.72), earR = spring(0.18, 0.72);
  const swing = spring(0.06, 0.92), squash = spring(0.22, 0.62), blush = spring(0.08, 0.8);
  let hopY = 0, hopV = 0;
  let mood = 'ok', asleep = false, groggyUntil = 0;
  let mode = 'idle', modeUntil = 0; // idle | pet | joy | eat | want | angry | brush
  let nextBlink = performance.now() + 1500, blinkEnd = 0;
  let nextIdle = performance.now() + 2500, chewUntil = 0;
  let lastPointer = 0, nextZ = 0, lastHum = 0;
  let taps = [], spitCool = 0;
  let mounted = false, raf = 0;

  const toWrap = (x, y) => { const s = wrap.clientWidth / 300; return [x * s, (y + 14) * s]; };
  const fromClient = (cx, cy) => {
    const r = svg.getBoundingClientRect(), s = r.width / 300;
    return [(cx - r.left) / s, (cy - r.top) / s - 14];
  };

  function puff(txt, x, y, cls = '') {
    const [px, py] = toWrap(x, y);
    const e = document.createElement('span');
    e.className = 'll-p ' + cls;
    e.textContent = txt;
    e.style.left = px + 'px';
    e.style.top = py + 'px';
    e.style.setProperty('--dx', rnd(-28, 28).toFixed(0) + 'px');
    fxEl.append(e);
    e.addEventListener('animationend', () => e.remove());
    setTimeout(() => e.remove(), 2500);
  }

  let sayTimer = 0;
  function say(text, ms = 1500) {
    bubble.textContent = text;
    bubble.classList.remove('on');
    void bubble.offsetWidth;
    bubble.classList.add('on');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => bubble.classList.remove('on'), ms);
  }

  function hop(power = 7) { if (hopY === 0) { hopV = -power; squash.v -= 0.05; } }
  function twitch(side = Math.random() < 0.5 ? 'l' : 'r') { (side === 'l' ? earL : earR).v += side === 'l' ? -7 : 7; }
  function setMode(m, ms) { mode = m; modeUntil = ms ? performance.now() + ms : 0; refreshFace(); }

  // ---------- лицо ----------
  function face() {
    if (mode === 'angry') return { eyes: 'open', brow: 'angry', mouth: 'flat' };
    if (mode === 'pet' || mode === 'brush') return { eyes: 'happy', mouth: asleep ? 'small' : 'smile' };
    if (mode === 'eat' || mode === 'want') return { eyes: mode === 'eat' ? 'happy' : 'open', mouth: 'open' };
    if (mode === 'joy') return { eyes: 'happy', mouth: 'open' };
    if (asleep) return { eyes: 'sleep', mouth: 'small' };
    if (mood === 'hungry' || mood === 'sad') return { eyes: 'open', brow: 'sad', mouth: 'sad' };
    if (performance.now() < groggyUntil) return { eyes: 'open', mouth: 'flat' };
    return { eyes: 'open', mouth: 'smile' };
  }
  function refreshFace() {
    const f = face();
    svg.dataset.eyes = f.eyes;
    const b = BROW[f.brow];
    P.bl.setAttribute('d', b ? b[0] : '');
    P.br.setAttribute('d', b ? b[1] : '');
    P.open.style.display = f.mouth === 'open' ? '' : 'none';
    P.mouth.setAttribute('d', f.mouth === 'open' ? '' : MOUTH[f.mouth]);
    blush.t = f.eyes === 'happy' ? 1 : 0;
    const droop = asleep ? 1 : (mood === 'hungry' || mood === 'sad') ? 0.7 : 0;
    earL.t = -28 * droop; earR.t = 24 * droop;
  }

  // ---------- петля ----------
  function frame(now) {
    raf = 0;
    if (!wrap.isConnected) { if (mounted) return destroy(); raf = requestAnimationFrame(frame); return; }
    mounted = true;
    const t = now / 1000;
    if (modeUntil && now > modeUntil) { mode = 'idle'; modeUntil = 0; refreshFace(); }

    if (!asleep && now > nextBlink) { blinkEnd = now + 140; nextBlink = now + rnd(2200, 5200) + (Math.random() < 0.2 ? -1900 : 0); }
    const groggy = now < groggyUntil;
    const lid = now < blinkEnd ? 1 : groggy ? 0.5 : mood === 'sad' || mood === 'hungry' ? 0.22 : 0;

    if (!asleep && now - lastPointer > 2200 && Math.random() < 0.012) { look.x.t = rnd(-1, 1); look.y.t = rnd(-0.6, 0.8); }
    if (asleep) { look.x.t = 0; look.y.t = 0.4; }
    look.x.step(); look.y.step();

    if (hopV || hopY) { hopY += hopV; hopV += 0.9; if (hopY >= 0) { hopY = 0; hopV = 0; squash.v -= 0.06; } }
    const sq = squash.step();
    const br = Math.sin(t * (asleep ? 1.4 : 2.6));
    const bob = br * (asleep ? 2.2 : 1.2) + (asleep ? 6 : 0);

    const tl = tilt.step();
    swing.v += -tilt.v * 0.5 - hopV * 0.04;
    swing.t = -tl * 0.6;
    const sw = swing.step();
    const eL = earL.step(), eR = earR.step();
    const bl = blush.step();

    P.all.setAttribute('transform', `translate(0 ${hopY.toFixed(2)}) translate(165 312) scale(${(1 - sq * 0.6).toFixed(4)} ${(1 + sq).toFixed(4)}) translate(-165 -312)`);
    P.body.setAttribute('transform', `translate(170 276) scale(${(1 + br * 0.008).toFixed(4)} ${(1 + br * (asleep ? 0.03 : 0.016)).toFixed(4)}) translate(-170 -276)`);
    P.head.setAttribute('transform', `translate(0 ${bob.toFixed(2)}) rotate(${(tl + (asleep ? 7 : 0)).toFixed(2)} 116 140) translate(116 140) scale(1.15) translate(-116 -140)`);
    P.earL.setAttribute('transform', `rotate(${eL.toFixed(2)} 86 60)`);
    P.earR.setAttribute('transform', `rotate(${eR.toFixed(2)} 140 56)`);
    P.tail.setAttribute('transform', `rotate(${(Math.sin(t * (mood === 'happy' || mode === 'joy' ? 9 : 2)) * 8).toFixed(2)} 258 186)`);
    if (P.bell) P.bell.setAttribute('transform', `rotate(${(sw * 1.5).toFixed(2)} 114 162)`);
    const big = mode === 'want' ? 1.25 : 1;
    const lx = look.x.x, ly = look.y.x;
    P.pupL.setAttribute('transform', `translate(${(lx * 6).toFixed(2)} ${(ly * 5).toFixed(2)}) translate(94 86) scale(${big}) translate(-94 -86)`);
    P.pupR.setAttribute('transform', `translate(${(lx * 5).toFixed(2)} ${(ly * 4.5).toFixed(2)}) translate(136 84) scale(${big}) translate(-136 -84)`);
    P.lidL.setAttribute('height', (lid * 40).toFixed(1));
    P.lidR.setAttribute('height', (lid * 36).toFixed(1));
    for (const c of P.cheeks) c.setAttribute('opacity', (0.35 + bl * 0.6).toFixed(2));

    const chew = mode === 'eat' ? 0.55 + Math.abs(Math.sin(t * 11)) * 0.5 : mode === 'want' ? 1.1 : 1;
    P.open.setAttribute('transform', `translate(112 124) scale(1 ${chew.toFixed(3)}) translate(-112 -124)`);
    P.mouth.setAttribute('transform', now < chewUntil ? `translate(${(Math.sin(t * 9) * 2.6).toFixed(2)} 0)` : '');

    if (asleep && mode !== 'pet' && now > nextZ) { nextZ = now + 1500; puff('z', 150, 30, 'z'); }
    if (now > nextIdle && mode === 'idle') idle(now);

    raf = requestAnimationFrame(frame);
  }

  function idle(now) {
    nextIdle = now + rnd(2500, 6000);
    if (asleep) { if (Math.random() < 0.3) twitch(); return; }
    const r = Math.random();
    if (mood === 'hungry' && r < 0.35) { look.y.t = 1; look.x.t = -0.8; say('🍽️?', 1400); return; }
    if (mood === 'sad' && r < 0.3) { look.y.t = 0.9; tilt.t = rnd(-6, 6); setTimeout(() => (tilt.t = 0), 1600); return; }
    if (r < 0.25) twitch();
    else if (r < 0.45) chewUntil = now + rnd(1500, 2800);
    else if (r < 0.62) { tilt.t = rnd(-9, 9); setTimeout(() => (tilt.t = 0), rnd(900, 1800)); }
    else if (r < 0.75 && mood === 'happy') { hop(6); setTimeout(() => hop(5), 380); }
    else if (r < 0.85 && mood === 'happy') { sfx('hum'); puff('♪', 60, 60, 'note'); }
    else { twitch('l'); setTimeout(() => twitch('r'), 160); }
  }

  // ---------- касания ----------
  let down = null;
  function onDown(e) {
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), path: 0, acc: 0, id: e.pointerId };
    try { svg.setPointerCapture(e.pointerId); } catch { /* нет захвата */ }
  }
  function aim(sx, sy) {
    look.x.t = clamp((sx - 114) / 110, -1, 1);
    look.y.t = clamp((sy - 86) / 120, -0.8, 1);
  }
  function onMove(e) {
    lastPointer = performance.now();
    const [sx, sy] = fromClient(e.clientX, e.clientY);
    if (!asleep) aim(sx, sy);
    if (!down || e.pointerId !== down.id) return;
    const d = Math.hypot(e.clientX - down.lx, e.clientY - down.ly);
    down.lx = e.clientX; down.ly = e.clientY;
    down.path += d;
    if (down.path > 24) {
      if (mode !== 'pet') { setMode('pet'); if (!asleep) sfx('hum'); }
      tilt.t = clamp((e.clientX - down.x) / 7, -12, 12);
      down.acc += d;
      if (down.acc > 70) {
        down.acc = 0;
        puff(asleep ? '💤' : '💗', sx, sy - 10);
        buzz(4);
        onPet?.();
      }
      const now = performance.now();
      if (!asleep && now - lastHum > 1300) { lastHum = now; sfx('hum'); }
    }
  }
  function onUp(e) {
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    down = null;
    if (mode === 'pet') { tilt.t = 0; setMode(asleep ? 'idle' : 'joy', 900); return; }
    if (d.path < 14 && performance.now() - d.t < 400) poke(e);
  }
  function onCancel() { if (mode === 'pet') { tilt.t = 0; setMode('idle'); } down = null; }

  function poke(e) {
    const now = performance.now();
    const [sx, sy] = fromClient(e.clientX, e.clientY);
    squash.v -= 0.09;
    sfx('boop');
    buzz(6);
    if (asleep) {
      asleep = false;
      groggyUntil = now + 9000;
      twitch('l'); twitch('r');
      say('😴?');
      refreshFace();
      setTimeout(refreshFace, 9100);
      onWake?.();
      return;
    }
    taps = taps.filter((x) => now - x < 3000);
    taps.push(now);
    if (taps.length >= 6 && now > spitCool) { taps = []; spitCool = now + 6000; spit(); return; }
    if (taps.length >= 4) { setMode('angry', 700); say('Ну хватит!', 1100); twitch(); return; }
    onPoke?.(e);
    const r = Math.random();
    if (r < 0.45) { setMode('joy', 700); puff('💗', sx, sy - 10); }
    else if (r < 0.7) { hop(7); setMode('joy', 600); }
    else { twitch(); aim(sx, sy); }
  }

  function spit() {
    setMode('angry', 1200);
    tilt.t = -5;
    setTimeout(() => {
      tilt.t = 0;
      squash.v += 0.06;
      sfx('spit');
      buzz([20, 30, 20]);
      puff('💦', 112, 130, 'spit');
      say('Тьфу!', 1300);
      onSpit?.();
    }, 650);
  }

  if (!still) {
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onCancel);
  } else wrap.classList.add('still');
  addEventListener('pointermove', onMove, { passive: true });
  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    removeEventListener('pointermove', onMove);
    clearTimeout(sayTimer);
  }
  refreshFace();
  raf = requestAnimationFrame(frame);

  let brushAcc = 0, lastBrush = null;

  return {
    el: wrap,
    say,
    /** Настроение по шкалам питомца; sleep — ночь */
    setMood({ food = 70, joy = 70, sleep = false } = {}) {
      mood = food < 30 ? 'hungry' : joy < 30 ? 'sad' : food >= 60 && joy >= 60 ? 'happy' : 'ok';
      asleep = sleep;
      refreshFace();
    },
    get asleep() { return asleep; },
    /** Наряд: { wool, head, eyes, neck, back } */
    setLook(lk = {}) {
      const [m, s] = WOOL[lk.wool] || WOOL.cream;
      svg.style.setProperty('--wm', m);
      svg.style.setProperty('--ws', s);
      for (const slot of ['head', 'eyes', 'neck', 'back']) {
        const fn = lk[slot] && ITEM_SVG[slot][lk[slot]];
        P.slot[slot].innerHTML = fn ? fn(n) : '';
      }
      P.bell = q('.ll-bell');
    },
    /** Грязь: 0 — чистая, 1 — вся в пятнах */
    setDirt(d) { P.dirt.forEach((e, i) => e.setAttribute('opacity', d > (i + 0.5) / P.dirt.length ? '0.75' : '0')); },
    lookAtClient(cx, cy) { lastPointer = performance.now(); const [sx, sy] = fromClient(cx, cy); aim(sx, sy); },
    /** Где рот — в координатах экрана */
    mouthClient() {
      const r = svg.getBoundingClientRect(), s = r.width / 300;
      return { x: r.left + 111 * s, y: r.top + (124 + 14) * s }; // с учётом увеличенной головы
    },
    /** Еда рядом — открывает рот */
    want(on) {
      if (asleep && on) { asleep = false; groggyUntil = performance.now() + 4000; onWake?.(); }
      if (on && mode !== 'want') setMode('want');
      else if (!on && mode === 'want') setMode('idle');
    },
    /** Расчёска над ламой: true — попали по шерсти; каждые ~60px — «порция» чистки */
    brushAt(cx, cy) {
      const [sx, sy] = fromClient(cx, cy);
      const over = sx > 60 && sx < 290 && sy > 20 && sy < 300;
      if (!over) { lastBrush = null; if (mode === 'brush') setMode('idle'); return 0; }
      if (mode !== 'brush') setMode('brush');
      if (lastBrush) brushAcc += Math.hypot(cx - lastBrush[0], cy - lastBrush[1]);
      lastBrush = [cx, cy];
      tilt.t = clamp((sx - 170) / 12, -8, 8);
      if (brushAcc > 60) { brushAcc = 0; puff('✨', sx, sy - 6); sfx('tap'); buzz(3); return 2; }
      return 1;
    },
    brushEnd() { lastBrush = null; tilt.t = 0; if (mode === 'brush') setMode('joy', 700); },
    /** Съесть: жуёт, крошки, радость */
    eat() {
      setMode('eat', 1300);
      sfx('munch');
      setTimeout(() => sfx('munch'), 420);
      setTimeout(() => sfx('munch'), 840);
      for (let i = 0; i < 4; i++) setTimeout(() => puff('•', 112 + rnd(-14, 14), 136, 'crumb'), i * 250);
      setTimeout(() => { setMode('joy', 900); hop(6); say('Ням!', 1100); }, 1300);
    },
    /** Порадоваться (подарок, обновка, встреча) */
    cheer(text) {
      if (asleep) { asleep = false; groggyUntil = 0; }
      setMode('joy', 1300);
      hop(8);
      setTimeout(() => hop(6), 420);
      sfx('happy');
      for (let i = 0; i < 3; i++) setTimeout(() => puff('💗', 114 + rnd(-60, 60), 40), i * 180);
      if (text) say(text, 1600);
    },
    refuse(text) { twitch('l'); twitch('r'); tilt.t = 8; setTimeout(() => (tilt.t = 0), 500); say(text || '🙅', 1200); },
    destroy,
  };
}

const CSS = `
.ll-wrap { position: relative; width: min(100%, 300px); margin: 0 auto; touch-action: none; -webkit-user-select: none; user-select: none; }
.ll-wrap.still { touch-action: auto; pointer-events: none; }
.ll-wrap svg { display: block; width: 100%; height: auto; overflow: visible; cursor: grab; -webkit-tap-highlight-color: transparent; }
.ll { --wm: #fff6e6; --ws: #e8d3b4; }
.ll .wm { fill: var(--wm); }
.ll .ws { fill: var(--ws); }
.ll .wsl { stroke: var(--ws); }
.ll-eh, .ll-es { display: none; fill: none; stroke: #111; stroke-width: 5; stroke-linecap: round; }
.ll[data-eyes="happy"] .ll-eo, .ll[data-eyes="sleep"] .ll-eo { display: none; }
.ll[data-eyes="happy"] .ll-eh { display: inline; }
.ll[data-eyes="sleep"] .ll-es { display: inline; }
.ll[data-eyes="happy"] .ll-slot-eyes, .ll[data-eyes="sleep"] .ll-slot-eyes { opacity: .9; }
.ll-ico { width: 100%; height: 100%; display: block; overflow: visible; }
.ll-fx { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.ll-p { position: absolute; transform: translate(-50%, -50%); font-size: 26px; line-height: 1; pointer-events: none; animation: ll-up 1.1s ease-out forwards; }
.ll-p.z { font-family: var(--display, sans-serif); font-weight: 900; color: #fff; font-size: 24px; animation: ll-z 2.2s ease-out forwards; }
.ll-p.note { font-weight: 900; font-size: 30px; animation: ll-up 1.4s ease-out forwards; }
.ll-p.crumb { font-size: 22px; color: #b07a3a; animation: ll-fall .7s ease-in forwards; }
.ll-p.spit { font-size: 30px; animation: ll-spit .75s cubic-bezier(.2,.8,.3,1) forwards; }
@keyframes ll-up { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.4); } 15% { opacity: 1; transform: translate(-50%, -70%) scale(1.15); }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), -300%) scale(.9); } }
@keyframes ll-z { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.5); } 20% { opacity: .9; }
  100% { opacity: 0; transform: translate(calc(-50% + 40px), -380%) scale(1.4); } }
@keyframes ll-fall { 0% { opacity: 1; transform: translate(-50%, -50%); } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), 120%); } }
@keyframes ll-spit { 0% { opacity: 1; transform: translate(-50%, -50%) scale(.3); } 70% { opacity: 1; transform: translate(-50%, 10%) scale(4.2); }
  100% { opacity: 0; transform: translate(-50%, 20%) scale(5); } }
.ll-say { position: absolute; left: 38%; top: -10px; transform: translate(-50%, -100%) scale(.6); opacity: 0; pointer-events: none;
  background: #fff; color: #111; border-radius: 18px; padding: 7px 14px; font-weight: 900; font-size: 17px; white-space: nowrap;
  box-shadow: 0 0 0 3px #111, 0 4px 0 3px #111; transition: transform .2s cubic-bezier(.2,1.6,.4,1), opacity .15s; }
.ll-say::after { content: ''; position: absolute; left: 50%; bottom: -9px; width: 14px; height: 14px; background: #fff; transform: translateX(-50%) rotate(45deg);
  box-shadow: 3px 3px 0 0 #111; }
.ll-say.on { opacity: 1; transform: translate(-50%, -100%) scale(1); }
`;
