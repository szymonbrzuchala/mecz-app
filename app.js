const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzgnPrlizHJdBl1cPxmFKJAHkXKbXBTkbWlxtByM46UeccX2kCJV3G-qI9AhZjO9WnN/exec";
const ADMIN_PASSWORD = "pilkanozna";

let playersData = [];
let availableDates = [];
let teamsByDate = {};
let selectedDate = "";
let currentTeams = null;
let useLocalFallback = false;

// Pobieranie najbliższego poniedziałku
function getNextMondayString() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() + (day === 0 ? 1 : (day === 1 ? 0 : 8 - day));
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Alfabetyczne sortowanie po Nazwisku (ostatni wyraz z ciągu tekstowego)
function sortPlayersByLastName(list) {
  return [...list].sort((a, b) => {
    const lastNameA = a.name.trim().split(' ').slice(-1)[0].toLowerCase();
    const lastNameB = b.name.trim().split(' ').slice(-1)[0].toLowerCase();
    if (lastNameA !== lastNameB) return lastNameA.localeCompare(lastNameB, 'pl');
    return a.name.localeCompare(b.name, 'pl');
  });
}

function switchTab(tabId, buttonEl) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if (buttonEl) buttonEl.classList.add('active');

  if (tabId === 'tab-players') openManagementTab();
  else if (tabId === 'tab-history') renderHistoryTable();
  else if (tabId === 'tab-main') render();
}

function openManagementTab() {
  const isAuthenticated = sessionStorage.getItem("isAdminAuthenticated") === "true";
  if (isAuthenticated) {
    document.getElementById("auth-container").style.display = "none";
    document.getElementById("management-content").style.display = "block";
    renderManagePlayers();
  } else {
    document.getElementById("auth-container").style.display = "block";
    document.getElementById("management-content").style.display = "none";
  }
}

function checkAdminPassword() {
  const input = document.getElementById("admin-password-input");
  const errorMsg = document.getElementById("auth-error");
  if (input && input.value === ADMIN_PASSWORD) {
    sessionStorage.setItem("isAdminAuthenticated", "true");
    document.getElementById("auth-container").style.display = "none";
    document.getElementById("management-content").style.display = "block";
    input.value = "";
    if (errorMsg) errorMsg.style.display = "none";
    renderManagePlayers();
  } else if (errorMsg) {
    errorMsg.style.display = "block";
  }
}

function logoutAdmin() {
  sessionStorage.removeItem("isAdminAuthenticated");
  openManagementTab();
}

// Główna funkcja ładująca dane z obsługą trybu awaryjnego lokalnego (Brak błędów!)
async function loadData() {
  const listDiv = document.getElementById('playersList');
  try {
    const response = await fetch(SCRIPT_URL);
    if (!response.ok) throw new Error("Błąd sieci");
    
    const result = await response.json();
    playersData = result.players || [];
    availableDates = result.dates || [];
    teamsByDate = result.teamsByDate || {};
    useLocalFallback = false;
  } catch (err) {
    console.warn("Przełączanie na tryb lokalny (localStorage failover):", err);
    useLocalFallback = true;
    playersData = JSON.parse(localStorage.getItem('local_players')) || [];
    availableDates = JSON.parse(localStorage.getItem('local_dates')) || ["15.07.2026"];
    teamsByDate = JSON.parse(localStorage.getItem('local_teams')) || {};
  }

  if (availableDates.length > 0 && !selectedDate) {
    selectedDate = availableDates[availableDates.length - 1];
  }

  const picker = document.getElementById('calendarPicker');
  if (picker && !picker.value) picker.value = getNextMondayString();

  renderDates();
  render();
}

function renderDates() {
  const select = document.getElementById('dateSelect');
  if (!select) return;
  select.innerHTML = '';
  availableDates.forEach(d => {
    select.innerHTML += `<option value="${d}" ${d === selectedDate ? 'selected' : ''}>${d}</option>`;
  });
  document.getElementById('selectedDateTitle').innerText = selectedDate || "-";
}

function onDateChange() {
  selectedDate = document.getElementById('dateSelect').value;
  document.getElementById('selectedDateTitle').innerText = selectedDate;
  render();
}

async function onCalendarPick(dateVal) {
  if (!dateVal) return;
  const parts = dateVal.split('-'); 
  const formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;

  if (!availableDates.includes(formattedDate)) {
    availableDates.push(formattedDate);
    if (useLocalFallback) {
      localStorage.setItem('local_dates', JSON.stringify(availableDates));
    } else {
      await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "ADD_DATE", dateStr: formattedDate })
      });
    }
    selectedDate = formattedDate;
    setTimeout(loadData, 1000);
  } else {
    selectedDate = formattedDate;
    renderDates();
    render();
  }
}

