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

const nomesMeses = [
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
    const c = texto[i];
    const n = texto[i + 1];

    if (c === '"') {
      if (aspas && n === '"') {
        campo += '"';
        i++;
      } else {
        aspas = !aspas;
      }
    } else if (c === ',' && !aspas) {
      linha.push(campo);
      campo = '';
    } else if ((c === '\n' || c === '\r') && !aspas) {
      if (c === '\r' && n === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += c;
    }
  }

  linha.push(campo);
  linhas.push(linha);

  return linhas.filter(l => l.some(c => String(c).trim() !== ''));
}

async function fetchCSV(url) {
  const resposta = await fetch(url + '&v=' + Date.now(), {
    cache: 'no-store'
  });

  if (!resposta.ok) {
    throw new Error('Erro ao carregar CSV: ' + resposta.status);
  }

  return parseCSV(await resposta.text());
}

function parseNumero(valor) {
  let texto = String(valor ?? '').trim();

  if (!texto || texto === '-') return 0;

  texto = texto.replace(/\s/g, '').replace(/[^0-9,.-]/g, '');

  if (!texto) return 0;

  if (texto.includes(',') && texto.includes('.')) {
    texto = texto.replace(/,/g, '');
  } else if (texto.includes(',') && !texto.includes('.')) {
    texto = texto.replace(',', '.');
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function parseMesResumo(valor) {
  const numero = Number(String(valor ?? '').trim());

  if (Number.isFinite(numero) && numero >= 1 && numero <= 12) {
    return `${CONFIG.anoBase}-${String(numero).padStart(2, '0')}`;
  }

  const data = parseData(valor);

  if (data) return chaveMes(data);

  return null;
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

function acharCabecalho(linhas, obrigatorias) {
  for (let i = 0; i < linhas.length; i++) {
    const texto = normalizarTexto(linhas[i].join(' | '));

    if (obrigatorias.every(p => texto.includes(normalizarTexto(p)))) {
      return i;
    }
  }

  return 0;
}

function indiceColuna(cabecalho, nomes, fallback) {
  const cab = cabecalho.map(normalizarTexto);

  for (const nome of nomes) {
    const alvo = normalizarTexto(nome);
    const idx = cab.findIndex(c => c.includes(alvo));
    if (idx >= 0) return idx;
  }

  return fallback;
}

function preencherSelectMeses() {
  const select = $('tapaMonth');
  select.innerHTML = '';

  for (let mes = 1; mes <= 12; mes++) {
    const valor = `${CONFIG.anoBase}-${String(mes).padStart(2, '0')}`;
    const texto = `${nomesMeses[mes - 1]} de ${CONFIG.anoBase}`;
    select.add(new Option(texto, valor));
  }

  select.value = `${CONFIG.anoBase}-01`;
}

function processarResumo(linhas) {
  const idx = acharCabecalho(linhas, ['DATA', 'TON TOTAL', 'BURACO']);
  const cabecalho = linhas[idx];
  const dados = linhas.slice(idx + 1);

  const colData = indiceColuna(cabecalho, ['DATA'], 0);
  const colTon = indiceColuna(cabecalho, ['TON TOTAL'], 1);
  const colArea = indiceColuna(cabecalho, ['AREA', 'ÁREA'], 2);
  const colBuraco = indiceColuna(cabecalho, ['BURACO'], 3);

  state.resumo = dados
    .map(linha => {
      const mes = parseMesResumo(linha[colData]);

      if (!mes) return null;

      return {
        mes,
        tonelagem: parseNumero(linha[colTon]),
        area: parseNumero(linha[colArea]),
        buracos: parseNumero(linha[colBuraco])
      };
    })
    .filter(Boolean);
}

function processarGeral(linhas) {
  const idx = acharCabecalho(linhas, ['DATA', 'BAIRRO', 'LOGADOURO']);
  const cabecalho = linhas[idx];
  const dados = linhas.slice(idx + 1);

  const colData = indiceColuna(cabecalho, ['DATA'], 0);
  const colBairro = indiceColuna(cabecalho, ['BAIRRO'], 1);
  const colLogradouro = indiceColuna(cabecalho, ['LOGADOURO', 'LOGRADOURO'], 2);
  const colArea = indiceColuna(cabecalho, ['AREA', 'ÁREA'], 3);
  const colTon = indiceColuna(cabecalho, ['POR SERVICO', 'POR SERVIÇO'], 4);

  state.geral = dados
    .map(linha => {
      const data = parseData(linha[colData]);

      if (!data) return null;
      if (data.getFullYear() !== CONFIG.anoBase) return null;

      const bairro = String(linha[colBairro] || '').trim();
      const logradouro = String(linha[colLogradouro] || '').trim();

      if (!bairro && !logradouro) return null;

      return {
        data,
        mes: chaveMes(data),
        bairro,
        logradouro,
        area: parseNumero(linha[colArea]),
        tonelagem: parseNumero(linha[colTon])
      };
    })
    .filter(Boolean);

  console.log('TOTAL GERAL PROCESSADO:', state.geral.length);
}

function dadosDoMes(mesSelecionado) {
  return state.geral.filter(item => item.mes === mesSelecionado);
}

function renderKPIs(mesSelecionado) {
  const resumo = state.resumo.find(item => item.mes === mesSelecionado);

  if (!resumo) {
    $('tapaTon').textContent = '-';
    $('tapaArea').textContent = '-';
    $('tapaBuracos').textContent = '-';
    return;
  }

  $('tapaTon').textContent = `${formatNumber(resumo.tonelagem, 2)} t`;
  $('tapaArea').textContent = `${formatNumber(resumo.area, 2)} m²`;
  $('tapaBuracos').textContent = formatNumber(resumo.buracos, 0);
}

function renderGraficoDiario(mesSelecionado) {
  const [ano, mes] = mesSelecionado.split('-').map(Number);
  const totalDias = diasNoMes(ano, mes);
  const dados = dadosDoMes(mesSelecionado);

  const mapa = new Map();

  dados.forEach(item => {
    const chave = chaveDia(item.data);
    mapa.set(chave, (mapa.get(chave) || 0) + 1);
  });

  const labels = [];
  const valores = [];

  for (let dia = 1; dia <= totalDias; dia++) {
    const data = new Date(ano, mes - 1, dia);

    labels.push(String(dia).padStart(2, '0'));
    valores.push(mapa.get(chaveDia(data)) || 0);
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

function gerarRanking(campo, mesSelecionado) {
  const mapa = new Map();

  state.geral
    .filter(item => item.mes === mesSelecionado)
    .forEach(item => {
      const nome = String(item[campo] || '').trim();

      if (!nome) return;

      mapa.set(nome, (mapa.get(nome) || 0) + 1);
    });

  return Array.from(mapa.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

function renderRanking(id, ranking) {
  const tbody = $(id);
  tbody.innerHTML = '';

  if (!ranking.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="empty">Sem registros no mês selecionado.</td>
      </tr>
    `;
    return;
  }

  ranking.forEach(([nome, total], i) => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${nome}</td>
      <td>${formatNumber(total, 0)}</td>
    `;

    tbody.appendChild(tr);
  });
}

function renderTudo() {
  const mesSelecionado = $('tapaMonth').value;
  const registrosMes = state.geral.filter(item => item.mes === mesSelecionado);

  console.log('MÊS SELECIONADO:', mesSelecionado);
  console.log('REGISTROS DO MÊS:', registrosMes.length);
  console.log('RANKING VIAS:', gerarRanking('logradouro', mesSelecionado));
  console.log('RANKING BAIRROS:', gerarRanking('bairro', mesSelecionado));

  renderKPIs(mesSelecionado);
  renderGraficoDiario(mesSelecionado);
  renderRanking('rankVias', gerarRanking('logradouro', mesSelecionado));
  renderRanking('rankBairros', gerarRanking('bairro', mesSelecionado));
}

function configurarEventos() {
  $('tapaMonth').addEventListener('change', renderTudo);
  $('refreshTapa').addEventListener('click', renderTudo);

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

async function iniciar() {
  try {
    setStatus('Carregando dados de tapa-buraco...');

    configurarEventos();

    const [resumoCSV, geralCSV] = await Promise.all([
      fetchCSV(CONFIG.urls.resumoTon),
      fetchCSV(CONFIG.urls.geral)
    ]);

    processarResumo(resumoCSV);
    processarGeral(geralCSV);

    preencherSelectMeses();
    renderTudo();

    $('lastUpdate').textContent = new Date().toLocaleString('pt-BR');
    setStatus('Dados carregados com sucesso.', 'ok');
  } catch (erro) {
    console.error(erro);
    setStatus('Erro ao carregar dados: ' + erro.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
