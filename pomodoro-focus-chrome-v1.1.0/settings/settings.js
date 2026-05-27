//pomodoro focus — settings js

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

const $ = id => document.getElementById(id);
let settings = { ...DEFAULT_SETTINGS };

//load settings

async function loadSettings() {
  const data = await b.storage.local.get('settings');
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

  //theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (localStorage.getItem('pomo-theme') || 'dark'));
  });
}

//collect form values

function parseNum(inputEl, min, max, name) {
  if (inputEl.validity && inputEl.validity.badInput) throw new Error(`${name} must be a valid number.`);
  const val = inputEl.value;
  if (!val || val.trim() === '') throw new Error(`${name} cannot be empty.`);
  if (val.includes('.')) throw new Error(`${name} must be a whole number.`);
  const num = Number(val);
  if (isNaN(num)) throw new Error(`${name} must be a valid number.`);
  if (num < min) throw new Error(`${name} cannot be less than ${min}.`);
  if (num > max) throw new Error(`${name} cannot be more than ${max}.`);
  return Math.round(num);
}

function collectSettings() {
  return {
    workDuration:        parseNum($('workDuration'), 1, 120, 'Focus Duration'),
    shortBreakDuration:  parseNum($('shortBreakDuration'), 1, 60, 'Short Break'),
    longBreakDuration:   parseNum($('longBreakDuration'), 1, 120, 'Long Break'),
    longBreakInterval:   parseNum($('longBreakInterval'), 2, 10, 'Long Break Interval'),
    autoStartBreaks:     $('autoStartBreaks').checked,
    autoStartWork:       $('autoStartWork').checked,
    soundEnabled:        $('soundEnabled').checked,
    notificationsEnabled:$('notificationsEnabled').checked,
    volume:              parseInt($('volume').value),
    blockEnabled:        $('blockEnabled').checked,
    blocklist:           $('blocklist').value
                           .split('\n')
                           .map(d => {
                             let clean = d.trim();
                             if (!clean) return '';
                             try { return new URL(clean).hostname.replace(/^www\./, ''); } 
                             catch(e) { return clean.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '').toLowerCase(); }
                           })
                           .filter(d => d.length > 0 && d.includes('.')),
  };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v || min)); }

//save

async function saveSettings() {
  try {
    const newSettings = collectSettings();
    settings = newSettings;
    applyToForm(settings);
    await browser.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    showToast('Settings saved');
  } catch (err) {
    showToast(err.message, true);
  }
}

function showToast(msg = 'Settings saved', isError = false) {
  const toast = $('savedToast');
  toast.textContent = msg;
  if (isError) toast.classList.add('error');
  else toast.classList.remove('error');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

//number input buttons

document.querySelectorAll('.num-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.target);
    const delta = parseInt(btn.dataset.delta);
    const min   = parseInt(input.min);
    const max   = parseInt(input.max);
    input.value = clamp(parseInt(input.value) + delta, min, max);
  });
});

//volume range

$('volume').addEventListener('input', () => {
  $('volumeVal').textContent = `${$('volume').value}%`;
});

//sound toggle shows/hides volume row

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

//test sound

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

//theme buttons

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    localStorage.setItem('pomo-theme', btn.dataset.theme);
  });
});

//reset buttons

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

//save button

$('saveBtn').addEventListener('click', saveSettings);

//sidebar active link on scroll

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

//init

loadSettings();
