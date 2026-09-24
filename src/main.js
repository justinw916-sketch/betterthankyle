// Entry point: boot the game, wire the UI and expose a debug handle for tests.
import { Game } from './game.js';
import { UI } from './ui.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;
window.__game = game;

const text = document.getElementById('loading-text');
game.init((msg) => { text.textContent = msg; }).then(() => {
  ui.show('main');
}).catch((err) => {
  console.error(err);
  text.textContent = 'Failed to start: ' + err.message + ' (WebGL2 required)';
});
