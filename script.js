'use strict';

const CONFIG = {
  anoBase: 2026,
  urls: {
    resumoTon: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4LFVuZ0zcS7_0vZYDu9k4UN2TRQ3e5wDYAlxyBnLTXri8YV-9LBYugIcTgbeZDxc6UerJK1f7OeC8/pub?gid=0&single=true&output=csv',
    geral: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4LFVuZ0zcS7_0vZYDu9k4UN2TRQ3e5wDYAlxyBnLTXri8YV-9LBYugIcTgbeZDxc6UerJK1f7OeC8/pub?gid=2071576844&single=true&output=csv'
  }
};

const state = {
  resumo: [],
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
  const resposta = await fetch(`${url}&cacheBust=${Date.now()}`, {
    cache: 'no-store'
  });

  if (!resposta.ok) {
    throw new Error(`Erro ao carregar CSV: ${resposta.status}`);
  }

  return parseCSV(await resposta.text());
}

function limparTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function parseNumero(valor) {
  if (valor === null || valor === undefined) return 0;

  let texto = String(valor).trim();

  if (!texto || texto === '-') return 0;

  texto = texto
    .replace(/\s/g, '')
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

  const match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;

  const mes = Number(match[1]);
  const dia = Number(match[2]);
  let ano = Number(match[3]);

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

function encontrarLinhaCabecalho(linhas, palavras) {
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].map(limparTexto).join(' | ');

    const achou = palavras.every(palavra => linha.includes(limparTexto(palavra)));

    if (achou) return i;
  }

  return 0;
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

function processarResumo(linhas) {
  const indiceCabecalho = encontrarLinhaCabecalho(linhas, ['DATA', 'TON TOTAL', 'BURACO']);
  const dados = linhas.slice(indiceCabecalho + 1);

  state.resumo = dados
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
  const indiceCabecalho = encontrarLinhaCabecalho(linhas, ['DATA', 'BAIRRO', 'LOGADOURO']);
  const dados = linhas.slice(indiceCabecalho + 1);

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
  const linhaResumo = state.resumo.find(item => item.mes === mesSelecionado);

  if (linhaResumo) {
    $('tapaTon').textContent = `${formatNumber(linhaResumo.tonelagem, 2)} t`;
    $('tapaArea').textContent = `${formatNumber(linhaResumo.area, 2)} m²`;
    $('tapaBuracos').textContent = formatNumber(linhaResumo.buracos, 0);
    return;
  }

  $('tapaTon').textContent = '-';
  $('tapaArea').textContent = '-';
  $('tapaBuracos').textContent = '-';
}

function filtrarGeralPorMes(mesSelecionado) {
  return state.geral.filter(item => item.mes === mesSelecionado);
}

function renderGraficoDiario(mesSelecionado) {
  const [ano, mes] = mesSelecionado.split('-').map(Number);
  const totalDias = diasNoMes(ano, mes);
  const dadosMes = filtrarGeralPorMes(mesSelecionado);

  const contagemPorDia = new Map();

  dadosMes.forEach(item => {
    const chave = chaveDia(item.data);
    contagemPorDia.set(chave, (contagemPorDia.get(chave) || 0) + 1);
  });

  const labels = [];
  const valores = [];

  for (let dia = 1; dia <= totalDias; dia++) {
    const data = new Date(ano, mes - 1, dia);

    labels.push(String(dia).padStart(2, '0'));
    valores.push(contagemPorDia.get(chaveDia(data)) || 0);
  }

  const canvas = $('chartTapaDiario');
  if (!canvas) return;

  if (state.charts.tapaDiario) {
    state.charts.tapaDiario.destroy();
  }

  state.charts.tapaDiario = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Buracos tapados',
          data: valores,
          borderWidth: 3,
          tension: 0.25,
          pointRadius: 3
        }
      ]
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

function gerarRanking(campo, mesSelecionado) {
  const dadosMes = filtrarGeralPorMes(mesSelecionado);
  const mapa = new Map();

  dadosMes.forEach(item => {
    const nome = String(item[campo] || '').trim();

    if (!nome) return;

    mapa.set(nome, (mapa.get(nome) || 0) + 1);
  });

  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

function renderTabelaRanking(idTbody, ranking) {
  const tbody = $(idTbody);
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
  const rankingVias = gerarRanking('logradouro', mesSelecionado);
  const rankingBairros = gerarRanking('bairro', mesSelecionado);

  renderTabelaRanking('rankVias', rankingVias);
  renderTabelaRanking('rankBairros', rankingBairros);
}

function renderTapaBuraco() {
  const mesSelecionado = $('tapaMonth').value;

  renderKPIs(mesSelecionado);
  renderGraficoDiario(mesSelecionado);
  renderRankings(mesSelecionado);
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
  $('tapaMonth').addEventListener('change', renderTapaBuraco);
  $('refreshTapa').addEventListener('click', renderTapaBuraco);
}

async function carregarTapaBuraco() {
  setStatus('Carregando dados de tapa-buraco...');

  const [csvResumo, csvGeral] = await Promise.all([
    fetchCSV(CONFIG.urls.resumo),
    fetchCSV(CONFIG.urls.geral)
  ]);

  processarResumo(csvResumo);
  processarGeral(csvGeral);

  preencherSelectMeses();

  const mesesComResumo = state.resumo.map(item => item.mes);
  const primeiroMesComDados = mesesComResumo[0] || `${CONFIG.anoBase}-01`;

  $('tapaMonth').value = primeiroMesComDados;

  renderTapaBuraco();

  $('lastUpdate').textContent = new Date().toLocaleString('pt-BR');
  setStatus('Dados de tapa-buraco carregados com sucesso.', 'ok');
}

async function iniciarDashboard() {
  try {
    configurarAbas();
    configurarEventosTapaBuraco();

    await carregarTapaBuraco();
  } catch (erro) {
    console.error(erro);
    setStatus(`Erro ao carregar dados: ${erro.message}`, 'err');
  }
}

document.addEventListener('DOMContentLoaded', iniciarDashboard);
