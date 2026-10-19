// Питомец: выбрать, покормить, погладить, нарядить, отправить на прогулку (idle-петля с добычей).
// Стиль — кислотно-жёлтый + чёрный + белый, крупные карточки и кнопки-капсулы.

import { h, toast, modal, confetti } from '../ui/common.js';
import { floatText, revealReward } from '../ui/fx.js';
import { state, commit, removeItem, applyReward } from '../state.js';
import { ITEMS, getItem, CATEGORIES, eatValue } from '../data/items.js';
import { gainXP, chestReward } from '../progression.js';
import { randomLetter } from '../data/letters.js';
import { createLlama } from '../ui/llama.js';

const KINDS = [
  { kind: 'llama', emoji: '🦙', name: 'Лама' },
  { kind: 'cat', emoji: '🐈', name: 'Кот' },
  { kind: 'dog', emoji: '🐕', name: 'Пёс' },
  { kind: 'hamster', emoji: '🐹', name: 'Хомяк' },
  { kind: 'rabbit', emoji: '🐇', name: 'Кролик' },
  { kind: 'parrot', emoji: '🦜', name: 'Попугай' },
  { kind: 'fox', emoji: '🦊', name: 'Лис' },
];

const MIN = 60 * 1000;
const TICK = 15 * MIN;        // −1 сытости и радости раз в 15 минут
const PACE = 50;              // метров в минуту на прогулке
const WALKS = [
  { id: 's', label: '30 мин', ms: 30 * MIN, lvl: 1, tier: 'wood', letters: 4, items: 1, xp: 10, pxp: 6 },
  { id: 'm', label: '2 ч', ms: 120 * MIN, lvl: 2, tier: 'silver', letters: 7, items: 2, xp: 25, pxp: 14 },
  { id: 'l', label: '8 ч', ms: 480 * MIN, lvl: 4, tier: 'gold', letters: 12, items: 3, xp: 60, pxp: 30 },
];

let timer = null;         // интервал таймера прогулки (только пока экран открыт)
let pickedKind = 'llama';   // выбор на экране заведения питомца
let lastPet = 0;          // анти-спам поглаживания
let wokeAt = 0;           // когда разбудили ночью (ещё 10 минут не спит)

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
const needXP = (lvl) => 50 * lvl;

// ---------- Склонения клички (простые эвристики) ----------
const isFem = (name) => /[ая]$/i.test(name);
function accus(name) { // «Ищем Бублика / Мурку / Соню»
  if (/[а]$/i.test(name)) return name.slice(0, -1) + 'у';
  if (/[я]$/i.test(name)) return name.slice(0, -1) + 'ю';
  if (/[йь]$/i.test(name)) return name.slice(0, -1) + 'я';
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(name)) return name + 'а';
  return name;
}
const returned = (p) => `${p.name} ${isFem(p.name) ? 'вернулась' : 'вернулся'}`;
const brought = (p) => `${p.name} ${isFem(p.name) ? 'принесла' : 'принёс'}!`;

