// Живая лама для экрана питомца: SVG из частей и одна rAF-петля (только пока лама на экране).
// Дышит, моргает, следит за пальцем, шевелит ушами и помпонами. Её можно гладить (провести пальцем),
// тыкать (если часто — обидится и плюнет), кормить (поднести еду ко рту). Ночью спит.

import { sfx, buzz } from './device.js';

const INK = '#111', WOOL = '#fffaf0', WOOL2 = '#f3e3c8', PINK = '#ff8fb8';

// контур-объединение пушистых частей: сначала чёрные круги побольше, сверху — светлые
const blob = (circles, fill) =>
  circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="${INK}"/>`).join('') +
  circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('');

const BODY = [[120, 206, 50], [80, 212, 30], [160, 212, 30], [96, 186, 26], [144, 186, 26], [120, 180, 28], [92, 236, 22], [148, 236, 22], [120, 240, 24]];
const TUFT = [[104, 46, 15], [120, 38, 17], [136, 46, 15], [110, 56, 13], [130, 56, 13]];
const TAIL = [[196, 198, 12], [204, 188, 9]];

const leg = (x, y, h, fill) =>
  `<rect x="${x}" y="${y}" width="24" height="${h}" rx="12" fill="${fill}" stroke="${INK}" stroke-width="5"/>` +
  `<rect x="${x}" y="${y + h - 13}" width="24" height="13" rx="6.5" fill="${INK}"/>`;

const eye = (cls, x) => `<g class="ll-eye ${cls}" transform="translate(${x} 80)">
  <g class="ll-eo"><ellipse rx="8.5" ry="10.5" fill="${INK}"/><circle cx="-3" cy="-4" r="3.3" fill="#fff"/><circle cx="3" cy="4" r="1.6" fill="#fff"/></g>
  <path class="ll-eh" d="M-9 3 Q0 -8 9 3"/><path class="ll-es" d="M-9 -1 Q0 7 9 -1"/></g>`;

const SVG = `<svg class="ll" viewBox="0 -10 240 310" data-eyes="open">
<ellipse class="ll-shadow" cx="120" cy="288" rx="74" ry="9" fill="rgba(0,0,0,.13)"/>
<g class="ll-all">
  <g class="ll-tail">${blob(TAIL, WOOL)}</g>
  ${leg(64, 228, 58, WOOL2)}${leg(152, 228, 58, WOOL2)}${leg(92, 234, 54, WOOL)}${leg(124, 234, 54, WOOL)}
  <g class="ll-feet"></g>
  <rect class="ll-neck" x="96" y="104" width="48" height="96" rx="24" fill="${WOOL}" stroke="${INK}" stroke-width="5"/>
  <g class="ll-body">${blob(BODY, WOOL)}<g class="ll-wear"></g></g>
  <g class="ll-head">
    <g class="ll-ear-l"><ellipse cx="82" cy="30" rx="12" ry="28" transform="rotate(-16 82 30)" fill="${WOOL}" stroke="${INK}" stroke-width="5"/>
      <ellipse cx="82" cy="33" rx="5" ry="16" transform="rotate(-16 82 33)" fill="${PINK}"/></g>
    <g class="ll-ear-r"><ellipse cx="158" cy="30" rx="12" ry="28" transform="rotate(16 158 30)" fill="${WOOL}" stroke="${INK}" stroke-width="5"/>
      <ellipse cx="158" cy="33" rx="5" ry="16" transform="rotate(16 158 33)" fill="${PINK}"/></g>
    <ellipse cx="120" cy="84" rx="50" ry="44" fill="${WOOL}" stroke="${INK}" stroke-width="5"/>
    <g class="ll-tas-l"><path d="M80 58 Q70 66 66 72" fill="none" stroke="${INK}" stroke-width="3"/><circle cx="64" cy="79" r="9" fill="#ff5fa2" stroke="${INK}" stroke-width="4"/></g>
    <g class="ll-tas-r"><path d="M160 58 Q170 66 174 72" fill="none" stroke="${INK}" stroke-width="3"/><circle cx="176" cy="79" r="9" fill="#c8ff2e" stroke="${INK}" stroke-width="4"/></g>
    <g class="ll-tuft">${blob(TUFT, WOOL)}</g>
    <ellipse class="ll-cheek" cx="84" cy="98" rx="9" ry="6" fill="${PINK}"/>
    <ellipse class="ll-cheek" cx="156" cy="98" rx="9" ry="6" fill="${PINK}"/>
    ${eye('ll-eye-l', 100)}${eye('ll-eye-r', 140)}
    <g class="ll-brows"><path class="ll-bl" d=""/><path class="ll-br" d=""/></g>
    <ellipse cx="120" cy="112" rx="30" ry="20" fill="${WOOL2}" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="111" cy="106" rx="2.6" ry="3.6" fill="${INK}"/><ellipse cx="129" cy="106" rx="2.6" ry="3.6" fill="${INK}"/>
    <g class="ll-mouthg"><path class="ll-mouth" d=""/><ellipse class="ll-mo" cx="120" cy="121" rx="7" ry="5" fill="${INK}"/></g>
    <g class="ll-hat"></g>
  </g>
