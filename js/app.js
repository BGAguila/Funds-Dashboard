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
let DB_INFO   = {};   // fila completa de info general por ISIN
let DB_LOADED = false;

function cargarDatos() {
  // Detectar ruta base automáticamente
  const pathname = window.location.pathname;
  let basePath = './';

  // Si estamos en GitHub Pages (detectar por /repositorio/ en la ruta)
  if (pathname.includes('/Fund-dashboard/')) {
    basePath = '/Fund-dashboard/';
  }

  const infoPath = basePath + 'data/5ejemplos-info general.csv';
  const navPath = basePath + 'data/5ejemplos-nav.csv';

  Papa.parse(infoPath, {
    download: true,
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
    encoding: 'UTF-8',
    complete: function(resInfo) {
      if (!resInfo.data || !resInfo.data.length) {
        mostrarErrorCSV();
        return;
      }
      Papa.parse(navPath, {
        download: true,
        header: true,
        delimiter: ';',
        skipEmptyLines: true,
        encoding: 'UTF-8',
        complete: function(resNav) {
          if (!resNav.data || !resNav.data.length) {
            mostrarErrorCSV();
            return;
          }
          procesarDatos(resInfo.data, resNav.data);
        },
        error: function(err) {
          console.error('Error cargando NAV CSV:', err);
          mostrarErrorCSV();
        }
      });
    },
    error: function(err) {
      console.error('Error cargando Info CSV:', err);
      mostrarErrorCSV();
    }
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
    DB_INFO[isin]  = fila;

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
  let cutoffStr;
  if (period === 'YTD') {
    cutoffStr = new Date().getFullYear() + '-01-01';
  } else {
    const cutoff = new Date(latest);
    if      (period === '1Y')  cutoff.setFullYear(cutoff.getFullYear() - 1);
    else if (period === '3Y')  cutoff.setFullYear(cutoff.getFullYear() - 3);
    else if (period === '5Y')  cutoff.setFullYear(cutoff.getFullYear() - 5);
    else if (period === '10Y') cutoff.setFullYear(cutoff.getFullYear() - 10);
    cutoffStr = cutoff.toISOString().slice(0, 10);
  }
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

// ── TAB SWITCHING ──
function switchFundTab(tab) {
  document.querySelectorAll('.fund-tab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.fund-tab-panel').forEach(function(p) {
    p.classList.remove('active');
  });
  const panel = document.getElementById('tab-' + tab);
  if (panel) panel.classList.add('active');
}

// ── POPULATE FUND INFO FROM DB_INFO ──
function populateFundInfo(isin) {
  try {
    const info = DB_INFO[isin];
    if (!info) return;

    // Helpers
    function pn(v)  { const n = parseNum(v); return n; }
    function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val || '—'; }

    // ── IDENTITY HEADER ──
    setText('fi-name', info['Nombre']);
    document.getElementById('fi-isin-label').textContent = isin;

    // Badges
    const badgesEl = document.getElementById('fi-badges');
    badgesEl.innerHTML = '';
    function addBadge(text, cls) { if (!text) return; const s = document.createElement('span'); s.className = 'fi-badge ' + cls; s.textContent = text; badgesEl.appendChild(s); }
    addBadge(info['Clase Activo'], 'fi-badge-cyan');
    addBadge(info['Moneda'], 'fi-badge-violet');
    if (info['UCITS'] === 'true') addBadge('UCITS', 'fi-badge-emerald');
    addBadge(info['Estructura Legal'], 'fi-badge-amber');

    // SRRI en header
    const srriVal = parseInt(info['SRRI (quote)'] || '0', 10);
    document.querySelectorAll('#fi-srri-row .fi-srri-box').forEach(function(box) { box.classList.toggle('active', parseInt(box.dataset.v, 10) === srriVal); });

    // Stars
    const stars = parseInt(info['Rating ★'] || '0', 10);
    document.getElementById('fi-stars').textContent = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : '';

    // ── TAB RESUMEN ──
    setText('fi-gestora',   info['Gestora']);
    setText('fi-marca',     info['Marca Gestora']);
    setText('fi-estructura',info['Estructura Legal']);
    setText('fi-pais',      info['País Domicilio']);
    setText('fi-moneda',    info['Moneda']);
    setText('fi-tipo',      info['Tipo Activo']);
    setText('fi-clase',     info['Clase Activo']);
    setText('fi-creacion',  (info['Creación (sp)'] || '').split('T')[0] || '—');
    const aumT = pn(info['Patr Total (M)']); setText('fi-aum-total', aumT !== null ? aumT.toFixed(1) + ' M€' : '—');
    const aumC = pn(info['Patr Clase (M)']); setText('fi-aum-clase', aumC !== null ? aumC.toFixed(1) + ' M€' : '—');
    const oc = pn(info['Coste Ongoing %']); setText('fi-ongoing', oc !== null ? oc.toFixed(2) + '%' : '—');
    const cm = pn(info['Comis.Gestión %']); setText('fi-comision', cm !== null ? cm.toFixed(2) + '%' : '—');

    // ── TAB RENTABILIDAD ──
    ['1D', '1S', '1M', '3M', 'YTD', '1A', '3A', '5A', '10A'].forEach(function(p) {
      const n = pn(info['Rent ' + p]);
      const el = document.getElementById('ret-' + p.toLowerCase());
      if (el && n !== null) {
        el.textContent = (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
        el.className = 'ret-val ' + (n > 0 ? 'up' : n < 0 ? 'down' : '');
      } else if (el) { el.textContent = '—'; el.className = 'ret-val'; }
    });

    // Historial anual
    const tbody = document.getElementById('fi-annual-body');
    if (tbody) {
      tbody.innerHTML = '';
      for (let y = 2025; y >= 2016; y--) {
        const retRaw = info[String(y)];
        const n = pn(retRaw);
        if (n === null) continue;
        const rankRaw = info['Rank ' + y];
        const catRaw  = info['Cat ' + y];
        const rankStr = rankRaw && catRaw ? rankRaw + ' / ' + catRaw : (rankRaw || '—');
        const tr = document.createElement('tr');
        const pctStr = (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
        tr.innerHTML = '<td class="name">' + y + '</td><td class="mono ' + (n >= 0 ? 'up' : 'down') + '" style="text-align:right">' + pctStr + '</td><td class="mono" style="text-align:right">' + rankStr + '</td>';
        tbody.appendChild(tr);
      }
    }

    // ── TAB CARTERA ──
    const allocWrap = document.getElementById('fi-alloc-wrap');
    if (allocWrap) {
      allocWrap.innerHTML = '';
      const allocMap = { 'Renta Variable': '% Acciones', 'Renta Fija': '% Bonos', 'Efectivo': '% Efectivo', 'Convertibles': '% Convertible', 'Otros': '% Otro' };
      const colors = { 'Renta Variable': '#0891b2', 'Renta Fija': '#7c3aed', 'Efectivo': '#059669', 'Convertibles': '#d97706', 'Otros': '#64748b' };
      for (const lbl in allocMap) {
        const n = pn(info[allocMap[lbl]]);
        if (n === null || n === 0) continue;
        const abs = Math.abs(n);
        allocWrap.innerHTML += '<div class="alloc-row"><span class="alloc-lbl">' + lbl + '</span><div class="alloc-bar-wrap"><div class="alloc-bar-fill" style="width:' + Math.min(abs, 100) + '%;background:' + colors[lbl] + '"></div></div><span class="alloc-pct">' + n.toFixed(1) + '%</span></div>';
      }
      if (!allocWrap.innerHTML) allocWrap.innerHTML = '<p style="color:var(--dim);font-size:12px;padding:12px">Sin datos</p>';
    }

    // Geographic distribution
    const geoWrap = document.getElementById('fi-geo-wrap');
    if (geoWrap) {
      geoWrap.innerHTML = '';
      const geoMap = { 'Europa Des.': 'Reg Europa Des. %', 'Norteamérica': 'Reg Norteamérica %', 'Asia Em.': 'Reg Asia Em. %', 'Asia Des.': 'Reg Asia Des. %', 'Latinoam.': 'Reg Latinoam. %', 'Japón': 'Reg Japón %', 'UK': 'Reg UK %', 'África/OM': 'Reg África/OM %', 'Europa Em.': 'Reg Europa Em. %', 'Australasia': 'Reg Australasia %' };
      const colors = { 'Europa Des.': '#0891b2', 'Norteamérica': '#7c3aed', 'Asia Em.': '#059669', 'Asia Des.': '#d97706', 'Latinoam.': '#e11d48', 'Japón': '#8b5cf6', 'UK': '#0ea5e9', 'África/OM': '#f59e0b', 'Europa Em.': '#10b981', 'Australasia': '#6366f1' };
      const items = [];
      for (const lbl in geoMap) { const n = pn(info[geoMap[lbl]]); if (n !== null && n > 0) items.push({ lbl, n, color: colors[lbl] }); }
      items.sort(function(a, b) { return b.n - a.n; });
      items.forEach(function(g) { geoWrap.innerHTML += '<div class="alloc-row"><span class="alloc-lbl">' + g.lbl + '</span><div class="alloc-bar-wrap"><div class="alloc-bar-fill" style="width:' + Math.min(g.n, 100) + '%;background:' + g.color + '"></div></div><span class="alloc-pct">' + g.n.toFixed(1) + '%</span></div>'; });
      if (!geoWrap.innerHTML) geoWrap.innerHTML = '<p style="color:var(--dim);font-size:12px;padding:12px">Sin datos</p>';
    }

    // Renta Fija details
    const rfCard = document.getElementById('fi-rf-card');
    if (rfCard) {
      const durN = pn(info['Duración Efect.']);
      const ytmN = pn(info['TIR (YTM)']);
      rfCard.style.display = (durN !== null || ytmN !== null) ? 'block' : 'none';
      setText('fi-dur', durN !== null ? durN.toFixed(2) + ' años' : '—');
      setText('fi-ytm', ytmN !== null ? ytmN.toFixed(2) + '%' : '—');
      const couponN = pn(info['Coupon Medio']);
      setText('fi-coupon', couponN !== null ? couponN.toFixed(2) + '%' : '—');
      setText('fi-cq', info['Calidad Cred.'] || '—');
    }

    // ── TAB RIESGO ──
    document.querySelectorAll('#fi-srri-scale .srri-box').forEach(function(box) { box.classList.toggle('active', parseInt(box.dataset.v, 10) === srriVal); });
    const vol1 = pn(info['Volatil 1A']); setText('fi-vol1', vol1 !== null ? vol1.toFixed(2) + '%' : '—');
    const vol3 = pn(info['Volatil 3A']); setText('fi-vol3', vol3 !== null ? vol3.toFixed(2) + '%' : '—');
    const vol5 = pn(info['Volatil 5A']); setText('fi-vol5', vol5 !== null ? vol5.toFixed(2) + '%' : '—');
    const sh1  = pn(info['Sharpe 1A']);  setText('fi-sh1',  sh1  !== null ? sh1.toFixed(3) : '—');
    const sh3  = pn(info['Sharpe 3A']);  setText('fi-sh3',  sh3  !== null ? sh3.toFixed(3) : '—');
    const sh5  = pn(info['Sharpe 5A']);  setText('fi-sh5',  sh5  !== null ? sh5.toFixed(3) : '—');
    const dd1  = pn(info['Drawdown 1A (hist)']); setText('fi-dd1', dd1 !== null ? dd1.toFixed(2) + '%' : '—');
    const dd3  = pn(info['Drawdown 3A (hist)']); setText('fi-dd3', dd3 !== null ? dd3.toFixed(2) + '%' : '—');
    const dd5  = pn(info['Drawdown 5A (hist)']); setText('fi-dd5', dd5 !== null ? dd5.toFixed(2) + '%' : '—');
    const ddm  = pn(info['Drawdown Máx (hist)']); setText('fi-ddmax', ddm !== null ? ddm.toFixed(2) + '%' : '—');
    setText('fi-riskms3', info['Riesgo MS 3A'] || '—');
    setText('fi-retms3',  info['Rent. MS 3A']  || '—');

    // ── TAB OTROS ──
    setText('fi-cat', info['Categoría ID'] || '—');
    const ratingMs = parseInt(info['Rating ★ MS'] || '0', 10);
    setText('fi-rating-ms', ratingMs > 0 ? '★'.repeat(ratingMs) + '☆'.repeat(5 - ratingMs) : '—');
    setText('fi-idx-prim', info['Índice Primario'] || '—');
    setText('fi-benchmark', info['Benchmark Prosp.'] || '—');
    setText('fi-bestfit', info['Índice BestFit'] || '—');
    setText('fi-fiscal', info['Fin Año Fiscal'] || '—');
    setText('fi-estado', info['Estado'] || '—');
    setText('fi-ucits-val', info['UCITS'] === 'true' ? 'Sí' : 'No');
    const yld = pn(info['Yield 12M']); setText('fi-yield', yld !== null ? yld.toFixed(2) + '%' : '—');
    setText('fi-acumdist', info['Acum/Dist'] || '—');
    setText('fi-nactivos', info['# Activos Total'] || '—');
    const t10 = pn(info['Top 10 %']); setText('fi-top10', t10 !== null ? t10.toFixed(2) + '%' : '—');

  } catch(e) {
    console.error('Error en populateFundInfo:', e);
  }
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

  // Rellenar cabecera de identidad + tabs con datos del CSV de info
  switchFundTab('resumen');
  populateFundInfo(isin);

  // NAV en cabecera de identidad (dato en tiempo real del NAV CSV)
  const fiNavEl = document.getElementById('fi-nav-val');
  const fiDateEl = document.getElementById('fi-nav-date-lbl');
  if (fiNavEl) fiNavEl.textContent = latestNAV.toFixed(2);
  if (fiDateEl) fiDateEl.textContent = latestDate;

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

  // Gráficos — ceder el hilo para que el navegador calcule el layout del panel
  const _filtDates = filt.dates, _filtNavs = filt.navs;
  const _annualData = computeAnnualReturns(dates, navs);
  const _navSub = isin + ' · ' + (_filtDates[0] || '—') + ' → ' + latestDate;
  setTimeout(function() {
    renderNAVChart(_filtDates, _filtNavs, currentPeriod);
    document.getElementById('nav-chart-sub').textContent = _navSub;
    renderAnnualChart(_annualData);
    renderPeriodoChart(isin);
  }, 0);
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
            label: ctx => '  NAV: ' + ctx.raw.toFixed(2)
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
