'use strict';

const VERSAO_SCRIPT = 'TAPA-BURACO-V3-2026-05-15';

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

function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
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

function parseData(valor) {
  if (!valor) return null;

  let texto = String(valor).trim();

  let m = texto.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;

  let a = Number(m[1]);
  let b = Number(m[2]);
  let ano = Number(m[3]);

  if (ano < 100) ano += 2000;

  let mes;
  let dia;

  if (a > 12 && b <= 12) {
    dia = a;
    mes = b;
  } else {
    mes = a;
    dia = b;
  }

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

function acharCabecalho(linhas, palavrasObrigatorias) {
  for (let i = 0; i < linhas.length; i++) {
    const textoLinha = normalizarTexto(linhas[i].join(' | '));
    const ok = palavrasObrigatorias.every(p => textoLinha.includes(normalizarTexto(p)));
    if (ok) return i;
  }

  return 0;
}

function indiceColuna(cabecalho, alternativas, fallback) {
  const normalizado = cabecalho.map(normalizarTexto);

  for (const alt of alternativas) {
    const alvo = normalizarTexto(alt);
    const idx = normalizado.findIndex(col => col.includes(alvo));
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
  const linhaCabecalho = acharCabecalho(linhas, ['DATA']);
  const cabecalho = linhas[linhaCabecalho];
  const dados = linhas.slice(linhaCabecalho + 1);

  const colData = indiceColuna(cabecalho, ['DATA'], 0);
  const colTon = indiceColuna(cabecalho, ['TON TOTAL', 'TON'], 1);
  const colArea = indiceColuna(cabecalho, ['AREA', 'ÁREA'], 2);
  const colBuracos = indiceColuna(cabecalho, ['BURACO', 'QNT'], 3);

  state.resumo = dados
    .map(linha => {
      const data = parseData(linha[colData]);
      if (!data) return null;

      return {
        data,
        mes: chaveMes(data),
        tonelagem: parseNumero(linha[colTon]),
        area: parseNumero(linha[colArea]),
        buracos: parseNumero(linha[colBuracos])
      };
    })
    .filter(Boolean);

  console.log(VERSAO_SCRIPT, 'RESUMO PROCESSADO:', state.resumo);
}

function processarGeral(linhas) {
  const linhaCabecalho = acharCabecalho(linhas, ['DATA', 'BAIRRO']);
  const cabecalho = linhas[linhaCabecalho];
  const dados = linhas.slice(linhaCabecalho + 1);

  const colData = indiceColuna(cabecalho, ['DATA'], 0);
  const colBairro = indiceColuna(cabecalho, ['BAIRRO'], 1);
  const colLogradouro = indiceColuna(cabecalho, ['LOGADOURO', 'LOGRADOURO', 'VIA'], 2);
  const colArea = indiceColuna(cabecalho, ['AREA', 'ÁREA'], 3);
  const colTon = indiceColuna(cabecalho, ['POR SERVICO', 'POR SERVIÇO', 'TON'], 4);

  state.geral = dados
    .map(linha => {
      const data = parseData(linha[colData]);
      if (!data) return null;

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

  console.log(VERSAO_SCRIPT, 'GERAL PROCESSADO:', state.geral);
}

function dadosGeralDoMes(mesSelecionado) {
  return state.geral.filter(item => item.mes === mesSelecionado);
}

function renderKPIs(mesSelecionado) {
  const resumo = state.resumo.find(item => item.mes === mesSelecionado);

  if (resumo) {
    $('tapaTon').textContent = `${formatNumber(resumo.tonelagem, 2)} t`;
    $('tapaArea').textContent = `${formatNumber(resumo.area, 2)} m²`;
    $('tapaBuracos').textContent = formatNumber(resumo.buracos, 0);
    return;
  }

  const dadosMes = dadosGeralDoMes(mesSelecionado);

  const tonelagem = dadosMes.reduce((soma, item) => soma + item.tonelagem, 0);
  const area = dadosMes.reduce((soma, item) => soma + item.area, 0);
  const buracos = dadosMes.length;

  $('tapaTon').textContent = dadosMes.length ? `${formatNumber(tonelagem, 2)} t` : '-';
  $('tapaArea').textContent = dadosMes.length ? `${formatNumber(area, 2)} m²` : '-';
  $('tapaBuracos').textContent = dadosMes.length ? formatNumber(buracos, 0) : '-';
}

function renderGraficoDiario(mesSelecionado) {
  const [ano, mes] = mesSelecionado.split('-').map(Number);
  const totalDias = diasNoMes(ano, mes);
  const dadosMes = dadosGeralDoMes(mesSelecionado);

  const contagem = new Map();

  dadosMes.forEach(item => {
    const dia = chaveDia(item.data);
    contagem.set(dia, (contagem.get(dia) || 0) + 1);
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

function gerarRanking(campo, mesSelecionado) {
  const dadosMes = dadosGeralDoMes(mesSelecionado);
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

function renderTabelaRanking(id, ranking) {
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

  renderKPIs(mesSelecionado);
  renderGraficoDiario(mesSelecionado);
  renderTabelaRanking('rankVias', gerarRanking('logradouro', mesSelecionado));
  renderTabelaRanking('rankBairros', gerarRanking('bairro', mesSelecionado));

  console.log(VERSAO_SCRIPT, 'MÊS SELECIONADO:', mesSelecionado, 'REGISTROS NO MÊS:', dadosGeralDoMes(mesSelecionado).length);
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
    console.clear();
    console.log('SCRIPT CARREGADO:', VERSAO_SCRIPT);

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
    setStatus('Dados carregados com sucesso. ' + VERSAO_SCRIPT, 'ok');

  } catch (erro) {
    console.error(erro);
    setStatus('Erro ao carregar dados: ' + erro.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
