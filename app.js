const STORE_KEY = "fueltrack.sales.v2";
const SYNC_SECRET_KEY = "fueltrack.syncSecret.v1";
const CLOUD_CONFIG = window.FUELTRACK_CLOUD || {};
const FUELS = [
  { name: "Premium", key: "premium", color: "#2563eb" },
  { name: "Unleaded", key: "unleaded", color: "#15803d" },
  { name: "Diesel", key: "diesel", color: "#b7791f" }
];

const defaultState = {
  nextId: 1,
  filter: "all",
  setup: {
    Premium: { price: 65.5, cost: 58, capacity: 10000, stock: 10000 },
    Unleaded: { price: 63, cost: 56, capacity: 10000, stock: 10000 },
    Diesel: { price: 62, cost: 55, capacity: 10000, stock: 10000 }
  },
  sales: []
};

let state = loadState();
let cloudState = {
  enabled: Boolean(CLOUD_CONFIG.enabled && CLOUD_CONFIG.supabaseUrl && CLOUD_CONFIG.anonKey && CLOUD_CONFIG.stationId),
  syncing: false,
  online: false
};

const currency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2
});

const number = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(input = {}) {
  return {
    ...structuredClone(defaultState),
    ...input,
    setup: fuelSetup(input.setup),
    sales: Array.isArray(input.sales) ? input.sales : []
  };
}

