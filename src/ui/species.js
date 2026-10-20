// Остальные питомцы, нарисованные кодом тем же способом, что и лама: пушистый силуэт с прядями,
// трёхтоновая светотень, живые глаза. Голова каждого вида рисуется в общей «рамке» (лицо по центру x=114,
// глаза около y=80) — поэтому наряды гардероба садятся на всех. Свой у каждого и ответ на частые тыки.

import { sfx, buzz } from './device.js';
import { INK, S, furPart, ellipsePts, eye } from './rig.js';
import { registerSpecies } from './llama.js';


const PINK = '#ff8fb0', NOSE = '#ff7a9a';
const DIRT = [[170, 236, 12, 7], [210, 222, 9, 6], [140, 248, 8, 5], [230, 206, 7, 4], [190, 250, 6, 4], [128, 290, 6, 4], [220, 292, 6, 4]];

/** Сборка svg вида из частей (одинаковые классы — движок анимирует их у всех) */
function frame({ shadow = [172, 311, 108, 9], back = '', tail = '', front = '', body, extra = '', neckT, backT, head, lift = 0 }) {
  return `<svg class="ll" viewBox="0 -14 300 334" data-eyes="open">
<ellipse cx="${shadow[0]}" cy="${shadow[1]}" rx="${shadow[2]}" ry="${shadow[3]}" fill="rgba(0,0,0,.16)"/>
<g class="ll-all">
  ${back}<g class="ll-tail">${tail}</g>${front}
  <g class="ll-body">${body}</g>${extra}
  <g class="ll-dirt">${DIRT.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#8a5a32" opacity="0"/>`).join('')}</g>
  <g class="ll-slot-back" transform="${backT}"></g>
  <g class="ll-slot-neck" transform="${neckT}"></g>
  <g class="ll-head">${head}</g>
</g></svg>`;
}

/** Общие детали головы: глаза, рот, брови, слоты нарядов, маркеры рта и макушки */
function faceParts(n, { eyes, mouthOpen, eyesT = '', headT = '', mpt, hpt = [114, 36], cheeks = [] }) {
  return `${cheeks.map(([x, y, rx, ry]) => `<ellipse class="ll-cheek" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${PINK}"/>`).join('')}
    ${eye('l', eyes[0][0], eyes[0][1], eyes[0][2], `sp${n}a`, -1)}${eye('r', eyes[1][0], eyes[1][1], eyes[1][2], `sp${n}b`, 1)}`
    + `__MUZZLE__<path class="ll-mouth" d="" fill="none" ${S} stroke-width="3.5"/>
    <g class="ll-open">${mouthOpen}</g>
    <g class="ll-brows"><path class="ll-bl" d="" fill="none" ${S} stroke-width="4.5"/><path class="ll-br" d="" fill="none" ${S} stroke-width="4.5"/></g>
    <g class="ll-slot-eyes" transform="${eyesT}"></g>
    <g class="ll-slot-head" transform="${headT}"></g>
    <circle class="ll-mpt" cx="${mpt[0]}" cy="${mpt[1]}" r="0.5" fill="none"/><circle class="ll-hpt" cx="${hpt[0]}" cy="${hpt[1]}" r="0.5" fill="none"/>`;
}
const withMuzzle = (parts, muzzle) => parts.replace('__MUZZLE__', muzzle);

/** Лапа: нога + подушечка/копытце */
const paw = (cx, top, cls, bottom = 300, w = 20, toe = 'wf') =>
  `<path d="M${cx - w / 2} ${top} L${cx + w / 2} ${top} L${cx + w / 2 - 1} ${bottom - 6} L${cx - w / 2 + 1} ${bottom - 6} Z" class="${cls}" ${S} stroke-width="5"/>
   <ellipse cx="${cx + 2}" cy="${bottom - 4}" rx="${w / 2 + 4}" ry="8" class="${toe}" ${S} stroke-width="4.5"/>`;

/** Пушистый хвост-дуга: контур толще, цвет внутри */
const strokeTail = (d, w = 15, cls = 'wsl') => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 9}" stroke-linecap="round"/>
  <path d="${d}" fill="none" class="${cls}" stroke-width="${w}" stroke-linecap="round"/>`;