</g></svg>`;

const MOUTH = {
  smile: 'M110 119 Q120 127 130 119',
  grin: 'M108 117 Q120 134 132 117 Z',
  sad: 'M110 125 Q120 117 130 125',
  flat: 'M111 121 L129 121',
  small: 'M115 121 Q120 124 125 121',
};
const BROW = {
  sad: ['M90 66 L108 61', 'M150 66 L132 61'],
  angry: ['M90 60 L108 68', 'M150 60 L132 68'],
};

// куда надевать вещь (эмодзи): позиция в координатах ламы, размер, поворот, слой
const WEAR = [
  { set: '👒🎩🧢', layer: 'hat', x: 122, y: 26, size: 72, rot: -8 },
  { set: '👓', layer: 'hat', x: 120, y: 84, size: 60, rot: 0 },
  { set: '💍', layer: 'hat', x: 60, y: 96, size: 22, rot: 0 },
  { set: '🧣📿', layer: 'wear', x: 120, y: 160, size: 50, rot: 0 },
  { set: '👗👕👔🧥👘🩱', layer: 'wear', x: 120, y: 214, size: 64, rot: 0 },
  { set: '🧦👟👠👢', layer: 'feet', x: 0, y: 0, size: 26, rot: 0 },
  { set: '👜🎒🌂💄', layer: 'wear', x: 176, y: 222, size: 40, rot: 10 },
];

let cssDone = false;
function injectCSS() {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.append(s);
}

function spring(k = 0.14, d = 0.74) {
  return { x: 0, v: 0, t: 0, step() { this.v = (this.v + (this.t - this.x) * k) * d; this.x += this.v; return this.x; } };
}
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Создать ламу. Колбэки: onPet() — гладят (порция поглаживания), onPoke() — тыкнули,
 * onWake() — разбудили, onSpit() — плюнула.
 */
export function createLlama({ onPet, onPoke, onWake, onSpit } = {}) {
  injectCSS();
  const wrap = document.createElement('div');
  wrap.className = 'll-wrap';
  wrap.innerHTML = SVG + '<div class="ll-fx"></div><div class="ll-say"></div>';
  const svg = wrap.querySelector('svg');
  const q = (s) => svg.querySelector(s);
  const P = {
    all: q('.ll-all'), body: q('.ll-body'), head: q('.ll-head'), earL: q('.ll-ear-l'), earR: q('.ll-ear-r'),
    tasL: q('.ll-tas-l'), tasR: q('.ll-tas-r'), tail: q('.ll-tail'), eyeL: q('.ll-eye-l'), eyeR: q('.ll-eye-r'),
    eoL: q('.ll-eye-l .ll-eo'), eoR: q('.ll-eye-r .ll-eo'), bl: q('.ll-bl'), br: q('.ll-br'), mouth: q('.ll-mouth'),
    mo: q('.ll-mo'), mouthG: q('.ll-mouthg'), cheeks: [...svg.querySelectorAll('.ll-cheek')],
    hat: q('.ll-hat'), wear: q('.ll-wear'), feet: q('.ll-feet'),
  };
  const fxEl = wrap.querySelector('.ll-fx');
  const bubble = wrap.querySelector('.ll-say');

  // ---------- состояние ----------
  const look = { x: spring(0.16, 0.7), y: spring(0.16, 0.7) };
  const tilt = spring(0.1, 0.78), earL = spring(0.18, 0.72), earR = spring(0.18, 0.72);
  const tasL = spring(0.08, 0.9), tasR = spring(0.08, 0.9), squash = spring(0.22, 0.62), blush = spring(0.08, 0.8);
  let hopY = 0, hopV = 0;
  let mood = 'ok', asleep = false, groggyUntil = 0;
  let mode = 'idle', modeUntil = 0; // idle | pet | joy | eat | want | angry
  let nextBlink = performance.now() + 1500, blinkEnd = 0;
  let nextIdle = performance.now() + 2500, chewUntil = 0;
  let lastPointer = 0, nextZ = 0, lastHum = 0;
  let taps = [], spitCool = 0;
  let mounted = false, raf = 0;

  const scale = () => wrap.clientWidth / 240;
  const toWrap = (x, y) => { const s = scale(); return [x * s, (y + 10) * s]; };
  const fromClient = (cx, cy) => {
    const r = svg.getBoundingClientRect(), s = r.width / 240;
    return [(cx - r.left) / s, (cy - r.top) / s - 10];
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
    if (mode === 'pet') return { eyes: 'happy', mouth: asleep ? 'small' : 'smile' };
    if (mode === 'eat') return { eyes: 'happy', mouth: 'open' };
    if (mode === 'want') return { eyes: 'open', mouth: 'open' };
    if (mode === 'joy') return { eyes: 'happy', mouth: 'grin' };
    if (asleep) return { eyes: 'sleep', mouth: 'small' };
    if (mood === 'hungry' || mood === 'sad') return { eyes: 'open', brow: 'sad', mouth: 'sad' };
    if (performance.now() < groggyUntil) return { eyes: 'open', mouth: 'flat' };
    if (mood === 'happy') return { eyes: 'open', mouth: 'grin' };
    return { eyes: 'open', mouth: 'smile' };
  }
  function refreshFace() {
    const f = face();
    svg.dataset.eyes = f.eyes;
    const b = BROW[f.brow];
    P.bl.setAttribute('d', b ? b[0] : '');
    P.br.setAttribute('d', b ? b[1] : '');
    if (f.mouth === 'open') { P.mouth.setAttribute('d', ''); P.mo.style.display = ''; }
    else {
      P.mo.style.display = 'none';
      P.mouth.setAttribute('d', MOUTH[f.mouth]);
      P.mouth.setAttribute('class', 'll-mouth' + (f.mouth === 'grin' ? ' fill' : ''));
    }
    blush.t = f.eyes === 'happy' ? 1 : 0;
    // уши: грустная/сонная лама их опускает
    const droop = asleep ? 1 : (mood === 'hungry' || mood === 'sad') ? 0.7 : 0;
    earL.t = -26 * droop; earR.t = 26 * droop;
  }

  // ---------- петля ----------
  function frame(now) {
    raf = 0;
    if (!wrap.isConnected) { if (mounted) return destroy(); raf = requestAnimationFrame(frame); return; }
    mounted = true;
    const t = now / 1000;
    if (modeUntil && now > modeUntil) { mode = 'idle'; modeUntil = 0; refreshFace(); }

    // моргание (спящая не моргает)
    if (!asleep && now > nextBlink) { blinkEnd = now + 130; nextBlink = now + rnd(2200, 5200) + (Math.random() < 0.2 ? -1900 : 0); }
    const groggy = now < groggyUntil;
    const lid = now < blinkEnd ? 0.1 : groggy ? 0.5 : mode === 'want' ? 1.15 : 1;

    // взгляд: за пальцем, без него — оглядывается сам
    if (!asleep && now - lastPointer > 2200 && Math.random() < 0.012) { look.x.t = rnd(-1, 1); look.y.t = rnd(-0.6, 0.8); }
    if (asleep) { look.x.t = 0; look.y.t = 0.4; }
    look.x.step(); look.y.step();

    // прыжок с гравитацией
    if (hopV || hopY) { hopY += hopV; hopV += 0.9; if (hopY >= 0) { hopY = 0; hopV = 0; squash.v -= 0.06; } }
    const sq = squash.step();
    const breathSpeed = asleep ? 1.4 : 2.6;
    const br = Math.sin(t * breathSpeed);
    const bob = br * (asleep ? 2.2 : 1.2) + (asleep ? 6 : 0);

    // уши, хвост, помпоны
    const tl = tilt.step();
    tasL.v += -tilt.v * 0.5; tasR.v += -tilt.v * 0.5;
    tasL.t = -tl * 0.6; tasR.t = -tl * 0.6;
    const eL = earL.step(), eR = earR.step();
    const pL = tasL.step(), pR = tasR.step();
    const bl = blush.step();

    P.all.setAttribute('transform', `translate(0 ${hopY.toFixed(2)}) translate(120 286) scale(${(1 - sq * 0.6).toFixed(4)} ${(1 + sq).toFixed(4)}) translate(-120 -286)`);
    P.body.setAttribute('transform', `translate(120 262) scale(${(1 + br * 0.008).toFixed(4)} ${(1 + br * (asleep ? 0.03 : 0.018)).toFixed(4)}) translate(-120 -262)`);
    P.head.setAttribute('transform', `translate(0 ${bob.toFixed(2)}) rotate(${(tl + (asleep ? 7 : 0)).toFixed(2)} 120 140)`);
    P.earL.setAttribute('transform', `rotate(${eL.toFixed(2)} 90 56)`);
    P.earR.setAttribute('transform', `rotate(${eR.toFixed(2)} 150 56)`);
    P.tasL.setAttribute('transform', `rotate(${pL.toFixed(2)} 80 58)`);
    P.tasR.setAttribute('transform', `rotate(${pR.toFixed(2)} 160 58)`);
    P.tail.setAttribute('transform', `rotate(${(Math.sin(t * (mood === 'happy' || mode === 'joy' ? 9 : 2)) * 8).toFixed(2)} 190 206)`);
    const lx = look.x.x * 4.5, ly = look.y.x * 3.5;
    P.eyeL.setAttribute('transform', `translate(${(100 + lx).toFixed(2)} ${(80 + ly).toFixed(2)})`);
    P.eyeR.setAttribute('transform', `translate(${(140 + lx).toFixed(2)} ${(80 + ly).toFixed(2)})`);
    const big = mode === 'want' ? 1.12 : 1;
    P.eoL.setAttribute('transform', `scale(${big} ${lid})`);
    P.eoR.setAttribute('transform', `scale(${big} ${lid})`);
    for (const c of P.cheeks) c.setAttribute('opacity', (0.4 + bl * 0.55).toFixed(2));

    // рот: жуёт еду / жвачку (ламы всё время жуют)
    if (mode === 'eat') P.mo.setAttribute('ry', (3.5 + Math.sin(t * 22) * 2.8).toFixed(2));
    else if (mode === 'want') P.mo.setAttribute('ry', '7');
    else P.mo.setAttribute('ry', '5');
    P.mouthG.setAttribute('transform', now < chewUntil ? `translate(${(Math.sin(t * 9) * 2.6).toFixed(2)} 0)` : '');

    if (asleep && mode !== 'pet' && now > nextZ) { nextZ = now + 1500; puff('z', 150, 40, 'z'); }
    if (now > nextIdle && mode === 'idle') idle(now);

    raf = requestAnimationFrame(frame);
  }

  // случайные «живые» мелочи
  function idle(now) {
    nextIdle = now + rnd(2500, 6000);
    if (asleep) { if (Math.random() < 0.3) twitch(); return; }
    const r = Math.random();
    if (mood === 'hungry' && r < 0.35) { look.y.t = 1; look.x.t = 0; say('🍽️?', 1400); return; }
    if (mood === 'sad' && r < 0.3) { look.y.t = 0.9; tilt.t = rnd(-6, 6); setTimeout(() => (tilt.t = 0), 1600); return; }
    if (r < 0.25) twitch();
    else if (r < 0.45) chewUntil = now + rnd(1500, 2800);
    else if (r < 0.62) { tilt.t = rnd(-9, 9); setTimeout(() => (tilt.t = 0), rnd(900, 1800)); }
    else if (r < 0.75 && mood === 'happy') { hop(6); setTimeout(() => hop(5), 380); }
    else if (r < 0.85 && mood === 'happy') { sfx('hum'); puff('♪', 168, 70, 'note'); }
    else { twitch('l'); setTimeout(() => twitch('r'), 160); }
  }

  // ---------- касания ----------
  let down = null;
  function onDown(e) {
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), path: 0, acc: 0, id: e.pointerId };
    try { svg.setPointerCapture(e.pointerId); } catch { /* нет захвата */ }
  }
  function onMove(e) {
    lastPointer = performance.now();
    const [sx, sy] = fromClient(e.clientX, e.clientY);
    if (!asleep) {
      look.x.t = clamp((sx - 120) / 90, -1, 1);
      look.y.t = clamp((sy - 84) / 110, -0.8, 1);
    }
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
    else { twitch(); look.x.t = clamp((sx - 120) / 90, -1, 1); }
  }

  function spit() {
    setMode('angry', 1200);
    tilt.t = -5;
    setTimeout(() => {
      tilt.t = 0;
      squash.v += 0.06;
      sfx('spit');
      buzz([20, 30, 20]);
      puff('💦', 120, 122, 'spit');
      say('Тьфу!', 1300);
      onSpit?.();
    }, 650);
  }

  // ---------- подключение ----------
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onCancel);
  addEventListener('pointermove', onMove, { passive: true });
  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    removeEventListener('pointermove', onMove);
    clearTimeout(sayTimer);
  }
  refreshFace();
  raf = requestAnimationFrame(frame);

  return {
    el: wrap,
    say,
    /** Настроение по шкалам питомца; asleep — ночь */
    setMood({ food = 70, joy = 70, sleep = false } = {}) {
      mood = food < 30 ? 'hungry' : joy < 30 ? 'sad' : food >= 60 && joy >= 60 ? 'happy' : 'ok';
      asleep = sleep;
      refreshFace();
    },
    get asleep() { return asleep; },
    /** Надеть вещь (эмодзи) или снять (null) */
    setOutfit(emoji) {
      P.hat.innerHTML = ''; P.wear.innerHTML = ''; P.feet.innerHTML = '';
      if (!emoji) return;
      const w = WEAR.find((x) => x.set.includes(emoji)) || WEAR[3];
      const txt = (x, y, size, rot) =>
        `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central" transform="rotate(${rot} ${x} ${y})">${emoji}</text>`;
      if (w.layer === 'feet') P.feet.innerHTML = txt(104, 276, w.size, 0) + txt(136, 276, w.size, 0);
      else P[w.layer].innerHTML = txt(w.x, w.y, w.size, w.rot);
    },
    /** Смотреть на точку экрана (например, на еду, которую тянут) */
    lookAtClient(cx, cy) {
      lastPointer = performance.now();
      const [sx, sy] = fromClient(cx, cy);
      look.x.t = clamp((sx - 120) / 90, -1, 1);
      look.y.t = clamp((sy - 84) / 110, -0.8, 1);
    },
    /** Где рот — в координатах экрана */
    mouthClient() {
      const r = svg.getBoundingClientRect(), s = r.width / 240;
      return { x: r.left + 120 * s, y: r.top + (121 + 10) * s };
    },
    /** Еда рядом — открывает рот */
    want(on) {
      if (asleep && on) { asleep = false; groggyUntil = performance.now() + 4000; onWake?.(); }
      if (on && mode !== 'want') setMode('want');
      else if (!on && mode === 'want') setMode('idle');
    },
    /** Съесть: жуёт, крошки, радость */
    eat() {
      setMode('eat', 1300);
      sfx('munch');
      setTimeout(() => sfx('munch'), 420);
      setTimeout(() => sfx('munch'), 840);
      for (let i = 0; i < 4; i++) setTimeout(() => puff('•', 120 + rnd(-14, 14), 128, 'crumb'), i * 250);
      setTimeout(() => { setMode('joy', 900); hop(6); say('Ням!', 1100); }, 1300);
    },
    /** Порадоваться (подарок, уровень, встреча) */
    cheer(text) {
      if (asleep) { asleep = false; groggyUntil = 0; }
      setMode('joy', 1300);
      hop(8);
      setTimeout(() => hop(6), 420);
      sfx('happy');
      for (let i = 0; i < 3; i++) setTimeout(() => puff('💗', 120 + rnd(-50, 50), 60), i * 180);
      if (text) say(text, 1600);
    },
    /** Отказаться (например, сыта) */
    refuse(text) { twitch('l'); twitch('r'); tilt.t = 8; setTimeout(() => (tilt.t = 0), 500); say(text || '🙅', 1200); },
    destroy,
  };
}

