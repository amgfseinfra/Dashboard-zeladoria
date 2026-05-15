'use strict';

const CONFIG = {
  anoBase: 2026,
  urls: {
    resumoTon: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4LFVuZ0zcS7_0vZYDu9k4UN2TRQ3e5wDYAlxyBnLTXri8YV-9LBYugIcTgbeZDxc6UerJK1f7OeC8/pub?gid=0&single=true&output=csv',
    geral: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4LFVuZ0zcS7_0vZYDu9k4UN2TRQ3e5wDYAlxyBnLTXri8YV-9LBYugIcTgbeZDxc6UerJK1f7OeC8/pub?gid=2071576844&single=true&output=csv',
    settran: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQfc4beWDtxWWleEmmhZPCHyTP8X6hLmZSCuDJgnK8UjU3roulJuBiU4zDYIkQxx48DUd_qpKYJ3xc/pub?gid=0&single=true&output=csv'
  }
};

const state = {
  resumo: [],
  geral: [],
  settran: [],
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

function parseMesResumo(valor) {
  const numero = Number(String(valor ?? '').trim());

  if (Number.isFinite(numero) && numero >= 1 && numero <= 12) {
    return `${CONFIG.anoBase}-${String(numero).padStart(2, '0')}`;
  }

  const data = parseData(valor);

  if (data) return chaveMes(data);

  return null;
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

  select.add(new Option('Todos', 'todos'));

  for (let mes = 1; mes <= 12; mes++) {
    const valor = `${CONFIG.anoBase}-${String(mes).padStart(2, '0')}`;
    const texto = `${nomesMeses[mes - 1]} de ${CONFIG.anoBase}`;
    select.add(new Option(texto, valor));
  }

  select.value = 'todos';
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
}

function dadosDoPeriodo(mesSelecionado) {
  if (mesSelecionado === 'todos') {
    return state.geral;
  }

  return state.geral.filter(item => item.mes === mesSelecionado);
}

function resumoDoPeriodo(mesSelecionado) {
  if (mesSelecionado === 'todos') {
    return state.resumo.reduce(
      (acc, item) => {
        acc.tonelagem += item.tonelagem;
        acc.area += item.area;
        acc.buracos += item.buracos;
        return acc;
      },
      { tonelagem: 0, area: 0, buracos: 0 }
    );
  }

  return state.resumo.find(item => item.mes === mesSelecionado) || null;
}

function renderKPIs(mesSelecionado) {
  const resumo = resumoDoPeriodo(mesSelecionado);

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
  const dados = dadosDoPeriodo(mesSelecionado);
  const mapa = new Map();

  dados.forEach(item => {
    const chave = chaveDia(item.data);
    mapa.set(chave, (mapa.get(chave) || 0) + 1);
  });

  const labels = [];
  const valores = [];

  if (mesSelecionado === 'todos') {
    const datas = dados
      .map(item => item.data)
      .sort((a, b) => a - b);

    if (datas.length) {
      let dataAtual = new Date(
        datas[0].getFullYear(),
        datas[0].getMonth(),
        datas[0].getDate()
      );

      const dataFinal = new Date(
        datas[datas.length - 1].getFullYear(),
        datas[datas.length - 1].getMonth(),
        datas[datas.length - 1].getDate()
      );

      while (dataAtual <= dataFinal) {
        labels.push(
          `${String(dataAtual.getDate()).padStart(2, '0')}/${String(dataAtual.getMonth() + 1).padStart(2, '0')}`
        );

        valores.push(mapa.get(chaveDia(dataAtual)) || 0);

        dataAtual.setDate(dataAtual.getDate() + 1);
      }
    }
  } else {
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    const totalDias = diasNoMes(ano, mes);

    for (let dia = 1; dia <= totalDias; dia++) {
      const data = new Date(ano, mes - 1, dia);

      labels.push(String(dia).padStart(2, '0'));
      valores.push(mapa.get(chaveDia(data)) || 0);
    }
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
      datasets: [{
        label: 'Buracos tapados',
        data: valores,
        borderWidth: 3,
        tension: 0.25,
        pointRadius: 2
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
        },
        x: {
          ticks: {
            autoSkip: true,
            maxTicksLimit: 20
          }
        }
      }
    }
  });
}

