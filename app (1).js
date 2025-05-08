// app.js

// Dark Mode
const darkModeToggle = document.getElementById("dark-mode-toggle");
const body = document.body;
if (localStorage.getItem("darkMode") === "enabled") {
  body.classList.add("dark-mode");
  darkModeToggle.textContent = "Light Mode";
}
darkModeToggle.addEventListener("click", () => {
  body.classList.toggle("dark-mode");
  if (body.classList.contains("dark-mode")) {
    localStorage.setItem("darkMode", "enabled");
    darkModeToggle.textContent = "Light Mode";
  } else {
    localStorage.setItem("darkMode", "disabled");
    darkModeToggle.textContent = "Dark Mode";
  }
});

// Hamburger Menu Toggle
const hamburgerToggle = document.getElementById("hamburger-toggle");
const controls = document.getElementById("controls");
hamburgerToggle.addEventListener("click", () => {
  controls.classList.toggle("active");
  hamburgerToggle.textContent = controls.classList.contains("active") ? "✖" : "☰";
});

// DOM-Elemente
const cryptoList     = document.getElementById("crypto-list");
const currencySwitch = document.getElementById("currency-switch");
const searchInput    = document.getElementById("search-input");
const buttons        = document.querySelectorAll("#intervals button");

// Standard-Zeitraum
let timeRange = "1d";

// 1T-Button beim Start aktiv setzen
buttons.forEach(btn => {
  if (btn.getAttribute("data-range") === timeRange) {
    btn.classList.add("active");
  }
});

// Modal-Elemente
const modal        = document.getElementById("chartModal");
const modalClose   = modal.querySelector(".close");
const modalCanvas  = document.getElementById("modalChartCanvas");
let modalChartInstance = null;  // Chart.js-Instanz merken

// Modal schließen & Canvas löschen
function closeModal() {
  modal.classList.remove("open");
  modal.addEventListener("transitionend", function handler(e) {
    if (e.propertyName === "opacity") {
      const ctx = modalCanvas.getContext("2d");
      ctx.clearRect(0, 0, modalCanvas.width, modalCanvas.height);
      modal.removeEventListener("transitionend", handler);
    }
  });
}
modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", e => {
  if (e.target === modal) closeModal();
});
document.addEventListener("keyup", e => {
  if (e.key === "Escape" && modal.classList.contains("open")) {
    closeModal();
  }
});

// APIs
const PRICE_API          = "https://api.sklfsh.xyz/prices";
const COINGECKO_LIST_API = "https://api.coingecko.com/api/v3/coins/list";

let allCoins      = [];
let firstLoad     = true;
const symbolToId  = {};
const resolvedIds = {};

// 1) Lade Coin-Liste (Symbol→ID), nur ersten Eintrag pro Symbol, und override für ETH & BTC
fetch(COINGECKO_LIST_API)
  .then(res => res.json())
  .then(list => {
    list.forEach(c => {
      const sym = c.symbol.toLowerCase();
      if (!symbolToId[sym]) symbolToId[sym] = c.id;
    });
    // Overrides für gängige Kürzel:
    symbolToId['eth'] = 'ethereum';
    symbolToId['btc'] = 'bitcoin';
  })
  .catch(err => console.error("Coin-Liste Fehler:", err))
  .finally(() => {
    fetchData();
    setInterval(fetchData, 10000);
  });

// Hilfsfunktion: finde CoinGecko-ID für ein Symbol
async function getCoinGeckoId(symbol) {
  const key = symbol.toLowerCase();
  if (resolvedIds[key]) return resolvedIds[key];
  let id = symbolToId[key];
  if (!id) {
    // Fallback-Suche
    try {
      const resp = await fetch(`https://api.coingecko.com/api/v3/search?query=${symbol}`);
      const json = await resp.json();
      const match = json.coins.find(c => c.symbol.toLowerCase() === key);
      if (match) id = match.id;
    } catch {}
  }
  resolvedIds[key] = id = id || symbol;
  return id;
}

// Preise & Daten laden
function fetchData() {
  const currency = currencySwitch.checked ? "eur" : "usd";
  localStorage.setItem("currency", currency);

  fetch(`${PRICE_API}?currency=${currency}&time_range=${timeRange}`)
    .then(res => res.json())
    .then(data => {
      allCoins = data;
      firstLoad ? renderCoins(data) : updateCoins(data);
      firstLoad = false;
    })
    .catch(err => {
      cryptoList.innerHTML = "<p>Fehler beim Laden der Daten 😓</p>";
      console.error(err);
    });
}

