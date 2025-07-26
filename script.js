let matchesData = [];
let grantsData = [];
let rerankedLoaded = false;
let grantsMap;
let researcherNames = [];
let providerChart;
let deadlineChart;
let grantsTable;
let currentResearcher = null;
const API_BASE = "https://ggm-backend.onrender.com";

// ---------- Google Analytics event helper ----------
function track(eventName, params = {}) {
  try {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params);
    }
  } catch (err) {
    /* no-op */
  }
}

function showLandingWizard() {
  const container = document.getElementById('grants');
  container.innerHTML = `
    <div class="landing-wizard">
      <img src="assets/wizardoc.png" alt="Cartoon robot scanning grant proposals">
    </div>`;
}

async function loadData() {
  const [matchesResp, grantsResp] = await Promise.all([
    fetch('reranked_matches.json').catch(() => null),
    fetch('grants.json'),
  ]);

  let matchesText;
  if (matchesResp && matchesResp.ok) {
    rerankedLoaded = true;
    matchesText = await matchesResp.text();
  } else {
    const fallback = await fetch('matches.json');
    matchesText = await fallback.text();
  }
  const grantsText = await grantsResp.text();

  matchesData = JSON.parse(matchesText);
  grantsData = JSON.parse(grantsText);
  grantsMap = new Map(grantsData.map(g => [String(g.grant_id), g]));

  researcherNames = matchesData.map((m) => m.name);
}

function createSuggestion(name) {
  const div = document.createElement('div');
  div.className = 'suggestion-item';
  div.tabIndex = 0;
  div.textContent = name;
  div.addEventListener('click', () => {
    selectResearcher(name);
  });
  return div;
}

function updateSuggestions(value) {
  const suggBox = document.getElementById('suggestions');
  suggBox.innerHTML = '';

  if (!value) {
    suggBox.style.display = 'none';
    return;
  }

  const filtered = researcherNames
    .filter((n) => n.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 8);

  if (filtered.length === 0) {
    suggBox.style.display = 'none';
    return;
  }

  filtered.forEach((name) => suggBox.appendChild(createSuggestion(name)));
  suggBox.style.display = 'block';
}

function selectResearcher(name) {
  document.getElementById('researcher-input').value = name;
  document.getElementById('suggestions').style.display = 'none';
  showGrants(name);
  track('select_researcher', { researcher_name: name });
}

function formatDate(raw) {
  if (!raw) return '';
  let arr;
  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    try {
      // Python-style string "['…','…']" -> JSON parse
      arr = JSON.parse(raw.replace(/'/g, '"'));
    } catch {
      // simple "YYYY-MM-DD HH:MM:SS" string
      arr = [raw];
    }
  }
  const MONTHS = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ];

  const pretty = (ts) => {
    const [datePart, timePart] = ts.split(' ');
    let dd, mm, yyyy;
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      // got YYYY-MM-DD -> flip order
      [yyyy, mm, dd] = datePart.split('-');
    } else {
      [dd, mm, yyyy] = datePart.split('-');
    }
    const [hh, min] = timePart.split(':');
    return `${dd} ${MONTHS[Number(mm) - 1]} ${yyyy} ${hh}:${min}`;
  };

  /* 3 ▸ format one or many dates */
  return arr.map(pretty).join(' / ');
}

function moneyFmt(m) {
  if (m === null || m === undefined || Number.isNaN(m)) return '';
  return m.toLocaleString();
}