function togglePresence(idxInSorted) {
  const sortedPlayers = sortPlayersByLastName(playersData);
  const targetPlayer = sortedPlayers[idxInSorted];
  const realIdx = playersData.findIndex(p => p.name === targetPlayer.name);

  if (realIdx !== -1) {
    if (!playersData[realIdx].attendance) playersData[realIdx].attendance = {};
    const current = playersData[realIdx].attendance[selectedDate] || 'x';
    playersData[realIdx].attendance[selectedDate] = (current === 'y') ? 'x' : 'y';
    render();
  }
}

async function saveAttendance() {
  const map = {};
  playersData.forEach(p => {
    map[p.name] = (p.attendance && p.attendance[selectedDate]) ? p.attendance[selectedDate] : 'x';
  });

  if (useLocalFallback) {
    localStorage.setItem('local_players', JSON.stringify(playersData));
  } else {
    await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "UPDATE_ATTENDANCE", dateStr: selectedDate, attendanceMap: map })
    });
  }
  alert("Zapisano obecności!");
}

function render() {
  const listDiv = document.getElementById('playersList');
  if (!listDiv) return;
  listDiv.innerHTML = '';

  if (playersData.length === 0) {
    listDiv.innerHTML = '<p>Brak graczy. Dodaj ich w zakładce Zawodnicy.</p>';
  } else {
    sortPlayersByLastName(playersData).forEach((p, idx) => {
      const status = (p.attendance && p.attendance[selectedDate]) ? p.attendance[selectedDate] : 'x';
      const isPresent = status === 'y';
      listDiv.innerHTML += `
        <div class="player-row">
          <span class="player-name">${p.name}</span>
          <button class="btn-status ${isPresent ? 'btn-status-y' : 'btn-status-x'}" onclick="togglePresence(${idx})">${isPresent ? 'Y' : 'X'}</button>
        </div>`;
    });
  }

  const matchSection = document.getElementById('matchSection');
  if (teamsByDate[selectedDate] && teamsByDate[selectedDate].t1 && teamsByDate[selectedDate].t1.length > 0) {
    currentTeams = teamsByDate[selectedDate];
    displayTeams(currentTeams.t1, currentTeams.t2);
    if (matchSection) matchSection.style.display = 'block';
  } else {
    currentTeams = null;
    if (matchSection) matchSection.style.display = 'none';
  }

  const tbody = document.querySelector('#rankTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    const sortedByPoints = [...playersData].sort((a, b) => {
      const pA = (a.wins * 3) + (a.draws * 1);
      const pB = (b.wins * 3) + (b.draws * 1);
      return pB !== pA ? pB - pA : b.wins - a.wins;
    });

    sortedByPoints.forEach((p, i) => {
      tbody.innerHTML += `
        <tr>
          <td><b>${i + 1}</b></td>
          <td style="text-align: left;"><b>${p.name}</b></td>
          <td><strong>${(p.wins * 3) + (p.draws * 1)}</strong></td>
          <td>${p.wins}</td>
          <td>${p.draws}</td>
          <td>${p.losses}</td>
        </tr>`;
    });
  }
}

function displayTeams(t1, t2) {
  const s1 = t1.reduce((acc, p) => acc + (p.rating || p.currentRating || 0), 0).toFixed(2);
  const s2 = t2.reduce((acc, p) => acc + (p.rating || p.currentRating || 0), 0).toFixed(2);
  document.getElementById('team1Box').innerHTML = `<h3>Drużyna A (${s1})</h3><ul>${t1.map(p => `<li>${p.name}</li>`).join('')}</ul>`;
  document.getElementById('team2Box').innerHTML = `<h3>Drużyna B (${s2})</h3><ul>${t2.map(p => `<li>${p.name}</li>`).join('')}</ul>`;
}

async function generateTeams() {
  const active = playersData.filter(p => (p.attendance && p.attendance[selectedDate] === 'y'));
  const size = parseInt(document.getElementById('gameModeSelect').value);
  const req = size * 2;

  if (active.length === 0) return alert("Brak obecnych graczy!");

  const avg = active.reduce((acc, p) => acc + p.currentRating, 0) / active.length;
  let pool = active.map(p => ({ name: p.name, rating: p.currentRating }));

  while (pool.length < req) {
    pool.push({ name: `Dodatkowy Gracz ${pool.length - active.length + 1}`, rating: parseFloat(avg.toFixed(2)) });
  }

  let valid = [];
  for (let i = 0; i < 500; i++) {
    const shuf = [...pool].sort(() => Math.random() - 0.5);
    const t1 = shuf.slice(0, size), t2 = shuf.slice(size);
    const sum1 = t1.reduce((acc, p) => acc + p.rating, 0), sum2 = t2.reduce((acc, p) => acc + p.rating, 0);
    const diff = Math.abs(sum1 - sum2);
    if (diff <= 1.5) valid.push({ t1, t2 });
  }

  const res = valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : { t1: pool.slice(0, size), t2: pool.slice(size) };
  currentTeams = res;
  teamsByDate[selectedDate] = currentTeams;
  displayTeams(res.t1, res.t2);
  document.getElementById('matchSection').style.display = 'block';

  if (useLocalFallback) {
    localStorage.setItem('local_teams', JSON.stringify(teamsByDate));
  } else {
    await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "SAVE_TEAMS", dateStr: selectedDate, t1: res.t1, t2: res.t2 })
    });
  }
}

