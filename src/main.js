// Точка входа: HUD, таббар, роутинг экранов и запуск мини-игр.

import * as store from './state.js';
import { state, subscribe, totalLetters } from './state.js';
import { h, toast, showReward, modal } from './ui/common.js';
import { avatarSVG } from './ui/avatar.js';
import { renderCreate, renderProfile } from './screens/character.js';
import { renderHome } from './screens/home.js';
import { renderBag } from './screens/bag.js';
import { renderOven } from './screens/oven.js';
import { renderGames, GAMES } from './screens/games.js';
import { loadDict } from './data/dict.js';
import { renderOrders, readyOrders } from './screens/orders.js';
import { setupDevice } from './ui/device.js';
import { maybeDailyGift, maybeIosHint } from './screens/settings.js';

const app = document.getElementById('app');
const TABS = [
  { id: 'home', icon: '🏠', label: 'Дом' },
  { id: 'games', icon: '🎮', label: 'Игры' },
  { id: 'bag', icon: '🎒', label: 'Сумка' },
  { id: 'oven', icon: '🔥', label: 'Печь' },
  { id: 'orders', icon: '📋', label: 'Заказы' },
];

let current = 'home';
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
  screenEl = h('div', { style: { display: 'contents' } });
  tabbarEl = h('div.tabbar');
  app.replaceChildren(hudEl, screenEl, tabbarEl);
  renderHud();
  renderTabs();
  refresh();
  setTimeout(() => { if (!maybeDailyGift(maybeIosHint)) maybeIosHint(); }, 400);
}

let prevHud = {};
function renderHud() {
  if (!hudEl) return;
  const vals = { energy: state.energy, coins: state.coins, keys: state.keys, letters: totalLetters() };
  const pill = (k, ic, title) => {
    const el = h('div.hud-pill', { title }, h('span.ic', ic), vals[k]);
    if (prevHud[k] != null && prevHud[k] !== vals[k]) el.classList.add('bump');
    return el;
  };
  hudEl.replaceChildren(
    h('button.hud-avatar', { style: { border: 0, padding: 0 }, onclick: () => go('me'), html: avatarSVG(state.profile) }),
    pill('energy', '⚡', 'Энергия'),
    pill('coins', '🪙', 'Монеты'),
    pill('keys', '🗝️', 'Ключи'),
    pill('letters', '🔤', 'Буквы'),
    h('div.hud-spacer'),
    h('button.btn-icon.hud-gear', { onclick: () => go('me'), 'aria-label': 'Настройки' }, '⚙️'),
  );
  prevHud = vals;
}

function renderTabs() {
  tabbarEl.replaceChildren(...TABS.map((t) =>
    h('button.tab' + (t.id === current ? '.active' : ''), { onclick: () => go(t.id) },
      h('span.ic', t.icon), t.label,
      t.id === 'orders' && readyOrders() ? h('span.tab-badge', readyOrders()) : null)));
}

function go(id) {
  current = id;
  renderTabs();
  refresh();
}

function refresh() {
  if (!screenEl) return;
  const scroll = screenEl.querySelector('.screen')?.scrollTop || 0;
  const r = { home: renderHome, games: renderGames, bag: renderBag, oven: renderOven, orders: renderOrders, me: renderProfile }[current];
  r(screenEl, current === 'me' ? () => { renderHud(); refresh(); } : nav);
  const sc = screenEl.querySelector('.screen');
  if (sc) sc.scrollTop = scroll;
}

subscribe(() => { if (!gameOpen) { renderHud(); if (tabbarEl) renderTabs(); } });

async function openGame(id) {
  const g = GAMES.find((x) => x.id === id);
  if (!g || gameOpen) return;
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
        h('div.hm-big', g.emoji),
        h('div.modal-title', g.title),
        h('div.tip-list', g.tip.map((t) => h('div.tip-row', t))),
        h('div.small.center.muted', `берёт: ${g.takes} · даёт: ${g.gives}`),
        h('button.btn.btn-big', { onclick: () => { started = true; m.close(); resolve(true); } }, 'Играть!'),
      ], { onClose: () => { if (!started) resolve(false); } });
    });
    seen.push(id); store.commit();
    if (!go) return;
  }
  if (g.energy) store.spendEnergy(g.energy);

  gameOpen = true;
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
      showReward(title, reward);
    },
    exit: close,
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
app.replaceChildren(h('div.splash', h('div.splash-logo', '🔤'), h('div.splash-text', 'Раскладываем буквы…')));
loadDict().then(boot);
