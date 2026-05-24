// ============================================================
// CSV DATA LOADING
// ============================================================
const MESES_ES = {
  'ene':'01','feb':'02','mar':'03','abr':'04','may':'05','jun':'06',
  'jul':'07','ago':'08','sep':'09','oct':'10','nov':'11','dic':'12'
};

function parseFechaCSV(s) {
  // "31-dic-14" → "2014-12-31"
  const parts = s.trim().split('-');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const mes = MESES_ES[m.toLowerCase()];
  if (!mes) return null;
  return `20${y}-${mes}-${d.padStart(2, '0')}`;
}

function parseNum(s) {
  if (!s || s.trim() === '' || s.trim() === '--') return null;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? null : n;
}

let DB_ISINS  = [];
let DB_NAMES  = {};
let DB_DATA   = {};
let DB_CAGR   = {};
let DB_LOADED = false;

function cargarDatos() {
  Papa.parse('data/5ejemplos-info general.csv', {
    download: true,
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
    complete: function(resInfo) {
      Papa.parse('data/5ejemplos-nav.csv', {
        download: true,
        header: true,
        delimiter: ';',
        skipEmptyLines: true,
        complete: function(resNav) {
          procesarDatos(resInfo.data, resNav.data);
        },
        error: function() { mostrarErrorCSV(); }
      });
    },
    error: function() { mostrarErrorCSV(); }
  });
}

function mostrarErrorCSV() {
  document.getElementById('no-data-warn').style.display = 'flex';
  document.getElementById('isin-selector-card').style.display = 'none';
}

function procesarDatos(infoData, navData) {
  const fechasColumnas = Object.keys(navData[0] || {}).filter(k => k !== 'Variable');

  infoData.forEach(function(fila, idx) {
    const isin = (fila['ISIN'] || '').trim();
    if (!isin) return;

    DB_ISINS.push(isin);
    DB_NAMES[isin] = (fila['Nombre'] || '').trim();

    const filaNav = navData[idx];
    const dates = [];
    const navs  = [];

    if (filaNav) {
      fechasColumnas.forEach(function(fechaRaw) {
        const isoDate = parseFechaCSV(fechaRaw);
        const valRaw  = filaNav[fechaRaw];
        if (!isoDate || valRaw === undefined) return;
        const num = parseNum(valRaw);
        if (num !== null) {
          dates.push(isoDate);
          navs.push(num);
        }
      });
    }

    DB_DATA[isin] = { d: dates, n: navs };
    DB_CAGR[isin] = computeCAGRForFund(dates, navs);
  });

  DB_LOADED = true;
  document.getElementById('db-info-label').textContent =
    DB_ISINS.length + ' fondos · NAV diario';

  initFundPage();
}

function computeCAGRForFund(dates, navs) {
  const result = { '1A': null, '3A': null, '5A': null, '7A': null, '10A': null, 'ALL': null };
  if (!dates.length) return result;

  const lastDate = new Date(dates[dates.length - 1] + 'T00:00:00');
  const lastNav  = navs[navs.length - 1];

  [['1A', 1], ['3A', 3], ['5A', 5], ['7A', 7], ['10A', 10]].forEach(function([label, years]) {
    const cutoff = new Date(lastDate);
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i] <= cutoffStr) {
        const actualYears = (lastDate - new Date(dates[i] + 'T00:00:00')) / (365.25 * 24 * 3600 * 1000);
        if (actualYears > 0.5) {
          result[label] = parseFloat(((Math.pow(lastNav / navs[i], 1 / actualYears) - 1) * 100).toFixed(2));
        }
        break;
      }
    }
  });

  // ALL: desde el primer dato
  const firstDate  = new Date(dates[0] + 'T00:00:00');
  const allYears   = (lastDate - firstDate) / (365.25 * 24 * 3600 * 1000);
  if (allYears > 0.1) {
    result['ALL'] = parseFloat(((Math.pow(lastNav / navs[0], 1 / allYears) - 1) * 100).toFixed(2));
  }

  return result;
}

