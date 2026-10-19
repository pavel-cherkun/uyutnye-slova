// Экран питомца в стиле «музейной карточки»: чёрная карточка с питомцем, крупное имя + тонкий курсив,
// цифры через тонкие разделители, крутящиеся круглые стикеры-кнопки; ниже белый лист:
// уход (расчёска и еда), желания дня, трюки, путешествие, гардероб.

import { h, toast, modal } from '../ui/common.js';
import { floatText } from '../ui/fx.js';
import { state, commit, removeItem } from '../state.js';
import { getItem, CATEGORIES, eatValue } from '../data/items.js';
import { WARDROBE, SLOTS, WOOL, TRICKS, itemPreview, createLlama } from '../ui/llama.js';
import { spellModal, missingLetters } from '../ui/spell.js';
import { playBall } from '../ui/ballgame.js';
import { DESTS, destById, sceneSVG } from '../data/travel.js';
import { KINDS, kindOf, MIN, clamp, needXP, g, tick, ageOf, AGE_NAME, addPetXP, petView, travelDist, claimTravel } from '../pet/core.js';
import { ensureWishes, currentWish, markWish, wishIcon, wishText } from '../pet/wishes.js';

export { petBadge } from '../pet/core.js';

let timer = null;         // таймер экрана (путешествие)
let pickedKind = 'llama'; // выбор на экране заведения питомца
let pickedFem = true;
let lastPet = 0;          // анти-спам поглаживания
let wokeAt = 0;           // когда разбудили ночью (ещё 10 минут не спит)
let lastTrick = 0;
let petPortions = 0;

const isNight = () => { const hr = new Date().getHours(); return hr >= 23 || hr < 7; };
const fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const two = (x) => String(x).padStart(2, '0');
  return hh ? `${hh}ч : ${two(mm)}м : ${two(ss)}с` : `${two(mm)}м : ${two(ss)}с`;
};
const fmtDur = (ms) => (ms >= 3600000 ? `${Math.round(ms / 3600000)} ч` : `${Math.round(ms / 60000)} мин`);
const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} км`);
export const wordTiles = (word, miss = {}) => {
  const left = { ...miss };
  return h('span.pt-price', ...word.split('').map((ch) => { const bad = left[ch] > 0; if (bad) left[ch]--; return h('span.ltr' + (bad ? '.miss' : ''), ch); }));
};

// ---------- Экран ----------
export function renderPet(root, nav) {
  clearInterval(timer); timer = null;
  const rerender = () => renderPet(root, nav);
  let body;
  if (!state.pet) body = adoptView(rerender);
  else {
    tick(state.pet);
    const p = state.pet;
    body = p.walk ? awayView(p, rerender, nav) : homeView(p, rerender, nav);
  }
  root.replaceChildren(h('div.screen.pt-screen', h('style', CSS), body));
}

/** Крутящийся круглый стикер с текстом по кругу (как на постерах) */
let stkN = 0;
export function sticker(text, color, icon, onclick) {
  const id = 'stk' + (++stkN);
  const el = h('button.pt-stk', { onclick });
  el.innerHTML = `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="58" fill="${color}"/>
    <defs><path id="${id}" d="M60,60 m-43,0 a43,43 0 1,1 86,0 a43,43 0 1,1 -86,0"/></defs>
    <g class="stk-rot"><text font-size="13" font-weight="900" fill="#111" font-family="Unbounded, sans-serif"><textPath href="#${id}" textLength="266" lengthAdjust="spacing">${text} • ${text} • </textPath></text></g>
    <circle cx="60" cy="60" r="28" fill="none" stroke="#111" stroke-width="3"/></svg><span class="pt-stk-ic">${icon}</span>`;
  return el;
}
const DOODLE = `<svg viewBox="0 0 90 110" class="pt-doodle"><path d="M30 6 C70 10 74 48 46 52 C22 56 26 26 50 30 C78 36 66 80 40 100" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <path d="M32 88 L39 101 L53 96" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------- Завести питомца ----------
function adoptView(rerender) {
  const input = h('input.pt-input', { maxlength: 12, placeholder: 'Кличка', autocomplete: 'off' });
  const kinds = h('div.pt-kinds', KINDS.map((k) => {
    const miss = missingLetters(k.word);
    const can = !Object.keys(miss).length;
    return h('button.pt-kind' + (k.kind === pickedKind ? '.on' : '') + (can ? '' : '.lock'), {
      onclick: (e) => { pickedKind = k.kind; for (const b of kinds.children) b.classList.toggle('on', b === e.currentTarget); },
    }, h('span.pt-kind-e', k.emoji), h('span.pt-kind-n', k.name), wordTiles(k.word, miss));
  }));
  const sex = h('div.pt-sex', [['она', true], ['он', false]].map(([t, f]) => h('button.pt-sexb' + (pickedFem === f ? '.on' : ''), {
    onclick: (e) => { pickedFem = f; for (const b of sex.children) b.classList.toggle('on', b === e.currentTarget); },
  }, t)));
  const adopt = () => {
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) { toast('Придумай кличку'); input.focus(); return; }
    const k = KINDS.find((x) => x.kind === pickedKind) || KINDS[0];
    spellModal({ word: k.word, title: `Завести: ${k.name.toLowerCase()}`, icon: kindIcon(k), sub: `Набери «${k.word}» своими буквами`,
      onDone: () => {
        const now = Date.now();
        state.pet = { kind: k.kind, emoji: k.emoji, name: name[0].toUpperCase() + name.slice(1), fem: pickedFem, level: 1, xp: 0, food: 70, joy: 70, clean: 100,
          walk: null, outfit: null, born: now, lastTick: now, walks: 0, meters: 0, owned: [k.kind], bowl: [], look: { wool: 'cream' }, wardrobe: ['wool:cream'], tricks: [] };
        commit();
        rerender();
      } });
  };
  return h('div.pt-stack',
    h('div.pt-hero.pt-adopt',
      h('div.pt-title', h('b', 'Заведи'), h('i', 'питомца')),
      h('div.pt-lead', 'Набери имя зверя буквами — первые буквы уже у тебя'),
    ),
    kinds,
    h('div.pt-namerow', input, sex),
    h('button.pt-pill.big', { onclick: adopt }, h('span', '🐾  Завести'), h('span', '→')),
  );
}

