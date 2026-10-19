// «Мир» — вкладка путешествий питомца (вместо заказов). Места открываются словом из букв,
// поездка идёт по таймеру, из каждой — добыча и открытка. Открытку можно поставить фоном дома.

import { h, toast, modal } from '../ui/common.js';
import { state, commit } from '../state.js';
import { DESTS, destById, sceneSVG } from '../data/travel.js';
import { spellModal, missingLetters } from '../ui/spell.js';
import { kindOf, g, petView, startTravel, travelDist, tick } from '../pet/core.js';
import { markWish } from '../pet/wishes.js';
import { wordTiles } from './pet.js';

let timer = null;
const fmtDur = (ms) => (ms >= 3600000 ? `${Math.round(ms / 3600000)} ч` : `${Math.round(ms / 60000)} мин`);
const fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const two = (x) => String(x).padStart(2, '0');
  return hh ? `${hh}ч : ${two(mm)}м : ${two(ss)}с` : `${two(mm)}м : ${two(ss)}с`;
};
const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} км`);

export function travelBadge() {
  const p = state.pet;
  return p?.walk && Date.now() >= p.walk.end ? 1 : 0;
}

export function renderTravel(root, nav) {
  clearInterval(timer); timer = null;
  const rerender = () => renderTravel(root, nav);
  const p = state.pet;
  let body;
  if (!p) {
    body = h('div.tr-stack',
      h('div.tr-hero', h('div.tr-title', h('b', 'Мир'), h('i', 'путешествий')), h('div.tr-lead', 'Сначала заведи питомца — он будет путешествовать и привозить находки')),
      h('button.tr-pill.big', { onclick: () => nav.go('pet') }, h('span', '🐾  Завести питомца'), h('span', '→')));
  } else {
    tick(p);
    body = view(p, rerender, nav);
  }
  root.replaceChildren(h('div.screen.tr-screen', h('style', CSS), body));
}

function view(p, rerender, nav) {
  const dests = (p.dests ||= []);
  const cards = p.cards || {};
  const away = p.walk ? destById(p.walk.id) : null;

  // шапка: где питомец сейчас
  const status = h('div.tr-now');
  if (away) {
    const done = Date.now() >= p.walk.end;
    const tEl = h('b', done ? 'уже дома' : fmtTime(p.walk.end - Date.now()));
    const dEl = h('b', fmtDist(travelDist(p.walk)));
    status.append(
      h('div.tr-stats', h('div', h('i', `${p.name} ${away.where}`), dEl), h('div', h('i', done ? 'Готово' : 'Вернётся через'), tEl)),
      h('button.tr-pill.lime', { onclick: () => nav.go('pet') }, h('span', done ? '🎁  Забрать добычу' : '🐾  К питомцу'), h('span', '→')),
    );
    if (!done) {
      timer = setInterval(() => {
        if (!status.isConnected || !p.walk) { clearInterval(timer); timer = null; return; }
        if (Date.now() >= p.walk.end) { rerender(); return; }
        tEl.textContent = fmtTime(p.walk.end - Date.now());
        dEl.textContent = fmtDist(travelDist(p.walk));
      }, 1000);
    }
  } else {
    status.append(h('div.tr-stats',
      h('div', h('i', 'Открыто мест'), h('b', `${DESTS.filter((d) => !d.word || dests.includes(d.id)).length}/${DESTS.length}`)),
      h('div', h('i', 'Открыток'), h('b', String(Object.values(cards).reduce((a, b) => a + b, 0)))),
      h('div', h('i', 'Пройдено'), h('b', fmtDist(p.meters || 0)))));
  }

  const hero = h('div.tr-hero',
    h('div.tr-title', h('b', 'Мир'), h('i', away ? 'питомец в пути' : `куда ${g(p, 'поедет', 'поедет')} ${p.name}?`)),
    status);

  // места
  const list = h('div.tr-list', DESTS.map((d) => {
    const open = !d.word || dests.includes(d.id);
    const lvlOk = p.level >= d.lvl;
    const card = h('button.tr-card' + (open ? '' : '.lock') + (away?.id === d.id ? '.here' : ''), {
      onclick: () => {
        if (!open) {
          const pic = h('div.tr-spell'); pic.innerHTML = sceneSVG(d.id, '', 'xMidYMid');
          spellModal({ word: d.word, title: d.name, icon: pic, sub: `Набери «${d.word}», чтобы открыть место`,
            onDone: () => { dests.push(d.id); commit(); rerender(); toast(`Открыто: ${d.name} ${d.icon}`); } });
          return;
        }
        if (away) { toast(away.id === d.id ? `${p.name} уже ${d.where}` : `${p.name} сейчас ${away.where}`); return; }
        if (!lvlOk) { toast(`Нужен ${d.lvl} уровень питомца`); return; }
        if (p.food < 20) { toast('Покорми перед дорогой'); nav.go('pet'); return; }
        startTravel(p, d.id);
        markWish(p, 'travel');
        toast(`${p.name} ${g(p, 'отправился', 'отправилась')} ${d.where}! ${d.icon}`);
        rerender();
      },
    });
    card.innerHTML = sceneSVG(d.id, 'tr-scene', 'xMidYMid');
    card.append(
      h('div.tr-card-top', h('span.tr-chip', fmtDur(d.ms)), !lvlOk ? h('span.tr-chip.dark', `ур. ${d.lvl}`) : null, cards[d.id] ? h('span.tr-chip.lime', `💌 ${cards[d.id]}`) : null),
      h('div.tr-card-b', h('b', d.name), open ? h('span.tr-go', away?.id === d.id ? 'в пути' : 'Отправить →') : wordTiles(d.word, missingLetters(d.word))),
    );
    return card;
  }));

  // открытки
  const visited = DESTS.filter((d) => cards[d.id]);
  const album = visited.length
    ? h('div.tr-album', [{ id: null, name: 'Дом' }, ...visited].map((d) => {
      const pc = h('button.tr-post' + ((p.scene || null) === d.id ? '.on' : ''), {
        onclick: () => (d.id ? postcard(p, d, rerender) : (p.scene = null, commit(), toast('Фон: дом'), rerender())),
      });
      pc.innerHTML = d.id ? sceneSVG(d.id, 'tr-scene') : '<div class="tr-home">🏠</div>';
      pc.append(h('span.tr-post-n', d.name));
      return pc;
    }))
    : h('div.tr-empty', 'Из поездки до конца питомец привезёт открытку — её можно поставить фоном дома');

  return h('div.tr-stack', hero, h('div.tr-cap', h('i', 'Места')), list, h('div.tr-cap', h('i', 'Открытки · фон дома')), album);
}

function postcard(p, d, rerender) {
  const big = h('div.tr-bigpost');
  big.innerHTML = sceneSVG(d.id, 'tr-scene');
  const v = petView(p, { still: true });
  big.append(v.el);
  const m = modal([
    big,
    h('div.modal-title', `${d.icon} ${d.name}`),
    h('div.center', `${p.name} ${g(p, 'был', 'была')} здесь ×${p.cards[d.id]}`),
    h('button.btn.btn-big', { onclick: () => { p.scene = d.id; commit(); m.close(); toast('Новый фон дома ✨'); } }, 'Поставить фоном дома'),
    h('button.btn.btn-ghost', { onclick: () => m.close() }, 'Закрыть'),
  ], { onClose: rerender });
}

const CSS = `
.tr-screen { padding-top: 8px; }
.tr-stack { display: flex; flex-direction: column; gap: 12px; }
.tr-hero { background: #0c0c0c; color: #fff; border-radius: 34px; padding: 22px 20px 20px; }
.tr-title b { display: block; font-family: var(--display); font-weight: 900; font-size: 56px; line-height: .95; letter-spacing: -2.5px; }
.tr-title i, .tr-stats i, .tr-cap i { font-family: var(--display); font-weight: 300; font-style: italic; }
.tr-title i { font-size: 26px; letter-spacing: -1px; }
.tr-lead { margin-top: 12px; font-weight: 700; opacity: .8; }
.tr-stats { display: flex; margin-top: 16px; border-top: 1.5px solid rgba(255,255,255,.35); }
.tr-stats > div { flex: 1; padding: 8px 10px 0; border-left: 1.5px solid rgba(255,255,255,.35); display: flex; flex-direction: column; min-width: 0; }
.tr-stats > div:first-child { border-left: 0; padding-left: 0; }
.tr-stats i { font-size: 12px; opacity: .85; }
.tr-stats b { font-family: var(--display); font-weight: 800; font-size: 24px; letter-spacing: -1px; white-space: nowrap; }
.tr-pill { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 16px; border: 0; border-radius: 99px; background: #fff; color: #111;
  padding: 15px 20px; font-weight: 900; font-size: 15px; cursor: pointer; }
.tr-pill.lime { background: #c8ff2e; }
.tr-pill.big { background: #111; color: #fff; padding: 18px 22px; font-size: 17px; margin-top: 0; }
.tr-cap { margin: 8px 4px 0; font-size: 16px; color: #444; }
.tr-list { display: flex; flex-direction: column; gap: 10px; }
.tr-card { position: relative; height: 150px; border: 0; padding: 0; border-radius: 28px; overflow: hidden; cursor: pointer; background: #111; color: #fff; text-align: left; box-shadow: inset 0 0 0 2px #111; }
.tr-card .tr-scene, .tr-post .tr-scene, .tr-bigpost .tr-scene, .tr-spell svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.tr-card.lock .tr-scene { filter: grayscale(.85) brightness(.55); }
.tr-card.here { box-shadow: inset 0 0 0 4px #c8ff2e; }
.tr-card-top { position: absolute; left: 12px; top: 12px; display: flex; gap: 6px; }
.tr-chip { background: #fff; color: #111; border-radius: 99px; padding: 4px 10px; font-weight: 900; font-size: 12px; }
.tr-chip.dark { background: #111; color: #fff; }
.tr-chip.lime { background: #c8ff2e; }
.tr-card-b { position: absolute; left: 0; right: 0; bottom: 0; padding: 30px 14px 12px; display: flex; align-items: flex-end; justify-content: space-between; gap: 8px;
  background: linear-gradient(transparent, rgba(0,0,0,.65)); }
.tr-card-b b { font-family: var(--display); font-weight: 900; font-size: 30px; letter-spacing: -1px; line-height: 1; }
.tr-go { background: #c8ff2e; color: #111; border-radius: 99px; padding: 7px 12px; font-weight: 900; font-size: 13px; white-space: nowrap; }
.tr-card .pt-price { font-size: 13px; margin: 0; }
.tr-album { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tr-post { position: relative; aspect-ratio: .8; border: 0; padding: 0; border-radius: 20px; overflow: hidden; background: #111; cursor: pointer; box-shadow: inset 0 0 0 2px #111; }
.tr-post.on { box-shadow: 0 0 0 3px #c8ff2e, inset 0 0 0 2px #111; }
.tr-post-n { position: absolute; left: 6px; bottom: 6px; background: #fff; color: #111; border-radius: 99px; padding: 3px 8px; font-weight: 900; font-size: 11px; }
.tr-home { position: absolute; inset: 0; display: grid; place-items: center; font-size: 40px; }
.tr-empty { text-align: center; font-weight: 800; color: var(--ink-soft); padding: 10px 14px 20px; }
.tr-bigpost { position: relative; height: 260px; border-radius: 24px; overflow: hidden; display: flex; justify-content: center; align-items: flex-end; margin-bottom: 8px; }
.tr-bigpost > .ll-wrap, .tr-bigpost > .ep { position: relative; width: 74%; }
.tr-spell { position: relative; width: 220px; height: 140px; border-radius: 20px; overflow: hidden; margin: 0 auto 10px; }
.sp-icon .tr-spell svg { width: 100%; height: 100%; }
`;