// ============================================================
// NAVIGATION
// ============================================================
const pages = { inicio: 'Inicio', buscar: 'Buscar Fondo', backtesting: 'Backtesting' };
const subtitles = {
  inicio:      'Análisis de fondos · Base de datos histórica NAV',
  buscar:      'Base de datos real · 5 fondos · Dic 2014 – May 2026',
  backtesting: 'Simulación histórica con datos reales de NAV diario'
};

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
    const arrow = b.querySelector('.nav-arrow');
    if (arrow) arrow.style.display = b.dataset.page === page ? 'block' : 'none';
  });
  document.getElementById('header-title').textContent = pages[page];
  document.getElementById('header-sub').textContent   = subtitles[page];
  if (page === 'inicio')      initFundPage();
  if (page === 'buscar')      initSearch();
  if (page === 'backtesting') initBacktest();
}

document.querySelectorAll('nav button').forEach(b => {
  const arrow = b.querySelector('.nav-arrow');
  if (arrow && !b.classList.contains('active')) arrow.style.display = 'none';
});

// ============================================================
// CHART HELPERS
// ============================================================
const gridColor = 'rgba(0,0,0,0.07)';
const tickColor = '#94a3b8';
let chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}
function makeChart(id, config) {
  destroyChart(id);
  const el = document.getElementById(id);
  if (!el) return;
  chartInstances[id] = new Chart(el, config);
}

// ============================================================
// SHARED DATA UTILITIES
// ============================================================
function filterByPeriod(dates, navs, period) {
  if (period === 'ALL' || !dates.length) return { dates, navs };
  const latest = new Date(dates[dates.length - 1] + 'T00:00:00');
  const cutoff = new Date(latest);
  if      (period === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
  else if (period === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
  else if (period === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
  else if (period === '3Y') cutoff.setFullYear(cutoff.getFullYear() - 3);
  else if (period === '5Y') cutoff.setFullYear(cutoff.getFullYear() - 5);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const idx = dates.findIndex(d => d >= cutoffStr);
  if (idx === -1) return { dates, navs };
  return { dates: dates.slice(idx), navs: navs.slice(idx) };
}

function computeReturnSinceDate(dates, navs, sinceDate) {
  if (!dates.length) return null;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= sinceDate) return (navs[navs.length - 1] / navs[i] - 1) * 100;
  }
  return null;
}

function computeReturnNMonths(dates, navs, n) {
  if (!dates.length) return null;
  const latest = new Date(dates[dates.length - 1] + 'T00:00:00');
  const cutoff = new Date(latest);
  cutoff.setMonth(cutoff.getMonth() - n);
  return computeReturnSinceDate(dates, navs, cutoff.toISOString().slice(0, 10));
}

function computeAnnualReturns(dates, navs) {
  if (!dates.length) return [];
  const curYear = new Date().getFullYear();
  const targetYears = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const results = [];

  for (const y of targetYears) {
    const prevEnd = (y - 1) + '-12-31';
    const yStr    = String(y);

    let startNav = null;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i] <= prevEnd) { startNav = navs[i]; break; }
    }
    let endNav = null;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i].startsWith(yStr)) { endNav = navs[i]; break; }
    }
    if (startNav !== null && endNav !== null) {
      results.push({
        label: y >= curYear ? y + ' YTD' : yStr,
        ret:   parseFloat(((endNav / startNav - 1) * 100).toFixed(2))
      });
    }
  }
  return results;
}