const MOUTH_STD = (y) => ({
  smile: `M102 ${y} Q108 ${y + 6} 114 ${y} Q120 ${y + 6} 126 ${y}`,
  sad: `M104 ${y + 6} Q114 ${y - 2} 124 ${y + 6}`,
  flat: `M104 ${y + 3} L124 ${y + 3}`,
  small: `M108 ${y + 1} Q114 ${y + 5} 120 ${y + 1}`,
});
const BROW_STD = (y) => ({
  sad: [`M80 ${y + 6} L102 ${y}`, `M126 ${y} L148 ${y + 6}`],
  angry: [`M80 ${y} L102 ${y + 8}`, `M126 ${y + 8} L148 ${y}`],
});
const openMouth = (y, w = 12) => `<path d="M${114 - w} ${y} Q114 ${y + 22} ${114 + w} ${y} Z" fill="${INK}" ${S} stroke-width="3"/>
  <ellipse cx="114" cy="${y + 11}" rx="${w * 0.55}" ry="4.5" fill="#ff7f9e"/>`;
const resetLater = (api, ms, fn) => setTimeout(fn, ms);

// ======================= КОТ =======================
const CAT_BODY = [[112, 172], [104, 196], [108, 222], [124, 244], [160, 252], [200, 252], [236, 246], [252, 226], [250, 202], [234, 186], [200, 180], [160, 180], [138, 168], [126, 158]];
registerSpecies('cat', {
  wool: 'ash',
  A: {
    ground: [172, 311], spin: [172, 230], body: [176, 250], head: [114, 124], lift: 46, earL: [84, 54], earR: [144, 54],
    tail: [246, 212], tailAmp: 10, eyes: [[93, 82, 15], [135, 82, 15]], mouth: [114, 114], look: [114, 84],
    fx: { z: [150, 50], spit: [114, 160], crumb: [114, 160], heart: [114, 40], note: [70, 70], sneeze: [80, 150] },
  },
  mouth: () => MOUTH_STD(112), brow: () => BROW_STD(60),
  markup(n) {
    const head = withMuzzle(faceParts(n, {
      eyes: this.A.eyes, mpt: [114, 116], cheeks: [[80, 104, 8, 5], [148, 104, 8, 5]],
      mouthOpen: openMouth(112, 11), eyesT: 'translate(0 -3)', headT: 'translate(0 2)',
    }), `<path d="M94 104 C94 94 110 94 114 100 C118 94 134 94 134 104 C134 116 124 121 114 119 C104 121 94 116 94 104 Z" class="wf" ${S} stroke-width="3.5"/>
      <path d="M108 99 L120 99 L114 106 Z" fill="${NOSE}" ${S} stroke-width="2.5"/>
      <path d="M90 106 L62 100 M90 111 L60 114 M138 106 L166 100 M138 111 L168 114" ${S} stroke-width="2.5" opacity=".8"/>
      <path d="M114 106 L114 111" ${S} stroke-width="3"/>`);
    return frame({
      back: paw(150, 226, 'ws') + paw(238, 222, 'ws'),
      tail: strokeTail('M246 214 C292 206 300 148 270 118', 15) + `<path d="M270 118 C266 112 262 110 258 112" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`,
      front: paw(126, 232, 'wm') + paw(214, 234, 'wm'),
      body: furPart(`cb${n}`, CAT_BODY, { step: 18, depth: 2, lean: 0.5, seed: 5, jitter: 0.2 }, { stroke: 6, light: [-4, -7],
        inner: '<path d="M190 186 q6 14 2 30 M212 186 q6 14 2 28 M232 192 q4 12 0 24" fill="none" class="wsl" stroke-width="5" stroke-linecap="round" opacity=".7"/>' }),
      neckT: 'translate(2 26)', backT: 'translate(-2 22) scale(.96 .86)',
      head: `<g class="ll-ear-r"><path d="M140 60 L160 14 L170 66 Z" class="ws" ${S} stroke-width="5"/><path d="M146 56 L159 26 L164 58 Z" fill="${PINK}"/></g>
        <g class="ll-ear-l"><path d="M88 60 L68 14 L58 66 Z" class="wm" ${S} stroke-width="5"/><path d="M82 56 L69 26 L64 58 Z" fill="${PINK}"/></g>
        ${furPart(`ch${n}`, ellipsePts(114, 86, 52, 42, 18), { step: 16, depth: 3, lean: 0.4, seed: 13, jitter: 0.2 }, { stroke: 6, light: [-4, -6],
          inner: '<path d="M104 50 l2 12 M114 48 l0 13 M124 50 l-2 12" class="wsl" stroke-width="4" stroke-linecap="round" opacity=".8"/>' })}
        ${head}`,
    });
  },
  // кот шипит: шерсть дыбом, хвост трубой, уши прижаты
  angry(api) {
    api.setMode('angry', 1600);
    api.setPuff(0.12); api.setTail(-25);
    api.earL.t = -45; api.earR.t = 45;
    sfx('spit'); buzz([30, 20, 30]);
    api.say('Шшш!', 1400);
    api.puff('💢', 150, 40);
    resetLater(api, 1600, () => { api.setPuff(0); api.setTail(0); api.earL.t = 0; api.earR.t = 0; });
  },
});

