const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbygGVjRb8hIJTXc_YTBfkW5De_1X8492JBKsrAvo6yvQGzhJ9Jab1r6J2xURl5g4yPJ/exec";
const ADMIN_PASSWORD = "pilkanozna";

let playersData = [];
let availableDates = [];
let teamsByDate = {};
let selectedDate = "";
let currentTeams = null;

// Helper do wyznaczania najbliższego poniedziałku
function getNextMondayString() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() + (day === 0 ? 1 : (day === 1 ? 0 : 8 - day));
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Funkcja pomocnicza do sortowania graczy alfabetycznie po Nazwisku
function sortPlayersByLastName(list) {
  return [...list].sort((a, b) => {
    const lastNameA = a.name.trim().split(' ').slice(-1)[0].toLowerCase();
    const lastNameB = b.name.trim().split(' ').slice(-1)[0].toLowerCase();
    if (lastNameA !== lastNameB) return lastNameA.localeCompare(lastNameB, 'pl');
    return a.name.localeCompare(b.name, 'pl');
  });
}

// ==========================================
// 1. ZAKŁADKI I HASŁO
// ==========================================

function switchTab(tabId, buttonEl) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  if (buttonEl) buttonEl.classList.add('active');

  if (tabId === 'tab-players') {
    openManagementTab();
  } else if (tabId === 'tab-history') {
    renderHistoryTable();
  } else if (tabId === 'tab-main') {
    render();
  }
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

document.getElementById("admin-password-input")?.addEventListener("keyup", function(event) {
  if (event.key === "Enter") checkAdminPassword();
});

// ==========================================
// 2. LOGIKA GOOGLE SHEETS
// ==========================================

async function loadData() {
  const listDiv = document.getElementById('playersList');
  if (listDiv) listDiv.innerHTML = '<i>Ładowanie danych z Google Sheets...</i>';

  try {
    const response = await fetch(SCRIPT_URL);
    const result = await response.json();
    
    playersData = result.players || [];
    availableDates = result.dates || [];
    teamsByDate = result.teamsByDate || {};

    if (availableDates.length > 0 && !selectedDate) {
      selectedDate = availableDates[availableDates.length - 1];
    }

    // Ustawianie domyślnej daty w kalendarzu na najbliższy poniedziałek
    const picker = document.getElementById('calendarPicker');
    if (picker && !picker.value) {
      picker.value = getNextMondayString();
    }

    renderDates();
    render();
    if (sessionStorage.getItem("isAdminAuthenticated") === "true") {
      renderManagePlayers();
    }
  } catch (err) {
    alert("Błąd połączenia z Google Sheets!");
    console.error(err);
  }
}

function renderDates() {
  const select = document.getElementById('dateSelect');
  if (!select) return;
  select.innerHTML = '';
  availableDates.forEach(d => {
    select.innerHTML += `<option value="${d}" ${d === selectedDate ? 'selected' : ''}>${d}</option>`;
  });
  const dateTitle = document.getElementById('selectedDateTitle');
  if (dateTitle) dateTitle.innerText = selectedDate || "Brak";
}

function onDateChange() {
  const select = document.getElementById('dateSelect');
  if (select) {
    selectedDate = select.value;
    const dateTitle = document.getElementById('selectedDateTitle');
    if (dateTitle) dateTitle.innerText = selectedDate;
    render();
  }
}

async function onCalendarPick(dateVal) {
  if (!dateVal) return;
  const parts = dateVal.split('-'); // YYYY-MM-DD -> DD.MM.YYYY
  const formattedDate = `${parts[2]}.${parts[1]}.${parts[0]}`;

  if (!availableDates.includes(formattedDate)) {
    await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ADD_DATE", dateStr: formattedDate })
    });
    selectedDate = formattedDate;
    setTimeout(loadData, 1200);
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

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "UPDATE_ATTENDANCE", dateStr: selectedDate, attendanceMap: map })
  });

  alert("Zapisano obecności!");
}

// ==========================================
// 3. RENDEROWANIE STRONY GŁÓWNEJ
// ==========================================