function computeMaxDrawdown(series) {
  let peak = series[0], maxDD = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function formatAxisDate(dateStr, period) {
  const d = new Date(dateStr + 'T00:00:00');
  if (period === '1M') return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  if (period === '6M') return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
}

function fmtPct(v) {
  if (v === null || v === undefined) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

// ============================================================
// INICIO — FUND ANALYSIS
// ============================================================
let currentIsin  = null;
let currentPeriod = 'ALL';
let isinPageInit  = false;

function initFundPage() {
  if (isinPageInit) return;
  if (!DB_LOADED || !DB_ISINS.length) return;

  isinPageInit = true;
  _rebuildISINSelect(DB_ISINS);
  document.getElementById('isin-count-label').textContent = DB_ISINS.length + ' fondos';

  if (DB_ISINS.length > 0) {
    const sel = document.getElementById('isin-select');
    sel.value = DB_ISINS[0];
    loadFund(DB_ISINS[0]);
  }
}

function _getName(isin) {
  return DB_NAMES[isin] || '';
}

function _buildOptionText(isin) {
  const name = _getName(isin);
  if (!name) return isin;
  const short = name.length > 55 ? name.slice(0, 52) + '…' : name;
  return short + '  ·  ' + isin;
}

function _rebuildISINSelect(list) {
  const sel  = document.getElementById('isin-select');
  const prev = sel.value;
  while (sel.options.length) sel.remove(0);
  list.forEach(isin => {
    const o = new Option(_buildOptionText(isin), isin);
    if (isin === prev || (isin === currentIsin && !prev)) o.selected = true;
    sel.add(o);
  });
  if (!sel.value && list.length) sel.value = list[0];
}

function filterISINSelect() {
  if (!DB_LOADED || !DB_ISINS.length) return;
  const q        = document.getElementById('isin-filter').value.trim().toUpperCase();
  const filtered = q
    ? DB_ISINS.filter(i => i.includes(q) || (DB_NAMES[i] && DB_NAMES[i].toUpperCase().includes(q)))
    : DB_ISINS;
  document.getElementById('isin-count-label').textContent = filtered.length + ' fondos';
  _rebuildISINSelect(filtered);
}

function loadFund(isin) {
  if (!isin || !DB_DATA[isin]) return;
  currentIsin = isin;

  const { d: dates, n: navs } = DB_DATA[isin];
  const latestNAV  = navs[navs.length - 1];
  const latestDate = dates[dates.length - 1];

  // Mostrar panel principal
  const name = _getName(isin);
  document.getElementById('fund-panel').style.display = 'block';

  // Nombre del fondo (fila dentro del selector)
  const nameRow = document.getElementById('fund-name-row');
  if (name) {
    document.getElementById('fund-name-text').textContent = name;
    document.getElementById('fund-isin-chip').textContent = isin;
    nameRow.classList.add('visible');
  } else {
    nameRow.classList.remove('visible');
  }
  const badge = name ? (name.length > 40 ? name.slice(0, 37) + '…' : name) : isin;
  document.getElementById('annual-isin-badge').textContent  = badge;
  document.getElementById('periodo-isin-badge').textContent = badge;

  // Stat: último NAV
  document.getElementById('stat-nav').textContent      = latestNAV.toFixed(2);
  document.getElementById('stat-nav-date').textContent = latestDate;

  // Stat: retorno periodo
  const filt      = filterByPeriod(dates, navs, currentPeriod);
  const periodRet = filt.navs.length > 1
    ? (filt.navs[filt.navs.length - 1] / filt.navs[0] - 1) * 100 : 0;
  const periodEl  = document.getElementById('stat-period-ret');
  periodEl.textContent = fmtPct(periodRet);
  periodEl.className   = 'val ' + (periodRet >= 0 ? 'up' : 'down');
  document.getElementById('stat-period-lbl').textContent = 'Retorno ' + currentPeriod;

  // Stat: YTD
  const curYear = new Date().getFullYear();
  document.getElementById('stat-ytd-label').textContent = curYear + ' YTD';
  const ytdRet = computeReturnSinceDate(dates, navs, (curYear - 1) + '-12-31');
  const ytdEl  = document.getElementById('stat-ytd');
  if (ytdRet !== null) {
    ytdEl.textContent = fmtPct(ytdRet);
    ytdEl.className   = 'val ' + (ytdRet >= 0 ? 'up' : 'down');
  } else {
    ytdEl.textContent = '—'; ytdEl.className = 'val';
  }

  // Stat: rango 52 semanas
  const w52 = filterByPeriod(dates, navs, '1Y');
  document.getElementById('stat-high52').textContent = Math.max(...w52.navs).toFixed(2);
  document.getElementById('stat-low52').textContent  = Math.min(...w52.navs).toFixed(2);

  // Gráficos
  renderNAVChart(filt.dates, filt.navs, currentPeriod);
  document.getElementById('nav-chart-sub').textContent =
    isin + ' · ' + (filt.dates[0] || '—') + ' → ' + latestDate;

  renderAnnualChart(computeAnnualReturns(dates, navs));
  renderPeriodoChart(isin);
}

function setPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.period === period);
  });
  if (currentIsin && DB_DATA[currentIsin]) {
    const { d: dates, n: navs } = DB_DATA[currentIsin];
    const filt      = filterByPeriod(dates, navs, period);
    const periodRet = filt.navs.length > 1
      ? (filt.navs[filt.navs.length - 1] / filt.navs[0] - 1) * 100 : 0;
    const el = document.getElementById('stat-period-ret');
    el.textContent = fmtPct(periodRet);
    el.className   = 'val ' + (periodRet >= 0 ? 'up' : 'down');
    document.getElementById('stat-period-lbl').textContent = 'Retorno ' + period;
    renderNAVChart(filt.dates, filt.navs, period);
    document.getElementById('nav-chart-sub').textContent =
      currentIsin + ' · ' + (filt.dates[0] || '—') + ' → ' + dates[dates.length - 1];
  }
}