function fuelSetup(savedSetup = {}) {
  return FUELS.reduce((setup, fuel) => {
    setup[fuel.name] = { ...defaultState.setup[fuel.name], ...(savedSetup?.[fuel.name] || {}) };
    return setup;
  }, {});
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function publicState() {
  return {
    nextId: state.nextId,
    filter: state.filter,
    setup: state.setup,
    sales: state.sales
  };
}

function syncSecret() {
  if (!cloudState.enabled) return "";
  let secret = localStorage.getItem(SYNC_SECRET_KEY);
  if (secret) return secret;
  secret = prompt("Enter your FuelTrack sync code for this station:");
  if (!secret) return "";
  localStorage.setItem(SYNC_SECRET_KEY, secret);
  return secret;
}

function setSyncStatus(message, kind = "") {
  const chip = document.getElementById("syncStatus");
  if (!chip) return;
  chip.textContent = message;
  chip.className = `sync-chip ${kind}`.trim();
}

function updateDataModeText() {
  const text = document.getElementById("dataModeText");
  if (!text) return;
  text.textContent = cloudState.enabled
    ? "Cloud sync is enabled. This device keeps a local copy and syncs to your shared station database."
    : "Stored privately in this browser. Export CSV for backup or reporting.";
}

async function supabaseRpc(functionName, payload) {
  const baseUrl = CLOUD_CONFIG.supabaseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      "apikey": CLOUD_CONFIG.anonKey,
      "authorization": `Bearer ${CLOUD_CONFIG.anonKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Supabase ${functionName} failed with ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function pullCloudState() {
  if (!cloudState.enabled) {
    setSyncStatus("Local mode");
    updateDataModeText();
    return;
  }

  const secret = syncSecret();
  if (!secret) {
    setSyncStatus("Sync code needed", "error");
    updateDataModeText();
    return;
  }

  try {
    cloudState.syncing = true;
    setSyncStatus("Syncing...", "syncing");
    const remote = await supabaseRpc("fueltrack_get_state", {
      p_station_id: CLOUD_CONFIG.stationId,
      p_sync_secret: secret
    });

    if (!remote) {
      cloudState.online = false;
      setSyncStatus("Sync denied", "error");
      return;
    }

    state = normalizeState(remote);
    saveState();
    cloudState.online = true;
    setSyncStatus("Cloud synced", "online");
    updateDataModeText();
    render();
  } catch {
    cloudState.online = false;
    setSyncStatus("Cloud offline", "error");
    updateDataModeText();
  } finally {
    cloudState.syncing = false;
  }
}

async function pushCloudState() {
  saveState();
  if (!cloudState.enabled) {
    setSyncStatus("Local mode");
    return;
  }

  const secret = syncSecret();
  if (!secret) {
    setSyncStatus("Sync code needed", "error");
    return;
  }

  try {
    cloudState.syncing = true;
    setSyncStatus("Saving...", "syncing");
    const saved = await supabaseRpc("fueltrack_save_state", {
      p_station_id: CLOUD_CONFIG.stationId,
      p_sync_secret: secret,
      p_data: publicState()
    });

    if (!saved) {
      cloudState.online = false;
      setSyncStatus("Sync denied", "error");
      return;
    }

    cloudState.online = true;
    setSyncStatus("Cloud synced", "online");
  } catch {
    cloudState.online = false;
    setSyncStatus("Saved locally", "error");
  } finally {
    cloudState.syncing = false;
  }
}

function php(value) {
  return currency.format(Number(value) || 0);
}

function liters(value) {
  return `${number.format(Number(value) || 0)} L`;
}

function activeFuel() {
  return document.querySelector("input[name='fuelType']:checked").value;
}

function totals() {
  return state.sales.reduce((acc, sale) => {
    const profit = sale.amount - sale.liters * sale.costPerLiter;
    acc.revenue += sale.amount;
    acc.cost += sale.liters * sale.costPerLiter;
    acc.profit += profit;
    acc.liters += sale.liters;
    if (!acc.byFuel[sale.fuel]) acc.byFuel[sale.fuel] = { revenue: 0, profit: 0, liters: 0 };
    acc.byFuel[sale.fuel].revenue += sale.amount;
    acc.byFuel[sale.fuel].profit += profit;
    acc.byFuel[sale.fuel].liters += sale.liters;
    return acc;
  }, {
    revenue: 0,
    cost: 0,
    profit: 0,
    liters: 0,
    byFuel: FUELS.reduce((byFuel, fuel) => {
      byFuel[fuel.name] = { revenue: 0, profit: 0, liters: 0 };
      return byFuel;
    }, {})
  });
}

function todaySales() {
  const today = new Date().toLocaleDateString("en-CA");
  return state.sales.filter((sale) => new Date(sale.timestamp).toLocaleDateString("en-CA") === today);
}

function setPage(page) {
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `page-${page}`);
  });
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  if (page === "setup") fillSetupForm();
  render();
}

function render() {
  renderMetrics();
  renderTanks("dashboardTanks");
  renderTanks("saleTanks");
  renderFilterButtons();
  renderHistory();
  renderSalePreview();
  drawMixChart();
  drawTrendChart();
}

function renderMetrics() {
  const data = totals();
  const today = todaySales();
  const margin = data.revenue > 0 ? `${((data.profit / data.revenue) * 100).toFixed(1)}% margin` : "No sales yet";
  document.getElementById("metricGrid").innerHTML = [
    metric("Total revenue", php(data.revenue), `${state.sales.length} transaction${state.sales.length === 1 ? "" : "s"}`, true),
    metric("Net profit", php(data.profit), margin),
    metric("Liters sold", liters(data.liters), `${today.length} today`),
    metric("Today", php(today.reduce((sum, sale) => sum + sale.amount, 0)), "Current trading day")
  ].join("");
}

function metric(label, value, sub, primary = false) {
  return `
    <article class="metric${primary ? " primary" : ""}">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="sub">${sub}</div>
    </article>
  `;
}

function renderTanks(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = FUELS.map((fuel) => {
    const item = state.setup[fuel.name];
    const percent = item.capacity > 0 ? Math.max(0, Math.min(100, (item.stock / item.capacity) * 100)) : 0;
    const color = percent <= 10 ? "var(--red)" : percent <= 25 ? "var(--amber)" : "var(--green)";
    return `
      <article class="tank-item">
        <div class="tank-top">
          <span>${fuel.name}</span>
          <span>${percent.toFixed(1)}%</span>
        </div>
        <div class="tank-track"><div class="tank-fill" style="width:${percent}%;background:${color}"></div></div>
        <div class="tank-meta">${liters(item.stock)} of ${liters(item.capacity)}</div>
      </article>
    `;
  }).join("");
}

function renderSalePreview() {
  const preview = document.getElementById("salePreview");
  if (!preview) return;
  const fuel = activeFuel();
  const amount = parseFloat(document.getElementById("saleAmount").value) || 0;
  const price = parseFloat(document.getElementById("salePrice").value) || state.setup[fuel].price;
  if (amount <= 0 || price <= 0) {
    preview.textContent = "Enter an amount to preview liters and profit.";
    return;
  }
  const qty = amount / price;
  const profit = amount - qty * state.setup[fuel].cost;
  preview.textContent = `${liters(qty)} dispensed - estimated profit ${php(profit)}`;
}

function renderHistory() {
  const body = document.getElementById("historyBody");
  if (!body) return;
  const sales = state.filter === "all" ? state.sales : state.sales.filter((sale) => sale.fuel === state.filter);
  if (!sales.length) {
    body.innerHTML = `<tr><td class="empty" colspan="7">No sales recorded yet.</td></tr>`;
    return;
  }
  body.innerHTML = [...sales].reverse().map((sale) => {
    const profit = sale.amount - sale.liters * sale.costPerLiter;
    const when = new Date(sale.timestamp).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    return `
      <tr>
        <td>#${sale.id}</td>
        <td>${when}</td>
        <td><span class="badge ${sale.fuel.toLowerCase()}">${sale.fuel}</span></td>
        <td>${php(sale.amount)}</td>
        <td>${liters(sale.liters)}</td>
        <td>${php(profit)}</td>
        <td><button class="danger-btn" data-delete="${sale.id}" type="button" aria-label="Delete sale ${sale.id}">Delete</button></td>
      </tr>
    `;
  }).join("");
}

function renderFilterButtons() {
  document.querySelectorAll(".filter").forEach((item) => {
    item.classList.toggle("active", item.dataset.filter === state.filter);
  });
}

function fillSetupForm() {
  const map = {
    premiumPrice: state.setup.Premium.price,
    premiumCost: state.setup.Premium.cost,
    premiumCapacity: state.setup.Premium.capacity,
    premiumStock: state.setup.Premium.stock,
    unleadedPrice: state.setup.Unleaded.price,
    unleadedCost: state.setup.Unleaded.cost,
    unleadedCapacity: state.setup.Unleaded.capacity,
    unleadedStock: state.setup.Unleaded.stock,
    dieselPrice: state.setup.Diesel.price,
    dieselCost: state.setup.Diesel.cost,
    dieselCapacity: state.setup.Diesel.capacity,
    dieselStock: state.setup.Diesel.stock
  };
  Object.entries(map).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value || "";
  });
}

function setFuelDefaults() {
  const fuel = activeFuel();
  document.getElementById("salePrice").value = state.setup[fuel].price || "";
  renderSalePreview();
}

function showNotice(id, message, kind = "success") {
  const notice = document.getElementById(id);
  if (!notice) return;
  notice.textContent = message;
  notice.className = `notice show ${kind}`;
  window.setTimeout(() => {
    notice.className = "notice";
  }, 3600);
}

function recordSale(event) {
  event.preventDefault();
  const fuel = activeFuel();
  const setup = state.setup[fuel];
  const amount = parseFloat(document.getElementById("saleAmount").value);
  const price = parseFloat(document.getElementById("salePrice").value);

  if (!amount || amount <= 0 || !price || price <= 0) {
    showNotice("saleNotice", "Enter a valid amount and price.", "error");
    return;
  }

  const qty = amount / price;
  if (qty > setup.stock) {
    showNotice("saleNotice", `Only ${liters(setup.stock)} of ${fuel} is available.`, "warning");
    return;
  }

  state.sales.push({
    id: state.nextId++,
    fuel,
    amount,
    liters: qty,
    pricePerLiter: price,
    costPerLiter: setup.cost,
    timestamp: new Date().toISOString()
  });
  setup.stock = Math.max(0, setup.stock - qty);
  pushCloudState();
  document.getElementById("saleAmount").value = "";
  showNotice("saleNotice", `${fuel} sale recorded: ${liters(qty)} for ${php(amount)}.`, setup.stock <= setup.capacity * 0.1 ? "warning" : "success");
  render();
}

function saveSetup(event) {
  event.preventDefault();
  state.setup = {
    Premium: {
      price: valueOf("premiumPrice"),
      cost: valueOf("premiumCost"),
      capacity: valueOf("premiumCapacity") || 10000,
      stock: valueOf("premiumStock")
    },
    Unleaded: {
      price: valueOf("unleadedPrice"),
      cost: valueOf("unleadedCost"),
      capacity: valueOf("unleadedCapacity") || 10000,
      stock: valueOf("unleadedStock")
    },
    Diesel: {
      price: valueOf("dieselPrice"),
      cost: valueOf("dieselCost"),
      capacity: valueOf("dieselCapacity") || 10000,
      stock: valueOf("dieselStock")
    }
  };
  FUELS.forEach((fuel) => {
    state.setup[fuel.name].stock = Math.min(state.setup[fuel.name].stock, state.setup[fuel.name].capacity);
  });
  pushCloudState();
  showNotice("setupNotice", "Setup saved.");
  setFuelDefaults();
  render();
}

function valueOf(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

function deleteSale(id) {
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;
  state.setup[sale.fuel].stock = Math.min(state.setup[sale.fuel].capacity, state.setup[sale.fuel].stock + sale.liters);
  state.sales = state.sales.filter((item) => item.id !== id);
  pushCloudState();
  render();
}

function clearAllSales() {
  if (!state.sales.length) return;
  if (!confirm("Clear all sales records? This cannot be undone.")) return;
  state.sales = [];
  state.nextId = 1;
  pushCloudState();
  render();
}

function exportCSV() {
  if (!state.sales.length) {
    alert("No sales to export yet.");
    return;
  }
  const header = ["ID", "Timestamp", "Fuel", "Amount PHP", "Liters", "Price per Liter", "Cost per Liter", "Profit PHP"];
  const rows = state.sales.map((sale) => {
    const profit = sale.amount - sale.liters * sale.costPerLiter;
    return [
      sale.id,
      new Date(sale.timestamp).toLocaleString("en-PH"),
      sale.fuel,
      sale.amount.toFixed(2),
      sale.liters.toFixed(4),
      sale.pricePerLiter.toFixed(2),
      sale.costPerLiter.toFixed(2),
      profit.toFixed(2)
    ];
  });
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fueltrack-sales-${new Date().toLocaleDateString("en-CA")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function drawMixChart() {
  const canvas = document.getElementById("mixChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const data = totals().byFuel;
  drawBars(ctx, canvas, FUELS.map((fuel) => ({
    label: fuel.name,
    value: data[fuel.name].revenue,
    color: fuel.color
  })));
}

function drawTrendChart() {
  const canvas = document.getElementById("trendChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const points = lastSevenDays().map((day) => {
    const daily = state.sales.filter((sale) => new Date(sale.timestamp).toLocaleDateString("en-CA") === day.key);
    return {
      label: day.label,
      revenue: daily.reduce((sum, sale) => sum + sale.amount, 0),
      profit: daily.reduce((sum, sale) => sum + sale.amount - sale.liters * sale.costPerLiter, 0)
    };
  });
  drawLines(ctx, canvas, points);
}

function drawBars(ctx, canvas, bars) {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#66736e";
  ctx.font = "24px system-ui";
  if (!bars.some((bar) => bar.value > 0)) {
    ctx.fillText("Record sales to build this chart", 36, height / 2);
    return;
  }
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const barWidth = 96;
  const gap = 150;
  const startX = Math.max(36, (width - (bars.length - 1) * gap - barWidth) / 2);
  bars.forEach((bar, index) => {
    const x = startX + index * gap;
    const barHeight = Math.max(8, (bar.value / max) * 150);
    const y = 210 - barHeight;
    ctx.fillStyle = bar.color;
    roundedRect(ctx, x, y, barWidth, barHeight, 12);
    ctx.fill();
    ctx.fillStyle = "#17201d";
    ctx.font = "bold 20px system-ui";
    ctx.fillText(bar.label, x, 246);
    ctx.fillStyle = "#66736e";
    ctx.font = "18px system-ui";
    ctx.fillText(php(bar.value), x, y - 14);
  });
}

function drawLines(ctx, canvas, points) {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const pad = { left: 52, right: 24, top: 26, bottom: 54 };
  const max = Math.max(...points.flatMap((point) => [point.revenue, point.profit]), 1);
  ctx.strokeStyle = "#dbe2dc";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const y = pad.top + ((height - pad.top - pad.bottom) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }
  plotLine(ctx, points, "revenue", "#0f766e", max, pad, width, height);
  plotLine(ctx, points, "profit", "#2563eb", max, pad, width, height);
  ctx.fillStyle = "#66736e";
  ctx.font = "18px system-ui";
  points.forEach((point, index) => {
    const x = pad.left + ((width - pad.left - pad.right) / Math.max(1, points.length - 1)) * index;
    ctx.fillText(point.label, x - 28, height - 18);
  });
}

function plotLine(ctx, points, key, color, max, pad, width, height) {
  const chartHeight = height - pad.top - pad.bottom;
  const chartWidth = width - pad.left - pad.right;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = pad.left + (chartWidth / Math.max(1, points.length - 1)) * index;
    const y = pad.top + chartHeight - (point[key] / max) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  points.forEach((point, index) => {
    const x = pad.left + (chartWidth / Math.max(1, points.length - 1)) * index;
    const y = pad.top + chartHeight - (point[key] / max) * chartHeight;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function lastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return {
      key: date.toLocaleDateString("en-CA"),
      label: date.toLocaleDateString("en-PH", { month: "short", day: "numeric" })
    };
  });
}

document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric"
});

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => setPage(button.dataset.page));
});

document.querySelectorAll("input[name='fuelType']").forEach((input) => {
  input.addEventListener("change", setFuelDefaults);
});

document.getElementById("saleAmount").addEventListener("input", renderSalePreview);
document.getElementById("salePrice").addEventListener("input", renderSalePreview);
document.getElementById("saleForm").addEventListener("submit", recordSale);
document.getElementById("setupForm").addEventListener("submit", saveSetup);
document.getElementById("clearSaleBtn").addEventListener("click", () => {
  document.getElementById("saleAmount").value = "";
  renderSalePreview();
});
document.getElementById("historyFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
  renderHistory();
});
document.getElementById("historyBody").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (button) deleteSale(Number(button.dataset.delete));
});
document.getElementById("clearAllBtn").addEventListener("click", clearAllSales);
["exportDashboardBtn", "exportHistoryBtn", "exportSetupBtn"].forEach((id) => {
  document.getElementById(id).addEventListener("click", exportCSV);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

document.getElementById("syncStatus").addEventListener("click", () => {
  if (!cloudState.enabled) {
    alert("Cloud sync is not configured yet. Add Supabase settings in config.js first.");
    return;
  }
  pullCloudState();
});

setFuelDefaults();
fillSetupForm();
render();
pullCloudState();
