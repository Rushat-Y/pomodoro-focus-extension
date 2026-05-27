//pomodoro focus — background script
const b = typeof browser !== 'undefined' ? browser : chrome;

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
  targetEndTime: null,
  pausedTimeLeft: DEFAULT_SETTINGS.workDuration * 60,
  totalTime: DEFAULT_SETTINGS.workDuration * 60,
  isRunning: false,
  sessionCount: 0,
  completedToday: 0,
  lastDate: new Date().toDateString(),
  currentLabel: '',
  sessionStartedAt: null,
  settings: { ...DEFAULT_SETTINGS },
};

let popupPort = null;
let audioCtx = null;

//audio
function getAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
  return audioCtx;
}

async function playChime(goingToBreak) {
  if (!state.settings.soundEnabled) return;
  const vol = (state.settings.volume / 100) * 0.4;

  if (typeof chrome !== 'undefined' && chrome.offscreen) {
    try {
      const hasOffscreen = await chrome.offscreen.hasDocument();
      if (!hasOffscreen) {
        await chrome.offscreen.createDocument({
          url: 'offscreen/offscreen.html',
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Play pomodoro timer sounds'
        });
      }
      chrome.runtime.sendMessage({ type: 'PLAY_CHIME', volume: vol, goingToBreak });
      setTimeout(() => chrome.offscreen.closeDocument(), 2000);
    } catch(e) {
      console.warn('[Pomodoro] Offscreen audio error:', e);
    }
  } else {
    try {
      const ctx = getAudioCtx();
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
}

//badge
function updateBadge() {
  const ba = b.browserAction || b.action;
  if (!ba) return;

  if (!state.isRunning || !state.targetEndTime) {
    ba.setBadgeText({ text: '' });
    return;
  }
  const remainingSecs = Math.max(0, Math.ceil((state.targetEndTime - Date.now()) / 1000));
  const mins = Math.ceil(remainingSecs / 60).toString();
  const color = state.phase === 'work' ? '#d4604f' : state.phase === 'shortBreak' ? '#3dbfaa' : '#8b66d4';
  
  ba.setBadgeText({ text: mins });
  ba.setBadgeBackgroundColor({ color });
}

//notifications
function showNotification() {
  if (!state.settings.notificationsEnabled) return;
  const label = state.currentLabel ? `"${state.currentLabel}" complete.` : 'Focus session complete.';
  const map = {
    work:       { title: 'Focus Session Complete', body: `${label} Time for a break.` },
    shortBreak: { title: 'Break Over',             body: "Ready to focus? Let's get back to work." },
    longBreak:  { title: 'Long Break Over',        body: 'Refreshed? Time to dive back in.' },
  };
  const n = map[state.phase];
  b.notifications.create(`pomo-${Date.now()}`, {
    type: 'basic',
    iconUrl: b.runtime.getURL('icons/icon-96.png'),
    title: n.title,
    message: n.body,
  });
}

if (b.notifications) {
  b.notifications.onClicked.addListener((id) => { b.notifications.clear(id); });
}

//phase helpers
function getDuration(phase) {
  const s = state.settings;
  return { work: s.workDuration, shortBreak: s.shortBreakDuration, longBreak: s.longBreakDuration }[phase] * 60;
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA');
}

//session history
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

  const data = await b.storage.local.get('sessionHistory');
  let history = data.sessionHistory || [];
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  history = history.filter(r => r.startedAt >= cutoff);
  history.push(record);
  await b.storage.local.set({ sessionHistory: history });
}

//timer core
function onPhaseComplete() {
  state.isRunning = false;
  state.targetEndTime = null;
  b.alarms.clear('timerEnd');
  b.alarms.clear('badgeTick');

  const wasWork = state.phase === 'work';
  playChime(wasWork);
  showNotification();

  if (wasWork) {
    saveSessionRecord();
    state.sessionCount++;
    state.completedToday++;
    state.phase = state.sessionCount >= state.settings.longBreakInterval ? 'longBreak' : 'shortBreak';
    if (state.phase === 'longBreak') state.sessionCount = 0;
  } else {
    state.phase = 'work';
  }

  state.sessionStartedAt = null;
  state.pausedTimeLeft = getDuration(state.phase);
  state.totalTime = state.pausedTimeLeft;

  const autoStart = wasWork ? state.settings.autoStartBreaks : state.settings.autoStartWork;
  if (autoStart) {
    startTimer(true);
  } else {
    syncBlockRules();
  }

  broadcastState();
  updateBadge();
  persistState();
}

function startTimer(internal = false) {
  state.isRunning = true;
  if (state.phase === 'work' && !state.sessionStartedAt) {
    state.sessionStartedAt = Date.now();
  }
  state.targetEndTime = Date.now() + (state.pausedTimeLeft * 1000);
  
  b.alarms.create('timerEnd', { when: state.targetEndTime });
  b.alarms.create('badgeTick', { periodInMinutes: 1 });
  
  syncBlockRules();
  if (!internal) { broadcastState(); updateBadge(); }
  persistState();
}

function pauseTimer() {
  if (state.isRunning && state.targetEndTime) {
    state.pausedTimeLeft = Math.max(0, Math.round((state.targetEndTime - Date.now()) / 1000));
  }
  state.isRunning = false;
  state.targetEndTime = null;
  b.alarms.clear('timerEnd');
  b.alarms.clear('badgeTick');
  syncBlockRules();
  broadcastState();
  updateBadge();
  persistState();
}

function resetTimer() {
  pauseTimer();
  state.sessionStartedAt = null;
  state.pausedTimeLeft = getDuration(state.phase);
  state.totalTime = state.pausedTimeLeft;
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
  state.pausedTimeLeft = getDuration(state.phase);
  state.totalTime = state.pausedTimeLeft;
  broadcastState();
  updateBadge();
  persistState();
}

b.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'timerEnd') {
    //wait a tick to ensure time has officially passed
    setTimeout(() => {
      if (state.isRunning && state.targetEndTime && Date.now() >= state.targetEndTime) {
        onPhaseComplete();
      }
    }, 100);
  } else if (alarm.name === 'badgeTick') {
    updateBadge();
  }
});