// ======================= ПЁС =======================
const DOG_BODY = [[106, 168], [98, 196], [104, 224], [122, 248], [160, 258], [204, 258], [240, 250], [258, 228], [256, 200], [238, 182], [200, 176], [160, 176], [136, 162], [124, 150]];
registerSpecies('dog', {
  wool: 'caramel',
  A: {
    ground: [172, 311], spin: [172, 230], body: [178, 256], head: [114, 126], lift: 36, earL: [86, 50], earR: [142, 50],
    tail: [252, 206], tailAmp: 16, eyes: [[94, 80, 14], [134, 80, 14]], mouth: [114, 118], look: [114, 82],
    fx: { z: [150, 46], spit: [114, 158], crumb: [114, 158], heart: [114, 36], note: [70, 66], sneeze: [80, 146] },
  },
  mouth: () => MOUTH_STD(116), brow: () => BROW_STD(58),
  markup(n) {
    const head = withMuzzle(faceParts(n, {
      eyes: this.A.eyes, mpt: [114, 120], cheeks: [[80, 102, 8, 5], [148, 102, 8, 5]],
      mouthOpen: openMouth(116, 13) + '<path d="M108 124 Q114 146 120 124" fill="#ff7f9e" stroke="#111" stroke-width="2.5"/>', eyesT: 'translate(0 -5)', headT: 'translate(0 0)',
    }), `<ellipse cx="114" cy="108" rx="25" ry="18" class="wf" ${S} stroke-width="4"/>
      <ellipse cx="114" cy="100" rx="10" ry="7" fill="${INK}"/><ellipse cx="110" cy="97.5" rx="3.5" ry="2" fill="#fff" opacity=".6"/>
      <path d="M114 106 L114 115" ${S} stroke-width="3"/>`);
    return frame({
      back: paw(150, 228, 'ws', 300, 22) + paw(240, 224, 'ws', 300, 22),
      tail: strokeTail('M252 206 C270 196 280 178 272 158', 12),
      front: paw(124, 236, 'wm', 300, 22) + paw(218, 238, 'wm', 300, 22),
      body: furPart(`db${n}`, DOG_BODY, { step: 17, depth: 2.5, lean: 0.45, seed: 7, jitter: 0.25 }, { stroke: 6.5, light: [-4, -8], strokes: 4, box: [140, 190, 240, 240], seed: 3,
        inner: `<ellipse cx="116" cy="210" rx="20" ry="28" class="wf" opacity=".9"/>` }),
      extra: `<path d="M98 168 Q118 182 140 166" fill="none" stroke="#e8344e" stroke-width="7" stroke-linecap="round"/><circle cx="118" cy="182" r="5.5" fill="#ffd23f" ${S} stroke-width="2.5"/>`,
      neckT: 'translate(0 18)', backT: 'translate(2 18) scale(.98 .9)',
      head: `${furPart(`dh${n}`, ellipsePts(114, 84, 46, 44, 18), { step: 16, depth: 2.5, lean: 0.4, seed: 17, jitter: 0.2 }, { stroke: 6, light: [-4, -6],
          inner: '<ellipse cx="136" cy="78" rx="18" ry="16" class="ws" opacity=".8"/>' })}
        <g class="ll-ear-r"><path d="M144 46 C166 46 176 82 170 112 C166 126 150 122 147 104 C144 86 138 64 144 46 Z" class="ws" ${S} stroke-width="5"/></g>
        <g class="ll-ear-l"><path d="M84 46 C62 46 52 82 58 112 C62 126 78 122 81 104 C84 86 90 64 84 46 Z" class="ws" ${S} stroke-width="5"/></g>
        ${head}`,
    });
  },
  // пёс гавкает и подпрыгивает
  angry(api) {
    api.setMode('angry', 1400);
    sfx('boop'); buzz(20); api.hop(9); api.say('Гав!', 700);
    setTimeout(() => { sfx('boop'); buzz(20); api.hop(9); api.say('Гав! Гав!', 1000); api.puff('💢', 150, 36); }, 600);
  },
});

