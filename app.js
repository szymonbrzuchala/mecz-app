const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzfjPZUsec8-4wwws3rELYVCRDNFLb0M1FbjZ1IrTq2ba2Gz3XYfB7NYxLLzHZeCPk/exec";
const ADMIN_PASSWORD = "pilkanozna";

let playersData = [];
let availableDates = [];
let selectedDate = "";
let currentTeams = null;

// --- SYSTEM ZAKŁADEK I HASŁA ---
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

  if (input.value === ADMIN_PASSWORD) {
    sessionStorage.setItem("isAdminAuthenticated", "true");
    document.getElementById("auth-container").style.display = "none";
    document.getElementById("management-content").style.display = "block";
    input.value = "";
    errorMsg.style.display = "none";
    renderManagePlayers();
  } else {
    errorMsg.style.display = "block";
  }
}

function logoutAdmin() {
  sessionStorage.removeItem("isAdminAuthenticated");
  openManagementTab();
}

document.getElementById("admin-password-input")?.addEventListener("keyup", function(event) {
  if (event.key === "Enter") {
    checkAdminPassword();
  }
});

// --- POBIERANIE I OBSŁUGA DANYCH ---
async function loadData() {
  const listDiv = document.getElementById('playersList');
  if (listDiv) listDiv.innerHTML = '<i>Ładowanie danych z Google Sheets...</i>';

  try {
    const response = await fetch(SCRIPT_URL);
    const result = await response.json();
    
    playersData = result.players || [];
    availableDates = result.dates || [];

    if (availableDates.length > 0 && !selectedDate) {
      selectedDate = availableDates[availableDates.length - 1];
    }

    renderDates();
    render();
    if (sessionStorage.getItem("isAdminAuthenticated") === "true") {
      renderManagePlayers();
    }
  } catch (err) {
    alert("Błąd podczas pobierania danych z Google Sheets!");
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
  document.getElementById('selectedDateTitle').innerText = selectedDate || "Brak";
}

function onDateChange() {
  selectedDate = document.getElementById('dateSelect').value;
  document.getElementById('selectedDateTitle').innerText = selectedDate;
  render();
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

function togglePresence(idx) {
  if (!playersData[idx].attendance) {
    playersData[idx].attendance = {};
  }
  const current = playersData[idx].attendance[selectedDate] || 'x';
  playersData[idx].attendance[selectedDate] = (current === 'y') ? 'x' : 'y';
  render();
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

  alert("Zapisano obecności na dzień " + selectedDate);
}

// Renderowanie Strony Główny (Ukryte oceny)
function render() {
  const listDiv = document.getElementById('playersList');
  if (!listDiv) return;

  listDiv.innerHTML = '';

  if (playersData.length === 0) {
    listDiv.innerHTML = '<p>Brak graczy w bazie. Przejdź do zakładki "Zarządzanie Zawodnikami", aby dodać pierwszych graczy.</p>';
  } else {
    playersData.forEach((p, idx) => {
      const status = (p.attendance && p.attendance[selectedDate]) ? p.attendance[selectedDate] : 'x';
      const badgeClass = status === 'y' ? 'status-y' : 'status-x';
      
      listDiv.innerHTML += `
        <div class="player-row">
          <span><b>${p.name}</b></span>
          <div>
            <span class="${badgeClass}">${status.toUpperCase()}</span>
            <button onclick="togglePresence(${idx})">Zmień Status</button>
          </div>
        </div>
      `;
    });
  }

  // Tabela Aktualna
  const tbody = document.querySelector('#rankTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    const sorted = [...playersData].sort((a, b) => b.currentRating - a.currentRating);

    sorted.forEach((p, index) => {
      tbody.innerHTML += `
        <tr>
          <td><b>${index + 1}</b></td>
          <td><b>${p.name}</b></td>
          <td>${p.wins}</td>
          <td>${p.draws}</td>
          <td>${p.losses}</td>
          <td><strong>${p.currentRating}</strong></td>
        </tr>
      `;
    });
  }
}

// ALGORYTM LOSUJĄCY Z DODATKOWYMI GRACZAMI I RÓŻNORODNOŚCIĄ
function generateTeams() {
  const activePlayers = playersData.filter(p => (p.attendance && p.attendance[selectedDate] === 'y'));
  const targetPerTeam = parseInt(document.getElementById('gameModeSelect').value);
  const totalRequired = targetPerTeam * 2;

  if (activePlayers.length === 0) return alert("Brak obecnych graczy (zaznaczonych jako Y)!");

  const avgRating = activePlayers.reduce((acc, p) => acc + p.currentRating, 0) / activePlayers.length;
  let pool = activePlayers.map(p => ({ name: p.name, rating: p.currentRating }));

  // Dopełnianie "Dodatkowymi Graczymi"
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

  const sum1 = selectedCombo.t1.reduce((acc, p) => acc + p.rating, 0).toFixed(2);
  const sum2 = selectedCombo.t2.reduce((acc, p) => acc + p.rating, 0).toFixed(2);

  document.getElementById('team1Box').innerHTML = `
    <h3>Drużyna A (Siła: ${sum1})</h3>
    <ul>${selectedCombo.t1.map(p => `<li>${p.name}</li>`).join('')}</ul>
  `;
  document.getElementById('team2Box').innerHTML = `
    <h3>Drużyna B (Siła: ${sum2})</h3>
    <ul>${selectedCombo.t2.map(p => `<li>${p.name}</li>`).join('')}</ul>
  `;

  document.getElementById('matchSection').style.display = 'block';
}

async function recordMatch(winnerTeam) {
  if (!currentTeams) return;

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

  document.getElementById('matchSection').style.display = 'none';
  alert("Wynik meczu został wysłany do Google Sheets!");
  setTimeout(loadData, 1500);
}

// PANEL ZARZĄDZANIA ZAWODNIKAMI
function renderManagePlayers() {
  const container = document.getElementById('managePlayersList');
  if (!container) return;
  container.innerHTML = '';

  playersData.forEach(p => {
    container.innerHTML += `
      <div class="player-row">
        <span><b>${p.name}</b> (Ocena bazowa: <b>${p.baseRating}</b> | Rating: ${p.currentRating})</span>
        <div>
          <button class="btn-blue" onclick="updateRatingPrompt('${p.name}', ${p.baseRating})">Zmień Ocenę</button>
          <button class="btn-danger" onclick="deletePlayer('${p.name}')">Usuń</button>
        </div>
      </div>
    `;
  });
}

async function addPlayer() {
  const nameInput = document.getElementById('pName');
  const ratingInput = document.getElementById('pRating');

  const name = nameInput.value.trim();
  const rating = parseFloat(ratingInput.value);

  if (!name || isNaN(rating) || rating < 1 || rating > 10) {
    return alert("Wprowadź imię i poprawną ocenę w przedziale od 1 do 10!");
  }

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ADD_PLAYER", name: name, baseRating: rating })
  });

  nameInput.value = '';
  ratingInput.value = '';
  alert(`Dodano zawodnika ${name}. Odświeżam dane...`);
  setTimeout(loadData, 1500);
}

