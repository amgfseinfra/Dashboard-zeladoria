'use strict';

const CONFIG = {
  urls: {
    resumoTon: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4LFVuZ0zcS7_0vZYDu9k4UN2TRQ3e5wDYAlxyBnLTXri8YV-9LBYugIcTgbeZDxc6UerJK1f7OeC8/pub?gid=0&single=true&output=csv',
    geral: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4LFVuZ0zcS7_0vZYDu9k4UN2TRQ3e5wDYAlxyBnLTXri8YV-9LBYugIcTgbeZDxc6UerJK1f7OeC8/pub?gid=2071576844&single=true&output=csv'
  },
  anoBase: 2026
};

const state = {
  resumoTon: [],
  geral: [],
  charts: {}
};

const meses = [
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
  el.className = `status card ${tipo}`;
}

function formatNumber(valor, casas = 0) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}

function parseCSV(texto) {
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    const prox = texto[i + 1];

    if (char === '"') {
      if (aspas && prox === '"') {
        campo += '"';
        i++;
      } else {
        aspas = !aspas;
      }
    } else if (char === ',' && !aspas) {
      linha.push(campo);
      campo = '';
    } else if ((char === '\n' || char === '\r') && !aspas) {
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
  const resposta = await fetch(`${url}&cacheBust=${Date.now()}`, {
    cache: 'no-store'
  });

  if (!resposta.ok) {
    throw new Error(`Erro ao carregar CSV: ${resposta.status}`);
  }

  return parseCSV(await resposta.text());
}

function parseNumero(valor) {
  if (valor === null || valor === undefined) return 0;

  let texto = String(valor).trim();

  if (!texto || texto === '-') return 0;

  texto = texto
    .replace(/\s/g, '')
    .replace(/[^0-9.-]/g, '');

  const numero = Number(texto);

  return Number.isFinite(numero) ? numero : 0;
}

function parseData(valor) {
  if (!valor) return null;

  const texto = String(valor).trim();

  const partes = texto.split('/');
  if (partes.length !== 3) return null;

  const mes = Number(partes[0]);
  const dia = Number(partes[1]);
  let ano = Number(partes[2]);

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

function preencherSelectMeses() {
  const select = $('tapaMonth');
  if (!select) return;

  select.innerHTML = '';

  for (let mes = 1; mes <= 12; mes++) {
    const valor = `${CONFIG.anoBase}-${String(mes).padStart(2, '0')}`;
    const texto = `${meses[mes - 1]} de ${CONFIG.anoBase}`;
    select.add(new Option(texto, valor));
  }
}

function processarResumoTon(linhas) {
  const dados = linhas.slice(1);

  state.resumoTon = dados
    .map(linha => {
      const data = parseData(linha[0]);

      if (!data) return null;

      return {
        data,
        mes: chaveMes(data),
        tonelagem: parseNumero(linha[1]),
        area: parseNumero(linha[2]),
        buracos: parseNumero(linha[3])
      };
    })
    .filter(Boolean);
}

function processarGeral(linhas) {
  const dados = linhas.slice(1);

  state.geral = dados
    .map(linha => {
      const data = parseData(linha[0]);

      if (!data) return null;

      return {
        data,
        mes: chaveMes(data),
        bairro: String(linha[1] || '').trim(),
        logradouro: String(linha[2] || '').trim(),
        area: parseNumero(linha[3]),
        tonelagem: parseNumero(linha[4])
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
  const [ano, mes] = mesSelecionado.split('-').map(Number);
  const totalDias = diasNoMes(ano, mes);

  const contagem = new Map();

  state.geral
    .filter(item => item.mes === mesSelecionado)
    .forEach(item => {
      const chave = chaveDia(item.data);
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
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

  state.charts.tapaDiario = new Chart($('chartTapaDiario'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Buracos tapados',
        data: valores,
        borderWidth: 3,
        tension: 0.25,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
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
      const nome = item[campo];

      if (!nome) return;

      mapa.set(nome, (mapa.get(nome) || 0) + 1);
    });

  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

function renderTabelaRanking(tbodyId, ranking, tituloColuna) {
  const tbody = $(tbodyId);
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!ranking.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="empty">Sem registros no mês selecionado.</td>
      </tr>
    `;
    return;
  }

  ranking.forEach(([nome, total], index) => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${nome}</td>
      <td>${formatNumber(total, 0)}</td>
    `;

    tbody.appendChild(tr);
  });
}

function renderRankings(mesSelecionado) {
  const rankingVias = contarRanking('logradouro', mesSelecionado);
  const rankingBairros = contarRanking('bairro', mesSelecionado);

  renderTabelaRanking('rankVias', rankingVias, 'Via');
  renderTabelaRanking('rankBairros', rankingBairros, 'Bairro');
}

function renderTapaBuraco() {
  const mesSelecionado = $('tapaMonth').value;

  renderKPIs(mesSelecionado);
  renderGraficoDiario(mesSelecionado);
  renderRankings(mesSelecionado);
}

async function carregarTapaBuraco() {
  setStatus('Carregando dados...');

  const [resumoTonCSV, geralCSV] = await Promise.all([
    fetchCSV(CONFIG.urls.resumoTon),
    fetchCSV(CONFIG.urls.geral)
  ]);

  processarResumoTon(resumoTonCSV);
  processarGeral(geralCSV);

  preencherSelectMeses();

  $('tapaMonth').value = `${CONFIG.anoBase}-01`;

  renderTapaBuraco();

  $('lastUpdate').textContent = new Date().toLocaleString('pt-BR');
  setStatus('Dados de tapa-buraco carregados com sucesso.', 'ok');
}

function configurarEventos() {
  $('tapaMonth').addEventListener('change', renderTapaBuraco);
  $('refreshTapa').addEventListener('click', renderTapaBuraco);

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

async function iniciarDashboard() {
  try {
    configurarEventos();
    await carregarTapaBuraco();
  } catch (erro) {
    console.error(erro);
    setStatus(`Erro ao carregar dados: ${erro.message}`, 'err');
  }
}

iniciarDashboard();