// ======================= ЛИС =======================
const FOX_BODY = [[110, 170], [102, 196], [106, 222], [122, 244], [160, 252], [200, 252], [236, 246], [250, 226], [248, 202], [232, 186], [200, 180], [160, 180], [138, 166], [126, 156]];
registerSpecies('fox', {
  wool: 'fox',
  A: {
    ground: [172, 311], spin: [172, 230], body: [176, 250], head: [114, 122], lift: 40, earL: [86, 52], earR: [142, 52],
    tail: [244, 214], tailAmp: 7, eyes: [[95, 82, 13], [133, 82, 13]], mouth: [114, 132], look: [114, 84],
    fx: { z: [150, 50], spit: [114, 170], crumb: [114, 170], heart: [114, 40], note: [70, 70], sneeze: [80, 160] },
  },
  mouth: () => MOUTH_STD(130), brow: () => BROW_STD(62),
  markup(n) {
    const head = withMuzzle(faceParts(n, {
      eyes: this.A.eyes, mpt: [114, 134], cheeks: [[80, 104, 7, 4.5], [148, 104, 7, 4.5]],
      mouthOpen: openMouth(130, 10), eyesT: 'translate(0 -3)', headT: 'translate(0 4)',
    }), `<path d="M94 100 Q114 93 134 100 L119 126 Q114 131 109 126 Z" class="wf" ${S} stroke-width="4"/>
      <ellipse cx="114" cy="124" rx="7" ry="5" fill="${INK}"/><ellipse cx="111.5" cy="122.5" rx="2.4" ry="1.4" fill="#fff" opacity=".6"/>`);
    const tailPts = ellipsePts(262, 196, 22, 50, 14, 0.75);
    return frame({
      back: paw(150, 226, 'ws', 300, 18, 'wf').replace(/class="wf"/, 'fill="#2b1f1a"') + paw(238, 222, 'ws', 300, 18).replace(/class="wf"/, 'fill="#2b1f1a"'),
      tail: furPart(`ft${n}`, tailPts, { step: 13, depth: 7, lean: 0.5, seed: 21 }, { stroke: 6, light: [-4, -6],
        inner: '<ellipse cx="292" cy="160" rx="22" ry="20" class="wf"/>' }),
      front: paw(126, 232, 'wm', 300, 18).replace(/class="wf"/, 'fill="#2b1f1a"') + paw(214, 234, 'wm', 300, 18).replace(/class="wf"/, 'fill="#2b1f1a"'),
      body: furPart(`fb${n}`, FOX_BODY, { step: 16, depth: 3, lean: 0.5, seed: 11, jitter: 0.25 }, { stroke: 6, light: [-4, -7], strokes: 3, box: [150, 190, 240, 240], seed: 4,
        inner: '<ellipse cx="114" cy="206" rx="22" ry="30" class="wf"/>' }),
      neckT: 'translate(2 20)', backT: 'translate(-2 22) scale(.96 .86)',
      head: `<g class="ll-ear-r"><path d="M138 60 L162 8 L170 66 Z" class="wm" ${S} stroke-width="5"/><path d="M162 8 L156 30 L166 34 Z" fill="${INK}"/><path d="M146 56 L160 24 L163 58 Z" fill="#fff3e6"/></g>
        <g class="ll-ear-l"><path d="M90 60 L66 8 L58 66 Z" class="wm" ${S} stroke-width="5"/><path d="M66 8 L72 30 L62 34 Z" fill="${INK}"/><path d="M82 56 L68 24 L65 58 Z" fill="#fff3e6"/></g>
        ${furPart(`fh${n}`, [[114, 42], [150, 48], [170, 72], [164, 96], [142, 112], [114, 128], [86, 112], [64, 96], [58, 72], [78, 48]], { step: 13, depth: 4, lean: 0.4, seed: 19 }, { stroke: 6, light: [-4, -6] })}
        ${head}`,
    });
  },
  // лис фыркает и отворачивается, хвост распушает
  angry(api) {
    api.setMode('angry', 1700);
    api.setFlip(-1); api.setTail(-14);
    sfx('spit'); buzz([20, 30]);
    api.say('Фыр!', 1300);
    resetLater(api, 1700, () => { api.setFlip(1); api.setTail(0); });
  },
});