async function recordMatch(winner) {
  if (!currentTeams) return;
  const payload = { action: "RECORD_MATCH", winnerTeam: winner, dateStr: selectedDate, team1Names: currentTeams.t1.map(p => p.name), team2Names: currentTeams.t2.map(p => p.name) };

  if (useLocalFallback) {
    currentTeams.t1.forEach(p => {
      let f = playersData.find(x => x.name === p.name);
      if (f) { if (winner === 1) f.wins++; else if (winner === 0) f.draws++; else f.losses++; }
    });
    currentTeams.t2.forEach(p => {
      let f = playersData.find(x => x.name === p.name);
      if (f) { if (winner === 2) f.wins++; else if (winner === 0) f.draws++; else f.losses++; }
    });
    localStorage.setItem('local_players', JSON.stringify(playersData));
  } else {
    await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload) });
  }
  alert("Mecz zapisany!");
  setTimeout(loadData, 1000);
}

function renderManagePlayers() {
  const container = document.getElementById('managePlayersList');
  if (!container) return;
  container.innerHTML = '';
  sortPlayersByLastName(playersData).forEach(p => {
    container.innerHTML += `
      <div class="player-row">
        <span><b>${p.name}</b> (Baza: ${p.baseRating} | Rating: ${p.currentRating} | Pkt: ${(p.wins * 3) + (p.draws * 1)})</span>
        <div style="display:flex; gap:4px;">
          <button class="btn-blue btn-small" onclick="updateRatingPrompt('${p.name}', ${p.baseRating})">Edytuj</button>
          <button class="btn-danger btn-small" onclick="deletePlayer('${p.name}')">Usuń</button>
        </div>
      </div>`;
  });
}

async function addPlayer() {
  const n = document.getElementById('pName').value.trim(), r = parseFloat(document.getElementById('pRating').value);
  if (!n || isNaN(r)) return alert("Błędne dane!");

  if (useLocalFallback) {
    playersData.push({ name: n, baseRating: r, wins: 0, draws: 0, losses: 0, currentRating: r, attendance: {} });
    localStorage.setItem('local_players', JSON.stringify(playersData));
  } else {
    await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "ADD_PLAYER", name: n, baseRating: r }) });
  }
  document.getElementById('pName').value = ''; document.getElementById('pRating').value = '';
  setTimeout(loadData, 1000);
}

async function deletePlayer(name) {
  if (!confirm("Usunąć?")) return;
  if (useLocalFallback) {
    playersData = playersData.filter(x => x.name !== name);
    localStorage.setItem('local_players', JSON.stringify(playersData));
  } else {
    await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "DELETE_PLAYER", name: name }) });
  }
  setTimeout(loadData, 1000);
}

async function updateRatingPrompt(name, currentBase) {
  const r = prompt("Nowa ocena (1-10):", currentBase);
  if (!r || isNaN(parseFloat(r))) return;
  if (useLocalFallback) {
    let f = playersData.find(x => x.name === name);
    if (f) f.baseRating = parseFloat(r);
    localStorage.setItem('local_players', JSON.stringify(playersData));
  } else {
    await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "UPDATE_PLAYER_RATING", name: name, baseRating: parseFloat(r) }) });
  }
  setTimeout(loadData, 1000);
}

function renderHistoryTable() {
  const thead = document.querySelector('#historyTable thead'), tbody = document.querySelector('#historyTable tbody');
  let head = `<tr><th>Zawodnik</th>`;
  availableDates.forEach(d => head += `<th>${d}</th>`);
  thead.innerHTML = head + `</tr>`;
  tbody.innerHTML = '';
  sortPlayersByLastName(playersData).forEach(p => {
    let r = `<tr><td style="text-align:left;"><b>${p.name}</b></td>`;
    availableDates.forEach(d => r += `<td>${(p.attendance && p.attendance[d]) ? p.attendance[d] : '-'}</td>`);
    tbody.innerHTML += r + `</tr>`;
  });
}

loadData();