function kindIcon(k) {
  if (k.kind !== 'llama') return k.emoji;
  const ll = createLlama({ still: true });
  ll.setLook({ wool: 'cream' });
  ll.setAge('baby');
  return h('div.pt-mini', ll.el);
}

function kindModal(p, rerender) {
  let m;
  m = modal([
    h('div.modal-title', 'Кто это?'),
    h('div.pt-m-sub', 'Имя и уровень останутся'),
    h('div.pt-sex.center', [['она', true], ['он', false]].map(([t, f]) => h('button.pt-sexb' + ((p.fem ?? /[ая]$/i.test(p.name)) === f ? '.on' : ''), {
      onclick: (e) => { p.fem = f; commit(); for (const b of e.currentTarget.parentNode.children) b.classList.toggle('on', b === e.currentTarget); },
    }, t))),
    h('div.pt-kinds', KINDS.map((k) => {
      const owned = (p.owned ||= [p.kind]).includes(k.kind);
      return h('button.pt-kind' + (k.kind === p.kind ? '.on' : ''), {
        onclick: () => {
          const go = () => { if (!p.owned.includes(k.kind)) p.owned.push(k.kind); p.kind = k.kind; p.emoji = k.emoji; commit(); m.close(); };
          if (owned) go();
          else spellModal({ word: k.word, title: `Завести: ${k.name.toLowerCase()}`, icon: kindIcon(k), sub: `Набери «${k.word}» своими буквами`, onDone: go });
        },
      }, h('span.pt-kind-e', k.emoji), h('span.pt-kind-n', k.name), owned ? h('span.pt-kind-ok', '✓') : wordTiles(k.word, missingLetters(k.word)));
    })),
    h('button.btn.btn-ghost', { onclick: () => m.close() }, 'Готово'),
  ], { onClose: rerender });
}

