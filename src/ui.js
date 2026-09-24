// Menu system wiring (main, level select, options, pause, death, results).
import { LEVELS } from './levels.js';
import { DIFFICULTIES } from './game.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.stack = [];
    this.current = null;
    document.querySelectorAll('#ui button[data-act]').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); this.act(b.dataset.act, b); });
      b.addEventListener('mouseenter', () => this.game.audio.play('hitmarker', { vol: 0.5 }));
    });
    this.bindOptions();
    this.updateDifficulty();
    // clicking the canvas while playing re-captures the mouse
    game.canvas.addEventListener('click', () => { if (game.state === 'playing' && !game.input.locked) game.input.lock(); });
  }

  show(name, push = false) {
    if (push && this.current) this.stack.push(this.current);
    else if (!push) this.stack = [];
    document.querySelectorAll('.menu').forEach((m) => m.classList.remove('show'));
    const el = $('menu-' + name);
    if (el) el.classList.add('show');
    this.current = name;
    if (name === 'levels') this.buildLevels();
    if (name === 'options') this.syncOptions();
  }

  hideAll() {
    document.querySelectorAll('.menu').forEach((m) => m.classList.remove('show'));
    this.current = null; this.stack = [];
  }

  back() {
    const prev = this.stack.pop();
    if (prev) { const s = this.stack; this.show(prev); this.stack = s; } else this.show('main');
  }

  async act(a, btn) {
    const g = this.game;
    // request pointer lock synchronously while we still hold the click's user activation
    if (['new', 'level', 'resume', 'restart', 'respawn', 'next'].includes(a)) g.input.lock();
    await g.ensureAudio();
    switch (a) {
      case 'new': g.newGame(0); break;
      case 'levels': this.show('levels', true); break;
      case 'level': g.newGame(Number(btn.dataset.level)); break;
      case 'difficulty':
        g.settings.difficulty = (g.settings.difficulty + 1) % DIFFICULTIES.length;
        g.saveSettings(); this.updateDifficulty();
        break;
      case 'options': this.show('options', true); break;
      case 'controls': this.show('controls', true); break;
      case 'back': this.back(); break;
      case 'resume': g.resume(); break;
      case 'restart': g.respawn(); break;
      case 'respawn': g.respawn(); break;
      case 'quit': g.quitToMenu(); break;
      case 'next': g.nextLevel(); break;
    }
  }

  updateDifficulty() {
    $('diff-label').textContent = DIFFICULTIES[this.game.settings.difficulty].name;
  }

  buildLevels() {
    const list = $('level-list');
    list.innerHTML = '';
    const unlocked = this.game.progress.unlocked || 1;
    LEVELS.forEach((L, i) => {
      const b = document.createElement('button');
      b.innerHTML = `${i + 1}. ${L.name}<small>${i < unlocked ? L.subtitle : 'Locked — finish the previous level'}</small>`;
      b.disabled = i >= unlocked;
      b.dataset.act = 'level'; b.dataset.level = i;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.act('level', b); });
      list.appendChild(b);
    });
  }

  bindOptions() {
    const g = this.game;
    const bind = (id, key, fmt = (v) => v, parse = Number) => {
      const el = $(id), out = $(id + '-v');
      el.addEventListener('input', () => {
        g.settings[key] = parse(el.value);
        if (out) out.textContent = fmt(g.settings[key]);
        g.saveSettings(); g.applyQuality();
      });
    };
    bind('opt-sens', 'sensitivity', (v) => v.toFixed(2));
    bind('opt-fov', 'fov', (v) => v + '°');
    bind('opt-vol', 'volume', (v) => Math.round(v * 100) + '%');
    bind('opt-music', 'music', (v) => Math.round(v * 100) + '%');
    $('opt-quality').addEventListener('change', (e) => { g.settings.quality = e.target.value; g.saveSettings(); g.applyQuality(); });
    $('opt-invert').addEventListener('change', (e) => { g.settings.invertY = e.target.checked; g.saveSettings(); });
    $('opt-fps').addEventListener('change', (e) => { g.settings.showFps = e.target.checked; g.saveSettings(); g.applyQuality(); });
  }

  syncOptions() {
    const s = this.game.settings;
    const set = (id, v, txt) => { $(id).value = v; const o = $(id + '-v'); if (o) o.textContent = txt; };
    set('opt-sens', s.sensitivity, s.sensitivity.toFixed(2));
    set('opt-fov', s.fov, s.fov + '°');
    set('opt-vol', s.volume, Math.round(s.volume * 100) + '%');
    set('opt-music', s.music, Math.round(s.music * 100) + '%');
    $('opt-quality').value = s.quality;
    $('opt-invert').checked = s.invertY;
    $('opt-fps').checked = s.showFps;
  }

  statRows(el, rows) {
    el.innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  }

  showComplete(stats, level, hasNext) {
    $('complete-title').textContent = `${level.name} — Complete`;
    const m = Math.floor(stats.time / 60), s = Math.floor(stats.time % 60);
    this.statRows($('complete-stats'), [
      ['Kills', `${stats.kills} / ${stats.total}`],
      ['Time', `${m}:${String(s).padStart(2, '0')}`],
      ['Score', stats.score],
      ['Difficulty', DIFFICULTIES[this.game.settings.difficulty].name],
    ]);
    $('btn-next').textContent = hasNext ? `Continue: ${LEVELS[this.game.levelIndex + 1].name}` : 'Finish';
    this.show('complete');
  }

  showVictory(stats) {
    this.statRows($('victory-stats'), [
      ['Final score', stats.score],
      ['Difficulty', DIFFICULTIES[this.game.settings.difficulty].name],
    ]);
    this.show('victory');
  }
}
