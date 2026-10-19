// Питомец подсказывает в мини-играх: маленький питомец в углу с облачком реплики.

import { h } from './common.js';
import { state } from '../state.js';
import { petView } from '../pet/core.js';

// подсказки по играм — короткие, по одной за раз
export const GAME_TIPS = {
  shooter: ['Целься в блоки с редкими буквами!', 'Отскок от стены тоже попадает 😉', 'Буквы из Блоков — это валюта для всего'],
  erudite: ['Новые слова дают больше наград', 'Длинное слово — редкая вещь!', 'Названия мест открывают Поиск: ЛЕС, САД…'],
  hidden: ['Ищи сначала крупные вещи', 'Новые места открываются словами', 'Не тапай наугад — время дороже'],
  match3: ['Собирай по 4 — будет бустер', 'Сначала цель, потом всё остальное', 'Фишки — твои вещи из сумки'],
  solitaire: ['Сначала открывай закрытые стопки', 'Категория собрана — получишь вещь'],
  merge: ['Две одинаковые вещи — одна круче', 'Эссенция ✨ заряжает генератор'],
};

let cur = null;

/** Показать подсказку питомца. Возвращает функцию «закрыть». */
export function petTip(text, ms = 4200) {
  const p = state.pet;
  if (!p || p.walk) return () => {};
  cur?.remove();
  const ava = h('div.ptip-ava');
  const view = petView(p, { still: true });
  view.el.classList.add('ptip-pet');
  ava.append(view.el);
  const el = h('div.ptip', { onclick: () => close() }, ava, h('div.ptip-say', h('b', p.name), h('span', text)));
  document.body.append(el);
  cur = el;
  requestAnimationFrame(() => el.classList.add('on'));
  const t = setTimeout(close, ms);
  function close() { clearTimeout(t); el.classList.remove('on'); setTimeout(() => el.remove(), 300); if (cur === el) cur = null; }
  return close;
}

const CSS = `
.ptip { position: fixed; left: 10px; right: 10px; bottom: calc(14px + var(--safe-bottom, 0px)); z-index: 400; display: flex; align-items: flex-end; gap: 8px;
  transform: translateY(130%); transition: transform .35s cubic-bezier(.2,1.4,.4,1); pointer-events: auto; }
.ptip.on { transform: none; }
.ptip-ava { flex: none; width: 74px; height: 74px; border-radius: 50%; background: #111; box-shadow: 0 0 0 3px #c8ff2e; overflow: hidden; position: relative; }
.ptip-pet.ll-wrap { position: absolute; width: 150px; left: -22px; top: -6px; }
.ptip-pet.ep { position: absolute; inset: 0; display: grid; place-items: center; }
.ptip-pet .ep-e { font-size: 50px !important; }
.ptip-say { background: #fff; color: #111; border-radius: 20px 20px 20px 4px; padding: 9px 14px; box-shadow: 0 0 0 3px #111, 0 4px 0 3px #111;
  font-weight: 800; font-size: 15px; line-height: 1.25; margin-bottom: 10px; max-width: 280px; }
.ptip-say b { display: block; font-family: var(--display); font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: #7b6cff; }
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
