// Wklej tutaj wygenerowany URL z wdrożenia Google Apps Script:
const SCRIPT_URL = "TUTAJ_WKLEJ_SWOJ_URL_Z_APPS_SCRIPT";

let playersData = [];
let currentTeams = null;

// Pobieranie danych z Google Sheets
async function loadData() {
  try {
    const response = await fetch(SCRIPT_URL);
    playersData = await response.json();
    
    // Domyślnie zaznaczamy obecność dla wszystkich
    playersData.forEach(p => { if (p.present === undefined) p.present = true; });
    
    render();
  } catch (err) {
    alert("Błąd podczas pobierania danych z Google Sheets!");
    console.error(err);
  }
}

// Dodawanie gracza
async function addPlayer() {
  const name = document.getElementById('pName').value.trim();
  const rating = parseFloat(document.getElementById('pRating').value);

  if (!name || isNaN(rating) || rating < 1 || rating > 10) {
    alert("Wprowadź poprawne dane (Ocena w przedziale 1–10)!");
    return;
  }

  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ADD_PLAYER", name: name, baseRating: rating })
  });

  document.getElementById('pName').value = '';
  document.getElementById('pRating').value = '';
  setTimeout(loadData, 1500); // Odświeżenie danych po zapisie
}

function render() {
  // Lista obecności
  const listDiv = document.getElementById('playersList');
  listDiv.innerHTML = '';
  playersData.forEach((p, idx) => {
    listDiv.innerHTML += `
      <label style="display:inline-block; margin-right: 15px;">
        <input type="checkbox" ${p.present ? 'checked' : ''} onchange="playersData[${idx}].present = !playersData[${idx}].present">
        ${p.name} (Baza: ${p.baseRating} | <b>Rating: ${p.currentRating}</b>)
      </label><br>
    `;
  });

  // Tabela wyników
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

// Algorytm wyrównanego losowania zespołów
function generateBalancedTeams() {
  const active = playersData.filter(p => p.present);
  if (active.length < 2) return alert("Zaznacz co najmniej 2 obecnych graczy!");

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
    <h3>Drużyna 1 (Łączna siła: ${sum1})</h3>
    <ul>${bestT1.map(p => `<li>${p.name} (${p.currentRating})</li>`).join('')}</ul>
  `;
  document.getElementById('team2Box').innerHTML = `
    <h3>Drużyna 2 (Łączna siła: ${sum2})</h3>
    <ul>${bestT2.map(p => `<li>${p.name} (${p.currentRating})</li>`).join('')}</ul>
  `;

  document.getElementById('matchSection').style.display = 'block';
}

// Zapis wyników do Google Sheets
async function recordMatch(winnerTeam) {
  if (!currentTeams) return;

  const payload = {
    action: "RECORD_MATCH",
    winnerTeam: winnerTeam,
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
  alert("Wynik został wysłany do Google Sheets!");
  setTimeout(loadData, 1500);
}

loadData();