function renderNAVChart(dates, navs, period) {
  if (!dates.length) return;
  const isUp    = navs[navs.length - 1] >= navs[0];
  const color   = isUp ? '#06b6d4' : '#f43f5e';
  const bgColor = isUp ? 'rgba(6,182,212,0.1)' : 'rgba(244,63,94,0.1)';
  const labels  = dates.map(d => formatAxisDate(d, period));

  makeChart('chart-nav', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: navs,
        borderColor: color, backgroundColor: bgColor,
        fill: true, tension: 0.35, pointRadius: 0,
        pointHoverRadius: 5, pointHoverBackgroundColor: color, borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
          titleColor: '#94a3b8', bodyColor: '#f1f5f9', padding: 10,
          callbacks: {
            title: ctx => dates[ctx[0].dataIndex],
            label: ctx => '  NAV: ' + ctx.raw.toFixed(4)
          }
        }
      },
      scales: {
        x: {
          ticks: { color: tickColor, maxTicksLimit: 10, maxRotation: 0, font: { size: 11 } },
          grid: { color: gridColor }
        },
        y: {
          ticks: {
            color: tickColor, font: { size: 11 },
            callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(2)
          },
          grid: { color: gridColor }
        }
      }
    }
  });
}

function renderAnnualChart(annual) {
  if (!annual || !annual.length) return;
  makeChart('chart-annual', {
    type: 'bar',
    data: {
      labels: annual.map(a => a.label),
      datasets: [{
        data: annual.map(a => a.ret),
        backgroundColor: annual.map(a => a.ret >= 0 ? 'rgba(6,182,212,0.75)' : 'rgba(244,63,94,0.75)'),
        borderColor:     annual.map(a => a.ret >= 0 ? 'rgba(6,182,212,1)'    : 'rgba(244,63,94,1)'),
        borderWidth: 1, borderRadius: 4, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
          titleColor: '#94a3b8', bodyColor: '#f1f5f9', padding: 10,
          callbacks: { label: ctx => '  ' + fmtPct(ctx.raw) }
        }
      },
      scales: {
        x: { ticks: { color: tickColor, font: { size: 11 } }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor, font: { size: 11 }, callback: v => v + '%' }, grid: { color: gridColor } }
      }
    }
  });
}

