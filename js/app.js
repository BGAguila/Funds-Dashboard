// VARIABLES GLOBALES
let datosFondos = []; // Aquí guardaremos la info cruzada de ambos CSV
let chartInstancia = null;
let fondoActual = null;
let horizonteActual = 'total';

// 1. INICIALIZACIÓN: Leer los CSVs al cargar la web
document.addEventListener("DOMContentLoaded", () => {
    cargarDatosCSV();
    configurarEventos();
});

// 2. FUNCIÓN PARA LEER LOS ARCHIVOS DE LA CARPETA /data/
function cargarDatosCSV() {
    // Leemos primero la información general
    Papa.parse("data/5ejemplos-info general.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(resultadosInfo) {
            let infoGeneral = resultadosInfo.data;
            
            // Leemos después el histórico de NAV
            Papa.parse("data/5ejemplos-nav.csv", {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: function(resultadosNav) {
                    let navData = resultadosNav.data;
                    procesarDatos(infoGeneral, navData);
                },
                error: function(err) { console.error("Error al leer 5ejemplos-nav.csv", err); }
            });
        },
        error: function(err) { console.error("Error al leer 5ejemplos-info general.csv", err); }
    });
}

// 3. PROCESAR Y UNIR LOS DATOS
function procesarDatos(infoGeneral, navData) {
    datosFondos = []; // Vaciamos por si acaso
    
    // Obtenemos las fechas del NAV (las cabeceras del CSV de NAV a partir de la columna 1)
    const fechasNav = Object.keys(navData[0]).filter(k => k !== 'Variable');

    // Cruzamos cada fila de info general con su correspondiente fila de NAV
    infoGeneral.forEach((fondoInfo, index) => {
        // Buscamos la fila de NAV que le corresponde a este fondo
        // Suponemos que el orden es el mismo, o puedes buscar por ISIN si el CSV de nav lo tuviera.
        let filaNav = navData[index]; 
        let historicoFechasValores = [];

        if (filaNav) {
            fechasNav.forEach(fecha => {
                let valor = parseFloat(filaNav[fecha]);
                if (!isNaN(valor)) {
                    historicoFechasValores.push({ fecha: fecha, valor: valor });
                }
            });
        }

        // Construimos el objeto del fondo uniendo todo
        datosFondos.push({
            isin: fondoInfo['ISIN'] || 'N/A',
            nombre: fondoInfo['Nombre'] || 'Fondo Desconocido',
            nombreLegal: fondoInfo['Nombre Legal'] || '--',
            gestora: fondoInfo['Gestora'] || 'Varias',
            moneda: fondoInfo['Moneda'] || 'EUR',
            pais: fondoInfo['País Domicilio'] || '--',
            categoria: fondoInfo['Categoría MS'] || '--',
            rating: (fondoInfo['Rating ★'] || '') + ' ★',
            riesgo: fondoInfo['SRRI (quote)'] || '--',
            score: fondoInfo['Risk Score'] || '--',
            ter: fondoInfo['TER %'] ? fondoInfo['TER %'] + '%' : '--',
            gestion: fondoInfo['Comis.Gest.Real %'] ? fondoInfo['Comis.Gest.Real %'] + '%' : '--',
            patr: fondoInfo['Patr Total (M)'] || '--',
            historico_nav: historicoFechasValores
        });
    });

    // Llenar el selector desplegable
    llenarBuscador();
}

function llenarBuscador() {
    const selector = document.getElementById('buscadorFondos');
    selector.innerHTML = ''; // Limpiamos el texto de "Cargando..."
    
    datosFondos.forEach((fondo, i) => {
        let opt = document.createElement('option');
        opt.value = i;
        opt.innerHTML = `${fondo.nombre} (${fondo.isin})`;
        selector.appendChild(opt);
    });

    // Cargar el primer fondo por defecto
    selector.addEventListener('change', cargarFondoSeleccionado);
    cargarFondoSeleccionado();
}

