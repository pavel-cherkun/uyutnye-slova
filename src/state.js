// Состояние игрока и сохранение в localStorage.
// Все изменения идут через функции этого модуля: они сохраняют и оповещают подписчиков.
// Надёжность: запись сразу при сворачивании/закрытии вкладки, резервная копия раз в 30 секунд,
// при старте — просьба к браузеру не удалять данные (navigator.storage.persist).

import { normWord } from './data/letters.js';

const SAVE_KEY = 'rita-game-save';
const BACKUP_KEY = 'rita-game-save-backup';
const SAVE_VERSION = 1;

function defaultState() {
  return {
    version: SAVE_VERSION,
    created: false,
    profile: {
      name: '',
      gender: 'f',
      skin: 1,
      hair: 0,
      hairColor: 0,
      eyes: 0,
      outfit: 0,
      outfitColor: 0,
    },
    energy: 25,
    coins: 30,
    keys: 0,
    letters: {},          // { 'А': 3, ... }
    items: {},            // { 'ЯБЛОКО': 2, 'card:СЕКРЕТЕР': 1, 'ess:ЛЮБОВЬ': 1 }
    rooms: {
      studio: { cells: {} }, // открытые комнаты; cells: { 'w0': id, 'f3': id }
    },
    oven: { level: 1, burned: 0 },
    progress: {
      match3Level: 1,
      hiddenUnlocked: ['kitchen'],
      wordsMade: {},      // { 'СЛОВО': кол-во раз }
      solitaireLevel: 1,
      questsClaimed: [],
    },
    stats: { shooterBest: 0, plays: {} },
    settings: { fullscreen: true, sound: true, vibro: true },
    savedAt: 0,
  };
}

function migrate(s) {
  const d = defaultState();
  // неглубокое слияние: новые поля из дефолта, старые значения сохраняются
  const out = { ...d, ...s };
  for (const k of ['profile', 'oven', 'progress', 'stats', 'settings']) out[k] = { ...d[k], ...(s[k] || {}) };
  out.version = SAVE_VERSION;
  return out;
}

function load() {
  // основное сохранение, при поломке — резервная копия
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) {
      console.warn('Не удалось прочитать сохранение', key, e);
    }
  }
  return defaultState();
}

export const state = load();

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let saveTimer = null;
let dirty = false;
let lastBackup = 0;
let frozen = false; // после сброса/импорта больше ничего не пишем

export function saveNow() {
  clearTimeout(saveTimer);
  if (frozen || !dirty) return;
  dirty = false;
  state.savedAt = Date.now();
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(SAVE_KEY, json);
    if (state.savedAt - lastBackup > 30000) { localStorage.setItem(BACKUP_KEY, json); lastBackup = state.savedAt; }
  } catch (e) { console.warn('Не удалось сохранить', e); }
}

export function commit() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 150);
  for (const fn of listeners) fn(state);
}

// Сохранить сразу, когда приложение сворачивают или закрывают
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
// Попросить браузер не вычищать данные игры (особенно важно для Safari)
try { navigator.storage?.persist?.(); } catch { /* не поддерживается */ }

export function resetSave() {
  frozen = true;
  clearTimeout(saveTimer);
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(BACKUP_KEY);
  location.reload();
}

export function exportSave() {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

export function importSave(code) {
  const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  if (!data || typeof data !== 'object' || !data.profile) throw new Error('bad save');
  frozen = true;
  clearTimeout(saveTimer);
  localStorage.setItem(SAVE_KEY, JSON.stringify(migrate(data)));
  location.reload();
}

// ---------- Предметы ----------
export function itemCount(id) { return state.items[id] || 0; }

export function addItem(id, n = 1) {
  state.items[id] = (state.items[id] || 0) + n;
  commit();
}

export function removeItem(id, n = 1) {
  if ((state.items[id] || 0) < n) return false;
  state.items[id] -= n;
  if (state.items[id] <= 0) delete state.items[id];
  commit();
  return true;
}

// ---------- Буквы ----------
export function letterCount(ch) { return state.letters[ch] || 0; }

export function totalLetters() {
  return Object.values(state.letters).reduce((a, b) => a + b, 0);
}

/** letters: строка 'АБВ' или объект { 'А': 2 } */
export function addLetters(letters) {
  const map = typeof letters === 'string' ? countChars(normWord(letters)) : letters;
  for (const [ch, n] of Object.entries(map)) state.letters[ch] = (state.letters[ch] || 0) + n;
  commit();
}

export function canSpell(word) {
  const need = countChars(normWord(word));
  return Object.entries(need).every(([ch, n]) => (state.letters[ch] || 0) >= n);
}

export function spendLetters(word) {
  if (!canSpell(word)) return false;
  for (const [ch, n] of Object.entries(countChars(normWord(word)))) {
    state.letters[ch] -= n;
    if (state.letters[ch] <= 0) delete state.letters[ch];
  }
  commit();
  return true;
}

function countChars(str) {
  const m = {};
  for (const ch of str) m[ch] = (m[ch] || 0) + 1;
  return m;
}

// ---------- Валюты ----------
export const MAX_ENERGY = 100;

export function addEnergy(n) { state.energy = Math.min(MAX_ENERGY, state.energy + n); commit(); }
export function spendEnergy(n) {
  if (state.energy < n) return false;
  state.energy -= n; commit(); return true;
}
export function addCoins(n) { state.coins += n; commit(); }
export function spendCoins(n) {
  if (state.coins < n) return false;
  state.coins -= n; commit(); return true;
}
export function addKeys(n) { state.keys += n; commit(); }
export function spendKeys(n) {
  if (state.keys < n) return false;
  state.keys -= n; commit(); return true;
}

/**
 * Применить награду целиком.
 * reward: { items?: {id:n}, letters?: string|{ch:n}, energy?, coins?, keys? }
 */
export function applyReward(reward = {}) {
  if (reward.items) for (const [id, n] of Object.entries(reward.items)) state.items[id] = (state.items[id] || 0) + n;
  if (reward.letters) {
    const map = typeof reward.letters === 'string' ? countChars(normWord(reward.letters)) : reward.letters;
    for (const [ch, n] of Object.entries(map)) state.letters[ch] = (state.letters[ch] || 0) + n;
  }
  if (reward.energy) state.energy = Math.min(MAX_ENERGY, state.energy + reward.energy);
  if (reward.coins) state.coins += reward.coins;
  if (reward.keys) state.keys += reward.keys;
  commit();
}