// ======================= ХОМЯК =======================
registerSpecies('hamster', {
  wool: 'caramel',
  A: {
    ground: [160, 311], spin: [160, 240], body: [156, 300], head: [114, 130], lift: 82, earL: [80, 56], earR: [148, 56],
    tail: [232, 268], tailAmp: 4, eyes: [[95, 84, 11], [133, 84, 11]], mouth: [114, 114], look: [114, 86],
    fx: { z: [150, 90], spit: [114, 200], crumb: [114, 200], heart: [114, 80], note: [70, 110], sneeze: [80, 190] },
  },
  mouth: () => MOUTH_STD(112), brow: () => BROW_STD(66),
  markup(n) {
    const head = withMuzzle(faceParts(n, {
      eyes: this.A.eyes, mpt: [114, 116], cheeks: [[78, 108, 8, 5], [150, 108, 8, 5]],
      mouthOpen: openMouth(112, 9) + '<rect x="109" y="111" width="5" height="7" rx="1" fill="#fff" stroke="#111" stroke-width="1.5"/><rect x="114" y="111" width="5" height="7" rx="1" fill="#fff" stroke="#111" stroke-width="1.5"/>',
      eyesT: 'translate(0 0) scale(1)', headT: 'translate(0 8)',
    }), `<ellipse cx="86" cy="108" rx="22" ry="17" class="wf" ${S} stroke-width="3.5"/><ellipse cx="142" cy="108" rx="22" ry="17" class="wf" ${S} stroke-width="3.5"/>
      <ellipse cx="114" cy="104" rx="16" ry="12" class="wf"/>
      <path d="M109 100 L119 100 L114 106 Z" fill="${NOSE}" ${S} stroke-width="2.2"/><path d="M114 106 L114 110" ${S} stroke-width="2.5"/>`);
    return frame({
      shadow: [172, 311, 100, 9],
      back: `<ellipse cx="196" cy="304" rx="18" ry="8" fill="#ffc4b0" ${S} stroke-width="4"/>`,
      tail: `<ellipse cx="232" cy="266" rx="9" ry="7" class="ws" ${S} stroke-width="4"/>`,
      front: `<ellipse cx="118" cy="306" rx="16" ry="7" fill="#ffc4b0" ${S} stroke-width="4"/>`,
      body: furPart(`hb${n}`, ellipsePts(158, 252, 76, 56, 18), { step: 13, depth: 3, lean: 0.35, seed: 31 }, { stroke: 6.5, light: [-5, -8], strokes: 6, box: [90, 200, 232, 298], seed: 6,
        inner: '<ellipse cx="140" cy="278" rx="50" ry="28" class="wf"/>' }),
      neckT: 'translate(4 66) scale(1.05 1)', backT: 'translate(-6 46) scale(.96 .82)',
      head: `<g class="ll-ear-r"><circle cx="150" cy="54" r="15" class="ws" ${S} stroke-width="5"/><circle cx="150" cy="56" r="8" fill="${PINK}"/></g>
        <g class="ll-ear-l"><circle cx="78" cy="54" r="15" class="wm" ${S} stroke-width="5"/><circle cx="78" cy="56" r="8" fill="${PINK}"/></g>
        ${furPart(`hh${n}`, ellipsePts(114, 90, 56, 46, 18), { step: 12, depth: 3.5, lean: 0.3, seed: 37 }, { stroke: 6, light: [-4, -6] })}
        ${head}`,
    });
  },
  // хомяк дуется и кувыркается
  angry(api) {
    api.setMode('angry', 1500);
    api.setPuff(0.1);
    sfx('spit'); buzz([20, 20]);
    api.say('Хмф!', 1100);
    setTimeout(() => { api.spinOnce(); api.say('Обиделся!', 1200); }, 500);
    resetLater(api, 1500, () => api.setPuff(0));
  },
});