async function deletePlayer(name) {
  if (!confirm(`Czy na pewno chcesz usunąć gracza ${name}?`)) return;

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "DELETE_PLAYER", name: name })
  });

  setTimeout(loadData, 1500);
}

async function updateRatingPrompt(name, currentBase) {
  const newRating = prompt(`Ustaw nową ocenę bazową (1-10) dla ${name}:`, currentBase);
  if (newRating === null || isNaN(parseFloat(newRating))) return;

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "UPDATE_PLAYER_RATING", name: name, baseRating: parseFloat(newRating) })
  });

  setTimeout(loadData, 1500);
}

// PRZEGLĄD WYNIKÓW
function renderHistoryTable() {
  const thead = document.querySelector('#historyTable thead');
  const tbody = document.querySelector('#historyTable tbody');
  if (!thead || !tbody) return;

  let headerRow = `<tr><th>Zawodnik</th>`;
  availableDates.forEach(d => { headerRow += `<th>${d}</th>`; });
  headerRow += `</tr>`;
  thead.innerHTML = headerRow;

  tbody.innerHTML = '';
  playersData.forEach(p => {
    let row = `<tr><td><b>${p.name}</b></td>`;
    availableDates.forEach(d => {
      const val = (p.attendance && p.attendance[d]) ? p.attendance[d] : '-';
      row += `<td>${val}</td>`;
    });
    row += `</tr>`;
    tbody.innerHTML += row;
  });
}

// Inicjalne ładowanie
loadData();