// ---------- Дом питомца ----------
function homeView(p, rerender, nav) {
  const kind = kindOf(p);
  const isLlama = p.kind === 'llama';
  p.bowl ||= []; p.look ||= { wool: 'cream' }; p.tricks ||= [];
  if (p.clean == null) p.clean = 100;
  const tut = (p.tut ||= {});
  const age = ageOf(p);
  const night = isNight() && Date.now() - wokeAt > 10 * MIN;
  petPortions = 0;

  const refs = { food: h('b', String(p.food)), joy: h('b', String(p.joy)), clean: h('b', String(p.clean)) };
  const setStat = (k) => { refs[k].textContent = String(p[k]); };
  const mood = () => ({ food: p.food, joy: p.joy, sleep: isNight() && Date.now() - wokeAt > 10 * MIN });
  const addJoy = (n) => { p.joy = clamp(p.joy + n); setStat('joy'); view.setMood(mood()); commit(); };
  const learned = (k) => { if (!tut[k]) { tut[k] = true; commit(); if (tut.pet && tut.fed && tut.brush) hint?.remove(); } };
  const wish = (type, target) => { if (markWish(p, type, target)) { view.cheer('Спасибо!'); drawThink(); drawWishes(); } };

  const view = petView(p, {
    onPet: () => {
      learned('pet');
      if (++petPortions === 8) wish('pet');
      const now = Date.now();
      if (now - lastPet < 1200) return;
      lastPet = now;
      if (petPortions <= 15) addJoy(2);
    },
    onPoke: () => { const now = Date.now(); if (now - lastPet < 2000) return; lastPet = now; addJoy(1); },
    onWake: () => { wokeAt = Date.now(); status.textContent = statusText(); },
    onSpit: () => { p.spits = (p.spits || 0) + 1; commit(); },
  });
  view.setMood(mood());
  view.setDirt((100 - p.clean) / 100);
  if (!isLlama && p.outfit && state.items[p.outfit]) view.el.prepend(h('div.ep-outfit', getItem(p.outfit).emoji));

  const now = Date.now();
  if (p.lastSeen && now - p.lastSeen > 3 * 60 * MIN && !night) setTimeout(() => view.cheer(p.food < 30 ? g(p, 'Я скучал… и голодный', 'Я скучала… и голодная') : 'Ура, ты тут!'), 500);
  p.lastSeen = now;

  const statusText = () => (view.asleep ? 'Спит' : p.food < 30 ? g(p, 'Голоден', 'Голодна') : p.joy < 30 ? 'Скучает' : p.clean < 40 ? 'Грязнуля' : 'Дома');
  const status = h('span', statusText());

  // облачко мысли — текущее желание
  const think = h('button.pt-think');
  const drawThink = () => {
    const w = currentWish(p);
    think.style.display = w ? '' : 'none';
    if (w) think.replaceChildren(h('span', wishIcon(w)));
    think.onclick = () => w && view.say(wishText(w), 1800);
  };
  drawThink();

  const bowl = bowlEl(p);
  const stage = h('div.pt-stage' + (p.scene ? '.scened' : ''), think, view.el, bowl.el);
  if (p.scene) stage.insertAdjacentHTML('afterbegin', sceneSVG(p.scene, 'pt-scene'));

  const ballBtn = sticker('ИГРАТЬ В МЯЧ', '#c8ff2e', '⚽', () => {
    if (stage.querySelector('.bg-layer')) return;
    let gained = 0;
    playBall(stage, view, {
      onHit: () => { if (gained < 20) { gained += 2; p.joy = clamp(p.joy + 2); setStat('joy'); } },
      onEnd: (hits) => {
        if (hits > (p.ballBest || 0)) { p.ballBest = hits; if (hits >= 3) toast(`Рекорд: ${hits} ⚽`); }
        if (hits) addPetXP(p, hits);
        commit();
        view.setMood(mood());
        if (hits >= 5) wish('ball');
      },
    });
  });
  const dressBtn = sticker('НАРЯДИТЬ', '#8c7bff', '🎀', () => (isLlama ? wardrobeModal(p, rerender, () => wish('wear')) : outfitModal(p, rerender, () => wish('wear'))));

  const hero = h('div.pt-hero' + (view.asleep ? '.night' : ''),
    h('div.pt-top', h('span.pt-status', h('i'), status), h('span.pt-lvl', `ур. ${p.level}`)),
    stage,
    h('div.pt-title', h('b', p.name),
      h('button.pt-kindbtn', { onclick: () => kindModal(p, rerender) }, h('i', [AGE_NAME[age], kind.name.toLowerCase()].filter(Boolean).join(' · ')), ' ↻')),
    h('div.pt-stats', stat('Сытость', refs.food), stat('Радость', refs.joy), stat('Чистота', refs.clean)),
    h('div.pt-stick', ballBtn, doodle(), dressBtn),
  );

  // ---------- белый лист ----------
  const hint = (!tut.pet || !tut.fed || !tut.brush) ? h('div.pt-hint', 'гладь пальцем · тяни еду ко рту или в миску · расчёсывай 🪮') : null;
  const tray = careTray(p, view, setStat, bowl, learned, wish, () => { status.textContent = statusText(); view.setMood(mood()); });

  const wishesEl = h('div.pt-wishes');
  const drawWishes = () => {
    const wl = ensureWishes(p);
    wishesEl.replaceChildren(
      ...wl.list.map((w) => h('button.pt-wish' + (w.done ? '.done' : ''), {
        onclick: () => {
          if (w.done) return;
          if (w.type === 'travel') nav.go('travel');
          else if (w.type === 'ball') ballBtn.click();
          else if (w.type === 'wear') dressBtn.click();
          else if (w.type === 'item') giftModal(p, rerender, (id) => wish('item', id));
          else if (w.type === 'food') {
            const b = tray.querySelector(`[data-id="${w.target}"]`);
            if (b) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); } else toast('Такой еды пока нет — ищи в играх');
          } else view.say(wishText(w), 1600);
        },
      }, h('span.pt-wish-ic', wishIcon(w)), h('span.pt-wish-t', wishText(w)), h('span.pt-wish-st', w.done ? '✓' : '→'))),
      h('div.pt-wish-chest' + (wl.chest ? '.done' : ''), wl.chest ? '👑 Сундук получен' : `👑 Все три — сундук · ${wl.list.filter((x) => x.done).length}/3`),
    );
  };
  drawWishes();

  const tricksEl = h('div.pt-tricks', TRICKS.map((t) => {
    const has = p.tricks.includes(t.id);
    return h('button.pt-trick' + (has ? '' : '.lock'), {
      onclick: () => {
        if (has) {
          const n = Date.now();
          if (n - lastTrick < 1800) return;
          lastTrick = n;
          view.perform(t.id);
          wish('trick');
          return;
        }
        spellModal({ word: t.word, title: `Трюк «${t.name}»`, icon: t.icon, sub: `Набери «${t.word}», чтобы научить`,
          onDone: () => { p.tricks.push(t.id); commit(); rerender(); toast(`${p.name} ${g(p, 'выучил', 'выучила')} трюк!`); } });
      },
    }, h('span', t.icon), h('b', t.name), has ? null : wordTiles(t.word, missingLetters(t.word)));
  }));

  const opened = DESTS.filter((d) => !d.word || (p.dests || []).includes(d.id));
  const dest = opened[opened.length - 1] || DESTS[0];
  const travelPill = h('button.pt-pill', { onclick: () => nav.go('travel') },
    h('span', '🗺️  Путешествие'), h('span.pt-pill-r', `${dest.name} · ${fmtDur(dest.ms)}`));

  const owned = WARDROBE.filter((w) => w.word && p.wardrobe?.includes(w.slot + ':' + w.id));
  const shown = isLlama ? (owned.length ? owned.slice(-3) : WARDROBE.filter((w) => w.slot === 'head').slice(0, 3)) : [];
  const thumbs = h('div.pt-thumbs', ...(isLlama ? shown.map((w) => {
    const t = h('button.pt-thumb' + (owned.includes(w) ? '' : '.lock'), { onclick: () => dressBtn.click() });
    t.innerHTML = w.slot === 'wool' ? `<span class="wd-swatch" style="background:${WOOL[w.id][0]}"></span>` : itemPreview(w.slot, w.id);
    return t;
  }) : [h('button.pt-thumb', { onclick: () => dressBtn.click() }, '🎀')]));
  requestAnimationFrame(() => thumbs.querySelectorAll('svg.ll-ico').forEach(fitIcon));

  const xpPct = Math.round((p.xp / needXP(p.level)) * 100);
  const sheet = h('div.pt-sheet',
    h('button.pt-gift', { onclick: () => giftModal(p, rerender, (id) => wish('item', id)), 'aria-label': 'Подарить' }, '🎁'),
    h('div.pt-cap', h('i', 'Уход')),
    tray,
    hint,
    h('div.pt-cap', h('i', 'Желания дня')),
    wishesEl,
    h('div.pt-cap', h('i', 'Трюки')),
    tricksEl,
    travelPill,
    h('div.pt-cap', h('i', 'Гардероб')),
    thumbs,
    h('div.pt-foot',
      h('div', h('i', 'Уровень'), h('b', String(p.level)), h('div.pt-bar', h('span', { style: { width: xpPct + '%' } }))),
      h('div', h('i', 'Путешествий'), h('b', String(p.walks || 0))),
      h('div', h('i', 'Пройдено'), h('b', fmtDist(p.meters || 0))),
    ),
  );

  return h('div.pt-stack.tight', hero, sheet);
}

function doodle() { const e = h('span.pt-doodle-w'); e.innerHTML = DOODLE; return e; }
function stat(label, val) { return h('div.pt-stat', h('i', label), val); }