// 4. ACTUALIZAR INTERFAZ AL SELECCIONAR FONDO
function cargarFondoSeleccionado() {
    const index = document.getElementById('buscadorFondos').value;
    fondoActual = datosFondos[index];

    if(!fondoActual) return;

    // Pintar textos
    document.getElementById('txt-nombre').innerText = fondoActual.nombre;
    document.getElementById('txt-gestora').innerText = fondoActual.gestora;
    document.getElementById('txt-isin').innerText = fondoActual.isin;
    document.getElementById('txt-moneda').innerText = fondoActual.moneda;
    document.getElementById('txt-pais').innerText = fondoActual.pais;
    
    document.getElementById('info-nombre').innerText = fondoActual.nombreLegal;
    document.getElementById('info-isin').innerText = fondoActual.isin;
    document.getElementById('info-cat').innerText = fondoActual.categoria;
    document.getElementById('info-rating').innerText = fondoActual.rating;
    document.getElementById('info-riesgo').innerText = fondoActual.riesgo;
    document.getElementById('info-score').innerText = fondoActual.score;
    document.getElementById('info-ter').innerText = fondoActual.ter;
    document.getElementById('info-gestion').innerText = fondoActual.gestion;
    document.getElementById('info-patr').innerText = fondoActual.patr;

    if (fondoActual.historico_nav.length > 0) {
        let ultimo = fondoActual.historico_nav[fondoActual.historico_nav.length - 1];
        document.getElementById('fecha-nav').innerText = `${ultimo.fecha} | ${ultimo.valor.toFixed(2)} ${fondoActual.moneda}`;
    }

    filtrarTiempo(horizonteActual);
}

// 5. MOTOR DE GRÁFICA Y FILTROS
function filtrarTiempo(meses) {
    horizonteActual = meses;
    
    // Cambiar clases CSS de los botones
    document.querySelectorAll('.btn-filter').forEach(btn => {
        if(btn.dataset.meses == meses) {
            btn.classList.replace('inactive', 'active');
        } else {
            btn.classList.replace('active', 'inactive');
        }
    });

    let datosFiltrados = [...fondoActual.historico_nav];
    if (meses !== 'total') {
        const dias = parseInt(meses) * 21; // Días bursátiles aprox
        if (datosFiltrados.length > dias) {
            datosFiltrados = datosFiltrados.slice(datosFiltrados.length - dias);
        }
    }
    renderizarGrafico(datosFiltrados);
}

function renderizarGrafico(datos) {
    if (chartInstancia) chartInstancia.destroy();
    if (!datos || datos.length === 0) return;

    const fechas = datos.map(d => d.fecha);
    const valores = datos.map(d => d.valor);

    const vIni = valores[0];
    const vFin = valores[valores.length - 1];
    const rentabilidad = ((vFin - vIni) / vIni) * 100;
    
    const txtRent = document.getElementById('txt-rendimiento');
    txtRent.innerText = (rentabilidad > 0 ? '+' : '') + rentabilidad.toFixed(2) + '%';
    txtRent.className = rentabilidad >= 0 ? 'font-bold text-green-600' : 'font-bold text-red-600';

    const colorLn = rentabilidad >= 0 ? '#10b981' : '#ef4444'; 
    const colorBg = rentabilidad >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)';

    const ctx = document.getElementById('chartEvolucion').getContext('2d');
    chartInstancia = new Chart(ctx, {
        type: 'line',
        data: { labels: fechas, datasets: [{ label: 'NAV', data: valores, borderColor: colorLn, backgroundColor: colorBg, fill: true, pointRadius: 0, tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 7 } } } }
    });
}

// 6. EVENTOS BÁSICOS (Pestañas y Botones de Filtro)
function configurarEventos() {
    // Pestañas
    document.getElementById('btn-grafico').addEventListener('click', () => { switchTab('grafico'); });
    document.getElementById('btn-info').addEventListener('click', () => { switchTab('info'); });

    // Botones de filtro de tiempo
    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            filtrarTiempo(e.target.dataset.meses);
        });
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    document.getElementById('btn-' + tabId).classList.add('active');
}