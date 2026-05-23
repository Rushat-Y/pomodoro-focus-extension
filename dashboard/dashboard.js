//Dashboard JS 

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGE_SIZE = 15;

let allSessions = [];
let filteredSessions = [];
let currentPage = 1;

//init

async function init() {
  const history = await browser.runtime.sendMessage({ type: 'GET_HISTORY' });
  allSessions = (history || []).slice().reverse(); // newest first
  filteredSessions = allSessions;

  renderSummary();
  renderHeatmap();
  renderBarChart();
  renderLog();

  document.getElementById('openTimerBtn').addEventListener('click', () => {
    browser.browserAction.openPopup().catch(() => window.close());
  });

  document.getElementById('logSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    filteredSessions = q
      ? allSessions.filter(s => (s.label || '').toLowerCase().includes(q))
      : allSessions;
    currentPage = 1;
    renderLog();
  });
}

//helpers

function isoToday() {
  return new Date().toLocaleDateString('en-CA');
}

function isoDate(d) {
  return new Date(d).toLocaleDateString('en-CA');
}

function groupByDate(sessions) {
  const map = {};
  sessions.forEach(s => {
    const d = s.date || isoDate(s.startedAt);
    map[d] = (map[d] || 0) + 1;
  });
  return map;
}

function calcStreak(byDate) {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    if (byDate[key]) streak++;
    else if (i > 0) break;
  }
  return streak;
}

//summary cards

function renderSummary() {
  const workSessions = allSessions.filter(s => s.phase === 'work' || !s.phase);
  const totalSessions = workSessions.length;
  const totalMins = workSessions.reduce((acc, s) => acc + (s.duration || 25), 0);
  const totalHours = totalMins / 60;

  const byDate = groupByDate(workSessions);
  const streak = calcStreak(byDate);
  const bestDay = Math.max(0, ...Object.values(byDate));

  document.getElementById('totalSessions').textContent = totalSessions;
  document.getElementById('totalHours').textContent =
    totalHours < 1 ? `${totalMins}m` : `${totalHours.toFixed(1)}h`;
  document.getElementById('currentStreakVal').textContent = streak;
  document.getElementById('bestDay').textContent = bestDay;
}

//heatmap

function renderHeatmap() {
  const grid = document.getElementById('heatmapGrid');
  const monthLabels = document.getElementById('heatmapMonths');
  const WEEKS = 14;
  const TOTAL_DAYS = WEEKS * 7;

  const workSessions = allSessions.filter(s => s.phase === 'work' || !s.phase);
  const byDate = groupByDate(workSessions);
  const maxCount = Math.max(1, ...Object.values(byDate));

  //Build date list from TOTAL_DAYS ago to today, starting on a Monday
  const today = new Date();
  const todayDow = today.getDay();
  //Pad so last column ends on today's day-of-week
  const endDate = new Date(today);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (TOTAL_DAYS - 1));

  grid.innerHTML = '';
  const tooltip = document.getElementById('tooltip');
  const cells = [];

  for (let i = 0; i < TOTAL_DAYS; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toLocaleDateString('en-CA');
    const count = byDate[key] || 0;
    const opacity = count === 0 ? 0 : Math.max(0.15, (count / maxCount));

    const cell = document.createElement('div');
    cell.className = 'heat-cell';
    cell.dataset.count = count;
    cell.dataset.date = key;
    if (count > 0) cell.style.setProperty('--cell-opacity', opacity.toFixed(2));

    cell.addEventListener('mouseenter', (e) => {
      const label = count === 0
        ? `${key} — no sessions`
        : `${key} — ${count} session${count > 1 ? 's' : ''}`;
      tooltip.textContent = label;
      tooltip.classList.add('show');
    });
    cell.addEventListener('mousemove', (e) => {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY - 28) + 'px';
    });
    cell.addEventListener('mouseleave', () => tooltip.classList.remove('show'));

    grid.appendChild(cell);
    cells.push({ d, cell });
  }

  //Month labels
  monthLabels.innerHTML = '';
  let lastMonth = -1;
  const colWidth = (grid.offsetWidth || (WEEKS * 14)) / WEEKS;
  for (let w = 0; w < WEEKS; w++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + w * 7);
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth();
      const label = document.createElement('span');
      label.className = 'month-label';
      label.textContent = MONTHS[d.getMonth()];
      label.style.left = `${w * 14}px`;
      monthLabels.appendChild(label);
    }
  }

  //Range sub-label
  document.getElementById('heatmapRange').textContent =
    `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

//bar chart

function renderBarChart() {
  const chart = document.getElementById('barChart');
  chart.textContent = '';

  const workSessions = allSessions.filter(s => s.phase === 'work' || !s.phase);
  const byDate = groupByDate(workSessions);
  const today = new Date();
  const days = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    days.push({ key, label: DAYS[d.getDay()], count: byDate[key] || 0 });
  }

  const max = Math.max(1, ...days.map(d => d.count));

  days.forEach(day => {
    const heightPct = (day.count / max) * 100;
    const group = document.createElement('div');
    group.className = 'bar-group';
    const countDiv = document.createElement('div');
    countDiv.className = 'bar-count';
    countDiv.textContent = day.count || '';

    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'bar-wrap';
    const barDiv = document.createElement('div');
    barDiv.className = 'bar';
    barDiv.style.height = `${heightPct}%`;
    barDiv.title = `${day.count} sessions`;
    wrapDiv.appendChild(barDiv);

    const dayDiv = document.createElement('div');
    dayDiv.className = 'bar-day';
    dayDiv.textContent = day.label;

    group.appendChild(countDiv);
    group.appendChild(wrapDiv);
    group.appendChild(dayDiv);
    chart.appendChild(group);
  });
}

//session log

function renderLog() {
  const tbody = document.getElementById('logBody');
  const pagination = document.getElementById('logPagination');
  tbody.textContent = '';

  const total = filteredSessions.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filteredSessions.slice(start, start + PAGE_SIZE);

  if (page.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'No sessions found.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    pagination.textContent = '';
    return;
  }

  page.forEach(s => {
    const date = new Date(s.startedAt || s.completedAt);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const label = s.label || '';
    const tr = document.createElement('tr');
    const tdDate = document.createElement('td');
    tdDate.className = 'td-date';
    tdDate.textContent = dateStr;

    const tdLabel = document.createElement('td');
    tdLabel.className = `td-label ${label ? '' : 'empty'}`;
    tdLabel.textContent = label || 'unlabeled';

    const tdDuration = document.createElement('td');
    tdDuration.className = 'td-duration';
    tdDuration.textContent = `${s.duration || 25} min`;

    tr.appendChild(tdDate);
    tr.appendChild(tdLabel);
    tr.appendChild(tdDuration);
    tbody.appendChild(tr);
  });

  //Pagination
  pagination.textContent = '';
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = 'Prev';
  prev.disabled = currentPage === 1;
  prev.addEventListener('click', () => { currentPage--; renderLog(); });
  pagination.appendChild(prev);

  for (let p = 1; p <= totalPages; p++) {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (p === currentPage ? ' active' : '');
    btn.textContent = p;
    btn.addEventListener('click', () => { currentPage = p; renderLog(); });
    pagination.appendChild(btn);
  }

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = 'Next';
  next.disabled = currentPage === totalPages;
  next.addEventListener('click', () => { currentPage++; renderLog(); });
  pagination.appendChild(next);
}

init();
