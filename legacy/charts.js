/* =========================================================================
 * charts.js
 * Responsabilidade: renderizar gráficos.
 *
 * A aplicação nunca chama Chart.js diretamente. Ela descreve o gráfico
 * (tipo, rótulos, séries) e este módulo decide como desenhar:
 *   - Chart.js, quando o CDN estiver acessível;
 *   - renderizador próprio em HTML/CSS, quando a fábrica estiver offline.
 * Isso mantém a tela útil em rede isolada, cenário comum em chão de fábrica.
 * ========================================================================= */
(function (global) {
  'use strict';

  var OEE = (global.OEE = global.OEE || {});

  var PALETA = ['#D97B29', '#9FB6BC', '#6FA383', '#DC6C57', '#6E9FB5', '#E0A46A', '#155263', '#C67A3C'];
  var COR_TEXTO = '#9FB6BC';
  var COR_GRADE = 'rgba(198, 210, 218, 0.12)';

  var instancias = new WeakMap();

  function temChartJs() { return typeof global.Chart !== 'undefined'; }

  function limpar(container) {
    var anterior = instancias.get(container);
    if (anterior && typeof anterior.destroy === 'function') {
      try { anterior.destroy(); } catch (e) { /* ignora */ }
      instancias.delete(container);
    }
    container.innerHTML = '';
  }

  function corDaSerie(serie, indice) {
    return serie.cor || PALETA[indice % PALETA.length];
  }

  function formatarValor(v, opcoes) {
    if (v === null || v === undefined) return '—';
    if (opcoes && opcoes.percentual) return OEE.Calc.fmt.percentual(v, 0);
    if (opcoes && opcoes.duracao) return OEE.Calc.fmt.duracao(v);
    return OEE.Calc.fmt.numero(v, opcoes && opcoes.casas ? opcoes.casas : 0);
  }

  /* ---------------------------------------------------------------------
   * Renderizador principal
   *
   * spec = {
   *   tipo: 'linha' | 'barra' | 'barraHorizontal' | 'pareto' | 'rosca',
   *   rotulos: [String],
   *   series: [{ nome, valores, cor, tipo }],
   *   opcoes: { percentual, duracao, maxY, empilhado, meta }
   * }
   * ------------------------------------------------------------------- */
  function desenhar(container, spec) {
    if (!container) return;
    limpar(container);

    var temDados = spec.series && spec.series.some(function (s) {
      return s.valores && s.valores.some(function (v) { return v !== null && v !== undefined; });
    });

    if (!temDados) {
      container.innerHTML = '<p class="grafico-vazio">Sem dados no período selecionado. Ajuste os filtros ou aguarde novos apontamentos.</p>';
      return;
    }

    /* Ter a biblioteca carregada não garante que ela vá conseguir desenhar:
     * o contexto 2D pode ser negado por falta de memória gráfica ou por
     * restrição do navegador. Se algo falhar, o painel não pode ficar em
     * branco — cai para o renderizador próprio. */
    if (temChartJs()) {
      try {
        desenharChartJs(container, spec);
        return;
      } catch (e) {
        console.warn('Chart.js falhou; usando o renderizador interno.', e);
        limpar(container);
      }
    }
    desenharFallback(container, spec);
  }

  /* --------------------------- Chart.js ------------------------------ */
  function desenharChartJs(container, spec) {
    var canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', spec.descricaoAcessivel || 'Gráfico de dados de produção');
    container.appendChild(canvas);

    var opcoes = spec.opcoes || {};
    var horizontal = spec.tipo === 'barraHorizontal';
    var tipoBase = (spec.tipo === 'linha') ? 'line'
      : (spec.tipo === 'rosca') ? 'doughnut'
      : 'bar';

    var datasets = spec.series.map(function (s, i) {
      var cor = corDaSerie(s, i);
      var comum = {
        label: s.nome,
        data: s.valores,
        borderColor: cor,
        borderWidth: s.tipo === 'linha' ? 2 : 1,
        tension: 0.25
      };
      if (spec.tipo === 'rosca') {
        comum.backgroundColor = spec.rotulos.map(function (_, idx) { return PALETA[idx % PALETA.length]; });
        comum.borderColor = '#082830';
        comum.borderWidth = 2;
      } else if (s.tipo === 'linha') {
        comum.type = 'line';
        comum.backgroundColor = 'transparent';
        comum.pointRadius = 2;
        comum.yAxisID = s.eixo || 'y';
        comum.fill = false;
      } else {
        comum.type = 'bar';
        comum.backgroundColor = s.cores || cor;
        comum.yAxisID = s.eixo || 'y';
        comum.borderRadius = 2;
      }
      return comum;
    });

    var escalas = {};
    if (spec.tipo !== 'rosca') {
      escalas.x = {
        stacked: !!opcoes.empilhado,
        ticks: { color: COR_TEXTO, autoSkip: true, maxRotation: 0 },
        grid: { color: COR_GRADE }
      };
      escalas.y = {
        stacked: !!opcoes.empilhado,
        beginAtZero: true,
        suggestedMax: opcoes.percentual ? 1 : undefined,
        ticks: {
          color: COR_TEXTO,
          callback: function (v) { return formatarValor(v, opcoes); }
        },
        grid: { color: COR_GRADE }
      };
      if (spec.series.some(function (s) { return s.eixo === 'y2'; })) {
        escalas.y2 = {
          position: 'right',
          beginAtZero: true,
          max: 1,
          ticks: { color: COR_TEXTO, callback: function (v) { return OEE.Calc.fmt.percentual(v, 0); } },
          grid: { drawOnChartArea: false }
        };
      }
    }

    var config = {
      type: tipoBase,
      data: { labels: spec.rotulos, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: spec.series.length > 1 || spec.tipo === 'rosca',
            labels: { color: COR_TEXTO, boxWidth: 12, font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: '#0B3C49',
            borderColor: 'rgba(198,210,218,0.25)',
            borderWidth: 1,
            titleColor: '#F5F4F0',
            bodyColor: COR_TEXTO,
            callbacks: {
              label: function (ctx) {
                var valor = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed;
                if (typeof valor === 'object' && valor !== null) valor = valor.x;
                var op = (ctx.dataset.yAxisID === 'y2') ? { percentual: true } : opcoes;
                return (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + formatarValor(valor, op);
              }
            }
          }
        },
        scales: escalas
      }
    };

    /* Eixo invertido em barras horizontais: os formatos vão para o eixo X. */
    if (horizontal && escalas.x && escalas.y) {
      var tmp = config.options.scales.x.ticks;
      config.options.scales.x.ticks = config.options.scales.y.ticks;
      config.options.scales.y.ticks = tmp;
    }

    try {
      instancias.set(container, new global.Chart(canvas.getContext('2d'), config));
    } catch (e) {
      console.error('Falha ao renderizar com Chart.js, usando renderizador interno.', e);
      desenharFallback(container, spec);
    }
  }

  /* ------------------- Renderizador interno (offline) ----------------- */
  function desenharFallback(container, spec) {
    var opcoes = spec.opcoes || {};
    var wrap = document.createElement('div');
    wrap.className = 'grafico-simples';

    var todos = [];
    spec.series.forEach(function (s) {
      (s.valores || []).forEach(function (v) { if (typeof v === 'number') todos.push(v); });
    });
    var max = Math.max.apply(null, todos.concat([0])) || 1;

    spec.rotulos.forEach(function (rotulo, i) {
      var linha = document.createElement('div');
      linha.className = 'grafico-simples__linha';

      var lab = document.createElement('span');
      lab.className = 'grafico-simples__rotulo';
      lab.textContent = rotulo;
      linha.appendChild(lab);

      var trilha = document.createElement('div');
      trilha.className = 'grafico-simples__trilha';

      spec.series.forEach(function (s, si) {
        var v = s.valores[i];
        if (typeof v !== 'number') return;
        var barra = document.createElement('div');
        barra.className = 'grafico-simples__barra';
        barra.style.width = Math.max(1, (v / max) * 100) + '%';
        barra.style.background = corDaSerie(s, si);
        barra.title = (s.nome ? s.nome + ': ' : '') + formatarValor(v, opcoes);
        trilha.appendChild(barra);
      });
      linha.appendChild(trilha);

      var val = document.createElement('span');
      val.className = 'grafico-simples__valor';
      val.textContent = formatarValor(spec.series[0].valores[i], opcoes);
      linha.appendChild(val);

      wrap.appendChild(linha);
    });

    var nota = document.createElement('p');
    nota.className = 'grafico-nota';
    nota.textContent = 'Exibição simplificada: biblioteca de gráficos indisponível offline.';
    wrap.appendChild(nota);

    container.appendChild(wrap);
  }

  /* ---------------------------------------------------------------------
   * Timeline de estados (renderização própria, sem biblioteca)
   * Cada segmento vira uma faixa proporcional à duração, com textura por
   * estado — o estado é comunicado por cor, padrão e texto no tooltip.
   * ------------------------------------------------------------------- */
  function desenharTimeline(container, segmentos, inicio, fim, opcoes) {
    if (!container) return;
    container.innerHTML = '';
    opcoes = opcoes || {};

    var total = fim - inicio;
    if (total <= 0) return;

    var faixa = document.createElement('div');
    faixa.className = 'timeline__faixa';
    faixa.setAttribute('role', 'img');
    faixa.setAttribute('aria-label', 'Linha do tempo de estados da máquina no período');

    var houve = false;
    segmentos.forEach(function (seg) {
      var segFim = seg.fim || fim;
      var a = Math.max(seg.inicio, inicio);
      var b = Math.min(segFim, fim);
      if (b <= a) return;
      houve = true;

      var def = OEE.Model.ESTADOS[seg.estado] || OEE.Model.ESTADOS.PARADA_NAO_PLANEJADA;
      var bloco = document.createElement('div');
      bloco.className = 'timeline__bloco estado-fundo estado--' + seg.estado + ' padrao--' + def.padrao;
      bloco.style.left = ((a - inicio) / total * 100) + '%';
      bloco.style.width = Math.max(0.25, (b - a) / total * 100) + '%';
      bloco.title = def.rotulo + ' · ' + OEE.Calc.fmt.hora(a) + ' → ' + OEE.Calc.fmt.hora(b) +
        ' · ' + OEE.Calc.fmt.duracao((b - a) / 1000);
      faixa.appendChild(bloco);
    });

    if (!houve) {
      container.innerHTML = '<p class="grafico-vazio">Sem eventos registrados neste período.</p>';
      return;
    }

    container.appendChild(faixa);

    /* Régua de horas */
    var regua = document.createElement('div');
    regua.className = 'timeline__regua';
    var passos = opcoes.marcas || 8;
    for (var i = 0; i <= passos; i++) {
      var marca = document.createElement('span');
      marca.textContent = OEE.Calc.fmt.hora(inicio + (total * i / passos));
      regua.appendChild(marca);
    }
    container.appendChild(regua);
  }

  OEE.Charts = {
    desenhar: desenhar,
    desenharTimeline: desenharTimeline,
    limpar: limpar,
    temChartJs: temChartJs,
    PALETA: PALETA
  };
})(window);