function renderPeriodoChart(isin) {
  if (!DB_CAGR[isin]) return;
  const all_labels = ['1A', '3A', '5A', '7A', '10A', 'ALL'];
  const raw = DB_CAGR[isin];

  const labels = all_labels.filter(l => raw[l] !== null);
  const values = labels.map(l => parseFloat(raw[l]));
  if (!labels.length) return;

  const display = labels.map(l => l === 'ALL' ? 'Total' : l);

  makeChart('chart-periodo', {
    type: 'bar',
    data: {
      labels: display,
      datasets: [{
        data: values,
        backgroundColor: values.map(v => v >= 0 ? 'rgba(6,182,212,0.75)' : 'rgba(244,63,94,0.75)'),
        borderColor:     values.map(v => v >= 0 ? 'rgba(6,182,212,1)'    : 'rgba(244,63,94,1)'),
        borderWidth: 1, borderRadius: 6, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2535', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
          titleColor: '#94a3b8', bodyColor: '#f1f5f9', padding: 10,
          callbacks: {
            title: ctx => {
              const map = { '1A': '1 Año', '3A': '3 Años', '5A': '5 Años',
                            '7A': '7 Años', '10A': '10 Años', 'Total': 'Desde inicio' };
              return map[ctx[0].label] || ctx[0].label;
            },
            label: ctx => '  CAGR: ' + fmtPct(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          ticks: { color: tickColor, font: { size: 12, weight: '600' } },
          grid: { color: gridColor }
        },
        y: {
          ticks: { color: tickColor, font: { size: 11 }, callback: v => v.toFixed(1) + '%' },
          grid: { color: gridColor }
        }
      }
    }
  });
}

// ============================================================
// BUSCAR FONDO
// ============================================================
let searchInit = false;
let searchData = null;

function initSearch() {
  if (searchInit) return;
  if (!DB_LOADED) {
    document.getElementById('search-results').innerHTML = `
      <div class="no-results">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        Cargando datos CSV…
      </div>`;
    return;
  }
  searchInit = true;
  searchData = DB_ISINS.map(isin => {
    const { d: dates, n: navs } = DB_DATA[isin];
    return {
      isin,
      name:  _getName(isin),
      nav:   navs[navs.length - 1],
      date:  dates[dates.length - 1],
      start: dates[0],
      r1m:   computeReturnNMonths(dates, navs, 1),
      r1y:   computeReturnNMonths(dates, navs, 12),
      r3y:   computeReturnNMonths(dates, navs, 36),
      r5y:   computeReturnNMonths(dates, navs, 60)
    };
  });
  filtrarFondos();
}

function filtrarFondos() {
  if (!searchData) return;
  const q   = document.getElementById('search-input').value.trim().toUpperCase();
  const ord = document.getElementById('filter-orden').value;

  let res = q
    ? searchData.filter(f => f.isin.includes(q) || (f.name && f.name.toUpperCase().includes(q)))
    : [...searchData];

  if      (ord === 'nav-desc') res.sort((a, b) => b.nav - a.nav);
  else if (ord === 'nav-asc')  res.sort((a, b) => a.nav - b.nav);
  else if (ord === '1m-desc')  res.sort((a, b) => (b.r1m ?? -Infinity) - (a.r1m ?? -Infinity));
  else if (ord === '1y-desc')  res.sort((a, b) => (b.r1y ?? -Infinity) - (a.r1y ?? -Infinity));
  else if (ord === '1y-asc')   res.sort((a, b) => (a.r1y ?? Infinity)  - (b.r1y ?? Infinity));
  else res.sort((a, b) => {
    const na = a.name || a.isin, nb = b.name || b.isin;
    return na.localeCompare(nb, 'es');
  });

  const total = searchData.length;
  document.getElementById('results-count').textContent =
    res.length === total ? total + ' fondos disponibles' :
    res.length + ' resultado' + (res.length !== 1 ? 's' : '') + ' de ' + total;

  const container = document.getElementById('search-results');
  if (!res.length) {
    container.innerHTML = `<div class="no-results">
      <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      No se encontraron fondos.</div>`;
    return;
  }

  const pct = v => v === null || v === undefined
    ? '<td class="na">—</td>'
    : `<td class="${v >= 0 ? 'up' : 'down'}">${fmtPct(v)}</td>`;

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nombre / ISIN</th>
            <th>Últ. Fecha</th>
            <th>NAV</th>
            <th>1 Mes</th>
            <th>1 Año</th>
            <th>3 Años</th>
            <th>5 Años</th>
          </tr>
        </thead>
        <tbody>
          ${res.map(f => `<tr style="cursor:pointer" onclick="goToFund('${f.isin}')">
            <td style="max-width:300px">
              <div class="name" style="font-size:12px;line-height:1.3">${f.name || '—'}</div>
              <div class="mono" style="font-size:10px;color:var(--cyan);margin-top:2px">${f.isin}</div>
            </td>
            <td class="mono" style="font-size:11px;color:var(--dim)">${f.date}</td>
            <td class="mono">${f.nav.toFixed(4)}</td>
            ${pct(f.r1m)}${pct(f.r1y)}${pct(f.r3y)}${pct(f.r5y)}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function goToFund(isin) {
  navigate('inicio');
  currentIsin = null;
  const sel = document.getElementById('isin-select');
  if (sel) sel.value = isin;
  loadFund(isin);
}

// ============================================================
// BACKTESTING
// ============================================================
let btInit = false;

function initBacktest() {
  if (btInit) return;
  if (!DB_LOADED) return;
  btInit = true;

  const sel = document.getElementById('bt-isin-select');
  DB_ISINS.forEach(isin => sel.add(new Option(_buildOptionText(isin), isin)));

  if (DB_ISINS.length > 0) onBtISINChange(DB_ISINS[0]);
}

function filterBtISINSelect() {
  if (!DB_LOADED || !DB_ISINS.length) return;
  const q   = document.getElementById('bt-isin-filter').value.trim().toUpperCase();
  const sel = document.getElementById('bt-isin-select');
  const prev = sel.value;
  while (sel.options.length) sel.remove(0);
  const list = q
    ? DB_ISINS.filter(i => i.includes(q) || (DB_NAMES[i] && DB_NAMES[i].toUpperCase().includes(q)))
    : DB_ISINS;
  list.forEach(isin => {
    const o = new Option(_buildOptionText(isin), isin);
    if (isin === prev) o.selected = true;
    sel.add(o);
  });
}

function onBtISINChange(isin) {
  if (!isin || !DB_DATA[isin]) return;
  const { d: dates }  = DB_DATA[isin];
  const startInput    = document.getElementById('bt-start');
  const endInput      = document.getElementById('bt-end');
  startInput.min      = dates[0];
  startInput.max      = dates[dates.length - 1];
  endInput.min        = dates[0];
  endInput.max        = dates[dates.length - 1];
  if (!endInput.value || endInput.value > dates[dates.length - 1])
    endInput.value = dates[dates.length - 1];
  if (!startInput.value || startInput.value < dates[0])
    startInput.value = dates[0];
}

function runBacktest() {
  const isin    = document.getElementById('bt-isin-select').value;
  const startD  = document.getElementById('bt-start').value;
  const endD    = document.getElementById('bt-end').value;
  const capital = parseFloat(document.getElementById('bt-capital').value) || 10000;

  if (!isin || !DB_DATA[isin]) { alert('Selecciona un fondo válido.'); return; }
  if (!startD || !endD || endD <= startD) {
    alert('La fecha fin debe ser posterior a la fecha inicio.'); return;
  }

  const { d: allDates, n: allNavs } = DB_DATA[isin];
  let si = allDates.findIndex(d => d >= startD);
  let ei = -1;
  for (let i = allDates.length - 1; i >= 0; i--) {
    if (allDates[i] <= endD) { ei = i; break; }
  }

  if (si === -1 || ei === -1 || ei <= si) {
    alert('No hay datos suficientes para el período seleccionado.'); return;
  }

  const dates  = allDates.slice(si, ei + 1);
  const navs   = allNavs.slice(si, ei + 1);
  const values = navs.map(n => (n / navs[0]) * capital);
  const finalVal = values[values.length - 1];

  const actualYears = (new Date(dates[dates.length - 1] + 'T00:00:00') - new Date(dates[0] + 'T00:00:00'))
    / (365.25 * 24 * 3600 * 1000);

  const totalReturn = (finalVal / capital - 1) * 100;
  const cagr        = actualYears > 0 ? (Math.pow(finalVal / capital, 1 / actualYears) - 1) * 100 : 0;
  const maxDD       = computeMaxDrawdown(values);

  // Volatilidad anualizada (datos diarios → ×252)
  const mRets = [];
  for (let i = 1; i < navs.length; i++) mRets.push(navs[i] / navs[i - 1] - 1);
  const meanR    = mRets.reduce((a, b) => a + b, 0) / (mRets.length || 1);
  const variance = mRets.reduce((s, r) => s + (r - meanR) ** 2, 0) / (mRets.length || 1);
  const annualVol = Math.sqrt(variance * 252) * 100;
  const sharpe    = annualVol > 0 ? cagr / annualVol : 0;

  const annual = computeAnnualReturns(dates, navs).filter(a => {
    const y = parseInt(a.label);
    const s = parseInt(dates[0].slice(0, 4));
    const e = parseInt(dates[dates.length - 1].slice(0, 4));
    return y >= s && y <= e;
  });

  document.getElementById('bt-results').style.display     = 'block';
  document.getElementById('bt-placeholder').style.display = 'none';

  document.getElementById('bt-metrics-grid').innerHTML = [
    { lbl: 'Capital Final', val: '€ ' + finalVal.toLocaleString('es', { maximumFractionDigits: 0 }), c: finalVal >= capital ? '#059669' : '#e11d48' },
    { lbl: 'Retorno Total', val: fmtPct(totalReturn),   c: totalReturn >= 0 ? '#059669' : '#e11d48' },
    { lbl: 'CAGR',          val: fmtPct(cagr),           c: cagr >= 0 ? '#0891b2' : '#e11d48' },
    { lbl: 'Max Drawdown',  val: '-' + maxDD.toFixed(1) + '%', c: '#d97706' },
    { lbl: 'Sharpe Ratio',  val: sharpe.toFixed(2),      c: sharpe >= 1 ? '#059669' : '#64748b' },
  ].map(m => `<div class="metric-box"><div class="m-val" style="color:${m.c}">${m.val}</div><div class="m-lbl">${m.lbl}</div></div>`).join('');

  document.getElementById('bt-chart-sub').textContent =
    isin + ' · ' + dates[0] + ' → ' + dates[dates.length - 1];
  const btName = _getName(isin);
  document.getElementById('bt-isin-badge').textContent =
    btName ? (btName.length > 35 ? btName.slice(0, 32) + '…' : btName) : isin;

  const btColor = finalVal >= capital ? '#06b6d4' : '#f43f5e';
  makeChart('bt-chart-main', {
    type: 'line',
    data: {
      labels: dates.map(d => formatAxisDate(d, 'ALL')),
      datasets: [
        {
          label: 'Capital (€)', data: values,
          borderColor: btColor, backgroundColor: btColor + '14',
          fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2
        },
        {
          label: 'Capital inicial', data: values.map(() => capital),
          borderColor: 'rgba(255,255,255,0.15)', borderDash: [4, 4],
          pointRadius: 0, borderWidth: 1, fill: false
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: tickColor, font: { size: 11 } } },
        tooltip: {
          mode: 'index', intersect: false,
          callbacks: { label: ctx => ' €' + ctx.raw.toLocaleString('es', { maximumFractionDigits: 0 }) }
        }
      },
      scales: {
        x: { ticks: { color: tickColor, maxTicksLimit: 8 }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor, callback: v => '€' + (v / 1000).toFixed(0) + 'k' }, grid: { color: gridColor } }
      }
    }
  });

  makeChart('bt-chart-anual', {
    type: 'bar',
    data: {
      labels: annual.map(a => a.label),
      datasets: [{
        label: 'Retorno anual (%)',
        data: annual.map(a => a.ret),
        backgroundColor: annual.map(a => a.ret >= 0 ? 'rgba(6,182,212,0.7)' : 'rgba(244,63,94,0.7)'),
        borderRadius: 4, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: tickColor, font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: tickColor }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor, callback: v => v + '%' }, grid: { color: gridColor } }
      }
    }
  });

  document.getElementById('bt-stats-body').innerHTML = [
    ['Capital inicial',   '€ ' + capital.toLocaleString('es'),                                        'Monto invertido al inicio del período'],
    ['Capital final',     '€ ' + finalVal.toLocaleString('es', { maximumFractionDigits: 0 }),         'Valor del capital al final del período'],
    ['Ganancia neta',     '€ ' + (finalVal - capital).toLocaleString('es', { maximumFractionDigits: 0 }), 'Beneficio o pérdida total en euros'],
    ['Retorno total',     fmtPct(totalReturn),                                                        'Rentabilidad acumulada en el período'],
    ['CAGR (Tasa anual)', fmtPct(cagr),                                                               'Tasa de crecimiento anual compuesto'],
    ['Volatilidad anual', annualVol.toFixed(1) + '%',                                                 'Desviación estándar anualizada (base 252 días)'],
    ['Máximo Drawdown',   '-' + maxDD.toFixed(2) + '%',                                               'Caída máxima desde un pico hasta el valle'],
    ['Ratio de Sharpe',   sharpe.toFixed(3),                                                          'Rentabilidad ajustada por riesgo (rf = 0%)'],
    ['Observaciones',     dates.length + ' días',                                                     'Datos reales de NAV diario'],
  ].map(([m, v, d]) => `<tr>
    <td class="name">${m}</td>
    <td class="mono">${v}</td>
    <td style="color:var(--dim);font-size:12px">${d}</td>
  </tr>`).join('');
}

// ============================================================
// INIT
// ============================================================
cargarDatos();
