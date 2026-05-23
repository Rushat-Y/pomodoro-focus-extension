// ── Pomodoro Focus — Settings JS ────────────────────────────────────────────

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

const $ = id => document.getElementById(id);
let settings = { ...DEFAULT_SETTINGS };

// ── Load settings ──────────────────────────────────────────────────────────

async function loadSettings() {
  const data = await browser.storage.local.get('settings');
  settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  applyToForm(settings);
}

function applyToForm(s) {
  $('workDuration').value       = s.workDuration;
  $('shortBreakDuration').value = s.shortBreakDuration;
  $('longBreakDuration').value  = s.longBreakDuration;
  $('longBreakInterval').value  = s.longBreakInterval;
  $('autoStartBreaks').checked  = s.autoStartBreaks;
  $('autoStartWork').checked    = s.autoStartWork;
  $('soundEnabled').checked     = s.soundEnabled;
  $('notificationsEnabled').checked = s.notificationsEnabled;
  $('volume').value             = s.volume;
  $('volumeVal').textContent    = `${s.volume}%`;
  $('blockEnabled').checked     = s.blockEnabled || false;
  $('blocklist').value          = (s.blocklist || []).join('\n');
  updateDomainRowVisibility(s.blockEnabled || false);
  updateVolumeRowVisibility(s.soundEnabled);

  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (localStorage.getItem('pomo-theme') || 'dark'));
  });
}

// ── Collect form values ────────────────────────────────────────────────────

function collectSettings() {
  return {
    workDuration:        clamp(parseInt($('workDuration').value),       1, 120),
    shortBreakDuration:  clamp(parseInt($('shortBreakDuration').value),  1, 60),
    longBreakDuration:   clamp(parseInt($('longBreakDuration').value),   1, 120),
    longBreakInterval:   clamp(parseInt($('longBreakInterval').value),   2, 10),
    autoStartBreaks:     $('autoStartBreaks').checked,
    autoStartWork:       $('autoStartWork').checked,
    soundEnabled:        $('soundEnabled').checked,
    notificationsEnabled:$('notificationsEnabled').checked,
    volume:              parseInt($('volume').value),
    blockEnabled:        $('blockEnabled').checked,
    blocklist:           $('blocklist').value
                           .split('\n')
                           .map(d => d.trim().replace(/^www\./, '').toLowerCase())
                           .filter(d => d.length > 0 && d.includes('.')),
  };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v || min)); }

// ── Save ───────────────────────────────────────────────────────────────────

async function saveSettings() {
  settings = collectSettings();
  await browser.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  showToast();
}

function showToast() {
  const toast = $('savedToast'); // plain text toast, no emoji
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ── Number input buttons ───────────────────────────────────────────────────

document.querySelectorAll('.num-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.target);
    const delta = parseInt(btn.dataset.delta);
    const min   = parseInt(input.min);
    const max   = parseInt(input.max);
    input.value = clamp(parseInt(input.value) + delta, min, max);
  });
});

// ── Volume range ───────────────────────────────────────────────────────────

$('volume').addEventListener('input', () => {
  $('volumeVal').textContent = `${$('volume').value}%`;
});

// ── Sound toggle shows/hides volume row ────────────────────────────────────

$('soundEnabled').addEventListener('change', () => {
  updateVolumeRowVisibility($('soundEnabled').checked);
});

$('blockEnabled').addEventListener('change', () => {
  updateDomainRowVisibility($('blockEnabled').checked);
});

function updateDomainRowVisibility(enabled) {
  $('domainRow').style.opacity = enabled ? '1' : '0.4';
  $('domainRow').style.pointerEvents = enabled ? '' : 'none';
}

function updateVolumeRowVisibility(enabled) {
  $('volumeRow').style.opacity = enabled ? '1' : '0.4';
  $('volumeRow').style.pointerEvents = enabled ? '' : 'none';
}

// ── Test sound ─────────────────────────────────────────────────────────────

$('testSound').addEventListener('click', () => {
  try {
    const vol = parseInt($('volume').value) / 100 * 0.4;
    const ctx = new AudioContext();
    const freqs = [523.25, 659.25, 783.99];
    freqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
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
  } catch (e) { console.warn('Sound test failed:', e); }
});

// ── Theme buttons ──────────────────────────────────────────────────────────

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    localStorage.setItem('pomo-theme', btn.dataset.theme);
  });
});

// ── Reset buttons ──────────────────────────────────────────────────────────

$('resetTodayBtn').addEventListener('click', async () => {
  if (!confirm('Reset today\'s data? This will clear your session count and focus time for today.')) return;
  const data = await browser.storage.local.get('timerState');
  if (data.timerState) {
    await browser.storage.local.set({
      timerState: { ...data.timerState, completedToday: 0, sessionCount: 0 }
    });
  }
  showToast();
});

$('factoryResetBtn').addEventListener('click', async () => {
  if (!confirm('This will reset ALL settings and data to defaults. Are you sure?')) return;
  await browser.storage.local.clear();
  settings = { ...DEFAULT_SETTINGS };
  applyToForm(settings);
  await browser.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  showToast();
});

// ── Save button ────────────────────────────────────────────────────────────

$('saveBtn').addEventListener('click', saveSettings);

// ── Sidebar active link on scroll ──────────────────────────────────────────

const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.section');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('active'));
      const link = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
      if (link) link.classList.add('active');
    }
  });
}, { threshold: 0.4 });

sections.forEach(s => observer.observe(s));

// ── Init ───────────────────────────────────────────────────────────────────

loadSettings();
