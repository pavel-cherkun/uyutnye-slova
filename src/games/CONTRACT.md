# Контракт мини-игры

Каждая игра — ES-модуль `src/games/<id>.js` без сборки и зависимостей (чистый JS в браузере).

```js
export const meta = {
  id: 'shooter',
  title: 'Блоки',
  emoji: '🎯',
  desc: 'Короткое описание для карточки в хабе',
  cost: { energy: 0 },     // сколько энергии списывает хаб перед стартом
  gives: 'буквы',          // что даёт (подпись на карточке)
};

/**
 * root — пустой div на весь экран (position:absolute; inset:0; flex column).
 * Верхнюю панель с кнопкой выхода игра рисует сама (можно классы .game-top, .game-title, .btn-icon).
 * Возвращает функцию очистки (снять слушатели, остановить requestAnimationFrame).
 */
export function mount(root, ctx) { ... return () => {}; }
```

`ctx`:
- `ctx.store` — весь модуль `src/state.js` (state, addItem, removeItem, itemCount, addLetters, spendLetters, canSpell, letterCount, spendEnergy, addCoins, spendKeys…).
- `ctx.finish(reward, title?)` — закончить игру: награда применяется, показывается окно наград, игрок возвращается в хаб.
  `reward = { items?: {id: n}, letters?: 'АБВ' | {А: 2}, energy?, coins?, keys? }`.
- `ctx.exit()` — выйти без награды (подтверждение выхода, если нужно, игра показывает сама).

Данные:
- `src/data/items.js` — `ITEMS` (id = слово, `emoji`, `cat`, `rarity` c/r/e), `getItem(id)`, `itemsByCat(cat)`, `CATEGORIES`.
- `src/data/letters.js` — `randomLetter()`, `LETTER_SCORE`, `normWord()`.
- `src/ui/common.js` — `h()`, `toast()`, `modal()`, `confetti()`, `shuffle()`, `pick()`.
- `src/style.css` — CSS-переменные (`--pink --violet --yellow --green --blue --orange --ink`), классы `.btn .btn-*`, `.tile`, `.chip`, `.card`.

Правила:
- Только мобильный портрет (ширина 320–480px, высота любая — используйте 100% от root, `dvh`, ResizeObserver).
- Управление: pointer events (палец), без hover.
- Стили игры кладутся в один `<style>` внутри root, все селекторы с префиксом игры (`.sh-…`, `.ho-…`, `.m3-…`).
- Ярко и пёстро: градиенты, «сочные» анимации, пружинки, частицы.
- Предметы — эмодзи из каталога. Язык интерфейса — русский, обращение на «вы» не нужно, коротко и дружелюбно.
