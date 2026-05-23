// ─── Pomodoro Focus — Background Script v2 ────────────────────────────────────

const DEFAULT_SETTINGS = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  autoStartBreaks: false,
  autoStartWork: false,
  soundEnabled: true,
  notificationsEnabled: true,
  volume: 70,
  blockEnabled: false,
  blocklist: [],
};

let state = {
  phase: 'work',
  timeLeft: DEFAULT_SETTINGS.workDuration * 60,
  totalTime: DEFAULT_SETTINGS.workDuration * 60,
  isRunning: false,
  sessionCount: 0,
  completedToday: 0,
  lastDate: new Date().toDateString(),
  currentLabel: '',
  sessionStartedAt: null,
  settings: { ...DEFAULT_SETTINGS },
};

let intervalId = null;
let popupPort = null;
let audioCtx = null;

// ─── Audio ────────────────────────────────────────────────────────────────────

function getAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
  return audioCtx;
}

function playChime(goingToBreak) {
  if (!state.settings.soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const vol = (state.settings.volume / 100) * 0.4;
    const freqs = goingToBreak ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.28;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.start(t);
      osc.stop(t + 0.95);
    });
  } catch (e) {
    console.warn('[Pomodoro] Sound error:', e);
  }
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function updateBadge() {
  if (!state.isRunning) {
    browser.browserAction.setBadgeText({ text: '' });
    return;
  }
  const mins = Math.ceil(state.timeLeft / 60).toString();
  const color = state.phase === 'work' ? '#d4604f' : state.phase === 'shortBreak' ? '#3dbfaa' : '#8b66d4';
  browser.browserAction.setBadgeText({ text: mins });
  browser.browserAction.setBadgeBackgroundColor({ color });
}

// ─── Notifications ────────────────────────────────────────────────────────────

function showNotification() {
  if (!state.settings.notificationsEnabled) return;
  const label = state.currentLabel ? `"${state.currentLabel}" complete.` : 'Focus session complete.';
  const map = {
    work:       { title: 'Focus Session Complete', body: `${label} Time for a break.` },
    shortBreak: { title: 'Break Over',             body: "Ready to focus? Let's get back to work." },
    longBreak:  { title: 'Long Break Over',        body: 'Refreshed? Time to dive back in.' },
  };
  const n = map[state.phase];
  browser.notifications.create(`pomo-${Date.now()}`, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('icons/icon-96.png'),
    title: n.title,
    message: n.body,
  });
}

browser.notifications.onClicked.addListener((id) => { browser.notifications.clear(id); });

// ─── Phase helpers ────────────────────────────────────────────────────────────

function getDuration(phase) {
  const s = state.settings;
  return { work: s.workDuration, shortBreak: s.shortBreakDuration, longBreak: s.longBreakDuration }[phase] * 60;
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

// ─── Session History ──────────────────────────────────────────────────────────

async function saveSessionRecord() {
  const record = {
    id: Date.now().toString(),
    date: todayISO(),
    startedAt: state.sessionStartedAt || Date.now(),
    completedAt: Date.now(),
    duration: state.settings.workDuration,
    label: state.currentLabel || '',
    completed: true,
  };

  const data = await browser.storage.local.get('sessionHistory');
  let history = data.sessionHistory || [];

  // Prune records older than 60 days
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  history = history.filter(r => r.startedAt >= cutoff);

  history.push(record);
  await browser.storage.local.set({ sessionHistory: history });
}

// ─── Timer core ───────────────────────────────────────────────────────────────

function tick() {
  if (state.timeLeft > 0) {
    state.timeLeft--;
    broadcastState();
    updateBadge();
    persistState();
  } else {
    onPhaseComplete();
  }
}

function onPhaseComplete() {
  clearInterval(intervalId);
  intervalId = null;
  state.isRunning = false;

  const wasWork = state.phase === 'work';
  playChime(wasWork);
  showNotification();

  if (wasWork) {
    // Save session record before advancing phase
    saveSessionRecord();

    state.sessionCount++;
    state.completedToday++;
    state.phase = state.sessionCount >= state.settings.longBreakInterval ? 'longBreak' : 'shortBreak';
    if (state.phase === 'longBreak') state.sessionCount = 0;
    if (state.settings.autoStartBreaks) startTimer(true);
  } else {
    state.phase = 'work';
    if (state.settings.autoStartWork) startTimer(true);
  }

  state.sessionStartedAt = null;
  state.timeLeft = getDuration(state.phase);
  state.totalTime = state.timeLeft;
  broadcastState();
  updateBadge();
  persistState();
}

function startTimer(internal = false) {
  if (intervalId) clearInterval(intervalId);
  state.isRunning = true;
  // Record when this work session started
  if (state.phase === 'work' && !state.sessionStartedAt) {
    state.sessionStartedAt = Date.now();
  }
  intervalId = setInterval(tick, 1000);
  if (!internal) { broadcastState(); updateBadge(); }
}

function pauseTimer() {
  clearInterval(intervalId);
  intervalId = null;
  state.isRunning = false;
  broadcastState();
  updateBadge();
  persistState();
}

function resetTimer() {
  pauseTimer();
  state.sessionStartedAt = null;
  state.timeLeft = getDuration(state.phase);
  state.totalTime = state.timeLeft;
  broadcastState();
  updateBadge();
}

function skipPhase() {
  pauseTimer();
  if (state.phase === 'work') {
    state.sessionCount++;
    state.completedToday++;
    state.phase = state.sessionCount >= state.settings.longBreakInterval ? 'longBreak' : 'shortBreak';
    if (state.phase === 'longBreak') state.sessionCount = 0;
  } else {
    state.phase = 'work';
  }
  state.sessionStartedAt = null;
  state.timeLeft = getDuration(state.phase);
  state.totalTime = state.timeLeft;
  broadcastState();
  updateBadge();
  persistState();
}

// ─── Website Blocker ──────────────────────────────────────────────────────────

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!state.isRunning || state.phase !== 'work') return {};
    if (!state.settings.blockEnabled || !state.settings.blocklist?.length) return {};
    try {
      const hostname = new URL(details.url).hostname.replace(/^www\./, '');
      const blocked = state.settings.blocklist.some(domain => {
        const d = domain.replace(/^www\./, '').trim();
        return hostname === d || hostname.endsWith('.' + d);
      });
      if (blocked) {
        const remaining = Math.ceil(state.timeLeft / 60);
        const blockUrl = browser.runtime.getURL('blocked/blocked.html')
          + `?site=${encodeURIComponent(hostname)}&mins=${remaining}`;
        return { redirectUrl: blockUrl };
      }
    } catch (_) {}
    return {};
  },
  { urls: ['*://*/*'], types: ['main_frame'] },
  ['blocking']
);