function gerarRanking(campo, mesSelecionado) {
  const mapa = new Map();

  dadosDoPeriodo(mesSelecionado).forEach(item => {
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
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!ranking || !ranking.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="empty">Sem registros.</td>
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

  renderRanking('rankVias', gerarRanking('logradouro', mesSelecionado));
  renderRanking('rankBairros', gerarRanking('bairro', mesSelecionado));
}

function parseDataSettran(valor) {
  const texto = normalizarTexto(valor).replace(/\s/g, '');
  const match = texto.match(/^(\d{1,2})\/?([A-Z]{3})$/);

  if (!match) return null;

  const dia = Number(match[1]);
  const mapaMeses = {
    JAN: 0,
    FEV: 1,
    MAR: 2,
    ABR: 3,
    MAI: 4,
    JUN: 5,
    JUL: 6,
    AGO: 7,
    SET: 8,
    OUT: 9,
    NOV: 10,
    DEZ: 11
  };

  const mes = mapaMeses[match[2]];
  if (mes === undefined) return null;

  const data = new Date(CONFIG.anoBase, mes, dia);

  if (
    data.getFullYear() !== CONFIG.anoBase ||
    data.getMonth() !== mes ||
    data.getDate() !== dia
  ) {
    return null;
  }

  return data;
}

function processarSettran(linhas) {
  const registros = [];

  for (let i = 0; i < linhas.length; i++) {
    const linhaDatas = linhas[i];
    const datasEncontradas = [];

    linhaDatas.forEach((celula, coluna) => {
      const data = parseDataSettran(celula);
      if (data) datasEncontradas.push({ coluna, data });
    });

    if (!datasEncontradas.length) continue;

    let linhaProducao = null;

    for (let j = i + 1; j <= Math.min(i + 3, linhas.length - 1); j++) {
      const preenchidos = datasEncontradas.filter(({ coluna }) => {
        return parseNumero(linhas[j][coluna]) > 0;
      }).length;

      if (preenchidos > 0) {
        linhaProducao = linhas[j];
        break;
      }
    }

    if (!linhaProducao) continue;

    datasEncontradas.forEach(({ coluna, data }) => {
      registros.push({
        data,
        mes: chaveMes(data),
        producao: parseNumero(linhaProducao[coluna])
      });
    });
  }

  state.settran = registros;
}

function preencherSelectSettran() {
  const select = $('settranMonth');
  if (!select) return;

  const meses = Array.from(new Set(state.settran.map(item => item.mes))).sort();

  select.innerHTML = '';
  select.add(new Option('Todos', 'todos'));

  meses.forEach(mes => {
    const numeroMes = Number(mes.split('-')[1]);
    select.add(new Option(`${nomesMeses[numeroMes - 1]} de ${CONFIG.anoBase}`, mes));
  });

  select.value = 'todos';
}

function dadosSettranDoPeriodo(mesSelecionado) {
  if (mesSelecionado === 'todos') return state.settran;
  return state.settran.filter(item => item.mes === mesSelecionado);
}

function totalSettranPeriodo(mesSelecionado) {
  return dadosSettranDoPeriodo(mesSelecionado).reduce((soma, item) => soma + item.producao, 0);
}

function renderSettranTotal(mesSelecionado) {
  const total = totalSettranPeriodo(mesSelecionado);
  const el = $('settranTotal');
  if (el) el.textContent = `${formatNumber(total, 2)} m²`;
}

function renderGraficoSettran(mesSelecionado) {
  const dados = dadosSettranDoPeriodo(mesSelecionado);
  const mapa = new Map();

  dados.forEach(item => {
    mapa.set(chaveDia(item.data), (mapa.get(chaveDia(item.data)) || 0) + item.producao);
  });

  const labels = [];
  const valores = [];

  if (mesSelecionado === 'todos') {
    const datas = dados.map(item => item.data).sort((a, b) => a - b);

    if (datas.length) {
      let dataAtual = new Date(datas[0].getFullYear(), datas[0].getMonth(), datas[0].getDate());
      const dataFinal = new Date(datas[datas.length - 1].getFullYear(), datas[datas.length - 1].getMonth(), datas[datas.length - 1].getDate());

      while (dataAtual <= dataFinal) {
        labels.push(`${String(dataAtual.getDate()).padStart(2, '0')}/${String(dataAtual.getMonth() + 1).padStart(2, '0')}`);
        valores.push(mapa.get(chaveDia(dataAtual)) || 0);
        dataAtual.setDate(dataAtual.getDate() + 1);
      }
    }
  } else {
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    const totalDias = diasNoMes(ano, mes);

    for (let dia = 1; dia <= totalDias; dia++) {
      const data = new Date(ano, mes - 1, dia);
      labels.push(String(dia).padStart(2, '0'));
      valores.push(mapa.get(chaveDia(data)) || 0);
    }
  }

  const canvas = $('chartSettranDiario');
  if (!canvas) return;

  if (state.charts.settranDiario) {
    state.charts.settranDiario.destroy();
  }

  state.charts.settranDiario = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Produção diária de sinalização',
        data: valores,
        borderWidth: 3,
        tension: 0.25,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        },
        x: {
          ticks: {
            autoSkip: true,
            maxTicksLimit: 20
          }
        }
      }
    }
  });
}