function createGrantCard(grant, matchReason = null) {
  const card = document.createElement('div');
  card.className = 'grant';

  card.innerHTML = `
      <h3>${grant.title}</h3>
      <p><strong>Provider:</strong> ${grant.provider}</p>
      <p><strong>Due Date:</strong> ${formatDate(grant.due_date)}</p>
      <p><strong>Proposed Money:</strong> ${moneyFmt(grant.proposed_money)}</p>
      <p><a href="${grant.submission_link}" target="_blank" rel="noopener">Submission Link ↗</a></p>
    `;

  // Track outbound submission link clicks
  card.querySelector('a').addEventListener('click', () =>
    track('click_submission_link', {
      grant_id: grant.grant_id,
      provider: grant.provider
    })
  );

  // Summary toggle
  const btn = document.createElement('button');
  btn.className = 'summary-toggle';
  btn.textContent = '▶ Summary';

  const summary = document.createElement('div');
  summary.className = 'summary';
  summary.textContent = grant.summary_text;
  summary.hidden = true;

  btn.addEventListener('click', () => {
    const open = !summary.hidden;
    summary.hidden = open; // toggle visibility
    btn.textContent = open ? '▶ Summary' : '▼ Summary';
    track(open ? 'collapse_summary' : 'expand_summary', { grant_id: grant.grant_id });
  });

  if (matchReason) {
    const whyBtn = document.createElement('button');
    whyBtn.className = 'summary-toggle';
    whyBtn.textContent = '▶ Ask AI Why';
    const reason = document.createElement('div');
    reason.className = 'ai-reason';
    reason.textContent = matchReason;
    reason.hidden = true;
    whyBtn.addEventListener('click', () => {
      const open = !reason.hidden;
      reason.hidden = open;
      whyBtn.textContent = open ? '▶ Ask AI Why' : '▼ Ask AI Why';
    });
    card.appendChild(whyBtn);
    card.appendChild(reason);
  }

  const voteBox = document.createElement('div');
  voteBox.className = 'vote-controls';
  voteBox.innerHTML = `
    <button class="like-btn" aria-label="Like">👍 <span class="count">0</span></button>
    <button class="dislike-btn" aria-label="Dislike">👎 <span class="count">0</span></button>
    <span class="vote-message" aria-live="polite"></span>
  `;

  card.appendChild(voteBox);

  card.appendChild(btn);
  card.appendChild(summary);

  return card;
}