// Vollständiges Rendern der Coin-Cards
function renderCoins(data) {
  cryptoList.innerHTML = "";
  if (!data.length) {
    cryptoList.innerHTML = "<p>Keine Währungen gefunden.</p>";
    return;
  }
  const currency = currencySwitch.checked ? "eur" : "usd";

  data.forEach(coin => {
    const sym = coin.symbol;
    const card = document.createElement("div");
    card.className = "crypto-card";
    card.dataset.symbol = sym;

    card.innerHTML = `
      <img src="${coin.image}" alt="${coin.name}">
      <h3>${coin.name} (${sym.toUpperCase()})</h3>
      <p class="price">Preis: ${coin.current_price} ${currency.toUpperCase()}</p>
      <p class="change">Änderung (${timeRange.toUpperCase()}):
        <span style="color:${coin.percent_change >= 0 ? 'green' : 'red'};">
          ${coin.percent_change.toFixed(2)} %
        </span>
      </p>
    `;

    cryptoList.appendChild(card);

    card.addEventListener("click", async () => {
      const id = await getCoinGeckoId(sym);
      modal.classList.add("open");
      drawChartInModal(id, sym);
    });
  });
}

// Updates der bestehenden Cards (ohne Neurendern)
function updateCoins(data) {
  const currency = currencySwitch.checked ? "eur" : "usd";
  data.forEach(coin => {
    const card = cryptoList.querySelector(`.crypto-card[data-symbol="${coin.symbol}"]`);
    if (!card) return;
    card.querySelector(".price").textContent = `Preis: ${coin.current_price} ${currency.toUpperCase()}`;
    const span = card.querySelector(".change span");
    span.textContent = `${coin.percent_change.toFixed(2)} %`;
    span.style.color = coin.percent_change >= 0 ? 'green' : 'red';
  });
}

// Chart im Modal zeichnen (alt’s Instanz zerstören & neues erstellen)
async function drawChartInModal(coinId, symbol) {
  const currency = currencySwitch.checked ? "eur" : "usd";

  if (modalChartInstance) {
    modalChartInstance.destroy();
    modalChartInstance = null;
  }

  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'Lade Chart…';
  modalCanvas.parentElement.appendChild(loading);

  let days;
  if (timeRange.endsWith('d'))      days = parseInt(timeRange, 10);
  else if (timeRange.endsWith('y')) days = parseInt(timeRange, 10) * 365;
  else                               days = 1;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=${currency}&days=${days}`
    );
    if (!res.ok) {
      if (res.status === 429) throw new Error('429');
      throw new Error(res.statusText || 'FetchError');
    }
    const data = await res.json();
    loading.remove();

    const ctx = modalCanvas.getContext("2d");
    const labels = data.prices.map(p => new Date(p[0]).toLocaleTimeString());
    const prices = data.prices.map(p => p[1]);

    modalChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: `${symbol.toUpperCase()} (${timeRange.toUpperCase()})`,
          data: prices,
          fill: false,
          borderWidth: 2
        }]
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: {
            display: true,
            title: { display: true, text: 'Uhrzeit' },
          },
          y: {
            display: true,
            title: { display: true, text: `Preis in ${currency.toUpperCase()}` },
            ticks: {
              callback: val => val.toLocaleString('de-DE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })
            }
          }
        }
      }
    });
  } catch (err) {
    loading.remove();
    if (err.message === '429') {
      alert("Fehler: 429 Too Many Requests");
    } else {
      alert("Fehler beim Laden des Charts");
      console.error(err);
    }
  }
}

// Suche (immer komplettes Neurendern)
searchInput.addEventListener("input", () => {
  const q = searchInput.value.toLowerCase();
  const filtered = allCoins.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.symbol.toLowerCase().includes(q)
  );
  renderCoins(filtered);
});

// Währung & Intervalle umschalten
currencySwitch.addEventListener("change", fetchData);
buttons.forEach(btn => {
  btn.addEventListener("click", () => {
    buttons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    timeRange = btn.getAttribute("data-range");
    fetchData();
  });
});

// Info-Popup bei Neuladen
window.addEventListener("load", () => {
  alert("Tipp: Klicke eine Coin an, um den Chart zu sehen!");
});
