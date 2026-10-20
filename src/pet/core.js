// Ядро питомца: виды, время (голод/радость), рост, путешествия, «живой» вид питомца.
// Используется экраном питомца, вкладкой «Мир» и подсказками в мини-играх.

import { h, confetti, modal, toast } from '../ui/common.js';
import { floatText, revealReward, enqueue } from '../ui/fx.js';
import { state, commit, applyReward } from '../state.js';
import { ITEMS, eatValue } from '../data/items.js';
import { gainXP, chestReward } from '../progression.js';
import { randomLetter } from '../data/letters.js';
import { createPet, SPECIES } from '../ui/llama.js';
import '../ui/species.js';
import { destById } from '../data/travel.js';
import { sfx } from '../ui/device.js';

export const KINDS = [
  { kind: 'llama', emoji: '🦙', name: 'Лама', word: 'ЛАМА' },
  { kind: 'cat', emoji: '🐈', name: 'Кот', word: 'КОТ' },
  { kind: 'dog', emoji: '🐕', name: 'Пёс', word: 'ПЕС' },
  { kind: 'fox', emoji: '🦊', name: 'Лис', word: 'ЛИС' },
  { kind: 'hamster', emoji: '🐹', name: 'Хомяк', word: 'ХОМЯК' },
  { kind: 'rabbit', emoji: '🐇', name: 'Кролик', word: 'КРОЛИК' },
  { kind: 'parrot', emoji: '🦜', name: 'Попугай', word: 'ПОПУГАЙ' },
];
export const kindOf = (p) => KINDS.find((k) => k.kind === p.kind) || KINDS[0];

export const MIN = 60 * 1000;
const TICK = 15 * MIN;        // −1 сытости и радости раз в 15 минут
const PACE = 50;              // метров в минуту в пути
export const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
export const needXP = (lvl) => 50 * lvl;

// ---------- Склонения клички (простые эвристики) ----------
export const isFem = (name) => /[ая]$/i.test(name);
// род питомца: выбирается при заведении (p.fem), для старых сохранений — по окончанию клички
export const g = (p, m, f) => ((p.fem ?? isFem(p.name)) ? f : m);

// ---------- Время ----------
/** Пересчитать падение шкал. write=false — только посчитать (для бейджа). */
export function tick(p, write = true) {
  const now = Date.now();
  const n = Math.floor((now - (p.lastTick || now)) / TICK);
  if (n <= 0) return p;
  const out = write ? p : { ...p };
  out.food = Math.max(0, out.food - n);
  out.joy = Math.max(0, out.joy - n);
  out.lastTick = (p.lastTick || now) + n * TICK;
  // миска: проголодавшись, питомец сам ест из неё
  if (p.bowl?.length) {
    out.bowl = [...p.bowl];
    while (out.food < 60 && out.bowl.length) out.food = clamp(out.food + (eatValue(out.bowl.shift()) || 4) * 4);
  }
  if (write) commit();
  return out;
}

/** Бейдж на вкладке: 1 — питомец вернулся и ждёт, или голоден */
export function petBadge() {
  const p0 = state.pet;
  if (!p0) return 1; // питомца ещё нет — зовём завести
  const p = tick(p0, false);
  if (p.walk && Date.now() >= p.walk.end) return 1;
  if (!p.walk && p.food < 30 && !p.bowl?.length) return 1;
  return 0;
}

// ---------- Рост ----------
export const ageOf = (p) => (p.level >= 6 ? 'adult' : p.level >= 3 ? 'teen' : 'baby');
export const AGE_NAME = { baby: 'малыш', teen: 'подросток', adult: '' };

export function addPetXP(p, n) {
  p.xp += Math.max(1, Math.round(n));
  const ageBefore = ageOf(p);
  let up = false;
  while (p.xp >= needXP(p.level)) { p.xp -= needXP(p.level); p.level++; up = true; }
  if (up) {
    commit();
    confetti();
    floatText(`${p.name}: уровень ${p.level}!`, innerWidth / 2, innerHeight / 2);
    const age = ageOf(p);
    if (age !== ageBefore) setTimeout(() => grewUp(p, age), 900);
  }
  return up;
}

