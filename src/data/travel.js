// Путешествия питомца: места открываются словом из букв (кроме Луга), поездка длится по таймеру,
// питомец привозит буквы, вещи и открытку. Где побывал — то место можно поставить фоном дома.

const MIN = 60 * 1000;

export const DESTS = [
  { id: 'meadow', word: '', name: 'Луг', where: 'на лугу', icon: '🌼', ms: 30 * MIN, lvl: 1, tier: 'wood', letters: 4, items: 1, xp: 10, pxp: 6 },
  { id: 'mountains', word: 'ГОРЫ', name: 'Горы', where: 'в горах', icon: '🏔️', ms: 120 * MIN, lvl: 2, tier: 'silver', letters: 7, items: 2, xp: 25, pxp: 14 },
  { id: 'beach', word: 'ПЛЯЖ', name: 'Пляж', where: 'на пляже', icon: '🏖️', ms: 120 * MIN, lvl: 2, tier: 'silver', letters: 7, items: 2, xp: 25, pxp: 14 },
  { id: 'city', word: 'ГОРОД', name: 'Город', where: 'в городе', icon: '🏙️', ms: 120 * MIN, lvl: 3, tier: 'silver', letters: 8, items: 2, xp: 28, pxp: 16 },
  { id: 'desert', word: 'ПУСТЫНЯ', name: 'Пустыня', where: 'в пустыне', icon: '🏜️', ms: 480 * MIN, lvl: 4, tier: 'gold', letters: 12, items: 3, xp: 60, pxp: 30 },
  { id: 'island', word: 'ОСТРОВ', name: 'Остров', where: 'на острове', icon: '🏝️', ms: 480 * MIN, lvl: 4, tier: 'gold', letters: 12, items: 3, xp: 60, pxp: 30 },
  { id: 'volcano', word: 'ВУЛКАН', name: 'Вулкан', where: 'у вулкана', icon: '🌋', ms: 480 * MIN, lvl: 5, tier: 'gold', letters: 13, items: 3, xp: 65, pxp: 32 },
  { id: 'space', word: 'КОСМОС', name: 'Космос', where: 'в космосе', icon: '🪐', ms: 480 * MIN, lvl: 6, tier: 'gold', letters: 14, items: 3, xp: 70, pxp: 35 },
];
export const destById = (id) => DESTS.find((d) => d.id === id) || DESTS[0];

