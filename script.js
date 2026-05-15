'use strict';

const CONFIG = {
  anoBase: 2026,
  urls: {
    resumoTon: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4LFVuZ0zcS7_0vZYDu9k4UN2TRQ3e5wDYAlxyBnLTXri8YV-9LBYugIcTgbeZDxc6UerJK1f7OeC8/pub?gid=0&single=true&output=csv',
    geral: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4LFVuZ0zcS7_0vZYDu9k4UN2TRQ3e5wDYAlxyBnLTXri8YV-9LBYugIcTgbeZDxc6UerJK1f7OeC8/pub?gid=2071576844&single=true&output=csv'
  }
};

const state = {
  resumoTon: [],
  geral: [],
  charts: {}
};

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function $(id) {
  return document.getElementById(id);
}

function setStatus(texto, tipo = '') {
  const el = $('statusBox');
  if (!el) return;
  el.textContent = texto;
  el.className = `status card ${tipo}`.trim();
}

function setLastUpdate(texto) {
  const el = $('lastUpdate');
  if (el) el.textContent = texto;
}

function formatNumber(valor, casas = 0) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseCSV(texto) {
  const linhas = [];
  let linha = [];
  let campo = '';
  let dentroAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    const prox = texto[i + 1];

    if (char === '"') {
      if (dentroAspas && prox === '"') {
        campo += '"';
        i++;
      } else {
        dentroAspas = !dentroAspas;
      }
    } else if (char === ',' && !dentroAspas) {
      linha.push(campo);
      campo = '';
    } else if ((char === '\n' || char === '\r') && !dentroAspas) {
      if (char === '\r' && prox === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += char;
    }
  }

  linha.push(campo);
  linhas.push(linha);

  return linhas.filter(l => l.some(c => String(c).trim() !== ''));
}

async function fetchCSV(url) {
  const separador = url.includes('?') ? '&' : '?';
  const resposta = await fetch(`${url}${separador}cacheBust=${Date.now()}`, { cache: 'no-store' });

  if (!resposta.ok) {
    throw new Error(`Falha ao carregar CSV: ${resposta.status}`);
  }

  return parseCSV(await resposta.text());
}

