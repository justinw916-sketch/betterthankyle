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
    // secret: click the SAM logo 5 times quickly to toggle invincibility
    const logo = document.querySelector('#menu-main .logo');
    let clicks = [];
    logo.addEventListener('click', () => {
      const now = performance.now();
      clicks = clicks.filter((t) => now - t < 2500);
      clicks.push(now);
      if (clicks.length >= 5) { clicks = []; this.game.toggleGodMode(); }
    });
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
    if (name === 'main') this.refreshContinue();
    if (name === 'pause') {
      const g = this.game, s = g.stats;
      const m = Math.floor(s.time / 60), sec = String(Math.floor(s.time % 60)).padStart(2, '0');
      const obj = g.objective ? g.objective().text : '';
      $('pause-info').innerHTML = `${$('hud-level').textContent} · ${m}:${sec} · Kills ${s.kills}/${s.total} · Secrets ${s.secrets}/${s.secretTotal}${obj ? `<br>Objective: ${obj}` : ''}`;
    }
    if (name === 'dead') {
      const r = this.game.arenaResult;
      $('dead-info').textContent = r ? `Reached wave ${r.wave} with ${r.score} points.${r.god ? ' (Invincibility on: records not saved.)' : r.isBest ? ' NEW BEST!' : ` Best: wave ${r.best.wave}.`}` : 'Even serious heroes fall. Get back in there.';
    }
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
    if (['new', 'continue', 'arena', 'level', 'resume', 'restart', 'respawn', 'next'].includes(a)) g.input.lock();
    await g.ensureAudio();
    switch (a) {
      case 'new': g.newGame(0); break;
      case 'continue': g.continueGame(); break;
      case 'arena': g.startArena(); break;
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

  refreshContinue() {
    const best = this.game.arenaBest;
    $('btn-arena').innerHTML = `Endless Arena<small>${best.wave ? `Best: wave ${best.wave} · ${best.score} pts` : 'Survive escalating waves'}</small>`;
    const btn = $('btn-continue');
    const s = this.game.savedRun;
    btn.hidden = !s;
    if (s) btn.innerHTML = `Continue<small>Level ${s.level + 1}: ${LEVELS[s.level].name}</small>`;
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
      const r = this.game.records[L.id];
      const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      const rec = r ? `<span class="rec">Best ${fmt(r.time)} · ${r.score} pts · ${r.kills}/${r.total} kills · ${r.secrets}/${r.secretTotal} secrets</span>` : '';
      b.innerHTML = `${i + 1}. ${L.name}<small>${i < unlocked ? L.subtitle : 'Locked — finish the previous level'}</small>${rec}`;
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
    $('opt-compass').addEventListener('change', (e) => { g.settings.showCompass = e.target.checked; g.saveSettings(); });
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
    $('opt-compass').checked = s.showCompass !== false;
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  statRows(el, rows) {
    el.innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  }

  showComplete(stats, level, hasNext) {
    $('complete-title').textContent = `${level.name} — Complete`;
    const m = Math.floor(stats.time / 60), s = Math.floor(stats.time % 60);
    this.statRows($('complete-stats'), [
      ['Kills', `${stats.kills} / ${stats.total}`],
      ['Secrets', `${stats.secrets} / ${stats.secretTotal}`],
      ['Best combo', stats.bestCombo || 0],
      ...(this.game.lastRecord?.newTime ? [['Personal best', 'NEW FASTEST TIME!']] : this.game.lastRecord?.newScore ? [['Personal best', 'NEW HIGH SCORE!']] : []),
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