// ======================= КРОЛИК =======================
registerSpecies('rabbit', {
  wool: 'snow',
  A: {
    ground: [164, 311], spin: [164, 240], body: [164, 296], head: [114, 126], lift: 70, earL: [92, 50], earR: [136, 50],
    tail: [230, 246], tailAmp: 6, eyes: [[94, 84, 14], [134, 84, 14]], mouth: [114, 116], look: [114, 86],
    fx: { z: [150, 60], spit: [114, 186], crumb: [114, 186], heart: [114, 40], note: [70, 90], sneeze: [80, 176] },
  },
  mouth: () => MOUTH_STD(112), brow: () => BROW_STD(64),
  markup(n) {
    const head = withMuzzle(faceParts(n, {
      eyes: this.A.eyes, mpt: [114, 116], cheeks: [[80, 106, 8, 5], [148, 106, 8, 5]],
      mouthOpen: openMouth(114, 10), eyesT: 'translate(0 0)', headT: 'translate(0 6)',
    }), `<path d="M96 106 C96 96 110 96 114 102 C118 96 132 96 132 106 C132 116 124 120 114 118 C104 120 96 116 96 106 Z" class="wf" ${S} stroke-width="3.5"/>
      <ellipse cx="114" cy="101" rx="5" ry="3.5" fill="${NOSE}" ${S} stroke-width="2"/>
      <rect x="109" y="117" width="5" height="8" rx="1" fill="#fff" ${S} stroke-width="1.8"/><rect x="114" y="117" width="5" height="8" rx="1" fill="#fff" ${S} stroke-width="1.8"/>`);
    return frame({
      back: `<ellipse cx="204" cy="300" rx="32" ry="10" class="ws" ${S} stroke-width="5"/>`,
      tail: furPart(`rt${n}`, ellipsePts(232, 244, 17, 15, 10), { step: 9, depth: 4, lean: 0.4, seed: 41 }, { stroke: 5, light: [-3, -4] }).replace(/class="ws"/, 'fill="#e9edf2"').replace(/class="wm"/, 'fill="#fff"'),
      front: paw(122, 262, 'wm', 302, 18) + paw(146, 264, 'wm', 302, 18),
      body: furPart(`rb${n}`, ellipsePts(166, 246, 68, 54, 18), { step: 13, depth: 3.5, lean: 0.35, seed: 43 }, { stroke: 6.5, light: [-5, -8], strokes: 6, box: [100, 196, 232, 292], seed: 8,
        inner: '<ellipse cx="134" cy="264" rx="30" ry="26" class="wf" opacity=".85"/>' }),
      neckT: 'translate(2 52)', backT: 'translate(-8 38) scale(.92 .8)',
      head: `<g class="ll-ear-r"><path d="M128 54 C122 20 124 -34 142 -46 C160 -34 160 20 146 54 Z" class="ws" ${S} stroke-width="5"/><path d="M134 48 C130 18 132 -24 142 -34 C152 -24 152 18 142 48 Z" fill="${PINK}"/></g>
        <g class="ll-ear-l"><path d="M84 54 C70 20 70 -34 88 -46 C106 -34 106 20 100 54 Z" class="wm" ${S} stroke-width="5"/><path d="M88 48 C80 18 80 -24 88 -34 C98 -24 98 18 94 48 Z" fill="${PINK}"/></g>
        ${furPart(`rh${n}`, ellipsePts(114, 88, 46, 42, 18), { step: 12, depth: 4, lean: 0.3, seed: 47 }, { stroke: 6, light: [-4, -6] })}
        ${head}`,
    });
  },
  // кролик топает лапой
  angry(api) {
    api.setMode('angry', 1500);
    api.earL.t = -35; api.earR.t = 35;
    [0, 260, 520].forEach((d) => setTimeout(() => { api.squash.v -= 0.12; sfx('boop'); buzz(25); }, d));
    api.say('Топ! Топ!', 1300);
    resetLater(api, 1500, () => { api.earL.t = 0; api.earR.t = 0; });
  },
});

