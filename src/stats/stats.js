document.addEventListener('DOMContentLoaded', loadStats);

function loadStats() {
  chrome.storage.local.get([
    'totalActions',
    'pagesOpened',
    'keyBreakdown',
    'dailyActions',
    'firstUseDate',
    'sessionCount',
    'keySequences',
    'hourlyActivity',
    'weekdayActivity'
  ], (result) => {
    const totalActions  = result.totalActions  || 0;
    const pagesOpened   = result.pagesOpened   || 0;
    const keyBreakdown  = result.keyBreakdown  || { ArrowUp: 0, ArrowDown: 0, ArrowLeft: 0, ArrowRight: 0 };
    const dailyActions  = result.dailyActions  || {};
    const firstUseDate  = result.firstUseDate  || null;
    const sessionCount  = result.sessionCount  || 0;
    const keySequences  = result.keySequences  || {};
    const hourlyActivity  = result.hourlyActivity  || {};
    const weekdayActivity = result.weekdayActivity || {};

    // Derived
    const activeDays    = Object.keys(dailyActions).length;
    const streak        = computeStreak(dailyActions);
    const avgPerSession = sessionCount > 0 ? Math.round(totalActions / sessionCount) : 0;
    const daysUsing     = firstUseDate
      ? Math.max(1, Math.round((Date.now() - new Date(firstUseDate).getTime()) / 86400000))
      : 0;

    // Header
    document.getElementById('days-subtitle').textContent =
      daysUsing > 0 ? `${daysUsing} day${daysUsing !== 1 ? 's' : ''} as a keyboard navigator` : 'Welcome to TUI Navigator';

    // Hero
    document.getElementById('hero-total').textContent = totalActions.toLocaleString();
    document.getElementById('pride-msg').textContent = getPrideMessage(totalActions);

    // Badges
    renderBadges(totalActions, streak);

    // Key metrics
    document.getElementById('time-saved').textContent    = formatTimeSaved(totalActions);
    document.getElementById('pages-opened').textContent  = pagesOpened.toLocaleString();
    document.getElementById('session-count').textContent = sessionCount.toLocaleString();
    document.getElementById('avg-per-session').textContent = avgPerSession.toLocaleString();
    document.getElementById('current-streak').textContent  = streak;
    document.getElementById('active-days').textContent     = activeDays;

    // Efficiency & Patterns
    renderEfficiency(pagesOpened, totalActions);
    renderPeakHour(hourlyActivity);
    renderMostActiveDay(weekdayActivity);

    // Direction compass
    renderDirectionCompass(keyBreakdown);

    // Navigation sequences
    renderTopSequences(keySequences);

    // Charts
    renderActivityChart(dailyActions);
    renderWeekdayChart(weekdayActivity);
  });
}

// ── Helpers ──────────────────────────────────────────────

function getPrideMessage(total) {
  if (total < 10)   return 'Getting started — every keystroke counts.';
  if (total < 100)  return 'Building habits — keep it up!';
  if (total < 500)  return 'Regular navigator — your fingers know the way.';
  if (total < 1000) return 'Power user — the mouse is a distant memory.';
  if (total < 5000) return 'Keyboard master — you are the keyboard.';
  return 'TUI Legend — you have transcended the mouse entirely.';
}