function renderNecessidadeSettran() {
  const km = parseNumero($('settranKm')?.value || 0);
  const indice = parseNumero($('settranIndice')?.value || 1350);
  const mesSelecionado = $('settranMonth')?.value || 'todos';
  const producao = totalSettranPeriodo(mesSelecionado);
  const necessidade = km * indice;
  const diferenca = Math.max(0, necessidade - producao);
  const equipes = diferenca > 0 ? Math.ceil(diferenca / 150) : 0;

  const necessidadeEl = $('settranNecessidadeResultado');
  const analiseEl = $('settranAnaliseEquipe');

  if (necessidadeEl) {
    necessidadeEl.textContent = `${formatNumber(necessidade, 2)} m²`;
  }

  if (analiseEl) {
    if (!km) {
      analiseEl.textContent = 'Informe a quilometragem para analisar a equipe.';
      analiseEl.className = 'analysis-note';
    } else if (diferenca > 0) {
      analiseEl.textContent = `Equipe subdimensionada. Déficit de ${formatNumber(diferenca, 2)} m². Aumentar ${equipes} equipe(s).`;
      analiseEl.className = 'analysis-note alert';
    } else {
      analiseEl.textContent = 'Produção compatível com a necessidade informada.';
      analiseEl.className = 'analysis-note ok';
    }
  }
}

function renderSettran() {
  const mesSelecionado = $('settranMonth')?.value || 'todos';

  renderSettranTotal(mesSelecionado);
  renderGraficoSettran(mesSelecionado);
  renderNecessidadeSettran();
}

function configurarEventos() {
  $('tapaMonth').addEventListener('change', renderTudo);
  $('refreshTapa').addEventListener('click', renderTudo);

  if ($('settranMonth')) $('settranMonth').addEventListener('change', renderSettran);
  if ($('refreshSettran')) $('refreshSettran').addEventListener('click', renderSettran);
  if ($('settranKm')) $('settranKm').addEventListener('input', renderNecessidadeSettran);
  if ($('settranIndice')) $('settranIndice').addEventListener('input', renderNecessidadeSettran);

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
    setStatus('Carregando dados...');

    configurarEventos();

    const [resumoCSV, geralCSV, settranCSV] = await Promise.all([
      fetchCSV(CONFIG.urls.resumoTon),
      fetchCSV(CONFIG.urls.geral),
      fetchCSV(CONFIG.urls.settran)
    ]);

    processarResumo(resumoCSV);
    processarGeral(geralCSV);
    processarSettran(settranCSV);

    preencherSelectMeses();
    preencherSelectSettran();

    renderTudo();
    renderSettran();

    $('lastUpdate').textContent = new Date().toLocaleString('pt-BR');
    setStatus('Dados carregados com sucesso.', 'ok');

  } catch (erro) {
    console.error(erro);
    setStatus('Erro ao carregar dados: ' + erro.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