// ---------- Питомец в пути ----------
function awayView(p, rerender, nav) {
  const w = p.walk;
  const d = destById(w.id);
  const done = Date.now() >= w.end;
  const stage = h('div.pt-stage.scened.away');
  stage.insertAdjacentHTML('afterbegin', sceneSVG(d.id, 'pt-scene'));
  const distEl = h('b', fmtDist(travelDist(w)));
  const timeEl = h('b', done ? '✓' : fmtTime(w.end - Date.now()));
  const barEl = h('span');
  const setBar = () => { barEl.style.width = Math.min(100, ((Date.now() - w.start) / (w.end - w.start)) * 100) + '%'; };
  setBar();
  if (done) { const v = petView(p, { still: true }); v.setDirt(0.4); stage.append(v.el); setTimeout(() => v.cheer('Я дома!'), 400); }
  const hero = h('div.pt-hero',
    h('div.pt-top', h('span.pt-status', h('i'), done ? g(p, 'Вернулся', 'Вернулась') : 'В пути'), h('span.pt-lvl', d.icon + ' ' + d.name)),
    stage,
    h('div.pt-title', h('b', p.name), h('i', done ? 'снова дома' : d.where)),
    h('div.pt-stats', stat('Пройдено', distEl), stat(done ? 'Путь' : 'Вернётся через', timeEl)),
    h('div.pt-bar.big', barEl),
  );
  const btn = done
    ? h('button.pt-pill.big.lime', { onclick: () => claimTravel(p, 1, rerender) }, h('span', '🎁  Забрать добычу'), h('span', '→'))
    : h('button.pt-pill.big', { onclick: () => claimTravel(p, Math.min(1, (Date.now() - w.start) / (w.end - w.start)), rerender) }, h('span', '🏠  Вернуть сейчас'), h('span.pt-pill-r', 'меньше добычи'));
  const wrap = h('div.pt-stack', hero, btn, h('button.pt-pill', { onclick: () => nav.go('travel') }, h('span', '🗺️  Карта мира'), h('span', '→')));
  if (!done) {
    timer = setInterval(() => {
      if (!wrap.isConnected || state.pet !== p || p.walk !== w) { clearInterval(timer); timer = null; return; }
      if (Date.now() >= w.end) { rerender(); return; }
      distEl.textContent = fmtDist(travelDist(w));
      timeEl.textContent = fmtTime(w.end - Date.now());
      setBar();
    }, 1000);
  }
  return wrap;
}