// ─── Persistence ──────────────────────────────────────────────────────────────

async function init() {
  const data = await browser.storage.local.get(['timerState', 'settings']);
  if (data.settings) state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  if (data.timerState) {
    const s = data.timerState;
    if (s.lastDate !== new Date().toDateString()) {
      state.completedToday = 0;
      state.sessionCount = 0;
      state.lastDate = new Date().toDateString();
    } else {
      state.completedToday = s.completedToday || 0;
      state.sessionCount = s.sessionCount || 0;
    }
    state.phase = s.phase || 'work';
    state.currentLabel = s.currentLabel || '';
    state.timeLeft = getDuration(state.phase);
    state.totalTime = state.timeLeft;
  }
  updateBadge();
}

function persistState() {
  browser.storage.local.set({
    timerState: {
      phase: state.phase,
      sessionCount: state.sessionCount,
      completedToday: state.completedToday,
      lastDate: state.lastDate,
      currentLabel: state.currentLabel,
    }
  });
}

async function applySettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  await browser.storage.local.set({ settings: state.settings });
  if (!state.isRunning) {
    state.timeLeft = getDuration(state.phase);
    state.totalTime = state.timeLeft;
  }
  broadcastState();
  updateBadge();
}

// ─── Messaging ────────────────────────────────────────────────────────────────

function getSnapshot() {
  return {
    phase: state.phase,
    timeLeft: state.timeLeft,
    totalTime: state.totalTime,
    isRunning: state.isRunning,
    sessionCount: state.sessionCount,
    completedToday: state.completedToday,
    currentLabel: state.currentLabel,
    settings: state.settings,
  };
}

function broadcastState() {
  if (!popupPort) return;
  try {
    popupPort.postMessage({ type: 'STATE', data: getSnapshot() });
  } catch (_) {
    popupPort = null;
  }
}

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup') return;
  popupPort = port;
  port.postMessage({ type: 'STATE', data: getSnapshot() });

  port.onDisconnect.addListener(() => { popupPort = null; });

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'START':  startTimer();  break;
      case 'PAUSE':  pauseTimer();  break;
      case 'RESET':  resetTimer();  break;
      case 'SKIP':   skipPhase();   break;
      case 'SET_LABEL':
        state.currentLabel = msg.label;
        persistState();
        break;
      case 'SET_PHASE':
        pauseTimer();
        state.phase = msg.phase;
        state.sessionStartedAt = null;
        state.timeLeft = getDuration(state.phase);
        state.totalTime = state.timeLeft;
        broadcastState(); updateBadge(); persistState();
        break;
      case 'SAVE_SETTINGS': applySettings(msg.settings); break;
    }
  });
});

browser.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'GET_STATE')   { reply(getSnapshot()); return true; }
  if (msg.type === 'GET_HISTORY') {
    browser.storage.local.get('sessionHistory').then(d => reply(d.sessionHistory || []));
    return true;
  }
  if (msg.type === 'SAVE_SETTINGS') { applySettings(msg.settings); }
});

init();