function grewUp(p, age) {
  // большое окно — в общую очередь, чтобы не налезало на сундуки и уровни
  enqueue((done) => {
    sfx('reward');
    confetti(innerWidth / 2, innerHeight / 3, 60);
    const view = petView(p, { still: true });
    view.setAge(age);
    const m = modal([
      h('div.pt-grow', view.el),
      h('div.modal-title', `${p.name} ${g(p, 'подрос', 'подросла')}!`),
      h('div.center', age === 'adult' ? g(p, 'Теперь совсем взрослый', 'Теперь совсем взрослая') : g(p, 'Стал больше и смелее', 'Стала больше и смелее')),
      h('button.btn.btn-big', { onclick: () => m.close() }, 'Ура!'),
    ], { onClose: done });
  });
}

// ---------- Путешествия ----------
export const travelDist = (w, now = Date.now()) => (Math.max(0, Math.min(now, w.end) - w.start) / MIN) * PACE;

export function startTravel(p, destId) {
  const d = destById(destId);
  const now = Date.now();
  p.walk = { id: d.id, start: now, end: now + d.ms };
  commit();
}

/** Вернуть питомца: frac — доля пройденного пути (1 — доехал) */
export function claimTravel(p, frac, onDone) {
  const w = p.walk;
  if (!w) return;
  const d = destById(w.id);
  const meters = travelDist(w);
  p.walk = null;
  p.walks = (p.walks || 0) + 1;
  p.meters = (p.meters || 0) + meters;

  const reward = { items: {} };
  if (frac >= 0.05) {
    let letters = '';
    const nl = Math.max(1, Math.round(d.letters * frac));
    for (let i = 0; i < nl; i++) letters += randomLetter();
    reward.letters = letters;
    const en = Math.round(({ wood: 3, silver: 6, gold: 12 }[d.tier] || 3) * frac);
    if (en) reward.energy = en;
    if (Math.random() < ({ wood: 0.15, silver: 0.35, gold: 0.7 }[d.tier]) * frac + p.level * 0.02) reward.keys = 1;
    const nItems = frac >= 1 ? d.items : Math.floor(d.items * frac);
    const pool = Object.entries(chestReward(d.tier).items).flatMap(([id, n]) => Array(n).fill(id));
    for (const id of pool.slice(0, nItems)) reward.items[id] = (reward.items[id] || 0) + 1;
    if (frac >= 1 && Math.random() < Math.min(0.5, p.level * 0.06)) {
      const rar = Math.random() < 0.25 ? 'e' : 'r';
      const rp = ITEMS.filter((it) => it.rarity === rar);
      const id = rp[Math.floor(Math.random() * rp.length)].id;
      reward.items[id] = (reward.items[id] || 0) + 1;
    }
  }
  if (!Object.keys(reward.items).length) delete reward.items;
  // доехал — открытка и место можно ставить фоном
  if (frac >= 1) { (p.cards ||= {})[d.id] = (p.cards[d.id] || 0) + 1; }

  p.food = clamp(p.food - Math.round(15 * Math.max(frac, 0.2)));
  p.joy = clamp(p.joy + Math.round(10 * Math.max(frac, 0.2)));
  p.clean = clamp((p.clean ?? 100) - Math.round(35 * Math.max(frac, 0.2))); // с дороги — в пятнах
  applyReward(reward);
  addPetXP(p, d.xp * frac);
  commit();
  if (frac < 0.05) toast(`${p.name} ничего не ${g(p, 'успел', 'успела')} найти`);
  else revealReward(`${d.icon} ${p.name} ${g(p, 'принёс', 'принесла')}!`, reward);
  gainXP(Math.max(1, Math.round(d.pxp * frac)));
  onDone?.();
}

// ---------- Вид питомца ----------
/** Лама — живой SVG; остальные — эмодзи с тем же набором методов */
export function petView(p, opts = {}) {
  if (SPECIES[p.kind]) {
    const ll = createPet(p.kind, opts);
    ll.setLook(p.look || {});
    ll.setAge(ageOf(p));
    ll.setTricks(p.tricks || []);
    return ll;
  }
  return emojiPet(kindOf(p).emoji, opts);
}