const CSS = `
.ll-wrap { position: relative; width: min(100%, 250px); margin: 0 auto; touch-action: none; -webkit-user-select: none; user-select: none; }
.ll-wrap svg { display: block; width: 100%; height: auto; overflow: visible; cursor: grab; -webkit-tap-highlight-color: transparent; }
.ll-wrap svg text { pointer-events: none; }
.ll-eh, .ll-es { display: none; fill: none; stroke: #111; stroke-width: 4.5; stroke-linecap: round; }
.ll[data-eyes="happy"] .ll-eo, .ll[data-eyes="sleep"] .ll-eo { display: none; }
.ll[data-eyes="happy"] .ll-eh { display: inline; }
.ll[data-eyes="sleep"] .ll-es { display: inline; }
.ll-brows path { fill: none; stroke: #111; stroke-width: 4.5; stroke-linecap: round; }
.ll-mouth { fill: none; stroke: #111; stroke-width: 4.5; stroke-linecap: round; stroke-linejoin: round; }
.ll-mouth.fill { fill: #111; }
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
.ll-say { position: absolute; left: 50%; top: -14px; transform: translate(-50%, -100%) scale(.6); opacity: 0; pointer-events: none;
  background: #fff; color: #111; border-radius: 18px; padding: 7px 14px; font-weight: 900; font-size: 17px; white-space: nowrap;
  box-shadow: 0 0 0 3px #111, 0 4px 0 3px #111; transition: transform .2s cubic-bezier(.2,1.6,.4,1), opacity .15s; }
.ll-say::after { content: ''; position: absolute; left: 50%; bottom: -9px; width: 14px; height: 14px; background: #fff; transform: translateX(-50%) rotate(45deg);
  box-shadow: 3px 3px 0 0 #111; }
.ll-say.on { opacity: 1; transform: translate(-50%, -100%) scale(1); }
`;
