// Создание и редактирование персонажа + профиль (сохранение, сброс).

import { h, toast, modal, confirmDialog, confetti } from '../ui/common.js';
import { avatarSVG, SKINS, HAIR_COLORS, EYE_COLORS, OUTFIT_COLORS, HAIR_STYLES, OUTFITS, BEARDS } from '../ui/avatar.js';
import { state, commit, applyReward, exportSave, importSave, resetSave } from '../state.js';
import { randomLetter } from '../data/letters.js';

const STARTER = {
  letters: 'КОТЛУКСОНМИР',
  items: {
    ЯБЛОКО: 2, КОФЕ: 1, ЛУПА: 2, МОЛОТОК: 2, СТУЛ: 1, ЛАМПА: 1, ФИКУС: 1,
    // по паре карточек в двух категориях — чтобы пасьянс был доступен сразу
    'card:СТОЛ': 1, 'card:ПОЛКА': 1, 'card:ПИОН': 1, 'card:ЛИЛИЯ': 1,
  },
};

function editor(draft, onChange) {
  const preview = h('div.ch-preview');
  const paint = () => { preview.innerHTML = avatarSVG(draft); };
  paint();

  const set = (k, v) => { draft[k] = v; paint(); onChange && onChange(); rebuild(); };

  const body = h('div.stack');
  function rebuild() {
    body.replaceChildren(
      h('div.ch-gender',
        h('button.ch-g' + (draft.gender === 'f' ? '.on' : ''), { onclick: () => set('gender', 'f') }, '♀ Женщина'),
        h('button.ch-g' + (draft.gender === 'm' ? '.on' : ''), { onclick: () => set('gender', 'm') }, '♂ Мужчина'),
      ),
      stepper('Причёска', HAIR_STYLES, 'hair'),
      swatches('Цвет волос', HAIR_COLORS, 'hairColor'),
      swatches('Кожа', SKINS, 'skin'),
      swatches('Глаза', EYE_COLORS, 'eyes'),
      stepper('Одежда', OUTFITS, 'outfit'),
      swatches('Цвет одежды', OUTFIT_COLORS, 'outfitColor'),
      draft.gender === 'm' ? stepper('Борода', BEARDS, 'beard') : null,
      h('button.btn.btn-ghost', { onclick: randomize }, '🎲 Случайно'),
    );
  }
  function stepper(label, list, key) {
    const cur = draft[key] || 0;
    return h('div.ch-row',
      h('div.ch-label', label),
      h('div.ch-stepper',
        h('button.btn-icon', { onclick: () => set(key, (cur - 1 + list.length) % list.length) }, '◀'),
        h('div.ch-val', list[cur]),
        h('button.btn-icon', { onclick: () => set(key, (cur + 1) % list.length) }, '▶'),
      ),
    );
  }
  function swatches(label, list, key) {
    return h('div.ch-row',
      h('div.ch-label', label),
      h('div.ch-sw', list.map((c, i) => h('button.sw' + (draft[key] === i ? '.on' : ''), { style: { background: c }, onclick: () => set(key, i) }))),
    );
  }
  function randomize() {
    const r = (n) => Math.floor(Math.random() * n);
    Object.assign(draft, {
      hair: r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length), skin: r(SKINS.length),
      eyes: r(EYE_COLORS.length), outfit: r(OUTFITS.length), outfitColor: r(OUTFIT_COLORS.length), beard: r(BEARDS.length),
    });
    paint(); rebuild();
  }
  rebuild();
  return { preview, body };
}

export function renderCreate(root, done) {
  const draft = { ...state.profile };
  const { preview, body } = editor(draft);
  const name = h('input.ch-name', { placeholder: 'Как тебя зовут?', maxlength: 16, value: draft.name || '' });

  root.replaceChildren(h('div.screen.ch-screen',
    h('div.ch-hello', 'Привет! Давай знакомиться'),
    preview,
    name,
    h('div.card', body),
    h('button.btn.btn-big', {
      onclick: () => {
        const n = name.value.trim();
        if (!n) { toast('Напиши имя'); name.focus(); return; }
        draft.name = n;
        state.profile = draft;
        state.created = true;
        // Стартовый набор: немного букв и предметов, чтобы сразу было во что играть
        let extra = '';
        for (let i = 0; i < 14; i++) extra += randomLetter();
        applyReward({ ...STARTER, letters: STARTER.letters + extra });
        commit();
        confetti();
        done();
      },
    }, 'Начать игру ✨'),
  ));
}

export function renderProfile(root, refresh) {
  const draft = { ...state.profile };
  const { preview, body } = editor(draft);
  const name = h('input.ch-name', { maxlength: 16, value: draft.name });
  const words = Object.keys(state.progress.wordsMade).length;

  root.replaceChildren(h('div.screen.ch-screen',
    preview,
    name,
    h('div.card', body),
    h('button.btn.btn-big.btn-green', {
      onclick: () => {
        draft.name = name.value.trim() || state.profile.name;
        state.profile = draft; commit(); toast('Сохранено'); refresh();
      },
    }, 'Сохранить внешность'),
    h('div.card.stack',
      h('b', 'Статистика'),
      h('div.small', `Слов составлено: ${words} · Рекорд в Блоках: ${state.stats.shooterBest} · Уровень три в ряд: ${state.progress.match3Level}`),
    ),
    h('div.card.stack',
      h('b', 'Сохранение'),
      h('div.small.muted', 'Прогресс хранится в этом браузере. Чтобы перенести на другое устройство — скопируй код и вставь там.'),
      h('div.row',
        h('button.btn.btn-violet.btn-sm', { onclick: showExport }, 'Код сохранения'),
        h('button.btn.btn-violet.btn-sm', { onclick: showImport }, 'Загрузить код'),
      ),
      h('button.btn.btn-ghost.btn-sm', {
        onclick: async () => { if (await confirmDialog('Удалить весь прогресс и начать заново?', 'Удалить')) resetSave(); },
      }, 'Начать заново'),
    ),
  ));
}

function showExport() {
  const code = exportSave();
  const ta = h('textarea.ch-code', { readonly: true }, code);
  const m = modal([
    h('div.modal-title', 'Код сохранения'), ta,
    h('button.btn', {
      onclick: async () => {
        try { await navigator.clipboard.writeText(code); toast('Скопировано'); } catch { ta.select(); }
        m.close();
      },
    }, 'Скопировать'),
  ]);
}

function showImport() {
  const ta = h('textarea.ch-code', { placeholder: 'Вставь код сюда' });
  modal([
    h('div.modal-title', 'Загрузить сохранение'), ta,
    h('button.btn', {
      onclick: () => { try { importSave(ta.value); } catch { toast('Код не подходит'); } },
    }, 'Загрузить'),
  ]);
}
