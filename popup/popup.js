// ── Pomodoro Focus — Popup JS v2 ─────────────────────────────────────────────

const CIRCUMFERENCE = 2 * Math.PI * 96;

const app            = document.getElementById('app');
const timeDisplay    = document.getElementById('timeDisplay');
const phaseLabel     = document.getElementById('phaseLabel');
const ringProgress   = document.getElementById('ringProgress');
const playPauseBtn   = document.getElementById('playPauseBtn');
const playIcon       = document.getElementById('playIcon');
const pauseIcon      = document.getElementById('pauseIcon');
const resetBtn       = document.getElementById('resetBtn');
const skipBtn        = document.getElementById('skipBtn');
const sessionDots    = document.getElementById('sessionDots');
const sessionLabel   = document.getElementById('sessionLabel');
const completedCount = document.getElementById('completedCount');
const focusTime      = document.getElementById('focusTime');
const currentStreak  = document.getElementById('currentStreak');
const themeToggle    = document.getElementById('themeToggle');
const themeIcon      = document.getElementById('themeIcon');
const settingsBtn    = document.getElementById('settingsBtn');
const dashboardBtn   = document.getElementById('dashboardBtn');
const phaseTabs      = document.querySelectorAll('.phase-tab');
const taskLabel      = document.getElementById('taskLabel');
const labelRow       = document.getElementById('labelRow');

let port = null;
let currentState = null;
let theme = localStorage.getItem('pomo-theme') || 'dark';

// ── Theme ──────────────────────────────────────────────────────────────────────

function applyTheme(t) {
  theme = t;
  app.dataset.theme = t;
  localStorage.setItem('pomo-theme', t);
  if (t === 'dark') {
    themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  } else {
    themeIcon.innerHTML = `
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  }
}

themeToggle.addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));
applyTheme(theme);

// ── Phase label map ────────────────────────────────────────────────────────────

const PHASE_LABELS = {
  work: 'Focus Session',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
};

// ── Format time ────────────────────────────────────────────────────────────────

function fmt(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Render state ───────────────────────────────────────────────────────────────

function render(state) {
  currentState = state;
  const { phase, timeLeft, totalTime, isRunning, sessionCount, completedToday, settings, currentLabel } = state;
  const interval = settings?.longBreakInterval || 4;

  // Time & phase
  timeDisplay.textContent = fmt(timeLeft);
  phaseLabel.textContent  = PHASE_LABELS[phase];
  app.dataset.phase       = phase;
  document.title          = `${fmt(timeLeft)} — Pomodoro Focus`;

  // Ring
  const progress = totalTime > 0 ? timeLeft / totalTime : 1;
  ringProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  ringProgress.setAttribute('stroke-dasharray', CIRCUMFERENCE);

  const strokeColor = { work: '#d4604f', shortBreak: '#3dbfaa', longBreak: '#8b66d4' }[phase];
  ringProgress.style.stroke = strokeColor;

  // Play/pause
  if (isRunning) {
    playIcon.style.display  = 'none';
    pauseIcon.style.display = '';
    app.classList.add('running');
  } else {
    playIcon.style.display  = '';
    pauseIcon.style.display = 'none';
    app.classList.remove('running');
  }

  // Label row — only show during work phase, disable editing during break
  if (phase === 'work') {
    labelRow.style.display = '';
    // Sync label input if it differs (e.g. on first load)
    if (taskLabel.value !== (currentLabel || '')) {
      taskLabel.value = currentLabel || '';
    }
    taskLabel.disabled = false;
  } else {
    labelRow.style.display = 'none';
    taskLabel.disabled = true;
  }

  // Session dots
  sessionDots.innerHTML = '';
  for (let i = 0; i < interval; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i < sessionCount ? ' filled' : '');
    sessionDots.appendChild(dot);
  }
  sessionLabel.textContent = `${sessionCount} / ${interval} to long break`;

  // Stats
  completedCount.textContent = completedToday;
  focusTime.textContent      = `${completedToday * (settings?.workDuration || 25)}m`;
  currentStreak.textContent  = completedToday > 0 ? `x${completedToday}` : '—';

  // Active tab highlight
  phaseTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.phase === phase);
  });
}

// ── Port connection ────────────────────────────────────────────────────────────

function connect() {
  port = browser.runtime.connect({ name: 'popup' });
  port.onMessage.addListener((msg) => {
    if (msg.type === 'STATE') render(msg.data);
  });
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, 1000);
  });
}

connect();

// ── Task label ─────────────────────────────────────────────────────────────────

let labelDebounce = null;
taskLabel.addEventListener('input', () => {
  clearTimeout(labelDebounce);
  labelDebounce = setTimeout(() => {
    if (!port) return;
    port.postMessage({ type: 'SET_LABEL', label: taskLabel.value.trim() });
  }, 400);
});

taskLabel.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') { e.preventDefault(); playPauseBtn.focus(); }
});

// ── Controls ───────────────────────────────────────────────────────────────────

playPauseBtn.addEventListener('click', () => {
  if (!port) return;
  port.postMessage({ type: currentState?.isRunning ? 'PAUSE' : 'START' });
  playPauseBtn.style.transform = 'scale(0.92)';
  setTimeout(() => { playPauseBtn.style.transform = ''; }, 150);
});

resetBtn.addEventListener('click', () => port?.postMessage({ type: 'RESET' }));
skipBtn.addEventListener('click',  () => port?.postMessage({ type: 'SKIP'  }));

phaseTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    port?.postMessage({ type: 'SET_PHASE', phase: tab.dataset.phase });
  });
});

settingsBtn.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
  window.close();
});

dashboardBtn.addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('dashboard/dashboard.html') });
  window.close();
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.target === taskLabel) return; // don't fire shortcuts when typing label
  if (e.code === 'Space') { e.preventDefault(); playPauseBtn.click(); }
  if (e.code === 'KeyR')  resetBtn.click();
  if (e.code === 'KeyS')  skipBtn.click();
});
