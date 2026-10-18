// Точка входа: HUD, таббар, роутинг экранов и запуск мини-игр.

import * as store from './state.js';
import { state, subscribe, totalLetters } from './state.js';
import { h, toast, showReward, modal } from './ui/common.js';
import { avatarSVG } from './ui/avatar.js';
import { renderCreate, renderProfile } from './screens/character.js';
import { renderPet, petBadge } from './screens/pet.js';
import { renderBag } from './screens/bag.js';
import { renderOven } from './screens/oven.js';
import { renderGames, GAMES, gameIcon, flowNodes, lockedReason } from './screens/games.js';
import { loadDict } from './data/dict.js';
import { renderOrders, readyOrders } from './screens/orders.js';
import { setupDevice } from './ui/device.js';
import { maybeDailyGift, maybeIosHint } from './screens/settings.js';
import { syncLetters, levelInfo, gainXP, chestReward, CHEST_EVERY } from './progression.js';
import { openChest, hold } from './ui/fx.js';
import { dailyReady } from './screens/daily.js';

const app = document.getElementById('app');
// «Играть» — большая кнопка по центру меню
const TABS = [
  { id: 'pet', icon: '🐾', label: 'Питомец', badge: petBadge },
  { id: 'bag', icon: '🎒', label: 'Сумка' },
  { id: 'games', icon: '▶', label: 'Играть', play: true },
  { id: 'oven', icon: '🔥', label: 'Печь' },
  { id: 'orders', icon: '📋', label: 'Заказы' },
];

let current = 'games';
let hudEl, screenEl, tabbarEl;
let gameOpen = false;

const nav = { go, openGame, refresh };

function boot() {
  if (!state.created) {
    app.replaceChildren();
    const root = h('div', { style: { display: 'contents' } });
    app.append(root);
    renderCreate(root, () => { current = 'games'; boot(); });
    return;
  }
  hudEl = h('div.hud');
  hudRefs = null; tabsKey = '';
  screenEl = h('div', { style: { display: 'contents' } });
  tabbarEl = h('div.tabbar');
  app.replaceChildren(hudEl, screenEl, tabbarEl);
  renderHud();
  renderTabs();
  refresh();
  setTimeout(() => { if (!maybeDailyGift(maybeIosHint)) maybeIosHint(); }, 400);
}

// Шапку и меню строим один раз, потом меняем только числа — иначе кнопки пересоздаются
// прямо под пальцем, и нажатие теряется.
let hudRefs = null;
let prevHud = {};
function renderHud() {
  if (!hudEl) return;
  const vals = { energy: state.energy, keys: state.keys, letters: totalLetters() };
  const lv = levelInfo();
  if (!hudRefs) {
    const pill = (k, ic, title) => {
      const num = h('span.hud-num', '');
      const el = h('div.hud-pill', { title, 'data-k': k }, ic === 'L' ? h('span.ltr', 'А') : h('span.ic', ic), num);
      return { el, num };
    };
    const ava = h('span.hud-ava');
    const lvl = h('span', '');
    const xpT = h('span', '');
    const xpBar = h('i');
    const pills = { energy: pill('energy', '⚡', 'Энергия'), keys: pill('keys', '🗝️', 'Ключи'), letters: pill('letters', 'L', 'Буквы') };
    hudEl.replaceChildren(
      h('button.hud-me', { onclick: () => go('me'), 'aria-label': 'Профиль' },
        ava,
        h('span.hud-lvlbox', h('span.hud-lvltext', lvl, xpT), h('span.hud-xp', xpBar)),
      ),
      h('div.hud-res', pills.energy.el, pills.keys.el, pills.letters.el),
    );
    hudRefs = { ava, lvl, xpT, xpBar, pills, avaKey: '' };
  }
  const avaKey = JSON.stringify(state.profile);
  if (hudRefs.avaKey !== avaKey) { hudRefs.ava.innerHTML = avatarSVG(state.profile, { bg: false }); hudRefs.avaKey = avaKey; }
  hudRefs.lvl.textContent = `УР. ${lv.lvl}`;
  hudRefs.xpT.textContent = `${lv.cur}/${lv.need} ⭐`;
  hudRefs.xpBar.style.width = Math.round((lv.cur / lv.need) * 100) + '%';
  for (const [k, ref] of Object.entries(hudRefs.pills)) {
    if (ref.num.textContent !== String(vals[k])) {
      ref.num.textContent = vals[k];
      if (prevHud[k] != null) { ref.el.classList.remove('bump'); void ref.el.offsetWidth; ref.el.classList.add('bump'); }
    }
  }
  prevHud = vals;
}

let tabsKey = '';
function renderTabs(force) {
  const badges = TABS.map((t) => (t.id === 'orders' ? readyOrders() : t.play ? dailyReady() : t.badge ? t.badge() : 0));
  const key = current + '|' + badges.join(',');
  if (!force && key === tabsKey) return; // ничего не изменилось — кнопки не трогаем
  tabsKey = key;
  tabbarEl.replaceChildren(...TABS.map((t, i) =>
    h((t.play ? 'button.tab-play' : 'button.tab') + (t.id === current ? '.active' : ''),
      { onclick: () => go(t.id), 'data-tab': t.id },
      h('span.ic', t.icon), t.label,
      badges[i] ? h('span.tab-badge', t.play ? '!' : badges[i]) : null)));
}

