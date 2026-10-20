// Настройки, установка на экран, ежедневный подарок.

import { h, toast, modal, confetti, showReward } from '../ui/common.js';
import { state, commit, applyReward } from '../state.js';
import { randomLetter } from '../data/letters.js';
import {
  isIOS, isStandalone, canFullscreen, enterFullscreen, exitFullscreen, canInstall, install,
} from '../ui/device.js';

function toggle(label, key, onChange) {
  const on = !!state.settings[key];
  return h('button.st-row', {
    onclick: () => { state.settings[key] = !on; commit(); onChange && onChange(!on); },
  }, h('span', label), h('span.st-sw' + (on ? '.on' : ''), h('span.st-knob')));
}

export function settingsCard(rerender) {
  const standalone = isStandalone();
  return h('div.card.stack',
    h('b', '⚙️ Настройки'),
    standalone
      ? h('div.small.muted', '📱 Игра запущена как приложение — на весь экран.')
      : canFullscreen
        ? toggle('Полный экран', 'fullscreen', (on) => { on ? enterFullscreen() : exitFullscreen(); rerender(); })
        : null,
    toggle('Звуки', 'sound', rerender),
    toggle('Вибрация', 'vibro', rerender),
    !standalone ? installBlock() : null,
  );
}

function installBlock() {
  if (canInstall()) {
    return h('button.btn.btn-violet.btn-sm', {
      onclick: async () => { if (await install()) toast('Игра на экране «Домой» 🎉'); },
    }, '📲 Установить на экран «Домой»');
  }
  if (isIOS && !canFullscreen) {
    return h('div.st-hint',
      h('b', '📲 Как играть на весь экран на iPhone'),
      h('div', 'Нажми «Поделиться» ⬆️ внизу Safari → «На экран „Домой“». Игра откроется как приложение, без адресной строки, и прогресс будет храниться надёжнее.'),
    );
  }
  return null;
}

/** Одноразовая подсказка про установку на iPhone (там полноэкранного режима в браузере нет) */
export function maybeIosHint() {
  if (!isIOS || canFullscreen || isStandalone() || state.progress.iosHintShown) return;
  state.progress.iosHintShown = true;
  commit();
  const m = modal([
    h('div.hm-big', '📲'),
    h('div.modal-title', 'Играть на весь экран'),
    h('div.center', 'На iPhone игра открывается на весь экран, если добавить её на экран «Домой»: «Поделиться» ⬆️ → «На экран „Домой“».'),
    h('button.btn.btn-big', { onclick: () => m.close() }, 'Понятно'),
  ]);
}

// ---------- Ежедневный подарок ----------
const today = () => new Date().toLocaleDateString('sv'); // ГГГГ-ММ-ДД по местному времени

export function maybeDailyGift(onDone) {
  const p = state.progress;
  const d = today();
  if (p.lastGift === d) return false;
  if (!p.lastGift && p.createdOn === d) return false; // первый день: без подарка, чтобы не перегружать
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('sv');
  p.giftStreak = p.lastGift === yesterday ? Math.min(7, (p.giftStreak || 0) + 1) : 1;
  p.lastGift = d;
  const day = p.giftStreak;
  let letters = '';
  for (let i = 0; i < 6 + day; i++) letters += randomLetter();
  const reward = { energy: 6 + day, letters };
  if (day === 7) reward.keys = 1;
  applyReward(reward);
  commit();
  confetti();
  showReward(`Подарок дня · день ${day} из 7`, reward, onDone);
  return true;
}
