const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyvhuKQaxyD1GIMDsGykJfBnYXIcRrvnZJmfKmyzL-Y-QOyEg66wAn38W6PwbFGu0Tz9w/exec";

let playersData = [];
let availableDates = [];
let selectedDate = "";
let currentTeams = null;

// Odczyt danych z Google Sheets
async function loadData() {
  try {
    const response = await fetch(SCRIPT_URL);
    const result = await response.json();
    
    playersData = result.players || [];
    availableDates = result.dates || [];

    if (availableDates.length > 0 && !selectedDate) {
      selectedDate = availableDates[availableDates.length - 1]; // Ostatnia data domyślnie
    }

    renderDates();
    render();
  } catch (err) {
    alert("Błąd podczas pobierania danych z Google Sheets!");
    console.error(err);
  }
}

// Obsługa wybierania daty
function renderDates() {
  const select = document.getElementById('dateSelect');
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

async function addNewDate() {
  const dateInput = document.getElementById('newDateInput').value.trim();
  if (!dateInput) return alert("Wpisz datę!");

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ADD_DATE", dateStr: dateInput })
  });

  selectedDate = dateInput;
  document.getElementById('newDateInput').value = '';
  setTimeout(loadData, 1500);
}

// Przełącznik obecności y / x
function togglePresence(idx) {
  const current = playersData[idx].attendance[selectedDate] || 'x';
  playersData[idx].attendance[selectedDate] = (current === 'y') ? 'x' : 'y';
  render();
}

async function saveAttendance() {
  const map = {};
  playersData.forEach(p => {
    map[p.name] = p.attendance[selectedDate] || 'x';
  });

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "UPDATE_ATTENDANCE", dateStr: selectedDate, attendanceMap: map })
  });

  alert("Obecności na dzień " + selectedDate + " zostały zapisane!");
}

function render() {
  // Generowanie listy obecności
  const listDiv = document.getElementById('playersList');
  listDiv.innerHTML = '';

  playersData.forEach((p, idx) => {
    const status = p.attendance[selectedDate] || 'x';
    const badgeClass = status === 'y' ? 'status-y' : 'status-x';
    
    listDiv.innerHTML += `
      <div style="margin-bottom: 8px;">
        <button onclick="togglePresence(${idx})">Zmień status</button>
        <span class="${badgeClass}">${status.toUpperCase()}</span>
        <b>${p.name}</b> (Baza: ${p.baseRating} | <b>Rating: ${p.currentRating}</b>)
      </div>
    `;
  });

  // Tabela Ligowa
  const tbody = document.querySelector('#rankTable tbody');
  tbody.innerHTML = '';
  const sorted = [...playersData].sort((a, b) => b.currentRating - a.currentRating);

  sorted.forEach(p => {
    tbody.innerHTML += `
      <tr>
        <td><b>${p.name}</b></td>
        <td>${p.baseRating}</td>
        <td>${p.wins}</td>
        <td>${p.draws}</td>
        <td>${p.losses}</td>
        <td><strong>${p.currentRating}</strong></td>
      </tr>
    `;
  });
}

// Algorytm losujący wyłącznie na podstawie obecnych 'y'
function generateBalancedTeams() {
  const active = playersData.filter(p => (p.attendance[selectedDate] || 'x') === 'y');
  if (active.length < 2) return alert("Musisz zaznaczyć przynajmniej dwóch graczy jako obecnych ('y') na wybrany dzień!");

  const teamSize = Math.floor(active.length / 2);
  let bestT1 = [], bestT2 = [], minDiff = Infinity;

  for (let i = 0; i < 300; i++) {
    const shuffled = [...active].sort(() => Math.random() - 0.5);
    const t1 = shuffled.slice(0, teamSize);
    const t2 = shuffled.slice(teamSize);

    const sum1 = t1.reduce((acc, p) => acc + p.currentRating, 0);
    const sum2 = t2.reduce((acc, p) => acc + p.currentRating, 0);
    const diff = Math.abs(sum1 - sum2);

    if (diff < minDiff) {
      minDiff = diff;
      bestT1 = t1;
      bestT2 = t2;
    }
  }

  currentTeams = { t1: bestT1, t2: bestT2 };

  const sum1 = bestT1.reduce((acc, p) => acc + p.currentRating, 0).toFixed(2);
  const sum2 = bestT2.reduce((acc, p) => acc + p.currentRating, 0).toFixed(2);

  document.getElementById('team1Box').innerHTML = `
    <h3>Drużyna 1 (Siła: ${sum1})</h3>
    <ul>${bestT1.map(p => `<li>${p.name} (${p.currentRating})</li>`).join('')}</ul>
  `;
  document.getElementById('team2Box').innerHTML = `
    <h3>Drużyna 2 (Siła: ${sum2})</h3>
    <ul>${bestT2.map(p => `<li>${p.name} (${p.currentRating})</li>`).join('')}</ul>
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
  alert("Wynik meczu dla daty " + selectedDate + " został wysłany!");
  setTimeout(loadData, 1500);
}

async function addPlayer() {
  const name = document.getElementById('pName').value.trim();
  const rating = parseFloat(document.getElementById('pRating').value);

  if (!name || isNaN(rating)) return alert("Wprowadź imię i ocenę!");

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ADD_PLAYER", name: name, baseRating: rating })
  });

  document.getElementById('pName').value = '';
  document.getElementById('pRating').value = '';
  setTimeout(loadData, 1500);
}

loadData();
