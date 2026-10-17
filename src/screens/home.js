// Квартира: комнаты, расстановка предметов. Комнаты открываются словами в Эрудите.

import { h, toast, modal } from '../ui/common.js';
import { state, commit, addItem, removeItem, canSpell } from '../state.js';
import { ROOMS, getItem, placeOf, RARITY, CATEGORIES } from '../data/items.js';
import { avatarSVG } from '../ui/avatar.js';
import { gainXP } from '../progression.js';

const WALL_SLOTS = 5;
const FLOOR_COLS = 5;
const FLOOR_ROWS = 4;

let currentRoom = 'studio';

export function roomCozy(roomId) {
  const cells = state.rooms[roomId]?.cells || {};
  return Object.values(cells).reduce((s, id) => s + RARITY[getItem(id).rarity].burn, 0);
}

export function renderHome(root, nav) {
  // открытые комнаты + одна следующая закрытая (остальные пока не показываем, чтобы не перегружать)
  const nextLocked = ROOMS.find((r) => !state.rooms[r.id]);
  const visible = ROOMS.filter((r) => state.rooms[r.id] || r === nextLocked);
  if (!visible.some((r) => r.id === currentRoom)) currentRoom = 'studio';
  const room = ROOMS.find((r) => r.id === currentRoom);
  const unlocked = !!state.rooms[room.id];
  const tabs = h('div.hm-tabs', visible.map((r) => {
    const open = !!state.rooms[r.id];
    return h('button.hm-tab' + (r.id === currentRoom ? '.on' : '') + (open ? '' : '.locked'),
      { onclick: () => { currentRoom = r.id; renderHome(root, nav); } },
      open ? r.name : '🔒 ' + r.name);
  }));

  root.replaceChildren(h('div.screen.hm-screen',
    tabs,
    unlocked ? roomView(room, root, nav) : lockedView(room, nav),
  ));
  // прокрутить к активной вкладке
  requestAnimationFrame(() => tabs.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
}

function roomView(room, root, nav) {
  const cells = state.rooms[room.id].cells;
  const rerender = () => renderHome(root, nav);

  const slot = (key, place) => {
    const id = cells[key];
    const el = h('button.hm-cell.hm-' + place + (id ? '.filled' : ''), {
      onclick: () => (id ? placedMenu(room.id, key, rerender) : pickItem(room.id, key, place, rerender, nav)),
    }, id ? h('span.hm-emoji', getItem(id).emoji) : h('span.hm-plus', '+'));
    return el;
  };

  const wall = h('div.hm-wall', { style: { background: room.bg } },
    h('div.hm-wallrow', Array.from({ length: WALL_SLOTS }, (_, i) => slot('w' + i, 'wall'))),
  );
  const floor = h('div.hm-floor', { style: { '--floor': room.floor } },
    Array.from({ length: FLOOR_COLS * FLOOR_ROWS }, (_, i) => slot('f' + i, 'floor')),
  );

  const placed = Object.keys(cells).length;
  return h('div.stack',
    h('div.hm-room' + (placed === 0 ? '.hm-empty' : ''), wall, floor, h('div.hm-me', { html: avatarSVG(state.profile, { bg: false }) })),
    h('div.hm-info', `💖 ${roomCozy(room.id)}`),
  );
}

function lockedView(room, nav) {
  const have = canSpell(room.word);
  // какие буквы слова уже есть (с учётом повторов)
  const pool = { ...state.letters };
  const tiles = [...room.word].map((ch) => {
    const ok = (pool[ch] || 0) > 0;
    if (ok) pool[ch]--;
    return h('span.tile' + (ok ? '' : '.hm-missing'), ch);
  });
  return h('div.card.stack.center.hm-locked',
    h('div.hm-lock', '🔒'),
    h('div.letters-row', tiles),
    have
      ? h('button.btn.btn-violet', { onclick: () => nav.openGame('erudite') }, '✍️ Собрать слово')
      : h('button.btn.btn-orange', { onclick: () => nav.openGame('shooter') }, '🎯 Добыть буквы'),
  );
}

function pickItem(roomId, key, place, rerender, nav) {
  const owned = Object.entries(state.items)
    .filter(([id]) => placeOf(id) === place)
    .map(([id, n]) => ({ it: getItem(id), n }));
  let m;
  const list = owned.length
    ? h('div.hm-pick', owned.map(({ it, n }) => h('button.hm-pick-item', {
      style: { '--rar': RARITY[it.rarity].color },
      onclick: () => {
        if (!removeItem(it.id)) return;
        state.rooms[roomId].cells[key] = it.id;
        commit(); m.close(); rerender();
        gainXP(3 + RARITY[it.rarity].burn, { x: innerWidth / 2, y: innerHeight * 0.4 });
      },
    }, h('span.hm-pick-emoji', it.emoji), h('span.small', it.word.toLowerCase()), n > 1 ? h('span.hm-pick-n', n) : null)))
    : h('p.muted.center', place === 'wall' ? 'Пока нечего повесить 🖼️' : 'Пока нечего поставить 🛋️');
  m = modal([
    h('div.modal-title', place === 'wall' ? '🖼️ На стену' : '🛋️ Поставить'),
    list,
    !owned.length ? h('button.btn', { onclick: () => { m.close(); nav.go('games'); } }, 'К играм') : null,
  ]);
}

function placedMenu(roomId, key, rerender) {
  const id = state.rooms[roomId].cells[key];
  const it = getItem(id);
  const m = modal([
    h('div.hm-big', it.emoji),
    h('div.modal-title', it.word[0] + it.word.slice(1).toLowerCase()),
    h('div.small.muted.center', `${CATEGORIES[it.cat].name} · ${RARITY[it.rarity].name}`),
    h('button.btn.btn-ghost', {
      onclick: () => {
        delete state.rooms[roomId].cells[key];
        addItem(id); m.close(); rerender(); toast('Вернулось в сумку');
      },
    }, 'Убрать в сумку'),
  ]);
}