function parseNumero(valor) {
  if (valor === null || valor === undefined) return 0;

  let texto = String(valor).trim();
  if (!texto || texto === '-' || texto === '–') return 0;

  texto = texto
    .replace(/\s/g, '')
    .replace(/m²|m2|ton|t/gi, '')
    .replace(/[^0-9,.-]/g, '');

  if (!texto) return 0;

  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');

  if (temVirgula && temPonto) {
    texto = texto.replace(/,/g, '');
  } else if (temVirgula && !temPonto) {
    texto = texto.replace(',', '.');
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function parseData(valor) {
  if (!valor) return null;

  const texto = String(valor).trim();

  const serial = Number(texto);
  if (Number.isFinite(serial) && serial > 20000 && serial < 70000) {
    const base = Date.UTC(1899, 11, 30);
    const data = new Date(base + serial * 86400000);
    return new Date(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
  }

  const partes = texto.split('/');
  if (partes.length !== 3) return null;

  const mes = Number(partes[0]);
  const dia = Number(partes[1]);
  let ano = Number(partes[2]);

  if (!Number.isFinite(mes) || !Number.isFinite(dia) || !Number.isFinite(ano)) return null;
  if (ano < 100) ano += 2000;

  const data = new Date(ano, mes - 1, dia);

  if (
    data.getFullYear() !== ano ||
    data.getMonth() !== mes - 1 ||
    data.getDate() !== dia
  ) {
    return null;
  }

  return data;
}

function chaveMes(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function chaveDia(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function diasNoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

function indiceCabecalho(linhas, nomesEsperados) {
  const esperados = nomesEsperados.map(normalizar);

  for (let i = 0; i < Math.min(linhas.length, 20); i++) {
    const linha = linhas[i].map(normalizar);
    const encontrou = esperados.some(nome => linha.some(celula => celula.includes(nome)));

    if (encontrou) return i;
  }

  return 0;
}

function indiceColuna(cabecalho, nomesPossiveis, fallback) {
  const header = cabecalho.map(normalizar);
  const nomes = nomesPossiveis.map(normalizar);

  for (const nome of nomes) {
    const idx = header.findIndex(celula => celula === nome || celula.includes(nome));
    if (idx >= 0) return idx;
  }

  return fallback;
}

function preencherSelectMeses() {
  const select = $('tapaMonth');
  if (!select) return;

  select.innerHTML = '';

  for (let mes = 1; mes <= 12; mes++) {
    const value = `${CONFIG.anoBase}-${String(mes).padStart(2, '0')}`;
    const label = `${NOMES_MESES[mes - 1]} de ${CONFIG.anoBase}`;
    select.add(new Option(label, value));
  }
}

function processarResumoTon(linhas) {
  const idxHeader = indiceCabecalho(linhas, ['DATA', 'TON TOTAL', 'ÁREA', 'BURACO']);
  const header = linhas[idxHeader];
  const dados = linhas.slice(idxHeader + 1);

  const colData = indiceColuna(header, ['DATA'], 0);
  const colTon = indiceColuna(header, ['TON TOTAL', 'TON'], 1);
  const colArea = indiceColuna(header, ['ÁREA (M²) TOTAL', 'AREA (M2) TOTAL', 'ÁREA', 'AREA'], 2);
  const colBuracos = indiceColuna(header, ['BURACO (QNT)', 'BURACO', 'QNT'], 3);

  state.resumoTon = dados
    .map(linha => {
      const data = parseData(linha[colData]);
      if (!data || data.getFullYear() !== CONFIG.anoBase) return null;

      return {
        data,
        mes: chaveMes(data),
        tonelagem: parseNumero(linha[colTon]),
        area: parseNumero(linha[colArea]),
        buracos: parseNumero(linha[colBuracos])
      };
    })
    .filter(Boolean);
}

function processarGeral(linhas) {
  const idxHeader = indiceCabecalho(linhas, ['DATA', 'BAIRRO', 'LOGADOURO', 'POR SERVIÇO']);
  const header = linhas[idxHeader];
  const dados = linhas.slice(idxHeader + 1);

  const colData = indiceColuna(header, ['DATA'], 0);
  const colBairro = indiceColuna(header, ['BAIRRO'], 1);
  const colLogradouro = indiceColuna(header, ['LOGADOURO', 'LOGRADOURO', 'VIA'], 2);
  const colArea = indiceColuna(header, ['ÁREA', 'AREA'], 3);
  const colTon = indiceColuna(header, ['POR SERVIÇO', 'POR SERVICO', 'TON'], 4);

  state.geral = dados
    .map(linha => {
      const data = parseData(linha[colData]);
      if (!data || data.getFullYear() !== CONFIG.anoBase) return null;

      return {
        data,
        mes: chaveMes(data),
        bairro: String(linha[colBairro] || '').trim(),
        logradouro: String(linha[colLogradouro] || '').trim(),
        area: parseNumero(linha[colArea]),
        tonelagem: parseNumero(linha[colTon])
      };
    })
    .filter(Boolean);
}

function renderKPIs(mesSelecionado) {
  const resumo = state.resumoTon.find(item => item.mes === mesSelecionado);

  $('tapaTon').textContent = resumo ? `${formatNumber(resumo.tonelagem, 2)} t` : '-';
  $('tapaArea').textContent = resumo ? `${formatNumber(resumo.area, 2)} m²` : '-';
  $('tapaBuracos').textContent = resumo ? formatNumber(resumo.buracos, 0) : '-';
}

function renderGraficoDiario(mesSelecionado) {
  const canvas = $('chartTapaDiario');
  if (!canvas) return;

  const [ano, mes] = mesSelecionado.split('-').map(Number);
  const totalDias = diasNoMes(ano, mes);
  const contagem = new Map();

  state.geral
    .filter(item => item.mes === mesSelecionado)
    .forEach(item => {
      const key = chaveDia(item.data);
      contagem.set(key, (contagem.get(key) || 0) + 1);
    });

  const labels = [];
  const valores = [];

  for (let dia = 1; dia <= totalDias; dia++) {
    const data = new Date(ano, mes - 1, dia);
    labels.push(String(dia).padStart(2, '0'));
    valores.push(contagem.get(chaveDia(data)) || 0);
  }

  if (state.charts.tapaDiario) {
    state.charts.tapaDiario.destroy();
  }

  if (typeof Chart === 'undefined') {
    setStatus('Dados carregados, mas a biblioteca Chart.js não foi carregada. Verifique a conexão/CDN.', 'err');
    return;
  }

  state.charts.tapaDiario = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Buracos tapados',
        data: valores,
        borderColor: '#1d4ed8',
        backgroundColor: '#1d4ed8',
        borderWidth: 3,
        tension: 0.25,
        pointRadius: 3,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: ${formatNumber(context.parsed.y, 0)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        },
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 16
          }
        }
      }
    }
  });
}

