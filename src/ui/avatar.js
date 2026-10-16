// Аватар персонажа: SVG из слоёв (волосы сзади, тело, голова, лицо, волосы спереди).

export const SKINS = ['#ffe3d1', '#f6c9a6', '#e8b08a', '#c98b62', '#9c6644', '#6b4329'];
export const HAIR_COLORS = ['#2b1d1a', '#5a3825', '#a0522d', '#e8a33a', '#f4dc94', '#d9453a', '#ff6fa1', '#8a63ff', '#3fa9ff', '#e9e9f2'];
export const EYE_COLORS = ['#4a3426', '#3d7bd9', '#2f9e63', '#7d8590', '#8a5cc9', '#c0782a'];
export const OUTFIT_COLORS = ['#ff4f8b', '#7a5cff', '#2fcf98', '#3fa9ff', '#ffc93c', '#ff8a3d', '#2b1d4a', '#f2f2f7'];

export const HAIR_STYLES = ['Каре', 'Длинные', 'Хвост', 'Пучок', 'Короткая', 'Ёжик', 'Кудри', 'Без волос'];
export const OUTFITS = ['Футболка', 'Худи', 'Платье', 'Пиджак', 'Свитер'];
export const BEARDS = ['Нет', 'Щетина', 'Борода', 'Усы'];

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  const r = c(n >> 16), g = c((n >> 8) & 255), b = c(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function hairBack(style, col) {
  switch (style) {
    case 0: return `<path d="M44 110 Q38 38 100 36 Q162 38 156 110 L160 152 Q138 160 132 146 L68 146 Q62 160 40 152 Z" fill="${col}"/>`;
    case 1: return `<path d="M42 110 Q36 34 100 34 Q164 34 158 110 L168 222 Q100 240 32 222 Z" fill="${col}"/>`;
    case 2: return `<path d="M138 66 Q196 84 178 176 Q170 196 160 186 Q170 130 140 104 Z" fill="${col}"/>`;
    case 3: return `<circle cx="100" cy="34" r="24" fill="${col}"/><circle cx="100" cy="34" r="24" fill="url(#hairShine)"/>`;
    case 6: {
      let s = '';
      const pts = [[50, 120], [48, 145], [60, 160], [150, 120], [152, 145], [140, 160]];
      for (const [x, y] of pts) s += `<circle cx="${x}" cy="${y}" r="16" fill="${col}"/>`;
      return s;
    }
    default: return '';
  }
}

function hairFront(style, col) {
  const dark = shade(col, -25);
  switch (style) {
    case 0: return `<path d="M46 98 Q48 40 100 40 Q152 40 154 98 Q132 66 100 70 Q72 66 46 98 Z" fill="${col}"/>`;
    case 1: return `<path d="M46 104 Q46 38 100 38 Q156 40 154 108 Q142 66 112 60 Q78 70 46 104 Z" fill="${col}"/>`;
    case 2:
    case 3: return `<path d="M47 96 Q48 38 100 38 Q152 38 153 96 Q140 58 100 56 Q60 58 47 96 Z" fill="${col}"/>
      <path d="M70 52 Q100 44 130 52" stroke="${dark}" stroke-width="3" fill="none" opacity=".5"/>`;
    case 4: return `<path d="M45 94 Q42 34 100 34 Q160 36 155 94 Q150 60 128 56 Q100 66 72 56 Q52 62 45 94 Z" fill="${col}"/>`;
    case 5: return `<path d="M48 86 Q50 42 100 42 Q150 42 152 86 Q140 58 100 56 Q60 58 48 86 Z" fill="${col}" opacity=".9"/>`;
    case 6: {
      let s = '';
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        const x = 100 + Math.cos(a) * 52, y = 92 + Math.sin(a) * 52;
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="17" fill="${col}"/>`;
      }
      s += `<circle cx="78" cy="58" r="16" fill="${col}"/><circle cx="104" cy="52" r="17" fill="${col}"/><circle cx="128" cy="60" r="15" fill="${col}"/>`;
      return s;
    }
    default: return '';
  }
}

function outfit(style, col, female) {
  const dark = shade(col, -35);
  const light = shade(col, 30);
  const body = female
    ? 'M42 240 Q46 186 100 178 Q154 186 158 240 Z'
    : 'M28 240 Q32 182 100 176 Q168 182 172 240 Z';
  let s = `<path d="${body}" fill="${col}"/>`;
  switch (style) {
    case 0: s += `<path d="M84 178 Q100 194 116 178" stroke="${dark}" stroke-width="4" fill="none"/>`; break;
    case 1: s += `<path d="M66 184 Q100 214 134 184 Q120 176 100 176 Q80 176 66 184 Z" fill="${dark}"/>
      <line x1="92" y1="198" x2="90" y2="226" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <line x1="108" y1="198" x2="110" y2="226" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`; break;
    case 2: s += `<path d="M80 178 Q100 206 120 178" fill="${dark}"/>
      <path d="${female ? 'M48 226 Q100 238 152 226 L158 240 L42 240 Z' : 'M34 226 Q100 238 166 226 L172 240 L28 240 Z'}" fill="${light}"/>`; break;
    case 3: s += `<path d="M86 178 L100 222 L114 178 Z" fill="#fff"/>
      <path d="M86 178 L100 222 L80 240 L66 186 Z" fill="${dark}"/><path d="M114 178 L100 222 L120 240 L134 186 Z" fill="${dark}"/>
      <circle cx="100" cy="232" r="3" fill="${dark}"/>`; break;
    case 4: s += `<path d="M80 176 Q100 190 120 176 L118 186 Q100 198 82 186 Z" fill="${dark}"/>
      <path d="M50 214 Q100 222 150 214" stroke="${light}" stroke-width="5" fill="none"/>
      <path d="M46 228 Q100 236 154 228" stroke="${light}" stroke-width="5" fill="none"/>`; break;
  }
  return s;
}

function beard(style, col) {
  switch (style) {
    case 1: return `<path d="M54 122 Q58 166 100 170 Q142 166 146 122 Q140 148 100 152 Q60 148 54 122 Z" fill="${col}" opacity=".28"/>`;
    case 2: return `<path d="M52 116 Q54 176 100 178 Q146 176 148 116 Q142 146 122 140 Q100 150 78 140 Q58 146 52 116 Z" fill="${col}"/>`;
    case 3: return `<path d="M80 128 Q100 118 120 128 Q112 134 100 130 Q88 134 80 128 Z" fill="${col}"/>`;
    default: return '';
  }
}

export function avatarSVG(p, { bg = true } = {}) {
  const female = p.gender === 'f';
  const skin = SKINS[p.skin] ?? SKINS[1];
  const skinDark = shade(skin, -28);
  const hair = HAIR_COLORS[p.hairColor] ?? HAIR_COLORS[0];
  const eye = EYE_COLORS[p.eyes] ?? EYE_COLORS[0];
  const out = OUTFIT_COLORS[p.outfitColor] ?? OUTFIT_COLORS[0];
  const brow = shade(hair, -20);

  const eyeSvg = (x) => `
    <ellipse cx="${x}" cy="106" rx="9.5" ry="11" fill="#fff"/>
    <circle cx="${x}" cy="107" r="6.5" fill="${eye}"/>
    <circle cx="${x}" cy="107" r="3.2" fill="#1b1230"/>
    <circle cx="${x + 2.5}" cy="104" r="2" fill="#fff"/>
    ${female ? `<path d="M${x - 10} 99 Q${x} 92 ${x + 10} 99" stroke="#1b1230" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <line x1="${x + 9}" y1="98" x2="${x + 13}" y2="94" stroke="#1b1230" stroke-width="2.2" stroke-linecap="round"/>` : ''}`;

  return `<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="avBg" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#fff6c9"/><stop offset="1" stop-color="#ffc2dc"/></radialGradient>
    <linearGradient id="hairShine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  ${bg ? '<rect width="200" height="240" fill="url(#avBg)"/>' : ''}
  ${hairBack(p.hair, hair)}
  ${outfit(p.outfit, out, female)}
  <rect x="86" y="146" width="28" height="36" rx="10" fill="${skinDark}"/>
  <circle cx="48" cy="110" r="10" fill="${skin}"/><circle cx="152" cy="110" r="10" fill="${skin}"/>
  <ellipse cx="100" cy="102" rx="52" ry="58" fill="${skin}"/>
  ${!female ? beard(p.beard || 0, hair) : ''}
  <circle cx="70" cy="126" r="9" fill="#ff7aa8" opacity=".3"/><circle cx="130" cy="126" r="9" fill="#ff7aa8" opacity=".3"/>
  ${eyeSvg(80)}${eyeSvg(120)}
  <path d="M69 ${female ? 88 : 87} Q80 ${female ? 82 : 83} 91 88" stroke="${brow}" stroke-width="${female ? 3 : 4.5}" fill="none" stroke-linecap="round"/>
  <path d="M109 88 Q120 ${female ? 82 : 83} 131 ${female ? 88 : 87}" stroke="${brow}" stroke-width="${female ? 3 : 4.5}" fill="none" stroke-linecap="round"/>
  <path d="M97 112 Q100 122 104 118" stroke="${skinDark}" stroke-width="3" fill="none" stroke-linecap="round"/>
  ${female
    ? `<path d="M87 132 Q100 145 113 132 Q100 136 87 132 Z" fill="#e0557c"/>`
    : `<path d="M86 132 Q100 144 114 132" stroke="#7a3b3b" stroke-width="3.5" fill="none" stroke-linecap="round"/>`}
  ${hairFront(p.hair, hair)}
  ${p.hair < 7 ? '<path d="M60 60 Q80 46 100 46" stroke="#fff" stroke-width="5" opacity=".18" fill="none" stroke-linecap="round"/>' : ''}
</svg>`;
}