// ---------- Миска ----------
function bowlEl(p) {
  const food = h('div.pt-bowl-food');
  const el = h('div.pt-bowl', food);
  el.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 100 50"><path d="M6 14 L94 14 Q90 46 50 46 Q10 46 6 14 Z" fill="#ff5fa2" stroke="#111" stroke-width="5" stroke-linejoin="round"/>
    <rect x="3" y="8" width="94" height="10" rx="5" fill="#c8ff2e" stroke="#111" stroke-width="5"/><path d="M30 30 L42 30 M54 30 L66 30" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/></svg>`);
  const fill = () => food.replaceChildren(...p.bowl.map((id, i) => h('span', { style: { '--i': i } }, getItem(id).emoji)));
  fill();
  return { el, fill };
}

// ---------- Уход: расчёска и еда ----------
function careTray(p, view, setStat, bowl, learned, wish, onChange) {
  const tray = h('div.pt-tray');
  const eatNow = (id) => {
    const v = eatValue(id) || 4;
    p.food = clamp(p.food + v * 4);
    setStat('food');
    view.eat();
    setTimeout(onChange, 1400);
    addPetXP(p, v);
    commit();
    wish('food', id);
  };
  const fill = () => {
    const foods = Object.keys(state.items).filter((id) => eatValue(id) != null).sort((a, b) => eatValue(b) - eatValue(a)).slice(0, 14);
    const brush = h('button.pt-food.pt-brush', h('span', '🪮'));
    brush.addEventListener('pointerdown', (e) => drag(e, null, brush));
    tray.replaceChildren(brush, ...(foods.length
      ? foods.map((id) => {
        const b = h('button.pt-food', { 'data-id': id }, h('span', getItem(id).emoji), h('small', '×' + state.items[id]));
        b.addEventListener('pointerdown', (e) => drag(e, id, b));
        return b;
      })
      : [h('div.pt-tray-empty', '🍽️ еды нет — ищи в играх')]));
  };
  const feedFromBag = (id) => {
    if (p.food >= 100) { view.refuse(g(p, 'Я сыт!', 'Я сыта!')); return; }
    if (!removeItem(id)) return;
    learned('fed');
    eatNow(id);
    fill();
  };
  const toBowl = (id) => {
    if (p.bowl.length >= 3) { view.say('Миска полна', 1200); return; }
    if (!removeItem(id)) return;
    learned('fed');
    p.bowl.push(id);
    commit();
    bowl.fill();
    fill();
    if (p.food < 60) setTimeout(eatFromBowl, 700);
  };
  const flyGhost = (emoji, from, to, ms, done) => {
    const gh = h('div.pt-ghost', emoji);
    gh.style.left = from.x + 'px'; gh.style.top = from.y + 'px';
    document.body.append(gh);
    requestAnimationFrame(() => { gh.style.transition = `left ${ms}ms ease-in-out, top ${ms}ms cubic-bezier(.3,-0.6,.7,1), transform ${ms}ms`; gh.style.left = to.x + 'px'; gh.style.top = to.y + 'px'; gh.style.transform = 'translate(-50%,-50%) scale(.5)'; });
    setTimeout(() => { gh.remove(); done(); }, ms + 20);
  };
  function eatFromBowl() {
    if (!bowl.el.isConnected || !p.bowl.length) return;
    if (p.food >= 95) { view.refuse('Не хочу'); return; }
    const id = p.bowl.shift();
    commit();
    bowl.fill();
    const r = bowl.el.getBoundingClientRect();
    view.want(true);
    flyGhost(getItem(id).emoji, { x: r.left + r.width / 2, y: r.top + 10 }, view.mouthClient(), 420, () => { view.want(false); eatNow(id); });
  }
  bowl.el.addEventListener('click', () => {
    if (p.bowl.length) eatFromBowl();
    else { bowl.el.classList.remove('shake'); void bowl.el.offsetWidth; bowl.el.classList.add('shake'); view.say('Миска пустая', 1200); }
  });
  const near = (x, y, el, d) => { const r = el.getBoundingClientRect(); return Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) < d; };

  function drag(e, id, btn) {
    const isBrush = id == null;
    const ghost = h('div.pt-ghost' + (isBrush ? '.brush' : ''), isBrush ? '🪮' : getItem(id).emoji);
    const r0 = btn.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false, atMouth = false, atBowl = false, portions = 0;
    const place = (x, y) => { ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; };
    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
      if (!moved) { moved = true; document.body.append(ghost); }
      const x = ev.clientX, y = ev.clientY - 30;
      place(x, y);
      if (isBrush) {
        if (view.brushAt(x, y) === 2) {
          learned('brush');
          const was = p.clean;
          p.clean = clamp(p.clean + 6);
          setStat('clean');
          view.setDirt((100 - p.clean) / 100);
          if (++portions <= 8) { p.joy = clamp(p.joy + 1); setStat('joy'); }
          commit();
          if (was < 100 && p.clean >= 100) { view.cheer('Чистюля!'); wish('brush'); onChange(); }
        }
        return;
      }
      view.lookAtClient(x, y);
      const m = view.mouthClient();
      const nm = Math.hypot(x - m.x, y - m.y) < 90;
      if (nm !== atMouth) { atMouth = nm; view.want(nm); }
      const nb = near(x, y, bowl.el, 70);
      if (nb !== atBowl) { atBowl = nb; bowl.el.classList.toggle('hot', nb); }
    };
    const stop = () => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', cancel);
      bowl.el.classList.remove('hot');
    };
    const end = () => {
      stop();
      if (isBrush) {
        ghost.remove();
        if (moved) view.brushEnd(); else view.say('Почеши меня 🪮', 1400);
        return;
      }
      if (!moved) {
        view.want(true);
        flyGhost(getItem(id).emoji, { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 }, view.mouthClient(), 380, () => { view.want(false); feedFromBag(id); });
        return;
      }
      view.want(false);
      ghost.remove();
      if (atMouth) feedFromBag(id);
      else if (atBowl) toBowl(id);
    };
    const cancel = () => { stop(); ghost.remove(); view.want(false); if (isBrush) view.brushEnd(); };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', cancel);
  }
  fill();
  return tray;
}

// ---------- Гардероб ламы: каждая вещь покупается словом из букв ----------
export function fitIcon(svg) {
  try {
    const b = svg.getBBox();
    if (!b.width) return;
    const pad = Math.max(b.width, b.height) * 0.08;
    svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
  } catch { /* не в DOM */ }
}

function wardrobeModal(p, rerender, onChange) {
  p.look ||= { wool: 'cream' };
  p.wardrobe ||= ['wool:cream'];
  const before = JSON.stringify(p.look);
  let slot = 'head';
  const prev = petView(p, { still: true });
  prev.setDirt(0);
  const tabs = h('div.wd-tabs');
  const grid = h('div.wd-grid');
  const has = (w) => !w.word || p.wardrobe.includes(w.slot + ':' + w.id);
  const wear = (w) => {
    if (w.slot !== 'wool' && p.look[w.slot] === w.id) delete p.look[w.slot];
    else p.look[w.slot] = w.id;
    commit();
    prev.setLook(p.look);
    prev.cheer();
    draw();
  };
  const draw = () => {
    tabs.replaceChildren(...SLOTS.map((s) => h('button.wd-tab' + (s.id === slot ? '.on' : ''), { onclick: () => { slot = s.id; draw(); } }, s.name)));
    grid.replaceChildren(...WARDROBE.filter((w) => w.slot === slot).map((w) => {
      const own = has(w);
      const on = p.look[w.slot] === w.id;
      const pic = h('div.wd-pic');
      if (w.slot === 'wool') pic.append(h('span.wd-swatch', { style: { background: WOOL[w.id][0], boxShadow: `inset -6px -8px 0 ${WOOL[w.id][1]}, 0 0 0 3px #111` } }));
      else pic.innerHTML = itemPreview(w.slot, w.id);
      return h('button.wd-item' + (on ? '.on' : '') + (own ? '' : '.lock'), {
        onclick: () => {
          if (own) { wear(w); return; }
          spellModal({ word: w.word, title: w.name, icon: h('div.wd-big', pic.cloneNode(true)), sub: `Набери «${w.word}», чтобы получить`,
            onDone: () => { p.wardrobe.push(w.slot + ':' + w.id); commit(); wear(w); } });
        },
      }, pic, h('span.wd-name', w.name), own ? (on ? h('span.wd-st', '✓ надето') : null) : wordTiles(w.word, missingLetters(w.word)));
    }));
    requestAnimationFrame(() => grid.querySelectorAll('svg.ll-ico').forEach(fitIcon));
  };
  draw();
  const m = modal([
    h('div.wd-prev', prev.el),
    tabs,
    grid,
    h('button.btn', { onclick: () => m.close() }, 'Готово'),
  ], { onClose: () => { const changed = JSON.stringify(p.look) !== before; rerender(); if (changed) { toast('Обновка! ✨'); onChange?.(); } } });
  m.el.classList.add('wd-box');
}

// ---------- Подарить ----------
// Любая вещь (кроме еды) может стать подарком. У каждого зверя любимые категории — подарок из них радует вдвое сильнее.
export const FAVS = {
  cat: ['decor', 'dishes', 'furniture'], dog: ['sport', 'tools', 'furniture'], hamster: ['plants', 'stationery', 'decor'],
  rabbit: ['plants', 'bath', 'light'], llama: ['plants', 'clothes', 'music'], parrot: ['music', 'tech', 'walldecor'], fox: ['fantasy', 'nature', 'transport'],
};
const GIFT_JOY = { c: 4, r: 8, e: 16, l: 30 };
function giftModal(p, rerender, onGift) {
  let m;
  const favs = FAVS[p.kind] || [];
  const list = h('div.pt-list');
  const favText = () => `Радость ${p.joy}% · любит: ${favs.map((c) => CATEGORIES[c].icon + ' ' + CATEGORIES[c].name.toLowerCase()).join(', ')}`;
  const head = h('div.pt-m-sub', favText());
  const want = ensureWishes(p).list.find((w) => w.type === 'item' && !w.done)?.target;
  const fill = () => {
    const ids = Object.keys(state.items).filter((id) => { const it = getItem(id); return it.tier === 1 && eatValue(id) == null; })
      .sort((a, b) => ((b === want) - (a === want)) || (favs.includes(getItem(b).cat) - favs.includes(getItem(a).cat)) || getItem(a).word.localeCompare(getItem(b).word));
    list.replaceChildren(...(ids.length ? ids.map((id) => {
      const it = getItem(id);
      const fav = favs.includes(it.cat);
      const v = GIFT_JOY[it.rarity] * (fav ? 2 : 1);
      return h('button.pt-li' + (id === want ? '.want' : ''), {
        onclick: (e) => {
          if (!removeItem(id)) return;
          p.joy = clamp(p.joy + v);
          addPetXP(p, v);
          commit();
          floatText(fav ? '😍 +' + v : '❤️ +' + v, e.clientX, e.clientY - 20);
          head.textContent = favText();
          onGift?.(id);
          fill();
        },
      }, h('span.pt-li-e', it.emoji), h('span.pt-li-w', (id === want ? '💭 ' : fav ? '⭐ ' : '') + it.word.toLowerCase()), h('span.pt-li-n', `×${state.items[id]}`), h('span.pt-li-v', `+${v}`));
    }) : [h('div.pt-empty', 'Пока нечего подарить — вещи дают игры и путешествия')]));
  };
  fill();
  m = modal([h('div.modal-title', 'Подарить'), head, list,
    h('button.btn.btn-ghost', { onclick: () => m.close() }, 'Готово')], { onClose: rerender });
}