function render() {
  const listDiv = document.getElementById('playersList');
  if (!listDiv) return;

  listDiv.innerHTML = '';

  if (playersData.length === 0) {
    listDiv.innerHTML = '<p>Brak graczy w bazie.</p>';
  } else {
    const sortedAlphabetically = sortPlayersByLastName(playersData);

    sortedAlphabetically.forEach((p, idx) => {
      const status = (p.attendance && p.attendance[selectedDate]) ? p.attendance[selectedDate] : 'x';
      const isPresent = status === 'y';
      const btnClass = isPresent ? 'btn-status-y' : 'btn-status-x';
      const statusText = isPresent ? 'Y' : 'X';
      
      listDiv.innerHTML += `
        <div class="player-row">
          <span class="player-name">${p.name}</span>
          <button class="btn-status ${btnClass}" onclick="togglePresence(${idx})">${statusText}</button>
        </div>
      `;
    });
  }

  // Odczyt i wyświetlanie wylosowanych drużyn dla wybranej daty
  const matchSection = document.getElementById('matchSection');
  if (teamsByDate[selectedDate] && teamsByDate[selectedDate].t1 && teamsByDate[selectedDate].t1.length > 0) {
    currentTeams = teamsByDate[selectedDate];
    displayTeams(currentTeams.t1, currentTeams.t2);
    if (matchSection) matchSection.style.display = 'block';
  } else {
    currentTeams = null;
    if (matchSection) matchSection.style.display = 'none';
  }

  // Tabela Ligowa (Sortowana po Punktach)
  const tbody = document.querySelector('#rankTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    
    // Punkty = Wygrane * 3 + Remisy * 1
    const sortedByPoints = [...playersData].sort((a, b) => {
      const pointsA = (a.wins * 3) + (a.draws * 1);
      const pointsB = (b.wins * 3) + (b.draws * 1);
      if (pointsB !== pointsA) return pointsB - pointsA;
      return b.wins - a.wins; // W przypadku remisu punktowego decydują wygrane
    });

    sortedByPoints.forEach((p, index) => {
      const points = (p.wins * 3) + (p.draws * 1);
      tbody.innerHTML += `
        <tr>
          <td><b>${index + 1}</b></td>
          <td style="text-align: left;"><b>${p.name}</b></td>
          <td><strong>${points}</strong></td>
          <td>${p.wins}</td>
          <td>${p.draws}</td>
          <td>${p.losses}</td>
        </tr>
      `;
    });
  }
}

function displayTeams(t1, t2) {
  const sum1 = t1.reduce((acc, p) => acc + (p.rating || p.currentRating || 0), 0).toFixed(2);
  const sum2 = t2.reduce((acc, p) => acc + (p.rating || p.currentRating || 0), 0).toFixed(2);

  const t1Box = document.getElementById('team1Box');
  const t2Box = document.getElementById('team2Box');

  if (t1Box) {
    t1Box.innerHTML = `
      <h3>Drużyna A (${sum1})</h3>
      <ul>${t1.map(p => `<li>${p.name}</li>`).join('')}</ul>
    `;
  }

  if (t2Box) {
    t2Box.innerHTML = `
      <h3>Drużyna B (${sum2})</h3>
      <ul>${t2.map(p => `<li>${p.name}</li>`).join('')}</ul>
    `;
  }
}

// ==========================================
// 4. GENERATOR SKŁADÓW (5v5 / 6v6)
// ==========================================

async function generateTeams() {
  const activePlayers = playersData.filter(p => (p.attendance && p.attendance[selectedDate] === 'y'));
  const modeSelect = document.getElementById('gameModeSelect');
  const targetPerTeam = modeSelect ? parseInt(modeSelect.value) : 6;
  const totalRequired = targetPerTeam * 2;

  if (activePlayers.length === 0) return alert("Brak graczy zaznaczonych na Y!");

  const avgRating = activePlayers.reduce((acc, p) => acc + p.currentRating, 0) / activePlayers.length;
  let pool = activePlayers.map(p => ({ name: p.name, rating: p.currentRating }));

  const missingCount = totalRequired - pool.length;
  if (missingCount > 0) {
    for (let i = 1; i <= missingCount; i++) {
      pool.push({ name: `Dodatkowy Gracz ${i}`, rating: parseFloat(avgRating.toFixed(2)) });
    }
  }

  let validCombinations = [];
  let minDiff = Infinity;

  for (let i = 0; i < 500; i++) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const t1 = shuffled.slice(0, targetPerTeam);
    const t2 = shuffled.slice(targetPerTeam);

    const sum1 = t1.reduce((acc, p) => acc + p.rating, 0);
    const sum2 = t2.reduce((acc, p) => acc + p.rating, 0);
    const diff = Math.abs(sum1 - sum2);

    if (diff < minDiff) minDiff = diff;

    if (diff <= 1.5) {
      validCombinations.push({ t1, t2, sum1, sum2 });
    }
  }

  let selectedCombo;
  if (validCombinations.length > 0) {
    selectedCombo = validCombinations[Math.floor(Math.random() * validCombinations.length)];
  } else {
    selectedCombo = { t1: pool.slice(0, targetPerTeam), t2: pool.slice(targetPerTeam) };
  }

  currentTeams = { t1: selectedCombo.t1, t2: selectedCombo.t2 };
  teamsByDate[selectedDate] = currentTeams;

  displayTeams(currentTeams.t1, currentTeams.t2);

  const matchSection = document.getElementById('matchSection');
  if (matchSection) matchSection.style.display = 'block';

  // Zapis wylosowanych drużyn w Google Sheets dla wybranego dnia
  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "SAVE_TEAMS", dateStr: selectedDate, t1: currentTeams.t1, t2: currentTeams.t2 })
  });
}