function contarRanking(campo, mesSelecionado) {
  const mapa = new Map();

  state.geral
    .filter(item => item.mes === mesSelecionado)
    .forEach(item => {
      const nome = String(item[campo] || '').trim();
      if (!nome) return;
      mapa.set(nome, (mapa.get(nome) || 0) + 1);
    });

  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

function renderTabelaRanking(tbodyId, ranking) {
  const tbody = $(tbodyId);
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!ranking.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">Sem registros no mês selecionado.</td></tr>';
    return;
  }

  ranking.forEach(([nome, total], index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${index + 1}</td><td>${nome}</td><td>${formatNumber(total, 0)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderRankings(mesSelecionado) {
  renderTabelaRanking('rankVias', contarRanking('logradouro', mesSelecionado));
  renderTabelaRanking('rankBairros', contarRanking('bairro', mesSelecionado));
}

function renderTapaBuraco() {
  const select = $('tapaMonth');
  if (!select || !select.value) return;

  const mesSelecionado = select.value;

  renderKPIs(mesSelecionado);
  renderGraficoDiario(mesSelecionado);
  renderRankings(mesSelecionado);
}

async function carregarTapaBuraco() {
  setStatus('Carregando dados de tapa-buraco...');
  setLastUpdate('Carregando...');

  const [csvResumo, csvGeral] = await Promise.all([
    fetchCSV(CONFIG.urls.resumoTon),
    fetchCSV(CONFIG.urls.geral)
  ]);

  processarResumoTon(csvResumo);
  processarGeral(csvGeral);
  preencherSelectMeses();

  const select = $('tapaMonth');
  const mesesComDados = [...new Set(state.resumoTon.map(item => item.mes))].sort();

  if (select) {
    select.value = mesesComDados[0] || `${CONFIG.anoBase}-01`;
  }

  renderTapaBuraco();

  setLastUpdate(new Date().toLocaleString('pt-BR'));
  setStatus(`Dados carregados com sucesso. Resumo: ${state.resumoTon.length} mês(es). Registros gerais: ${state.geral.length}.`, 'ok');
}

function configurarAbas() {
  document.querySelectorAll('.tab').forEach(botao => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

      botao.classList.add('active');

      const painel = $(`panel-${botao.dataset.tab}`);
      if (painel) painel.classList.add('active');
    });
  });
}

function configurarEventosTapaBuraco() {
  const select = $('tapaMonth');
  const refresh = $('refreshTapa');

  if (select) select.addEventListener('change', renderTapaBuraco);
  if (refresh) refresh.addEventListener('click', carregarTapaBuraco);
}

async function iniciarDashboard() {
  try {
    configurarAbas();
    configurarEventosTapaBuraco();
    await carregarTapaBuraco();
  } catch (erro) {
    console.error(erro);
    setLastUpdate('Erro na leitura');
    setStatus(`Erro ao carregar dados: ${erro.message}`, 'err');
  }
}

iniciarDashboard();