// ---------- Нарядить (не лама: эмодзи-вещь из сумки) ----------
function outfitModal(p, rerender, onChange) {
  let m;
  const wear = Object.keys(state.items).filter((id) => { const it = getItem(id); return it.tier === 1 && (it.cat === 'clothes' || it.cat === 'accessory'); });
  const set = (id) => { p.outfit = id; commit(); m.close(); if (id) { toast('Красота!'); onChange?.(); } };
  m = modal([
    h('div.modal-title', 'Нарядить'),
    h('div.pt-m-sub', 'Вещь не тратится — просто надета'),
    wear.length
      ? h('div.pt-grid', wear.map((id) => {
        const it = getItem(id);
        return h('button.pt-wear' + (p.outfit === id ? '.on' : ''), { onclick: () => set(id) }, h('span', it.emoji), h('small', it.word.toLowerCase()));
      }))
      : h('div.pt-empty', `Нет одежды и аксессуаров. Ищи их в играх (${CATEGORIES.clothes.icon} ${CATEGORIES.accessory.icon})`),
    h('div.row',
      p.outfit ? h('button.btn.btn-ghost', { onclick: () => set(null) }, 'Снять') : null,
      h('button.btn', { onclick: () => m.close() }, 'Готово')),
  ], { onClose: rerender });
}