function go(id) {
  current = id;
  renderTabs();
  refresh();
}

function refresh() {
  if (!screenEl) return;
  const scroll = screenEl.querySelector('.screen')?.scrollTop || 0;
  const r = { pet: renderPet, games: renderGames, bag: renderBag, oven: renderOven, orders: renderOrders, me: renderProfile }[current];
  r(screenEl, current === 'me' ? () => { renderHud(); refresh(); } : nav);
  const sc = screenEl.querySelector('.screen');
  if (sc) sc.scrollTop = scroll;
}

// обновления после сохранений — не чаще раза в кадр
let hudQueued = false;
subscribe(() => {
  if (gameOpen || hudQueued) return;
  hudQueued = true;
  requestAnimationFrame(() => { hudQueued = false; renderHud(); if (tabbarEl) renderTabs(); });
});

async function openGame(id) {
  const g = GAMES.find((x) => x.id === id);
  if (!g || gameOpen) return;
  if (levelInfo().lvl < (g.lvl || 1)) { toast(lockedReason(g), 2800); return; }
  if (g.energy && state.energy < g.energy) {
    const m = modal([
      h('div.modal-title', 'Не хватает энергии ⚡'),
      h('p.center', `Нужно ${g.energy}, есть ${state.energy}. Сожги что-нибудь в печи или съешь вкусное из сумки. А «Блоки» — бесплатно!`),
      h('div.row',
        h('button.btn.btn-orange', { onclick: () => { m.close(); go('oven'); } }, '🔥 В печь'),
        h('button.btn.btn-violet', { onclick: () => { m.close(); openGame('shooter'); } }, '🎯 Блоки'),
      ),
    ]);
    return;
  }

  let mod;
  try {
    mod = await import(`./games/${id}.js`);
  } catch (e) {
    console.error(e);
    toast('Эта игра ещё в разработке');
    return;
  }
  // правила при первом запуске игры
  const seen = (state.progress.tipsSeen ||= []);
  if (!seen.includes(id) && g.tip) {
    const go = await new Promise((resolve) => {
      let started = false;
      const m = modal([
        h('div.hm-big', gameIcon(g.emoji)),
        h('div.modal-title', g.title),
        h('div.tip-flow', flowNodes(g.flow)),
        h('div.center', g.tip),
        h('button.btn.btn-big', { onclick: () => { started = true; m.close(); resolve(true); } }, 'Играть'),
      ], { onClose: () => { if (!started) resolve(false); } });
    });
    seen.push(id); store.commit();
    if (!go) return;
  }
  if (g.energy) store.spendEnergy(g.energy);

  gameOpen = true;
  hold(true); // большие окна (новый уровень и т.п.) подождут конца партии
  const layer = h('div#game-layer');
  app.append(layer);
  let cleanup = null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try { cleanup && cleanup(); } catch (e) { console.error(e); }
    layer.remove();
    gameOpen = false;
    renderHud();
    refresh();
  };
  const ctx = {
    store,
    finish(reward = {}, title = 'Награда') {
      (state.stats.plays ||= {})[id] = (state.stats.plays[id] || 0) + 1;
      store.applyReward(reward);
      close();
      // опыт за партию; если пришёл новый уровень — он и подарок за него в ТОМ ЖЕ окне итогов
      const lv = gainXP(10 + Object.values(reward.items || {}).reduce((a, b) => a + b, 0) * 2, { x: innerWidth / 2, y: innerHeight * 0.3 }, { merge: true });
      let shown = reward;
      if (lv) {
        shown = { ...reward, items: { ...(reward.items || {}) } };
        shown.energy = (reward.energy || 0) + lv.reward.energy;
        shown.keys = (reward.keys || 0) + lv.reward.keys;
        shown.letters = (typeof reward.letters === 'string' ? reward.letters : '') + lv.reward.letters;
        for (const [k, n] of Object.entries(lv.reward.items)) shown.items[k] = (shown.items[k] || 0) + n;
      }
      showReward(title, shown, null, lv ? { level: lv.level } : {});
      // каждые CHEST_EVERY партий — сундук
      state.progress.playCount = (state.progress.playCount || 0) + 1;
      if (state.progress.playCount % CHEST_EVERY === 0) {
        const r = chestReward('silver');
        store.applyReward(r);
        openChest(`Сундук за ${CHEST_EVERY} игр!`, 'silver', r, () => refresh());
      }
      store.commit();
      hold(false);
    },
    exit: () => { close(); hold(false); },
  };
  try {
    cleanup = mod.mount(layer, ctx);
  } catch (e) {
    console.error(e);
    toast('Ошибка в игре: ' + e.message);
    if (g.energy) store.addEnergy(g.energy);
    close();
  }
}

// Отладка из консоли
window.game = { store, openGame };

setupDevice();
syncLetters();
app.replaceChildren(h('div.splash', h('div.splash-logo', h('span.ltr.ltr-big', 'А')), h('div.splash-text', 'Раскладываем буквы…')));
loadDict().then(boot);