function formatTimeSaved(total) {
  const seconds = Math.round(total * 1.2);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

function computeStreak(dailyActions) {
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (dailyActions[key]) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function renderBadges(total, streak) {
  const container = document.getElementById('badges-row');
  const badges = [];

  if (total >= 1)    badges.push({ label: 'Keyboard User',     cls: 'badge-base' });
  if (total >= 100)  badges.push({ label: 'Quick Fingers',     cls: 'badge-silver' });
  if (total >= 1000) badges.push({ label: 'Speed Demon',       cls: 'badge-gold' });
  if (total >= 5000) badges.push({ label: 'Keyboard Warrior',  cls: 'badge-legendary' });
  if (streak >= 3)   badges.push({ label: '3-Day Streak',      cls: 'badge-streak' });
  if (streak >= 7)   badges.push({ label: 'Streak Master',     cls: 'badge-streak' });

  container.innerHTML = badges
    .map(b => `<span class="badge ${b.cls}">${b.label}</span>`)
    .join('');
}

function renderEfficiency(pagesOpened, totalActions) {
  const el = document.getElementById('nav-efficiency');
  if (totalActions === 0) { el.textContent = '—'; return; }
  const pct = Math.round((pagesOpened / totalActions) * 100);
  el.textContent = `${pct}%`;
  if (pct > 15)      el.classList.add('efficiency-high');
  else if (pct > 8)  el.classList.add('efficiency-mid');
  else               el.classList.add('efficiency-low');
}

const HOUR_LABELS = ['12am','1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am',
                     '12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm'];

function renderPeakHour(hourlyActivity) {
  const el = document.getElementById('peak-hour');
  const entries = Object.entries(hourlyActivity);
  if (entries.length === 0) { el.textContent = '—'; return; }
  const peak = entries.reduce((a, b) => b[1] > a[1] ? b : a);
  el.textContent = HOUR_LABELS[parseInt(peak[0], 10)] || `${peak[0]}:00`;
}

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function renderMostActiveDay(weekdayActivity) {
  const el = document.getElementById('most-active-day');
  const entries = Object.entries(weekdayActivity);
  if (entries.length === 0) { el.textContent = '—'; return; }
  const peak = entries.reduce((a, b) => b[1] > a[1] ? b : a);
  el.textContent = DAY_LABELS[parseInt(peak[0], 10)] || peak[0];
}

function renderDirectionCompass(keyBreakdown) {
  const counts = {
    ArrowUp:    keyBreakdown.ArrowUp    || 0,
    ArrowDown:  keyBreakdown.ArrowDown  || 0,
    ArrowLeft:  keyBreakdown.ArrowLeft  || 0,
    ArrowRight: keyBreakdown.ArrowRight || 0
  };
  const maxCount = Math.max(...Object.values(counts), 1);

  const dirs = [
    { key: 'ArrowUp',    fillId: 'fill-up',    barId: 'bar-up',    label: '↑' },
    { key: 'ArrowDown',  fillId: 'fill-down',  barId: 'bar-down',  label: '↓' },
    { key: 'ArrowLeft',  fillId: 'fill-left',  barId: 'bar-left',  label: '←' },
    { key: 'ArrowRight', fillId: 'fill-right', barId: 'bar-right', label: '→' }
  ];

  const dominantKey = Object.entries(counts).reduce((a, b) => b[1] > a[1] ? b : a)[0];

  dirs.forEach(({ key, fillId, barId }) => {
    const pct = counts[key] / maxCount;
    const px = Math.max(4, Math.round(pct * 50));
    const fillEl = document.getElementById(fillId);
    if (fillEl) {
      fillEl.style.setProperty('--bar-size', `${px}px`);
      if (key === dominantKey) fillEl.classList.add('dominant');
    }
  });

  // Counts display
  const countsEl = document.getElementById('compass-counts');
  countsEl.innerHTML = dirs.map(d =>
    `<span class="dir-count ${d.key === dominantKey ? 'dominant-count' : ''}">${d.label} ${counts[d.key].toLocaleString()}</span>`
  ).join('');

  // Dominant label
  const dirNames = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
  document.getElementById('dominant-dir').textContent =
    counts[dominantKey] > 0
      ? `Dominant direction: ${dirNames[dominantKey]} (${counts[dominantKey].toLocaleString()} presses)`
      : 'No navigation data yet';
}

const SEQ_GLYPH = { D: '↓', U: '↑', L: '←', R: '→', E: '↵' };

function renderTopSequences(keySequences) {
  const container = document.getElementById('sequences-list');
  const entries = Object.entries(keySequences);
  if (entries.length === 0) {
    container.innerHTML = '<p class="no-data">Navigate more to see your patterns appear here.</p>';
    return;
  }
  const top5 = entries.sort((a, b) => b[1] - a[1]).slice(0, 5);
  container.innerHTML = top5.map(([seq, count]) => {
    const glyphs = seq.split('').map(c => SEQ_GLYPH[c] || c).join(' ');
    return `<div class="sequence-row">
      <span class="seq-glyphs">${glyphs}</span>
      <span class="seq-count">${count.toLocaleString()}×</span>
    </div>`;
  }).join('');
}

function renderActivityChart(dailyActions) {
  const container = document.getElementById('activity-chart');
  const today = new Date();
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, count: dailyActions[key] || 0 });
  }
  const maxCount = Math.max(...days.map(d => d.count), 1);
  container.innerHTML = days.map(({ key, count }) => {
    const heightPct = Math.round((count / maxCount) * 100);
    const label = key.slice(5); // MM-DD
    return `<div class="bar-col" title="${key}: ${count}">
      <div class="bar-inner" style="height:${heightPct}%"></div>
      <div class="bar-label">${label.replace('-', '/')}</div>
    </div>`;
  }).join('');
}

function renderWeekdayChart(weekdayActivity) {
  const container = document.getElementById('weekday-chart');
  const days = [
    { label: 'Sun', key: '0' },
    { label: 'Mon', key: '1' },
    { label: 'Tue', key: '2' },
    { label: 'Wed', key: '3' },
    { label: 'Thu', key: '4' },
    { label: 'Fri', key: '5' },
    { label: 'Sat', key: '6' }
  ];
  const counts = days.map(d => weekdayActivity[d.key] || 0);
  const maxCount = Math.max(...counts, 1);
  container.innerHTML = days.map(({ label }, i) => {
    const heightPct = Math.round((counts[i] / maxCount) * 100);
    return `<div class="bar-col" title="${label}: ${counts[i]}">
      <div class="bar-inner" style="height:${heightPct}%"></div>
      <div class="bar-label">${label}</div>
    </div>`;
  }).join('');
}