const INK = '#111';
const S = `stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;
const sky = (id, a, b) => `<defs><linearGradient id="sk-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="360" height="300" fill="url(#sk-${id})"/>`;
const stars = (n, seed = 1) => {
  let x = seed, out = '';
  const r = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  for (let i = 0; i < n; i++) out += `<circle cx="${(r() * 360).toFixed(0)}" cy="${(r() * 200).toFixed(0)}" r="${(0.8 + r() * 1.6).toFixed(1)}" fill="#fff" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
  return out;
};

const SCENES = {
  meadow: () => `${sky('m', '#9fe3ff', '#e8fbff')}<circle cx="292" cy="62" r="28" fill="#ffd23f" ${S}/>
    <path d="M-10 210 Q90 160 200 200 Q290 230 370 190 L370 300 L-10 300 Z" fill="#7fd65a" ${S}/>
    <path d="M-10 250 Q120 220 240 248 Q310 262 370 240 L370 300 L-10 300 Z" fill="#5fbf3c" ${S}/>
    ${[[40, 262, '#ff5fa2'], [96, 272, '#fff'], [170, 260, '#ffd23f'], [250, 276, '#ff5fa2'], [318, 262, '#fff']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="6" fill="${c}" ${S} stroke-width="3"/>`).join('')}`,
  mountains: () => `${sky('g', '#b8a5ff', '#ffd0e0')}<circle cx="80" cy="70" r="22" fill="#fff6e6" ${S}/>
    <path d="M-10 250 L90 110 L170 230 L250 90 L370 250 L370 300 L-10 300 Z" fill="#7b6cff" ${S}/>
    <path d="M90 110 L112 141 L100 136 L88 146 L76 130 Z M250 90 L276 126 L262 120 L248 132 L234 114 Z" fill="#fff" ${S} stroke-width="3"/>
    <path d="M-10 270 Q120 240 220 266 Q300 284 370 262 L370 300 L-10 300 Z" fill="#3fb950" ${S}/>`,
  beach: () => `${sky('b', '#7fd8ff', '#fff3c4')}<circle cx="270" cy="70" r="30" fill="#ffd23f" ${S}/>
    <path d="M-10 190 L370 190 L370 250 L-10 250 Z" fill="#2f8fff" ${S}/>
    <path d="M10 205 q15 -8 30 0 t30 0 M150 220 q15 -8 30 0 t30 0 M260 204 q15 -8 30 0 t30 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <path d="M-10 240 Q180 220 370 244 L370 300 L-10 300 Z" fill="#ffe08a" ${S}/>
    <path d="M300 250 Q296 200 306 160" fill="none" ${S} stroke-width="6"/><path d="M306 160 q-30 -6 -44 12 M306 160 q30 -10 44 8 M306 160 q-8 -26 -30 -30 M306 160 q14 -24 36 -24" fill="none" stroke="#3fb950" stroke-width="9" stroke-linecap="round"/>`,
  city: () => `${sky('c', '#2c2a6b', '#8c7bff')}${stars(14, 3)}<circle cx="300" cy="56" r="18" fill="#fff6e6" ${S}/>
    ${[[10, 120, 60], [76, 80, 54], [136, 140, 50], [192, 60, 62], [260, 110, 46], [312, 150, 60]].map(([x, y, w], i) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${300 - y}" fill="${['#111', '#2b2b3a', '#1d1b3a'][i % 3]}" ${S}/>` +
      Array.from({ length: 6 }, (_, j) => `<rect x="${x + 10 + (j % 2) * (w / 2 - 6)}" y="${y + 16 + Math.floor(j / 2) * 30}" width="10" height="12" fill="${(i + j) % 3 ? '#ffd23f' : '#3a3a55'}"/>`).join('')).join('')}`,
  desert: () => `${sky('d', '#ff9a3d', '#ffe08a')}<circle cx="96" cy="78" r="32" fill="#fff3c4" ${S}/>
    <path d="M-10 220 Q100 170 210 214 Q290 240 370 200 L370 300 L-10 300 Z" fill="#f2c79a" ${S}/>
    <path d="M-10 260 Q150 226 370 262 L370 300 L-10 300 Z" fill="#e8a868" ${S}/>
    <path d="M290 250 L290 176 Q290 162 302 162 Q314 162 314 176 L314 250 Z M290 208 L272 208 Q262 208 262 196 L262 186 M314 196 L330 196 Q340 196 340 184 L340 176" fill="#3fb950" ${S}/>`,
  island: () => `${sky('i', '#4fd1ff', '#d4f5ff')}<path d="M-10 170 L370 170 L370 300 L-10 300 Z" fill="#2f8fff" ${S}/>
    <ellipse cx="180" cy="236" rx="150" ry="38" fill="#ffe08a" ${S}/>
    <path d="M70 230 Q64 180 78 140" fill="none" ${S} stroke-width="6"/><path d="M78 140 q-30 -6 -44 12 M78 140 q30 -10 44 8 M78 140 q-8 -26 -30 -30 M78 140 q14 -24 36 -24" fill="none" stroke="#3fb950" stroke-width="9" stroke-linecap="round"/>
    <path d="M20 190 q15 -8 30 0 t30 0 M260 186 q15 -8 30 0 t30 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
  volcano: () => `${sky('v', '#3a1220', '#ff5f3d')}${stars(8, 7)}
    <path d="M40 300 L150 100 L210 100 L320 300 Z" fill="#4a2a2a" ${S}/>
    <path d="M150 100 L210 100 L200 130 L186 118 L176 150 L166 120 L156 132 Z" fill="#ff7a1a" ${S} stroke-width="3"/>
    <circle cx="170" cy="70" r="16" fill="#777" opacity=".8"/><circle cx="196" cy="48" r="22" fill="#888" opacity=".7"/><circle cx="160" cy="30" r="14" fill="#999" opacity=".6"/>
    <path d="M-10 276 Q180 250 370 278 L370 300 L-10 300 Z" fill="#2b1414" ${S}/>`,
  space: () => `<rect width="360" height="300" fill="#0b0b1e"/>${stars(40, 11)}
    <circle cx="276" cy="80" r="34" fill="#ff5fa2" ${S}/><ellipse cx="276" cy="80" rx="58" ry="12" fill="none" stroke="#ffd23f" stroke-width="6" transform="rotate(-18 276 80)"/>
    <path d="M-10 250 Q180 216 370 252 L370 300 L-10 300 Z" fill="#c9c9d6" ${S}/>
    <ellipse cx="80" cy="270" rx="22" ry="6" fill="#a9a9b8"/><ellipse cx="250" cy="262" rx="16" ry="5" fill="#a9a9b8"/>`,
};

/** SVG-сцена места (фон питомца, открытка, карточка поездки) */
export function sceneSVG(id, cls = '', align = 'xMidYMax') {
  const f = SCENES[id];
  return f ? `<svg class="scene ${cls}" viewBox="0 0 360 300" preserveAspectRatio="${align} slice">${f()}</svg>` : '';
}
