// Всё, что касается телефона: полный экран, установка на экран «Домой», звуки, вибрация, кнопка «Назад».

import { state } from '../state.js';

const root = document.documentElement;
const ua = navigator.userAgent;
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Запущено как приложение с экрана «Домой» (там браузерных панелей и так нет) */
export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches
    || navigator.standalone === true;
}

export const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen);
export const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

export async function enterFullscreen() {
  if (!canFullscreen || isFullscreen()) return;
  try {
    await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen());
    await screen.orientation?.lock?.('portrait').catch(() => {});
  } catch { /* браузер отказал — не страшно */ }
}

export function exitFullscreen() {
  if (!isFullscreen()) return;
  (document.exitFullscreen || document.webkitExitFullscreen).call(document);
}

// Полный экран можно включить только по жесту пользователя — делаем это на первом тапе.
function autoFullscreen() {
  if (state.settings.fullscreen && state.created && !isStandalone() && !isFullscreen()) enterFullscreen();
}

// ---------- Установка (Android/Chrome) ----------
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });
export const canInstall = () => !!installEvent;
export async function install() {
  if (!installEvent) return false;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  return outcome === 'accepted';
}

// ---------- Звуки (синтез, без файлов) ----------
let ctx = null;
function audio() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', vol = 0.12, slide = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SOUNDS = {
  tap: () => tone(660, 0, 0.06, { type: 'triangle', vol: 0.05 }),
  coin: () => { tone(988, 0, 0.08, { type: 'square', vol: 0.05 }); tone(1319, 0.07, 0.14, { type: 'square', vol: 0.05 }); },
  reward: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.18, { type: 'triangle', vol: 0.09 })),
  win: () => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.06, 0.12, { type: 'sine', vol: 0.07 })),
  error: () => tone(220, 0, 0.18, { type: 'sawtooth', vol: 0.05, slide: 0.7 }),
};

export function sfx(name) {
  if (!state.settings.sound) return;
  try { SOUNDS[name]?.(); } catch { /* без звука */ }
}

export function buzz(pattern = 8) {
  if (!state.settings.vibro || navigator.userActivation?.hasBeenActive === false) return;
  try { navigator.vibrate?.(pattern); } catch { /* нет вибрации */ }
}

// ---------- Кнопка «Назад» (Android) ----------
// Держим в истории одну «пустую» запись: «Назад» закрывает окно или выходит из мини-игры,
// а не закрывает всё приложение.
function setupBack() {
  history.pushState({ game: 1 }, '');
  addEventListener('popstate', () => {
    const modalBack = [...document.querySelectorAll('.modal-back')].pop();
    const gameExit = document.querySelector('#game-layer .game-top .btn-icon');
    if (modalBack) modalBack.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    else if (gameExit) gameExit.click();
    history.pushState({ game: 1 }, '');
  });
}

export function setupDevice() {
  // первый тап: звук «проснётся», полный экран включится
  document.addEventListener('pointerup', () => { audio(); autoFullscreen(); }, { capture: true });
  // звук и лёгкая вибрация на любую кнопку
  document.addEventListener('click', (e) => {
    if (e.target.closest('button:not(:disabled)')) { sfx('tap'); buzz(5); }
  }, { capture: true });
  setupBack();
}