// ---------- Стили ----------
const CSS = `
.pt-screen { --pt-v: #8c7bff; --pt-l: #c8ff2e; padding-top: 8px; }
.pt-stack { display: flex; flex-direction: column; gap: 14px; }
.pt-stack.tight { gap: 0; }
.pt-hero i, .pt-sheet i, .pt-title i { font-family: var(--display); font-weight: 300; font-style: italic; }

/* чёрная карточка */
.pt-hero { position: relative; background: #0c0c0c; color: #fff; border-radius: 34px; padding: 16px 18px 18px; overflow: hidden; }
.pt-hero.night { background: #1b1838; background-image: radial-gradient(2px 2px at 18% 12%, #fff9, transparent), radial-gradient(2px 2px at 78% 8%, #fffa, transparent),
  radial-gradient(1.5px 1.5px at 62% 22%, #fff8, transparent), radial-gradient(2px 2px at 30% 30%, #fff6, transparent), radial-gradient(1.5px 1.5px at 90% 28%, #fff8, transparent); }
.pt-top { display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 2; }
.pt-status { display: inline-flex; align-items: center; gap: 8px; border: 2px solid #fff; border-radius: 99px; padding: 6px 14px; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: .5px; }
.pt-status i { width: 9px; height: 9px; border-radius: 50%; background: var(--pt-l); display: block; }
.pt-lvl { font-family: var(--display); font-weight: 800; font-size: 13px; background: #fff; color: #111; border-radius: 99px; padding: 6px 12px; }
.pt-stage { position: relative; display: flex; justify-content: center; align-items: flex-end; padding: 34px 0 6px; margin: 0 -18px; min-height: 250px; }
.pt-stage.scened { margin: 12px -6px 0; border-radius: 26px; overflow: hidden; }
.pt-stage.away { min-height: 230px; }
.pt-scene { position: absolute; inset: 0; width: 100%; height: 100%; }
.pt-stage > .ll-wrap, .pt-stage > .ep { position: relative; z-index: 1; width: min(84%, 300px); }
.pt-think { position: absolute; z-index: 3; left: 10%; top: 8px; width: 56px; height: 52px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 0 0 3px #111;
  display: grid; place-items: center; font-size: 26px; cursor: pointer; animation: pt-float 3s ease-in-out infinite; }
.pt-think::before, .pt-think::after { content: ''; position: absolute; background: #fff; border-radius: 50%; box-shadow: 0 0 0 3px #111; }
.pt-think::before { width: 14px; height: 14px; right: -2px; bottom: -8px; }
.pt-think::after { width: 8px; height: 8px; right: -12px; bottom: -18px; }
@keyframes pt-float { 50% { transform: translateY(-5px); } }
.pt-title { position: relative; z-index: 2; margin-top: 6px; }
.pt-title b { display: block; font-family: var(--display); font-weight: 900; font-size: 52px; line-height: .95; letter-spacing: -2.5px; word-break: break-word; }
.pt-title i, .pt-kindbtn i { font-size: 26px; letter-spacing: -1px; line-height: 1.1; }
.pt-kindbtn { border: 0; background: none; color: inherit; padding: 0; font-size: 20px; cursor: pointer; text-align: left; }
.pt-stats { display: flex; margin-top: 14px; border-top: 1.5px solid rgba(255,255,255,.35); }
.pt-stat { flex: 1; padding: 8px 10px 0; border-left: 1.5px solid rgba(255,255,255,.35); display: flex; flex-direction: column; min-width: 0; }
.pt-stat:first-child { border-left: 0; padding-left: 0; }
.pt-stat i { font-size: 12px; opacity: .85; }
.pt-stat b { font-family: var(--display); font-weight: 800; font-size: 30px; letter-spacing: -1px; line-height: 1.1; white-space: nowrap; }
.pt-stick { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; }
.pt-stk { position: relative; width: 118px; height: 118px; border: 0; padding: 0; background: none; cursor: pointer; flex: none; -webkit-tap-highlight-color: transparent; }
.pt-stk:active { transform: scale(.95); }
.pt-stk svg { width: 100%; height: 100%; display: block; overflow: visible; }
.stk-rot { transform-origin: 60px 60px; animation: stk-spin 16s linear infinite; }
@keyframes stk-spin { to { transform: rotate(360deg); } }
.pt-stk-ic { position: absolute; inset: 0; display: grid; place-items: center; font-size: 34px; pointer-events: none; }
.pt-doodle-w { width: 70px; flex: none; }
.pt-doodle { width: 70px; display: block; }
.pt-bar { height: 8px; border-radius: 99px; background: rgba(17,17,17,.12); overflow: hidden; margin-top: 6px; }
.pt-bar span { display: block; height: 100%; background: currentColor; border-radius: 99px; }
.pt-hero .pt-bar { background: rgba(255,255,255,.2); color: var(--pt-l); }
.pt-bar.big { height: 10px; margin-top: 14px; }

/* белый лист */
.pt-sheet { position: relative; background: #fff; border-radius: 34px; margin-top: -26px; padding: 22px 16px 18px; color: #111; z-index: 1; }
.pt-gift { position: absolute; right: 16px; top: -28px; width: 60px; height: 60px; border-radius: 50%; border: 6px solid #fff; background: var(--pt-l); font-size: 24px; cursor: pointer; }
.pt-cap { margin: 16px 2px 8px; font-size: 15px; color: #444; }
.pt-cap:first-of-type { margin-top: 0; }
.pt-tray { display: flex; gap: 8px; overflow-x: auto; padding: 4px 2px 6px; margin: 0 -4px; scrollbar-width: none; touch-action: pan-x; }
.pt-tray::-webkit-scrollbar { display: none; }
.pt-food { flex: none; position: relative; width: 56px; height: 56px; border: 0; border-radius: 50%; background: #f4f3ee; box-shadow: inset 0 0 0 2px #111;
  display: grid; place-items: center; cursor: grab; touch-action: pan-x; -webkit-user-select: none; user-select: none; }
.pt-food span { font-size: 28px; line-height: 1; pointer-events: none; }
.pt-food small { position: absolute; right: -4px; bottom: -4px; background: #111; color: #fff; border-radius: 99px; padding: 1px 6px; font-size: 11px; font-weight: 900; }
.pt-food.pulse { animation: pt-pulse .5s 2; }
@keyframes pt-pulse { 50% { transform: scale(1.25); box-shadow: inset 0 0 0 3px #111, 0 0 0 5px var(--pt-l); } }
.pt-brush { background: var(--pt-l) !important; }
.pt-tray-empty { font-weight: 800; font-size: 14px; opacity: .6; padding: 8px 6px; }
.pt-hint { margin-top: 6px; font-size: 12px; font-weight: 800; opacity: .45; }
.pt-ghost { position: fixed; z-index: 999; font-size: 48px; line-height: 1; transform: translate(-50%, -50%); pointer-events: none; filter: drop-shadow(0 6px 0 rgba(0,0,0,.18)); }
.pt-ghost.brush { font-size: 54px; transform: translate(-50%, -50%) rotate(-30deg); }
.pt-bowl { position: absolute; left: 8px; bottom: 8px; z-index: 2; width: 74px; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform .15s; }
.pt-bowl svg { display: block; width: 100%; }
.pt-bowl.hot { transform: scale(1.18); }
.pt-bowl.shake { animation: sp-shake .3s; }
.pt-bowl-food { position: absolute; left: 0; right: 0; bottom: 18px; display: flex; justify-content: center; pointer-events: none; }
.pt-bowl-food span { font-size: 24px; margin: 0 -5px; transform: translateY(calc(var(--i) * -3px)); }
.ep-outfit { position: absolute; top: -6px; left: 50%; transform: translateX(-50%) rotate(-10deg); font-size: 56px; z-index: 2; pointer-events: none; }

.pt-wishes { display: flex; flex-direction: column; gap: 6px; }
.pt-wish { display: flex; align-items: center; gap: 10px; border: 1.5px solid #111; border-radius: 99px; background: #fff; padding: 5px 16px 5px 5px; cursor: pointer; text-align: left; color: #111; }
.pt-wish-ic { width: 40px; height: 40px; border-radius: 50%; background: #f4f3ee; display: grid; place-items: center; font-size: 22px; flex: none; }
.pt-wish-t { flex: 1; font-weight: 800; font-size: 14px; }
.pt-wish-st { font-weight: 900; font-size: 16px; }
.pt-wish.done { background: #111; color: #fff; }
.pt-wish.done .pt-wish-ic { background: var(--pt-l); }
.pt-wish-chest { text-align: center; font-weight: 800; font-size: 12px; opacity: .6; margin-top: 2px; }
.pt-wish-chest.done { opacity: 1; color: #3fb950; }

.pt-tricks { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 6px; margin: 0 -4px; scrollbar-width: none; }
.pt-trick { flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 76px; border: 0; border-radius: 20px; background: #111; color: #fff; padding: 8px 8px 9px; cursor: pointer; }
.pt-trick > span:first-child { font-size: 26px; line-height: 1.1; }
.pt-trick b { font-size: 12px; font-weight: 900; }
.pt-trick.lock { background: #f4f3ee; color: #111; }
.pt-trick.lock > span:first-child { filter: grayscale(1); }
.pt-price { display: inline-flex; gap: 2px; font-size: 10px; margin-top: 3px; flex-wrap: wrap; justify-content: center; }
.pt-price .ltr.miss { background: #ffd0d8; color: #b0203a; box-shadow: 0 .12em 0 #e8445a; }

.pt-pill { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; margin-top: 16px; border: 1.5px solid #111; border-radius: 99px;
  background: #fff; color: #111; padding: 14px 20px; font-weight: 900; font-size: 15px; cursor: pointer; text-align: left; }
.pt-pill-r { font-weight: 700; font-size: 13px; opacity: .7; }
.pt-pill.big { padding: 18px 22px; font-size: 17px; margin-top: 0; background: #111; color: #fff; border: 0; }
.pt-pill.big.lime { background: var(--pt-l); color: #111; }
.pt-thumbs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.pt-thumb { min-width: 0; overflow: hidden; aspect-ratio: 1.1; border: 0; border-radius: 20px; background: #111; display: grid; place-items: center; padding: 14px; cursor: pointer; font-size: 34px; }
.pt-thumb.lock { opacity: .45; }
.pt-thumb svg { width: 100%; height: 100%; }
.pt-foot { display: flex; margin-top: 16px; border-top: 1.5px solid #111; }
.pt-foot > div { flex: 1; padding: 8px 10px 0; border-left: 1.5px solid #111; display: flex; flex-direction: column; min-width: 0; }
.pt-foot > div:first-child { border-left: 0; padding-left: 0; }
.pt-foot i { font-size: 12px; }
.pt-foot b { font-family: var(--display); font-weight: 800; font-size: 22px; letter-spacing: -1px; white-space: nowrap; }
.pt-foot .pt-bar { color: #111; }

/* заведение */
.pt-adopt { padding: 26px 22px 24px; }
.pt-lead { margin-top: 12px; font-weight: 700; font-size: 15px; opacity: .8; }
.pt-kinds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.pt-kind { position: relative; border: 0; border-radius: 24px; background: #fff; padding: 12px 4px 10px; display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer;
  box-shadow: inset 0 0 0 2px #111; color: #111; }
.pt-kind.on { background: #111; color: #fff; box-shadow: inset 0 0 0 3px var(--pt-l); }
.pt-kind.lock .pt-kind-e { filter: grayscale(1); }
.pt-kind-e { font-size: 40px; line-height: 1.1; }
.pt-kind-n { font-weight: 900; font-size: 14px; }
.pt-kind-ok { font-weight: 900; color: #3fb950; font-size: 13px; margin-top: 2px; }
.pt-input { width: 100%; box-sizing: border-box; border: 0; border-radius: 999px; background: #fff; padding: 16px 22px; font-size: 20px; font-weight: 900;
  color: #111; outline: none; box-shadow: inset 0 0 0 2px #111; }
.pt-namerow { display: flex; gap: 8px; align-items: center; }
.pt-namerow .pt-input { flex: 1; min-width: 0; }
.pt-sex { display: flex; gap: 6px; }
.pt-sex.center { justify-content: center; margin-bottom: 10px; }
.pt-sexb { border: 0; border-radius: 99px; padding: 14px 16px; font-weight: 900; font-size: 15px; background: #fff; color: #111; box-shadow: inset 0 0 0 2px #111; cursor: pointer; }
.pt-sexb.on { background: #111; color: #c8ff2e; }
.pt-mini { width: 150px; }
.pt-mini .ll-wrap { width: 150px; }

/* окна */
.pt-m-sub { text-align: center; font-weight: 800; color: var(--ink-soft); margin: -4px 0 6px; }
.pt-list { display: flex; flex-direction: column; gap: 8px; max-height: 50vh; overflow-y: auto; margin-bottom: 10px; }
.pt-li { display: flex; align-items: center; gap: 10px; border: 0; border-radius: 999px; background: var(--card-soft); padding: 6px 16px 6px 6px; cursor: pointer; text-align: left; }
.pt-li.want { box-shadow: inset 0 0 0 3px #8c7bff; }
.pt-li-e { width: 44px; height: 44px; border-radius: 50%; background: #fff; display: grid; place-items: center; font-size: 26px; flex: none; }
.pt-li-w { flex: 1; font-weight: 900; font-size: 16px; }
.pt-li-n { font-weight: 800; color: var(--ink-soft); }
.pt-li-v { background: var(--ink); color: var(--pt-l); border-radius: 99px; padding: 4px 10px; font-weight: 900; font-size: 13px; }
.pt-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-height: 50vh; overflow-y: auto; margin-bottom: 10px; }
.pt-wear { border: 0; border-radius: 20px; background: var(--card-soft); padding: 8px 2px; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
.pt-wear span { font-size: 32px; line-height: 1.2; }
.pt-wear small { font-size: 10px; font-weight: 800; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-wear.on { background: var(--pt-l); box-shadow: inset 0 0 0 3px var(--ink); }
.pt-empty { text-align: center; font-weight: 800; color: var(--ink-soft); padding: 14px 6px; }
.wd-box { max-height: 92vh; overflow-y: auto; }
.wd-box > * { flex-shrink: 0; }
.wd-prev { width: 170px; margin: -6px auto 4px; }
.wd-prev .ll-wrap { width: 170px; }
.wd-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 4px 2px 8px; scrollbar-width: none; }
.wd-tab { flex: none; border: 0; border-radius: 99px; padding: 8px 14px; font-weight: 900; font-size: 14px; background: var(--card-soft, #eee); color: var(--ink); cursor: pointer; }
.wd-tab.on { background: var(--ink); color: var(--pt-l); }
.wd-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.wd-item { border: 0; border-radius: 20px; background: var(--card-soft, #f2f2f2); padding: 8px 4px 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; color: var(--ink); }
.wd-item.on { background: var(--pt-l); box-shadow: inset 0 0 0 3px var(--ink); }
.wd-item.lock .wd-pic { opacity: .55; }
.wd-pic { width: 64px; height: 52px; display: grid; place-items: center; }
.wd-swatch { width: 40px; height: 40px; border-radius: 50%; display: block; }
.wd-name { font-weight: 900; font-size: 12px; }
.wd-st { font-weight: 900; font-size: 11px; }
.wd-item .pt-price { font-size: 9px; gap: 1px; }
.wd-big { width: 150px; height: 110px; display: grid; place-items: center; margin-bottom: 12px; }
.wd-big .wd-pic { width: 150px; height: 110px; }
.wd-big .wd-swatch { width: 90px; height: 90px; }
`;