// ======================= ПОПУГАЙ =======================
registerSpecies('parrot', {
  wool: 'emerald',
  A: {
    ground: [160, 311], spin: [150, 220], body: [140, 290], head: [114, 118], lift: 30, earL: [104, 46], earR: [118, 44],
    tail: [158, 268], tailAmp: 5, eyes: [[92, 78, 12], [136, 78, 12]], mouth: [118, 108], look: [114, 80],
    fx: { z: [150, 30], spit: [118, 150], crumb: [118, 150], heart: [114, 20], note: [60, 60], sneeze: [80, 140] },
  },
  mouth: () => ({ smile: 'M110 112 Q118 116 126 112', sad: 'M110 116 Q118 110 126 116', flat: 'M110 114 L126 114', small: 'M114 113 Q118 115 122 113' }),
  brow: () => BROW_STD(56),
  markup(n) {
    const head = withMuzzle(faceParts(n, {
      eyes: this.A.eyes, mpt: [118, 112], cheeks: [[78, 98, 9, 6], [150, 98, 9, 6]],
      mouthOpen: `<path d="M104 104 Q118 128 130 104 Z" fill="${INK}"/><ellipse cx="117" cy="112" rx="5" ry="3.5" fill="#ff7f9e"/>`, eyesT: 'translate(0 -8)', headT: 'translate(0 2)',
    }), `<path d="M102 92 C102 80 128 78 132 94 C134 108 126 118 116 122 C120 112 118 102 102 92 Z" fill="#ffb020" ${S} stroke-width="4"/>
      <path d="M106 94 C110 90 120 89 124 92" fill="none" stroke="#fff" stroke-width="2.5" opacity=".6" stroke-linecap="round"/>`);
    return frame({
      shadow: [160, 311, 96, 8],
      back: `<rect x="44" y="292" width="232" height="13" rx="6.5" fill="#8a5a32" ${S} stroke-width="4.5"/>`,
      tail: `<path d="M150 262 L174 326 L190 318 L164 258 Z" fill="#2f8fff" ${S} stroke-width="4.5"/><path d="M140 264 L156 330 L170 326 L154 260 Z" fill="#e8344e" ${S} stroke-width="4.5"/>`,
      front: `<path d="M118 284 l-6 12 m10 -12 l0 13 m8 -13 l6 12 M152 284 l-6 12 m10 -12 l0 13 m8 -13 l6 12" stroke="#ff9a3d" stroke-width="6" stroke-linecap="round"/>`,
      body: furPart(`pb${n}`, ellipsePts(138, 214, 50, 74, 18, -0.15), { step: 11, depth: 3.5, lean: 0.6, seed: 51 }, { stroke: 6, light: [-4, -7],
        inner: `<ellipse cx="128" cy="228" rx="28" ry="46" class="wf" opacity=".9"/>
          <path d="M160 160 C196 180 200 250 172 284 C166 250 158 210 160 160 Z" class="ws" ${S} stroke-width="4.5"/>
          <path d="M168 196 q10 6 14 18 M168 220 q10 6 12 18 M166 244 q8 6 8 16" fill="none" stroke="${INK}" stroke-width="2.5" opacity=".45"/>` }),
      neckT: 'translate(-2 6) scale(.92 1)', backT: 'translate(-34 8) scale(.8 .8)',
      head: `<g class="ll-ear-l"><path d="M100 46 C88 22 92 0 104 -10 C112 6 112 26 108 46 Z" fill="#ffd23f" ${S} stroke-width="4.5"/></g>
        <g class="ll-ear-r"><path d="M114 44 C110 18 118 -2 132 -6 C134 12 128 30 122 46 Z" fill="#ff7a1a" ${S} stroke-width="4.5"/></g>
        ${furPart(`ph${n}`, ellipsePts(114, 80, 44, 40, 16), { step: 11, depth: 3, lean: 0.6, seed: 53 }, { stroke: 6, light: [-4, -6] })}
        <circle cx="92" cy="78" r="17" fill="#fff" opacity=".85"/><circle cx="136" cy="78" r="17" fill="#fff" opacity=".85"/>
        ${head}`,
    });
  },
  // попугай кричит «Отстань!» и роняет перья
  angry(api) {
    api.setMode('angry', 1500);
    api.earL.t = -25; api.earR.t = 25; api.setPuff(0.08);
    sfx('spit'); buzz([20, 30, 20]);
    api.say('Отстань! Отстань!', 1400);
    for (let i = 0; i < 3; i++) setTimeout(() => api.puff('🪶', 110 + Math.random() * 60, 150), i * 160);
    resetLater(api, 1500, () => { api.earL.t = 0; api.earR.t = 0; api.setPuff(0); });
  },
});