// ---------- Время ----------
/** Пересчитать падение шкал. write=false — только посчитать (для бейджа). */
function tick(p, write = true) {
  const now = Date.now();
  const n = Math.floor((now - (p.lastTick || now)) / TICK);
  if (n <= 0) return p;
  const out = write ? p : { ...p };
  out.food = Math.max(0, out.food - n);
  out.joy = Math.max(0, out.joy - n);
  out.lastTick = (p.lastTick || now) + n * TICK;
  if (write) commit();
  return out;
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const two = (x) => String(x).padStart(2, '0');
  return hh ? `${hh}:${two(mm)}:${two(ss)}` : `${mm}:${two(ss)}`;
}
function fmtDist(m) {
  return m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} км`;
}
const walkDist = (w, now = Date.now()) => (Math.max(0, Math.min(now, w.end) - w.start) / MIN) * PACE;

/** Бейдж на вкладке: 1 — питомец вернулся и ждёт, или голоден */
export function petBadge() {
  const p0 = state.pet;
  if (!p0) return 0;
  const p = tick(p0, false);
  if (p.walk && Date.now() >= p.walk.end) return 1;
  if (!p.walk && p.food < 30) return 1;
  return 0;
}

// ---------- Экран ----------
export function renderPet(root, nav) {
  clearInterval(timer); timer = null;
  const rerender = () => renderPet(root, nav);
  let body;
  if (!state.pet) body = adoptView(rerender);
  else {
    tick(state.pet);
    const p = state.pet;
    body = p.walk ? walkView(p, rerender) : homeView(p, rerender, nav);
  }
  root.replaceChildren(h('div.screen.pt-screen', h('style', CSS), body));
}

// ---------- Завести питомца ----------
function adoptView(rerender) {
  const input = h('input.pt-input', { maxlength: 12, placeholder: 'Кличка', autocomplete: 'off' });
  const kinds = h('div.pt-kinds', KINDS.map((k) => h('button.pt-kind' + (k.kind === pickedKind ? '.on' : ''), {
    onclick: (e) => {
      pickedKind = k.kind;
      for (const b of kinds.children) b.classList.toggle('on', b === e.currentTarget);
    },
  }, h('span.pt-kind-e', k.emoji), h('span.pt-kind-n', k.name))));
  const adopt = () => {
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) { toast('Придумай кличку'); input.focus(); return; }
    const k = KINDS.find((x) => x.kind === pickedKind) || KINDS[1];
    const now = Date.now();
    state.pet = { kind: k.kind, emoji: k.emoji, name: name[0].toUpperCase() + name.slice(1), level: 1, xp: 0, food: 70, joy: 70,
      walk: null, outfit: null, born: now, lastTick: now, walks: 0, meters: 0 };
    commit();
    confetti();
    rerender();
  };
  return h('div.pt-stack',
    h('div.pt-hero.pt-adopt',
      h('div.pt-hero-title', 'Заведи', h('br'), 'питомца'),
      h('div.pt-hero-sub', 'Корми, гладь и отправляй гулять — он принесёт буквы и находки'),
    ),
    kinds,
    input,
    swipeBtn('🐾', 'Завести', '→', adopt),
  );
}

// ---------- Дом питомца ----------
function homeView(p, rerender, nav) {
  const kind = KINDS.find((k) => k.kind === p.kind) || KINDS[0];
  const outfit = p.outfit && state.items[p.outfit] ? getItem(p.outfit) : null;
  const refs = { food: h('b', p.food + '%'), joy: h('b', p.joy + '%') };
  const isLlama = p.kind === 'llama';
  const card = isLlama ? llamaCard(p, kind, outfit, refs, rerender) : emojiCard(p, kind, outfit, refs, rerender);

  const xpPct = Math.round((p.xp / needXP(p.level)) * 100);
  const stats = h('div.pt-stats',
    tile('white', '🍖', 'Сытость', refs.food, bar(p.food)),
    tile('gray', '❤️', 'Радость', refs.joy, bar(p.joy)),
    tile('gray', '⭐', 'Уровень', h('b', String(p.level)), bar(xpPct)),
    tile('white', '🦮', 'Прогулок', h('b', String(p.walks || 0))),
    tile('white wide', '📍', 'Пройдено', h('b', ((p.meters || 0) / 1000).toFixed(1).replace('.', ',') + ' км')),
  );

  // одна подсказка о новом звере для тех, кто завёл питомца раньше
  let offer = null;
  if (!isLlama && !state.progress.llamaOffer) {
    offer = h('button.pt-notice.pt-offer', { onclick: () => { state.progress.llamaOffer = true; commit(); kindModal(p, rerender); } },
      h('span.pt-ava', '🦙'), h('div', h('b', 'Появилась лама!'), h('small', 'Сменить питомца — имя и уровень останутся')));
  }

  const hungry = p.food < 30;
  return h('div.pt-stack',
    offer,
    hungry && !isLlama ? notice(p, `${p.name} ${isFem(p.name) ? 'голодна' : 'голоден'}`, 'Покорми из сумки') : null,
    card,
    h('div.pt-acts',
      roundBtn('🍖', 'Покормить', () => feedModal(p, rerender, nav)),
      roundBtn('🎀', 'Нарядить', () => outfitModal(p, rerender, nav)),
      roundBtn('🎁', 'Подарить', () => giftModal(p, rerender)),
    ),
    h('div.pt-sec', 'Прогулка'),
    h('div.pt-walks', WALKS.map((w) => {
      const locked = p.level < w.lvl;
      return swipeBtn(locked ? '🔒' : '🦮', w.label, locked ? `ур. ${w.lvl}` : '→', () => {
        if (locked) { toast(`Откроется на ${w.lvl} уровне питомца`); return; }
        if (p.food < 20) { toast('Покорми перед прогулкой'); return; }
        const now = Date.now();
        p.walk = { id: w.id, start: now, end: now + w.ms };
        commit();
        rerender();
      }, locked);
    })),
    stats,
  );
}

function statusChip(p) {
  return h('span.pt-chip', p.food < 30 ? '🍖 голоден' : p.joy < 30 ? '😿 скучает' : '🏠 дома');
}

/** Чип вида — по тапу можно сменить зверя (имя, уровень и шкалы остаются) */
function kindChip(p, kind, rerender) {
  return h('button.pt-chip.dark', { onclick: (e) => { e.stopPropagation(); kindModal(p, rerender); } }, kind.emoji + ' ' + kind.name + ' ↻');
}

function kindModal(p, rerender) {
  let m;
  m = modal([
    h('div.modal-title', 'Кто это?'),
    h('div.pt-m-sub', 'Имя и уровень останутся'),
    h('div.pt-kinds', KINDS.map((k) => h('button.pt-kind' + (k.kind === p.kind ? '.on' : ''), {
      onclick: () => { p.kind = k.kind; p.emoji = k.emoji; commit(); m.close(); },
    }, h('span.pt-kind-e', k.emoji), h('span.pt-kind-n', k.name)))),
    h('button.btn.btn-ghost', { onclick: () => m.close() }, 'Готово'),
  ], { onClose: rerender });
}

// Обычный питомец — эмодзи, тап — погладить
function emojiCard(p, kind, outfit, refs, rerender) {
  const emo = h('div.pt-emoji', p.emoji);
  return h('div.pt-card', { role: 'button',
    onclick: (e) => {
      const now = Date.now();
      emo.classList.remove('boing'); void emo.offsetWidth; emo.classList.add('boing');
      if (now - lastPet < 2000) return;
      lastPet = now;
      p.joy = clamp(p.joy + 3);
      commit();
      floatText('❤️ +3', e.clientX, e.clientY - 20);
      refs.joy.textContent = p.joy + '%';
    },
  },
    h('div.pt-name', p.name),
    h('div.pt-pet', outfit ? h('div.pt-outfit', outfit.emoji) : null, emo),
    h('div.pt-chips', kindChip(p, kind, rerender), h('span.pt-chip', `ур. ${p.level}`), statusChip(p)),
    h('div.pt-hint', 'тапни — погладить'),
  );
}

// ---------- Живая лама ----------
const isNight = () => { const hr = new Date().getHours(); return hr >= 23 || hr < 7; };

function llamaCard(p, kind, outfit, refs, rerender) {
  const tut = (p.tut ||= {});
  let petGain = 0;
  const addJoy = (n) => {
    p.joy = clamp(p.joy + n);
    refs.joy.textContent = p.joy + '%';
    ll.setMood(mood());
    commit();
  };
  const mood = () => ({ food: p.food, joy: p.joy, sleep: isNight() && Date.now() - wokeAt > 10 * MIN });
  const ll = createLlama({
    onPet: () => {
      if (!tut.pet) { tut.pet = true; hint.remove(); commit(); }
      const now = Date.now();
      if (now - lastPet < 1200) return;
      lastPet = now;
      petGain++;
      if (petGain <= 15) addJoy(2); // за один заход — до +30 радости поглаживаниями
    },
    onPoke: () => {
      const now = Date.now();
      if (now - lastPet < 2000) return;
      lastPet = now;
      addJoy(1);
    },
    onWake: () => { wokeAt = Date.now(); },
    onSpit: () => { p.spits = (p.spits || 0) + 1; commit(); },
  });
  ll.setMood(mood());
  ll.setOutfit(outfit ? outfit.emoji : null);

  // встреча после долгой разлуки
  const now = Date.now();
  if (p.lastSeen && now - p.lastSeen > 3 * 60 * MIN && !ll.asleep) setTimeout(() => ll.cheer(p.food < 30 ? 'Я скучала… и голодная' : 'Ура, ты тут!'), 500);
  p.lastSeen = now;

  const hint = (!tut.pet || !tut.fed)
    ? h('div.pt-hint', !tut.pet ? 'погладь пальцем · тяни еду к ламе' : 'тяни еду к ламе')
    : null;
  const night = ll.asleep;
  const tray = foodTray(p, ll, refs, () => { if (!tut.fed) { tut.fed = true; hint?.remove(); commit(); } });

  return h('div.pt-card.ll-card' + (night ? '.night' : ''),
    night ? h('div.pt-moon', '🌙') : null,
    h('div.pt-name', p.name),
    h('div.pt-chips', kindChip(p, kind, rerender), h('span.pt-chip', `ур. ${p.level}`)),
    h('div.pt-stage', ll.el),
    tray,
    hint,
  );
}

/** Полка с едой под ламой: тянуть еду ко рту или просто тапнуть */
function foodTray(p, ll, refs, onFed) {
  const tray = h('div.pt-tray');
  const fill = () => {
    const foods = Object.keys(state.items).filter((id) => eatValue(id) != null)
      .sort((a, b) => eatValue(b) - eatValue(a)).slice(0, 12);
    tray.replaceChildren(...(foods.length
      ? foods.map((id) => {
        const b = h('button.pt-food', h('span', getItem(id).emoji), h('small', '×' + state.items[id]));
        b.addEventListener('pointerdown', (e) => drag(e, id, b));
        return b;
      })
      : [h('div.pt-tray-empty', '🍽️ еды нет — ищи в играх')]));
  };
  const feed = (id) => {
    if (p.food >= 100) { ll.refuse(isFem(p.name) ? 'Я сыта!' : 'Я сыт!'); return false; }
    if (!removeItem(id)) return false;
    const v = eatValue(id);
    p.food = clamp(p.food + v * 4);
    refs.food.textContent = p.food + '%';
    ll.eat();
    setTimeout(() => ll.setMood({ food: p.food, joy: p.joy, sleep: false }), 1400);
    addPetXP(p, v);
    commit();
    onFed();
    fill();
    return true;
  };
  function drag(e, id, btn) {
    const ghost = h('div.pt-ghost', getItem(id).emoji);
    const r0 = btn.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false, near = false;
    const place = (x, y) => { ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; };
    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
      if (!moved) { moved = true; document.body.append(ghost); }
      place(ev.clientX, ev.clientY - 30);
      ll.lookAtClient(ev.clientX, ev.clientY - 30);
      const m = ll.mouthClient();
      const n = Math.hypot(ev.clientX - m.x, ev.clientY - 30 - m.y) < 90;
      if (n !== near) { near = n; ll.want(n); }
    };
    const end = (ev) => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', cancel);
      if (!moved) { // тап: еда сама летит ко рту
        const m = ll.mouthClient();
        place(r0.left + r0.width / 2, r0.top + r0.height / 2);
        document.body.append(ghost);
        ll.want(true);
        requestAnimationFrame(() => { ghost.classList.add('fly'); place(m.x, m.y); });
        setTimeout(() => { ghost.remove(); ll.want(false); feed(id); }, 380);
        return;
      }
      ll.want(false);
      if (near) { ghost.remove(); feed(id); }
      else { ghost.classList.add('drop'); setTimeout(() => ghost.remove(), 250); }
    };
    const cancel = () => { // браузер забрал жест (прокрутка полки)
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', cancel);
      ghost.remove();
      ll.want(false);
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', cancel);
  }
  fill();
  return tray;
}

function tile(cls, icon, label, value, extra) {
  return h('div.pt-tile.' + cls.split(' ').join('.'),
    h('div.pt-tile-top', h('span.pt-tile-l', label), h('span.pt-ico', icon)),
    value, extra || null);
}
function bar(pct) { return h('div.pt-bar', h('i', { style: { width: clamp(pct) + '%' } })); }

function notice(p, title, sub) {
  return h('div.pt-notice', h('span.pt-ava', p.emoji), h('div', h('b', title), sub ? h('small', sub) : null));
}

function roundBtn(icon, label, onclick) {
  return h('button.pt-round', { onclick }, h('span.pt-dot', icon), h('span', label));
}

/** Тёмная капсула с белым кружком-иконкой, как свайп-кнопка */
function swipeBtn(icon, label, tail, onclick, dim = false) {
  return h('button.pt-swipe' + (dim ? '.dim' : ''), { onclick },
    h('span.pt-dot', icon), h('span.pt-swipe-l', label), h('span.pt-swipe-t', tail));
}

// ---------- Покормить ----------
function feedModal(p, rerender) {
  let m;
  const list = h('div.pt-list');
  const fill = () => {
    const foods = Object.keys(state.items).filter((id) => eatValue(id) != null);
    list.replaceChildren(...(foods.length ? foods.map((id) => {
      const it = getItem(id), v = eatValue(id);
      return h('button.pt-li', {
        onclick: (e) => {
          if (p.food >= 100) { toast(`${p.name} уже ${isFem(p.name) ? 'сыта' : 'сыт'}`); return; }
          if (!removeItem(id)) return;
          p.food = clamp(p.food + v * 4);
          addPetXP(p, v);
          commit();
          floatText('Ням!', e.clientX, e.clientY - 20);
          fill();
          head.textContent = `Сытость ${p.food}%`;
        },
      }, h('span.pt-li-e', it.emoji), h('span.pt-li-w', it.word.toLowerCase()), h('span.pt-li-n', `×${state.items[id]}`), h('span.pt-li-v', `+${v * 4}%`));
    }) : [h('div.pt-empty', 'В сумке нет еды. Её можно найти в играх и на прогулке')]));
  };
  const head = h('div.pt-m-sub', `Сытость ${p.food}%`);
  fill();
  m = modal([h('div.modal-title', 'Покормить'), head, list,
    h('button.btn.btn-ghost', { onclick: () => m.close() }, 'Готово')], { onClose: rerender });
}

// ---------- Подарить ----------
// Любая вещь (кроме еды) может стать подарком: так у мебели, декора, техники и прочего есть смысл.
// У каждого зверя любимые категории — подарок из них радует вдвое сильнее.
export const FAVS = {
  cat: ['decor', 'dishes', 'furniture'], dog: ['sport', 'tools', 'furniture'], hamster: ['plants', 'stationery', 'decor'],
  rabbit: ['plants', 'bath', 'light'], llama: ['plants', 'clothes', 'music'], parrot: ['music', 'tech', 'walldecor'], fox: ['fantasy', 'nature', 'transport'],
};
const GIFT_JOY = { c: 4, r: 8, e: 16, l: 30 };
function giftModal(p, rerender) {
  let m;
  const favs = FAVS[p.kind] || [];
  const list = h('div.pt-list');
  const head = h('div.pt-m-sub', `Радость ${p.joy}% · любит: ${favs.map((c) => CATEGORIES[c].icon + ' ' + CATEGORIES[c].name.toLowerCase()).join(', ')}`);
  const fill = () => {
    const ids = Object.keys(state.items).filter((id) => { const it = getItem(id); return it.tier === 1 && eatValue(id) == null; })
      .sort((a, b) => (favs.includes(getItem(b).cat) - favs.includes(getItem(a).cat)) || getItem(a).word.localeCompare(getItem(b).word));
    list.replaceChildren(...(ids.length ? ids.map((id) => {
      const it = getItem(id);
      const fav = favs.includes(it.cat);
      const v = GIFT_JOY[it.rarity] * (fav ? 2 : 1);
      return h('button.pt-li', {
        onclick: (e) => {
          if (!removeItem(id)) return;
          p.joy = clamp(p.joy + v);
          addPetXP(p, v);
          commit();
          floatText(fav ? '😍 +' + v : '❤️ +' + v, e.clientX, e.clientY - 20);
          head.firstChild.textContent = `Радость ${p.joy}% · любит: ${favs.map((c) => CATEGORIES[c].icon + ' ' + CATEGORIES[c].name.toLowerCase()).join(', ')}`;
          fill();
        },
      }, h('span.pt-li-e', it.emoji), h('span.pt-li-w', (fav ? '⭐ ' : '') + it.word.toLowerCase()), h('span.pt-li-n', `×${state.items[id]}`), h('span.pt-li-v', `+${v}`));
    }) : [h('div.pt-empty', 'Пока нечего подарить — вещи дают игры и прогулки')]));
  };
  fill();
  m = modal([h('div.modal-title', 'Подарить'), head, list,
    h('button.btn.btn-ghost', { onclick: () => m.close() }, 'Готово')], { onClose: rerender });
}

// ---------- Нарядить ----------
function outfitModal(p, rerender) {
  let m;
  const wear = Object.keys(state.items).filter((id) => {
    const it = getItem(id);
    return it.tier === 1 && (it.cat === 'clothes' || it.cat === 'accessory');
  });
  const set = (id) => { p.outfit = id; commit(); m.close(); if (id) toast('Красота!'); };
  m = modal([
    h('div.modal-title', 'Нарядить'),
    h('div.pt-m-sub', 'Вещь не тратится — просто надета'),
    wear.length
      ? h('div.pt-grid', wear.map((id) => {
        const it = getItem(id);
        return h('button.pt-wear' + (p.outfit === id ? '.on' : ''), { onclick: () => set(id) },
          h('span', it.emoji), h('small', it.word.toLowerCase()));
      }))
      : h('div.pt-empty', `Нет одежды и аксессуаров. Ищи их в играх (${CATEGORIES.clothes.icon} ${CATEGORIES.accessory.icon})`),
    h('div.row',
      p.outfit ? h('button.btn.btn-ghost', { onclick: () => set(null) }, 'Снять') : null,
      h('button.btn', { onclick: () => m.close() }, 'Готово')),
  ], { onClose: rerender });
}

// ---------- Опыт питомца ----------
function addPetXP(p, n) {
  p.xp += Math.max(1, Math.round(n));
  let up = false;
  while (p.xp >= needXP(p.level)) { p.xp -= needXP(p.level); p.level++; up = true; }
  if (up) {
    commit();
    confetti();
    floatText(`${p.name}: уровень ${p.level}!`, innerWidth / 2, innerHeight / 2);
    const opened = WALKS.find((w) => w.lvl === p.level);
    if (opened) setTimeout(() => toast(`Открыта прогулка ${opened.label}!`, 2400), 600);
  }
  return up;
}

// ---------- Прогулка ----------
function walkView(p, rerender) {
  const w = p.walk;
  const def = WALKS.find((x) => x.id === w.id) || WALKS[0];
  const done = Date.now() >= w.end;

  if (done) {
    return h('div.pt-stack',
      notice(p, `${returned(p)} с прогулки!`, `Прошли ${fmtDist(walkDist(w))}`),
      h('div.pt-walk.done',
        h('div.pt-walk-t', `${returned(p)}!`),
        h('div.pt-walk-pet', p.emoji, h('span.pt-bag', '🎒')),
        h('div.pt-walk-d', fmtDist(walkDist(w))),
        h('div.pt-walk-s', 'с добычей'),
      ),
      swipeBtn('🎁', 'Забрать добычу', '→', () => claim(p, 1, rerender)),
    );
  }

  const distEl = h('div.pt-walk-d', fmtDist(walkDist(w)));
  const timeEl = h('b', fmtTime(w.end - Date.now()));
  const barEl = h('i');
  const setBar = () => { barEl.style.width = Math.min(100, ((Date.now() - w.start) / (w.end - w.start)) * 100) + '%'; };
  setBar();
  const wrap = h('div.pt-stack',
    h('div.pt-walk',
      h('div.pt-walk-t', `Ищем ${accus(p.name)}`),
      h('div.pt-arrow-wrap', h('div.pt-arrow')),
      distEl,
      h('div.pt-walk-s', 'от дома'),
      h('div.pt-walk-time', 'вернётся через ', timeEl),
      h('div.pt-bar.dark', barEl),
      h('div.pt-walk-chip', `${p.emoji} прогулка ${def.label}`),
    ),
    swipeBtn('🏠', 'Вернуть сейчас', '→', () => {
      const frac = Math.min(1, (Date.now() - w.start) / (w.end - w.start));
      claim(p, frac, rerender);
    }),
  );
  // стрелка — SVG через innerHTML (createElement не делает SVG-элементы)
  wrap.querySelector('.pt-arrow').innerHTML =
    '<svg viewBox="0 0 100 100"><path d="M50 8 L84 80 L50 64 L16 80 Z" fill="#111" stroke="#111" stroke-width="6" stroke-linejoin="round"/></svg>';

  timer = setInterval(() => {
    if (!wrap.isConnected || state.pet !== p || p.walk !== w) { clearInterval(timer); timer = null; return; }
    if (Date.now() >= w.end) { rerender(); return; }
    distEl.textContent = fmtDist(walkDist(w));
    timeEl.textContent = fmtTime(w.end - Date.now());
    setBar();
  }, 1000);
  return wrap;
}

function claim(p, frac, rerender) {
  const w = p.walk;
  if (!w) return;
  const def = WALKS.find((x) => x.id === w.id) || WALKS[0];
  const meters = walkDist(w);
  p.walk = null;
  p.walks = (p.walks || 0) + 1;
  p.meters = (p.meters || 0) + meters;

  const reward = { items: {} };
  if (frac >= 0.05) {
    let letters = '';
    const nl = Math.max(1, Math.round(def.letters * frac));
    for (let i = 0; i < nl; i++) letters += randomLetter();
    reward.letters = letters;
    const en = Math.round(({ s: 3, m: 6, l: 12 }[def.id] || 3) * frac); // энергии скромно: прогулка — за буквы и находки
    if (en) reward.energy = en;
    if (Math.random() < ({ s: 0.15, m: 0.35, l: 0.7 }[def.id]) * frac + p.level * 0.02) reward.keys = 1;
    // предметы — из сундука по длине прогулки; досрочно — меньше
    const nItems = frac >= 1 ? def.items : Math.floor(def.items * frac);
    const pool = Object.entries(chestReward(def.tier).items).flatMap(([id, n]) => Array(n).fill(id));
    for (const id of pool.slice(0, nItems)) reward.items[id] = (reward.items[id] || 0) + 1;
    // с уровнем питомца — шанс на редкую находку сверху
    if (frac >= 1 && Math.random() < Math.min(0.5, p.level * 0.06)) {
      const rar = Math.random() < 0.25 ? 'e' : 'r';
      const rp = ITEMS.filter((it) => it.rarity === rar);
      const id = rp[Math.floor(Math.random() * rp.length)].id;
      reward.items[id] = (reward.items[id] || 0) + 1;
    }
  }
  if (!Object.keys(reward.items).length) delete reward.items;

  p.food = clamp(p.food - Math.round(15 * Math.max(frac, 0.2)));
  p.joy = clamp(p.joy + Math.round(10 * Math.max(frac, 0.2)));
  applyReward(reward); // внутри commit()
  addPetXP(p, def.xp * frac);
  commit();
  if (frac < 0.05) toast(`${p.name} ничего не ${isFem(p.name) ? 'успела' : 'успел'} найти`);
  else revealReward(brought(p), reward);
  gainXP(Math.max(1, Math.round(def.pxp * frac)));
  rerender();
}

// ---------- Стили ----------
const CSS = `
.ll-card { cursor: default; min-height: 0; padding-bottom: 12px; }
.ll-card:active { transform: none; }
.ll-card.night { background: #1d1b3a; color: #fff; box-shadow: 0 6px 0 #000;
  background-image: radial-gradient(2px 2px at 18% 30%, #fff8, transparent), radial-gradient(2px 2px at 78% 22%, #fff9, transparent),
  radial-gradient(1.5px 1.5px at 62% 48%, #fff7, transparent), radial-gradient(2px 2px at 30% 62%, #fff6, transparent), radial-gradient(1.5px 1.5px at 88% 58%, #fff8, transparent); }
.pt-moon { position: absolute; right: 18px; top: 16px; font-size: 40px; }
.ll-card .pt-chips { margin-top: 10px; }
.pt-stage { display: flex; justify-content: center; padding: 30px 0 0; }
.pt-tray { display: flex; gap: 8px; overflow-x: auto; padding: 10px 2px 4px; margin: 6px -6px 0; scrollbar-width: none; touch-action: pan-x; }
.pt-tray::-webkit-scrollbar { display: none; }
.pt-food { flex: none; position: relative; width: 58px; height: 58px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 0 0 3px var(--ink);
  display: grid; place-items: center; cursor: grab; touch-action: pan-x; -webkit-user-select: none; user-select: none; }
.pt-food span { font-size: 30px; line-height: 1; pointer-events: none; }
.pt-food small { position: absolute; right: -4px; bottom: -4px; background: var(--ink); color: #fff; border-radius: 99px; padding: 1px 6px; font-size: 11px; font-weight: 900; }
.pt-tray-empty { font-weight: 800; font-size: 14px; opacity: .6; padding: 8px 6px; }
.pt-ghost { position: fixed; z-index: 999; font-size: 48px; line-height: 1; transform: translate(-50%, -50%); pointer-events: none; filter: drop-shadow(0 6px 0 rgba(0,0,0,.18)); }
.pt-ghost.fly { transition: left .35s cubic-bezier(.4,0,.6,1), top .35s cubic-bezier(.3,-0.6,.7,1), transform .35s; transform: translate(-50%, -50%) scale(.5); }
.pt-ghost.drop { transition: opacity .25s, transform .25s; opacity: 0; transform: translate(-50%, -20%) scale(.6); }
.pt-chip { border: 0; font-family: inherit; }
.pt-offer { border: 0; width: 100%; text-align: left; cursor: pointer; }
.pt-screen { --pt-y: #eef24a; --pt-g: rgba(17,17,17,.07); padding-top: 8px; }
.pt-stack { display: flex; flex-direction: column; gap: 14px; }
.pt-card { position: relative; display: flex; flex-direction: column; width: 100%; box-sizing: border-box; min-height: 380px; border-radius: 32px;
  background: var(--pt-y, #eef24a); padding: 22px 18px 14px; color: var(--ink); cursor: pointer; overflow: hidden; box-shadow: 0 6px 0 var(--ink);
  -webkit-tap-highlight-color: transparent; user-select: none; }
.pt-card:active { transform: translateY(2px); }
.pt-name { font-family: var(--display); font-weight: 900; font-size: 44px; line-height: .95; letter-spacing: -2px; word-break: break-word; }
.pt-pet { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 0 12px; pointer-events: none; }
.pt-emoji { font-size: 150px; line-height: 1; filter: drop-shadow(0 8px 0 rgba(0,0,0,.12)); }
.pt-emoji.boing { animation: pt-boing .45s cubic-bezier(.2,1.8,.4,1); }
.pt-outfit { font-size: 60px; line-height: 1; margin-bottom: -26px; position: relative; z-index: 1; transform: rotate(-10deg); }
.pt-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.pt-chip { background: #fff; color: var(--ink); border-radius: 999px; padding: 8px 14px; font-weight: 900; font-size: 15px; }
.pt-chip.dark { background: var(--ink); color: #fff; }
.pt-hint { margin-top: 10px; font-size: 12px; font-weight: 800; opacity: .45; }
@keyframes pt-boing { 30% { transform: scale(1.15, .88); } 60% { transform: scale(.94, 1.08); } }

.pt-notice { display: flex; align-items: center; gap: 12px; background: var(--ink); color: #fff; border-radius: 999px; padding: 8px 18px 8px 8px;
  animation: pt-drop .4s cubic-bezier(.2,1.6,.4,1); }
.pt-notice b { display: block; font-weight: 900; font-size: 16px; line-height: 1.15; }
.pt-notice small { display: block; font-size: 12px; font-weight: 700; opacity: .65; }
.pt-ava { flex: none; width: 46px; height: 46px; border-radius: 50%; background: var(--pt-y, #eef24a); display: grid; place-items: center; font-size: 26px; }
@keyframes pt-drop { from { transform: translateY(-20px); opacity: 0; } }

.pt-acts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.pt-acts .pt-round { flex-direction: column; gap: 6px; border-radius: 26px; padding: 10px 6px 12px; font-size: 13px; }
.pt-round { display: flex; align-items: center; gap: 10px; border: 0; border-radius: 999px; background: var(--ink); color: #fff; padding: 7px 16px 7px 7px;
  font-weight: 900; font-size: 16px; cursor: pointer; }
.pt-round:active, .pt-swipe:active { transform: scale(.97); }
.pt-dot { flex: none; width: 46px; height: 46px; border-radius: 50%; background: #fff; display: grid; place-items: center; font-size: 22px; color: var(--ink); }
.pt-sec { font-family: var(--display); font-weight: 900; font-size: 22px; letter-spacing: -.5px; margin: 4px 0 -4px; text-transform: uppercase; }
.pt-walks { display: flex; flex-direction: column; gap: 10px; }
.pt-swipe { display: flex; align-items: center; gap: 14px; width: 100%; border: 0; border-radius: 999px; background: var(--ink); color: #fff;
  padding: 8px 22px 8px 8px; cursor: pointer; text-align: left; }
.pt-swipe .pt-dot { width: 54px; height: 54px; font-size: 26px; background: var(--pt-y, #eef24a); }
.pt-swipe-l { flex: 1; min-width: 0; font-family: var(--display); font-weight: 800; font-size: 18px; letter-spacing: -.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-swipe-t { font-weight: 900; font-size: 22px; color: var(--pt-y, #eef24a); }
.pt-swipe.dim { background: #3a3a40; }
.pt-swipe.dim .pt-dot { background: #fff; }
.pt-swipe.dim .pt-swipe-t { font-size: 14px; color: #bbb; }

.pt-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pt-tile { border-radius: 26px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; min-height: 108px; }
.pt-tile.white { background: #fff; }
.pt-tile.gray { background: var(--pt-g); }
.pt-tile.wide { grid-column: span 2; min-height: 0; }
.pt-tile-top { display: flex; align-items: center; justify-content: space-between; }
.pt-tile-l { font-weight: 800; font-size: 14px; color: var(--ink-soft); }
.pt-ico { width: 34px; height: 34px; border-radius: 50%; background: var(--pt-y, #eef24a); display: grid; place-items: center; font-size: 17px; }
.pt-tile b { font-family: var(--display); font-weight: 900; font-size: 34px; letter-spacing: -1.5px; line-height: 1.05; }
.pt-bar { height: 8px; border-radius: 99px; background: rgba(17,17,17,.12); overflow: hidden; margin-top: auto; }
.pt-bar i { display: block; height: 100%; background: var(--ink); border-radius: 99px; }
.pt-bar.dark { background: rgba(255,255,255,.18); width: 80%; }
.pt-bar.dark i { background: var(--pt-y, #eef24a); }

.pt-walk { background: var(--ink); color: #fff; border-radius: 32px; padding: 24px 20px 22px; display: flex; flex-direction: column; align-items: center; gap: 6px;
  box-shadow: 0 6px 0 #000; text-align: center; }
.pt-walk-t { font-family: var(--display); font-weight: 900; font-size: 30px; letter-spacing: -1px; line-height: 1; color: var(--pt-y, #eef24a); }
.pt-arrow-wrap { width: 190px; height: 190px; border-radius: 50%; background: var(--pt-y, #eef24a); display: grid; place-items: center; margin: 18px 0 10px; }
.pt-arrow { width: 120px; height: 120px; animation: pt-seek 7s ease-in-out infinite alternate; }
.pt-arrow svg { width: 100%; height: 100%; display: block; }
@keyframes pt-seek { from { transform: rotate(-35deg); } to { transform: rotate(40deg); } }
.pt-walk-d { font-family: var(--display); font-weight: 900; font-size: 64px; letter-spacing: -3px; line-height: 1; }
.pt-walk-s { font-weight: 800; font-size: 14px; opacity: .6; margin-top: -2px; }
.pt-walk-time { margin-top: 10px; font-weight: 800; font-size: 16px; }
.pt-walk-time b { color: var(--pt-y, #eef24a); font-family: var(--display); font-size: 20px; }
.pt-walk-chip { margin-top: 8px; background: #fff; color: var(--ink); border-radius: 999px; padding: 7px 14px; font-weight: 900; font-size: 14px; }
.pt-walk-pet { position: relative; font-size: 120px; line-height: 1; margin: 16px 0 6px; }
.pt-bag { position: absolute; right: -20px; bottom: 0; font-size: 52px; }

.pt-hero { background: var(--pt-y, #eef24a); border-radius: 32px; padding: 26px 22px; box-shadow: 0 6px 0 var(--ink); }
.pt-hero-title { font-family: var(--display); font-weight: 900; font-size: 42px; line-height: .95; letter-spacing: -2px; text-transform: uppercase; }
.pt-hero-sub { margin-top: 12px; font-weight: 800; font-size: 15px; opacity: .75; }
.pt-kinds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.pt-kind { border: 0; border-radius: 24px; background: #fff; padding: 12px 4px 10px; display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer;
  box-shadow: inset 0 0 0 3px transparent; }
.pt-kind.on { background: var(--ink); color: #fff; box-shadow: inset 0 0 0 3px var(--pt-y, #eef24a); }
.pt-kind-e { font-size: 44px; line-height: 1.1; }
.pt-kind-n { font-weight: 900; font-size: 14px; }
.pt-input { width: 100%; box-sizing: border-box; border: 0; border-radius: 999px; background: #fff; padding: 16px 22px; font-size: 20px; font-weight: 900;
  color: var(--ink); outline: none; box-shadow: inset 0 0 0 3px var(--ink); }
.pt-input:focus { box-shadow: inset 0 0 0 3px var(--ink), 0 0 0 4px var(--pt-y, #eef24a); }

.pt-m-sub { text-align: center; font-weight: 800; color: var(--ink-soft); margin: -4px 0 6px; }
.pt-list { display: flex; flex-direction: column; gap: 8px; max-height: 50vh; overflow-y: auto; margin-bottom: 10px; }
.pt-li { display: flex; align-items: center; gap: 10px; border: 0; border-radius: 999px; background: var(--card-soft); padding: 6px 16px 6px 6px; cursor: pointer; text-align: left; }
.pt-li:active { transform: scale(.97); }
.pt-li-e { width: 44px; height: 44px; border-radius: 50%; background: #fff; display: grid; place-items: center; font-size: 26px; flex: none; }
.pt-li-w { flex: 1; font-weight: 900; font-size: 16px; }
.pt-li-n { font-weight: 800; color: var(--ink-soft); }
.pt-li-v { background: var(--ink); color: var(--pt-y, #eef24a); border-radius: 99px; padding: 4px 10px; font-weight: 900; font-size: 13px; }
.pt-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-height: 50vh; overflow-y: auto; margin-bottom: 10px; }
.pt-wear { border: 0; border-radius: 20px; background: var(--card-soft); padding: 8px 2px; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
.pt-wear span { font-size: 32px; line-height: 1.2; }
.pt-wear small { font-size: 10px; font-weight: 800; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-wear.on { background: var(--pt-y, #eef24a); box-shadow: inset 0 0 0 3px var(--ink); }
.pt-empty { text-align: center; font-weight: 800; color: var(--ink-soft); padding: 14px 6px; }
`;