async function recordMatch(winnerTeam) {
  if (!currentTeams) return alert("Brak drużyn dla tego dnia!");

  const payload = {
    action: "RECORD_MATCH",
    winnerTeam: winnerTeam,
    dateStr: selectedDate,
    team1Names: currentTeams.t1.map(p => p.name),
    team2Names: currentTeams.t2.map(p => p.name)
  };

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  alert("Wynik meczu został zapisany!");
  setTimeout(loadData, 1500);
}

// ==========================================
// 5. ZARZĄDZANIE GRACZAMI
// ==========================================

function renderManagePlayers() {
  const container = document.getElementById('managePlayersList');
  if (!container) return;
  container.innerHTML = '';

  const sortedAlphabetically = sortPlayersByLastName(playersData);

  sortedAlphabetically.forEach(p => {
    const points = (p.wins * 3) + (p.draws * 1);
    container.innerHTML += `
      <div class="player-row">
        <span><b>${p.name}</b> (Baza: <b>${p.baseRating}</b> | Rating: <b>${p.currentRating}</b> | Pkt: <b>${points}</b>)</span>
        <div style="display: flex; gap: 4px;">
          <button class="btn-blue btn-small" onclick="updateRatingPrompt('${p.name}', ${p.baseRating})">Edytuj</button>
          <button class="btn-danger btn-small" onclick="deletePlayer('${p.name}')">Usuń</button>
        </div>
      </div>
    `;
  });
}

async function addPlayer() {
  const nameInput = document.getElementById('pName');
  const ratingInput = document.getElementById('pRating');

  if (!nameInput || !ratingInput) return;

  const name = nameInput.value.trim();
  const rating = parseFloat(ratingInput.value);

  if (!name || isNaN(rating) || rating < 1 || rating > 10) {
    return alert("Wprowadź imię i ocenę 1-10!");
  }

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ADD_PLAYER", name: name, baseRating: rating })
  });

  nameInput.value = '';
  ratingInput.value = '';
  alert(`Dodano zawodnika ${name}.`);
  setTimeout(loadData, 1500);
}

async function deletePlayer(name) {
  if (!confirm(`Usunąć ${name}?`)) return;

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "DELETE_PLAYER", name: name })
  });

  setTimeout(loadData, 1500);
}

async function updateRatingPrompt(name, currentBase) {
  const newRating = prompt(`Nowa ocena (1-10) dla ${name}:`, currentBase);
  if (newRating === null || isNaN(parseFloat(newRating))) return;

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "UPDATE_PLAYER_RATING", name: name, baseRating: parseFloat(newRating) })
  });

  setTimeout(loadData, 1500);
}

// ==========================================
// 6. PRZEGLĄD WYNIKÓW
// ==========================================

function renderHistoryTable() {
  const thead = document.querySelector('#historyTable thead');
  const tbody = document.querySelector('#historyTable tbody');
  if (!thead || !tbody) return;

  let headerRow = `<tr><th>Zawodnik</th>`;
  availableDates.forEach(d => { headerRow += `<th>${d}</th>`; });
  headerRow += `</tr>`;
  thead.innerHTML = headerRow;

  tbody.innerHTML = '';
  const sortedAlphabetically = sortPlayersByLastName(playersData);

  sortedAlphabetically.forEach(p => {
    let row = `<tr><td style="text-align:left;"><b>${p.name}</b></td>`;
    availableDates.forEach(d => {
      const val = (p.attendance && p.attendance[d]) ? p.attendance[d] : '-';
      row += `<td>${val}</td>`;
    });
    row += `</tr>`;
    tbody.innerHTML += row;
  });
}

// Inicjalne ładowanie danych
loadData();
