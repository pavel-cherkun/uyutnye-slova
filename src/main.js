// Точка входа: HUD, таббар, роутинг экранов и запуск мини-игр.

import * as store from './state.js';
import { state, subscribe, totalLetters } from './state.js';
import { h, toast, showReward, modal } from './ui/common.js';
import { avatarSVG } from './ui/avatar.js';
import { renderCreate, renderProfile } from './screens/character.js';
import { renderHome } from './screens/home.js';
import { renderBag } from './screens/bag.js';
import { renderOven } from './screens/oven.js';
import { renderGames, GAMES, gameIcon, flowNodes } from './screens/games.js';
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
  { id: 'home', icon: '🏠', label: 'Дом' },
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
  const vals = { energy: state.energy, keys: state.keys, letters: totalLetters() };
  const pill = (k, ic, title) => {
    const el = h('div.hud-pill', { title, 'data-k': k }, ic === 'L' ? h('span.ltr', 'А') : h('span.ic', ic), vals[k]);
    if (prevHud[k] != null && prevHud[k] !== vals[k]) el.classList.add('bump');
    return el;
  };
  const lv = levelInfo();
  hudEl.replaceChildren(
    h('button.hud-me', { onclick: () => go('me'), 'aria-label': 'Профиль' },
      h('span.hud-ava', { html: avatarSVG(state.profile, { bg: false }) }),
      h('span.hud-lvlbox',
        h('span.hud-lvltext', h('span', `УР. ${lv.lvl}`), h('span', `${lv.cur}/${lv.need} ⭐`)),
        h('span.hud-xp', h('i', { style: { width: Math.round((lv.cur / lv.need) * 100) + '%' } })),
      ),
    ),
    h('div.hud-res',
      pill('energy', '⚡', 'Энергия'),
      pill('keys', '🗝️', 'Ключи'),
      pill('letters', 'L', 'Буквы'),
    ),
  );
  prevHud = vals;
}

function renderTabs() {
  tabbarEl.replaceChildren(...TABS.map((t) =>
    h((t.play ? 'button.tab-play' : 'button.tab') + (t.id === current ? '.active' : '') + (t.play && current !== 'games' ? '.pulse' : ''),
      { onclick: () => go(t.id), 'data-tab': t.id },
      h('span.ic', t.icon), t.label,
      t.id === 'orders' && readyOrders() ? h('span.tab-badge', readyOrders()) : null,
      t.play && dailyReady() ? h('span.tab-badge', '!') : null)));
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
