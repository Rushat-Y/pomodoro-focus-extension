//blocked page js

const params = new URLSearchParams(window.location.search);
const b = typeof browser !== 'undefined' ? browser : chrome;
const site    = params.get('site')  || 'this site';
const initMin = parseInt(params.get('mins') || '0', 10);

const CIRCUMFERENCE = 2 * Math.PI * 52; //r=52 → ~326.73

document.getElementById('siteName').textContent = site;

let timeLeft = initMin * 60; //seconds

const ringFill  = document.getElementById('ringFill');
const timeEl    = document.getElementById('timeLeft');
const totalTime = timeLeft || 1;

function setRing(secs) {
  const progress = secs / totalTime;
  ringFill.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
}

function fmt(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function update(secs) {
  timeEl.textContent = secs > 0 ? fmt(secs) : '—';
  setRing(secs);
}

//initial render
update(timeLeft);

//poll background state every second for live countdown
const poll = setInterval(async () => {
  try {
    const state = await b.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null);  if (!state) { clearInterval(poll); return; }
    //if session is over or switched to break, unblock
    if (!state.isRunning || state.phase !== 'work') {
      clearInterval(poll);
      timeEl.textContent = '—';
      setRing(0);
      return;
    }
    update(state.timeLeft);
  } catch (_) {
    clearInterval(poll);
  }
}, 1000);

//go back button
document.getElementById('backBtn').addEventListener('click', () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.close();
  }
});