function emojiPet(emoji, { onPet, onPoke } = {}) {
  const em = h('div.ep-e', emoji);
  const say = h('div.ll-say');
  const el = h('div.ep', em, say);
  let sayT = 0, age = 1, downAt = null, path = 0, acc = 0;
  const boing = (cls = 'boing') => { em.classList.remove('boing', 'hop', 'spin', 'eat'); void em.offsetWidth; em.classList.add(cls); };
  const sayFn = (t, ms = 1400) => { say.textContent = t; say.classList.remove('on'); void say.offsetWidth; say.classList.add('on'); clearTimeout(sayT); sayT = setTimeout(() => say.classList.remove('on'), ms); };
  const heart = (x, y) => floatText('💗', x, y);
  em.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; path = 0; acc = 0; });
  em.addEventListener('pointermove', (e) => {
    if (!downAt) return;
    const d = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = [e.clientX, e.clientY]; path += d; acc += d;
    if (acc > 70) { acc = 0; heart(e.clientX, e.clientY - 20); onPet?.(); }
  });
  em.addEventListener('pointerup', (e) => { if (path < 14) { boing(); sfx('boop'); onPoke?.(e); } downAt = null; });
  const center = () => { const r = em.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.55 }; };
  return {
    el, say: sayFn, asleep: false,
    setMood() {}, setLook() {}, setDirt() {}, setTricks() {}, lookAtClient() {}, want() {}, brushEnd() {},
    setAge(a) { age = { baby: 0.75, teen: 0.88, adult: 1 }[a] || 1; em.style.fontSize = Math.round(140 * age) + 'px'; },
    mouthClient: center,
    headClient: () => { const r = em.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 10 }; },
    brushAt(cx, cy) { const r = em.getBoundingClientRect(); const over = cx > r.left && cx < r.right && cy > r.top && cy < r.bottom; if (over && Math.random() < 0.08) { floatText('✨', cx, cy); return 2; } return over ? 1 : 0; },
    eat() { boing('eat'); sfx('munch'); setTimeout(() => sayFn('Ням!'), 700); },
    cheer(t) { boing('hop'); sfx('happy'); if (t) sayFn(t, 1600); },
    refuse(t) { boing(); sayFn(t || '🙅'); },
    bump() { boing('hop'); sfx('boop'); },
    perform() { boing('spin'); sfx('happy'); },
  };
}

const CSS = `
.ep { position: relative; display: flex; justify-content: center; align-items: flex-end; min-height: 220px; touch-action: none; user-select: none; -webkit-user-select: none; }
.ep-e { font-size: 140px; line-height: 1; filter: drop-shadow(0 8px 0 rgba(0,0,0,.25)); cursor: grab; }
.ep-e.boing { animation: ep-boing .45s cubic-bezier(.2,1.8,.4,1); }
.ep-e.hop { animation: ep-hop .6s cubic-bezier(.2,1.6,.4,1); }
.ep-e.spin { animation: ep-spin .8s ease-in-out; }
.ep-e.eat { animation: ep-eat .9s; }
.ep .ll-say { position: absolute; left: 50%; top: -10px; transform: translate(-50%, -100%) scale(.6); opacity: 0; pointer-events: none; background: #fff; color: #111;
  border-radius: 18px; padding: 7px 14px; font-weight: 900; font-size: 17px; white-space: nowrap; box-shadow: 0 0 0 3px #111; transition: transform .2s, opacity .15s; }
.ep .ll-say.on { opacity: 1; transform: translate(-50%, -100%) scale(1); }
.pt-grow { width: 200px; margin: 0 auto; }
.pt-grow .ll-wrap { width: 200px; }
@keyframes ep-boing { 30% { transform: scale(1.15, .88); } 60% { transform: scale(.94, 1.08); } }
@keyframes ep-hop { 40% { transform: translateY(-40px) scale(.95, 1.05); } 70% { transform: translateY(0) scale(1.1, .9); } }
@keyframes ep-spin { 50% { transform: translateY(-50px) rotate(180deg); } 100% { transform: rotate(360deg); } }
@keyframes ep-eat { 20%, 60% { transform: scale(1.06, .94); } 40%, 80% { transform: scale(.96, 1.04); } }
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
