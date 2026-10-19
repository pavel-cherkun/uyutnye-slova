// Игра в мяч с питомцем: мяч падает, тапни по нему — он летит питомцу на голову, тот отбивает.
// С каждым ударом быстрее. Уронила — конец. Каждый удар — радость.

import { h } from './common.js';
import { sfx, buzz } from './device.js';

const BALL = `<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" fill="#c8ff2e" stroke="#111" stroke-width="5"/>
  <path d="M30 17 L41 25 L37 38 L23 38 L19 25 Z" fill="#111"/><path d="M30 17 L30 5 M41 25 L53 21 M37 38 L45 49 M23 38 L15 49 M19 25 L7 21" stroke="#111" stroke-width="4"/></svg>`;

/**
 * host — элемент сцены (position: relative), pet — контроллер питомца (headClient, bump, lookAtClient, say).
 * onHit(score) — каждый удар, onEnd(score) — конец.
 */
export function playBall(host, pet, { onHit, onEnd } = {}) {
  const ball = h('div.bg-ball');
  ball.innerHTML = BALL;
  const score = h('div.bg-score', '0');
  const hint = h('div.bg-hint', 'Тапай по мячу!');
  const close = h('button.bg-x', '✕');
  const layer = h('div.bg-layer', ball, score, hint, close);
  host.append(layer);

  let x = 0, y = 0, vx = 0, vy = 0, g = 0.32, rot = 0;
  let phase = 'wait', hits = 0, raf = 0, over = false;
  const R = 26;
  const box = () => host.getBoundingClientRect();
  const head = () => { const b = box(), hc = pet.headClient(); return { x: hc.x - b.left, y: hc.y - b.top }; };
  const floor = () => box().height - R - 6;

  function drop() {
    const hd = head();
    x = hd.x; y = hd.y - 10;
    vx = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 1.5);
    vy = 0.5;
    phase = 'down';
  }
  setTimeout(() => { hint.classList.add('off'); drop(); }, 1100);
  { const hd = head(); x = hd.x; y = hd.y - 10; }

  function kick(px, py) {
    if (phase !== 'down') return;
    if (Math.hypot(px - x, py - y) > R + 34) return;
    const hd = head();
    const rise = Math.max(30, y - hd.y + 12);
    vy = -Math.sqrt(2 * g * rise);
    const t = -vy / g;
    vx = (hd.x - x) / t;
    phase = 'up';
    sfx('tap');
    buzz(5);
  }
  layer.addEventListener('pointerdown', (e) => {
    if (e.target === close) return;
    const b = box();
    kick(e.clientX - b.left, e.clientY - b.top);
  });
  close.onclick = () => end(true);

  function frame() {
    raf = 0;
    if (!layer.isConnected) return;
    if (phase !== 'wait' && phase !== 'over') {
      vy += g;
      x += vx; y += vy;
      const w = box().width;
      if (x < R) { x = R; vx = Math.abs(vx); }
      if (x > w - R) { x = w - R; vx = -Math.abs(vx); }
      if (phase === 'up' && vy >= 0) {
        // мяч на макушке — питомец отбивает
        hits++;
        score.textContent = hits;
        score.classList.remove('pop'); void score.offsetWidth; score.classList.add('pop');
        pet.bump();
        onHit?.(hits);
        g *= 1.06;
        vy = 1 + Math.min(4, hits * 0.25);
        vx = (Math.random() * 2 - 1) * (2 + Math.min(4, hits * 0.3));
        phase = 'down';
      }
      if (phase === 'down' && y >= floor()) { y = floor(); end(false); }
      rot += vx * 3;
    }
    ball.style.transform = `translate(${(x - R).toFixed(1)}px, ${(y - R).toFixed(1)}px) rotate(${rot.toFixed(0)}deg)`;
    const b = box();
    pet.lookAtClient(b.left + x, b.top + y);
    if (!over) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function end(quit) {
    if (over) return;
    over = true;
    phase = 'over';
    cancelAnimationFrame(raf);
    if (!quit) { sfx('error'); pet.say(hits >= 5 ? `${hits}! Ещё!` : 'Ой…', 1400); }
    layer.classList.add('done');
    hint.textContent = quit ? '' : `Ударов: ${hits}`;
    hint.classList.remove('off');
    setTimeout(() => { layer.remove(); onEnd?.(hits); }, quit ? 0 : 1300);
  }
  return { stop: () => end(true) };
}

const CSS = `
.bg-layer { position: absolute; inset: 0; z-index: 5; touch-action: none; cursor: pointer; }
.bg-ball { position: absolute; left: 0; top: 0; width: 52px; height: 52px; will-change: transform; pointer-events: none; }
.bg-ball svg { width: 100%; height: 100%; display: block; }
.bg-score { position: absolute; right: 10px; top: 4px; font-family: var(--display); font-weight: 900; font-size: 54px; color: var(--lime, #c8ff2e); line-height: 1; pointer-events: none; }
.bg-score.pop { animation: bg-pop .3s cubic-bezier(.2,1.8,.4,1); }
.bg-hint { position: absolute; left: 50%; bottom: 40%; transform: translateX(-50%); background: #fff; color: #111; border-radius: 99px; padding: 8px 16px;
  font-weight: 900; font-size: 16px; white-space: nowrap; box-shadow: 0 0 0 3px #111; transition: opacity .3s; pointer-events: none; }
.bg-hint.off { opacity: 0; }
.bg-x { position: absolute; left: 6px; top: 6px; width: 36px; height: 36px; border-radius: 50%; border: 0; background: #fff; color: #111; font-weight: 900; font-size: 16px; box-shadow: 0 0 0 3px #111; }
@keyframes bg-pop { 40% { transform: scale(1.4); } }
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