//blocker (chrome mv3)
async function syncBlockRules() {
  if (!b.declarativeNetRequest) return;
  const existingRules = await b.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map(r => r.id);
  
  if (!state.isRunning || state.phase !== 'work' || !state.settings.blockEnabled || !state.settings.blocklist?.length) {
    if (existingIds.length > 0) {
      await b.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingIds });
    }
    return;
  }
  
  let ruleId = 1;
  const newRules = state.settings.blocklist.map(domain => {
    const d = domain.replace(/^www\./, '').trim();
    return {
      id: ruleId++,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { extensionPath: '/blocked/blocked.html' }
      },
      condition: {
        urlFilter: `||${d}`,
        resourceTypes: ['main_frame']
      }
    };
  });
  
  await b.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: newRules
  });
}

//blocker (firefox mv2)
if (b.webRequest && b.webRequest.onBeforeRequest && !b.declarativeNetRequest) {
  b.webRequest.onBeforeRequest.addListener(
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
          const remainingSecs = Math.max(0, Math.ceil((state.targetEndTime - Date.now()) / 1000));
          const remainingMins = Math.ceil(remainingSecs / 60);
          const blockUrl = b.runtime.getURL('blocked/blocked.html')
            + `?site=${encodeURIComponent(hostname)}&mins=${remainingMins}`;
          return { redirectUrl: blockUrl };
        }
      } catch (_) {}
      return {};
    },
    { urls: ['*://*/*'], types: ['main_frame'] },
    ['blocking']
  );
}

//persistence
async function init() {
  const data = await b.storage.local.get(['timerState', 'settings']);
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
    state.targetEndTime = s.targetEndTime || null;
    state.pausedTimeLeft = s.pausedTimeLeft || getDuration(state.phase);
    state.totalTime = s.totalTime || getDuration(state.phase);
    state.isRunning = s.isRunning || false;
  }
  
  if (state.isRunning && state.targetEndTime) {
    if (Date.now() >= state.targetEndTime) {
      onPhaseComplete();
    } else {
      b.alarms.create('timerEnd', { when: state.targetEndTime });
      b.alarms.create('badgeTick', { periodInMinutes: 1 });
      syncBlockRules();
    }
  } else {
    syncBlockRules();
  }
  updateBadge();
  broadcastState();
}

function persistState() {
  b.storage.local.set({
    timerState: {
      phase: state.phase,
      sessionCount: state.sessionCount,
      completedToday: state.completedToday,
      lastDate: state.lastDate,
      currentLabel: state.currentLabel,
      targetEndTime: state.targetEndTime,
      pausedTimeLeft: state.pausedTimeLeft,
      totalTime: state.totalTime,
      isRunning: state.isRunning
    }
  });
}

async function applySettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  await b.storage.local.set({ settings: state.settings });
  if (!state.isRunning) {
    state.pausedTimeLeft = getDuration(state.phase);
    state.totalTime = state.pausedTimeLeft;
  }
  broadcastState();
  updateBadge();
  syncBlockRules();
}

//messaging
function getSnapshot() {
  let timeLeft = state.pausedTimeLeft;
  if (state.isRunning && state.targetEndTime) {
    timeLeft = Math.max(0, Math.round((state.targetEndTime - Date.now()) / 1000));
  }
  return {
    phase: state.phase,
    timeLeft: timeLeft,
    targetEndTime: state.targetEndTime,
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

b.runtime.onConnect.addListener((port) => {
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
        state.pausedTimeLeft = getDuration(state.phase);
        state.totalTime = state.pausedTimeLeft;
        broadcastState(); updateBadge(); persistState();
        break;
      case 'SAVE_SETTINGS': applySettings(msg.settings); break;
    }
  });
});

b.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'GET_STATE')   { reply(getSnapshot()); return true; }
  if (msg.type === 'GET_HISTORY') {
    b.storage.local.get('sessionHistory').then(d => reply(d.sessionHistory || []));
    return true;
  }
  if (msg.type === 'SAVE_SETTINGS') { applySettings(msg.settings); }
});

init();