function parseDueDate(raw) {
  if (!raw) return null;
  let str = '';
  if (Array.isArray(raw)) {
    str = raw[0];
  } else {
    try {
      const arr = JSON.parse(raw.replace(/'/g, '"'));
      str = Array.isArray(arr) ? arr[0] : arr;
    } catch {
      str = raw;
    }
  }
  const [datePart, timePart = '00:00:00'] = str.split(' ');
  let dd, mm, yyyy;
  if (/^\d{4}-\d{2}-\d{2}/.test(datePart)) {
    [yyyy, mm, dd] = datePart.split('-');
  } else {
    [dd, mm, yyyy] = datePart.split('-');
  }
  return new Date(`${yyyy}-${mm}-${dd}T${timePart}Z`);
}

function setupVoting(card, grantId) {
  const likeBtn = card.querySelector('.like-btn');
  const dislikeBtn = card.querySelector('.dislike-btn');
  const likeCount = likeBtn.querySelector('.count');
  const dislikeCount = dislikeBtn.querySelector('.count');
  const msg = card.querySelector('.vote-message');
  let userVote = null;

  async function refreshCounts() {
    try {
      const resp = await fetch(`${API_BASE}/votes/${grantId}`);
      if (resp.ok) {
        const data = await resp.json();
        likeCount.textContent = data.likes ?? 0;
        dislikeCount.textContent = data.dislikes ?? 0;
      }
    } catch {}
  }

  async function refreshUser() {
    if (!currentResearcher) return;
    try {
      const resp = await fetch(`${API_BASE}/vote/${grantId}/${encodeURIComponent(currentResearcher)}`);
      if (resp.ok) {
        const data = await resp.json();
        userVote = data.action;
      } else {
        userVote = null;
      }
    } catch {
      userVote = null;
    }
    applyState();
  }

  function applyState() {
    likeBtn.classList.toggle('active-like', userVote === 'like');
    dislikeBtn.classList.toggle('active-dislike', userVote === 'dislike');
  }

  async function send(action) {
    if (!currentResearcher) return;
    try {
      let resp;
      if (userVote === action) {
        resp = await fetch(`${API_BASE}/vote/${grantId}/${encodeURIComponent(currentResearcher)}`, { method: 'DELETE' });
        if (resp.ok) userVote = null;
      } else {
        resp = await fetch(`${API_BASE}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grant_id: grantId, researcher_id: currentResearcher, action })
        });
        if (resp.ok) userVote = action;
      }
      if (resp && resp.status === 429) {
        msg.textContent = 'Slow down';
        setTimeout(() => (msg.textContent = ''), 2000);
      }
    } catch {}
    applyState();
    refreshCounts();
  }

  likeBtn.addEventListener('click', () => send('like'));
  dislikeBtn.addEventListener('click', () => send('dislike'));
  refreshCounts();
  refreshUser();
}

function animateNumber(el, value, duration = 800) {
  if (!el) return;
  const start = performance.now();
  const nf = new Intl.NumberFormat();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = nf.format(Math.floor(progress * value));
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function showDashboard() {
  const grantTotal = grantsData.length;
  const researcherTotal = matchesData.length;
  const matchTotal = matchesData.reduce((s, r) => s + (r.grants ? r.grants.length : 0), 0);

  animateNumber(document.getElementById('grant-count'), grantTotal);
  animateNumber(document.getElementById('researcher-count'), researcherTotal);
  animateNumber(document.getElementById('match-count'), matchTotal);

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim();
  const primary = styles.getPropertyValue('--primary').trim();

  const providerCounts = {};
  grantsData.forEach(g => {
    const label = g.provider.startsWith('HORIZON') ? 'EU Horizon' : g.provider;
    providerCounts[label] = (providerCounts[label] || 0) + 1;
  });
  const providerLabels = Object.keys(providerCounts);
  const providerValues = providerLabels.map(l => providerCounts[l]);

  if (providerChart) providerChart.destroy();
  providerChart = new Chart(document.getElementById('providerChart'), {
    type: 'doughnut',
    data: {
      labels: providerLabels,
      datasets: [{
        data: providerValues,
        backgroundColor: providerLabels.map((_, i) => i % 2 ? primary : accent),
        borderColor: '#ffffff',
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Grants by Provider',
            color: '#213646',
            font: {
              size: 18,
              weight: 'bold'
            },
            padding: {
              top: 10,
              bottom: 10
            }
          }
        },
      animation: { duration: 800 },
      aspectRatio: 2
    }
  });

  const now = new Date();
  const baseIndex = now.getFullYear() * 12 + now.getMonth();
  const months = [];
  const monthCounts = new Array(6).fill(0);

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(d.toLocaleString('default', { month: 'short' }));
  }

  grantsData.forEach(g => {
    const d = parseDueDate(g.due_date);
    if (!d || isNaN(d)) return;
    const idx = d.getFullYear() * 12 + d.getMonth() - baseIndex;
    if (idx >= 0 && idx < 6) monthCounts[idx]++;
  });

  if (deadlineChart) deadlineChart.destroy();
  deadlineChart = new Chart(document.getElementById('deadlineChart'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        data: monthCounts,
        backgroundColor: accent
      }]
    },
    options: {
      plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Upcoming Deadlines (Next 6 Months)',
            color: '#213646',
            font: {
              size: 18,
              weight: 'bold'
            },
            padding: {
              top: 10,
              bottom: 10
            }
          }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eeeeee' } },
        x: { grid: { display: false } }
      },
      animation: { duration: 800 },
      aspectRatio: 2
    }
  });
}

function showTab(name) {
  const rec = document.getElementById('recommendations');
  const dash = document.getElementById('dashboard');
  const grantsSec = document.getElementById('tab-grants');
  const recTab = document.getElementById('tab-recommendations');
  const grantsTab = document.getElementById('tab-grants-btn');
  const statTab = document.getElementById('tab-stats');

  const allSecs = [rec, dash, grantsSec];
  const allTabs = [recTab, grantsTab, statTab];
  allSecs.forEach(sec => sec.classList.add('hidden'));
  allTabs.forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  if (name === 'stats') {
    dash.classList.remove('hidden');
    statTab.classList.add('active');
    statTab.setAttribute('aria-selected', 'true');
    requestAnimationFrame(showDashboard);
    track('view_stats_tab');
  } else if (name === 'grants') {
    grantsSec.classList.remove('hidden');
    grantsTab.classList.add('active');
    grantsTab.setAttribute('aria-selected', 'true');
    if (!grantsTable) initGrantsTable();
    track('view_grants_tab');
  } else {
    rec.classList.remove('hidden');
    recTab.classList.add('active');
    recTab.setAttribute('aria-selected', 'true');
    track('view_recommendations_tab');
  }
}

function showGrants(name) {
  currentResearcher = name;
  const grantsContainer = document.getElementById('grants');
  grantsContainer.innerHTML = '';

  const match = matchesData.find((m) => m.name === name);
  if (!match) return;

  match.grants.forEach((g) => {
    const id = typeof g === 'object' ? g.grant_id : g;
    const reason = typeof g === 'object' ? g.match_reason : null;
    const grant = grantsMap.get(String(id));
    if (!grant) return;
    const card = createGrantCard(grant, reason);
    grantsContainer.appendChild(card);
    setupVoting(card, grant.grant_id);
  });

  grantsContainer.dispatchEvent(
    new CustomEvent('grantsUpdated', { detail: { name } })
  );
}

function initGrantsTable() {
  const idToNames = {};
  matchesData.forEach(m => {
    if (!Array.isArray(m.grants)) return;
    if (rerankedLoaded) {
      m.grants.forEach(g => {
        const id = typeof g === 'object' ? g.grant_id : g;
        if (!idToNames[id]) idToNames[id] = [];
        idToNames[id].push(m.name);
      });
    } else {
      m.grants.forEach(id => {
        if (!idToNames[id]) idToNames[id] = [];
        idToNames[id].push(m.name);
      });
    }
  });

  const rows = grantsData.map(g => ({
    grant_id: g.grant_id,
    provider: g.provider,
    title: g.title,
    due_date: formatDate(g.due_date),
    money: g.proposed_money,
    suggested_collaborators: idToNames[g.grant_id]
      ? idToNames[g.grant_id]
          .slice(0, 10)
          .join(' <strong>·</strong> ')
      : '',
    link: g.submission_link,
  }));

  grantsTable = $('#grants-table').DataTable({
    data: rows,
    responsive: true,
    colReorder: true,
    dom: 'Bfrtip',
    searchHighlight: true,
    buttons: [
      { extend: 'csvHtml5', text: 'Export CSV', exportOptions: { columns: ':visible' }, title: 'grants', filename: 'grants',
        action: function(e, dt, button, config) {
          track('export_grants_csv');
          $.fn.dataTable.ext.buttons.csvHtml5.action.call(this, e, dt, button, config);
        }
      },
      'colvis'
    ],
    columns: [
      { data: 'grant_id', title: 'ID' },
      { data: 'provider', title: 'Provider' },
      { data: 'title', title: 'Title' },
      { data: 'due_date', title: 'Due Date' },
      { data: 'money', title: 'Money' },
      { data: 'suggested_collaborators', title: 'Suggested Collaborators' },
      { data: 'link', title: 'Link', orderable: false, render: d => `<a href="${d}" target="_blank" rel="noopener">Open</a>` },
    ]
  });

  $('#grant-global-search').on('input', function(){
    grantsTable.search(this.value).draw();
    track('search_grants', { query: this.value });
  });

}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff} seconds ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hours ago`;
  const d = Math.floor(h / 24);
  return `${d} days ago`;
}

async function loadHealth() {
  const box = document.getElementById('health-widget');
  if (!box) return;
  box.textContent = 'Loading...';
  try {
    const resp = await fetch(`${API_BASE}/health`);
    if (!resp.ok) throw resp;
    const data = await resp.json();
    box.innerHTML = `<strong>${data.total_votes} total votes</strong> · ${data.unique_grants} grants · ${data.unique_researchers} researchers`+
      `<br>Top grant #${data.top_grant.grant_id} (👍 ${data.top_grant.likes} / 👎 ${data.top_grant.dislikes})`+
      `<br>Last vote ${timeAgo(data.last_vote)}`;
  } catch (err) {
    if (err.status == 429) box.textContent = 'Slow down';
    else box.textContent = 'Error loading stats';
  }
}

function startHealthPolling() {
  loadHealth();
  setInterval(loadHealth, 60000);
}

async function init() {
  await loadData();

  showLandingWizard();
  startHealthPolling();

  document.getElementById('tab-recommendations').addEventListener('click', () => showTab('recommendations'));
  document.getElementById('tab-grants-btn').addEventListener('click', () => showTab('grants'));
  document.getElementById('tab-stats').addEventListener('click', () => showTab('stats'));

  const linkedInLink = document.querySelector('footer .linkedin');
  if (linkedInLink) {
    linkedInLink.addEventListener('click', () => track('click_linkedin'));
  }

  const input = document.getElementById('researcher-input');
  input.addEventListener('input', (e) => updateSuggestions(e.target.value));
  input.addEventListener('focus', (e) => updateSuggestions(e.target.value));
  document.addEventListener('click', (e) => {
    if (!document.querySelector('.selector').contains(e.target)) {
      document.getElementById('suggestions').style.display = 'none';
    }
  });

  showTab('recommendations');
}

document.addEventListener('DOMContentLoaded', init);
