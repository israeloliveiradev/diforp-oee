/* =========================================================================
 * calculations.js
 * Responsabilidade: todas as regras de cálculo de indicadores.
 * Este módulo é puro: recebe eventos e devolve números. Não conhece DOM,
 * LocalStorage nem gráficos — o que permite reaproveitá-lo no futuro em um
 * backend Node/Edge sem alteração.
 *
 * Fórmulas (TPM clássico):
 *   Tempo de Produção Planejado = Tempo Total do Turno − Paradas Planejadas
 *   Tempo Operacional           = TPP − Paradas Não Planejadas
 *   Disponibilidade             = Tempo Operacional ÷ TPP
 *   Performance                 = (Produção Total × Ciclo Ideal) ÷ Tempo Operacional
 *   Qualidade                   = Produção Aprovada ÷ Produção Total
 *   OEE                         = Disponibilidade × Performance × Qualidade
 *   Produção Aprovada           = Produção Total − Refugos
 * ========================================================================= */
(function (global) {
  'use strict';

  var OEE = (global.OEE = global.OEE || {});
  var Model = OEE.Model;

  /* ---------------------------------------------------------------------
   * Utilidades numéricas e de formatação
   * ------------------------------------------------------------------- */

  function seguro(n) { return (typeof n === 'number' && isFinite(n)) ? n : 0; }

  /* Divisão protegida: sem tempo/quantidade base, o indicador é indefinido
     (devolve null) em vez de 0 — o que evita "OEE 0%" falso em máquina sem
     tempo planejado. */
  function dividir(a, b) {
    if (!b || b <= 0) return null;
    return a / b;
  }

  /* Interseção entre o segmento [ini,fim] e a janela [janIni,janFim]. */
  function sobreposicaoMs(ini, fim, janIni, janFim) {
    var f = (fim === null || fim === undefined) ? janFim : fim;
    var a = Math.max(ini, janIni);
    var b = Math.min(f, janFim);
    return b > a ? b - a : 0;
  }

  function classeDoEstado(estadoId, config) {
    var override = config && config.classificacaoEstados && config.classificacaoEstados[estadoId];
    if (override) return override;
    var def = Model.ESTADOS[estadoId];
    return def ? def.classe : 'NAO_PLANEJADA';
  }

  function formatarPercentual(valor, casas) {
    if (valor === null || valor === undefined) return '—';
    var c = (casas === undefined) ? 1 : casas;
    return (valor * 100).toFixed(c).replace('.', ',') + '%';
  }

  function formatarNumero(valor, casas) {
    if (valor === null || valor === undefined) return '—';
    var c = (casas === undefined) ? 0 : casas;
    return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  }

  /* Duração legível: 1h 24min / 8min 30s */
  function formatarDuracao(segundos) {
    if (segundos === null || segundos === undefined || !isFinite(segundos)) return '—';
    var s = Math.max(0, Math.round(segundos));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'min';
    if (m > 0) return m + 'min ' + String(r).padStart(2, '0') + 's';
    return r + 's';
  }

  /* Cronômetro do estado atual: HH:MM:SS */
  function formatarCronometro(segundos) {
    var s = Math.max(0, Math.round(segundos || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function formatarHora(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function formatarDataHora(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.toLocaleDateString('pt-BR') + ' ' + formatarHora(ts);
  }

  /* ---------------------------------------------------------------------
   * Agregação de tempos por classe de estado
   * ------------------------------------------------------------------- */

  /**
   * Soma a duração dos eventos de estado dentro da janela informada.
   * Eventos abertos (fim === null) são contados até o fim da janela.
   *
   * @returns {Object} tempos em segundos, por estado e por classe.
   */
  function agregarTempos(eventosEstado, janIni, janFim, config) {
    var porEstado = {};
    var porClasse = { PRODUTIVO: 0, PLANEJADA: 0, NAO_PLANEJADA: 0 };
    var totalCoberto = 0;

    eventosEstado.forEach(function (ev) {
      var ms = sobreposicaoMs(ev.inicio, ev.fim, janIni, janFim);
      if (ms <= 0) return;
      var seg = ms / 1000;
      porEstado[ev.estado] = (porEstado[ev.estado] || 0) + seg;
      porClasse[classeDoEstado(ev.estado, config)] += seg;
      totalCoberto += seg;
    });

    return { porEstado: porEstado, porClasse: porClasse, totalCobertoSeg: totalCoberto };
  }

  /* ---------------------------------------------------------------------
   * Cálculo principal de OEE
   * ------------------------------------------------------------------- */

  /**
   * @param {Object} p
   *   p.eventosEstado   {Array}  eventos de estado da(s) máquina(s)
   *   p.eventosProducao {Array}  apontamentos de produção
   *   p.inicio, p.fim   {Number} janela de análise (ms)
   *   p.cicloIdealSeg   {Number} ciclo ideal médio (s/peça)
   *   p.config          {Object} configurações (classificação de estados)
   *
   * @returns {Object} indicadores + memória de cálculo + anomalias.
   */
  function calcularOEE(p) {
    var config = p.config || {};
    var janIni = p.inicio;
    var janFim = p.fim;
    var anomalias = [];

    var tempos = agregarTempos(p.eventosEstado || [], janIni, janFim, config);

    /* Tempo total considerado: apenas o período em que existe registro de
       estado para a máquina. Períodos sem registro não são atribuídos como
       perda — evita penalizar máquina recém-cadastrada. */
    var tempoTotalSeg = tempos.totalCobertoSeg;
    var paradaPlanejadaSeg = tempos.porClasse.PLANEJADA;
    var paradaNaoPlanejadaSeg = tempos.porClasse.NAO_PLANEJADA;

    /* TPP = tempo total − paradas planejadas */
    var tempoProducaoPlanejadoSeg = Math.max(0, tempoTotalSeg - paradaPlanejadaSeg);
    /* Tempo operacional = TPP − paradas não planejadas */
    var tempoOperacionalSeg = Math.max(0, tempoProducaoPlanejadoSeg - paradaNaoPlanejadaSeg);

    /* Produção no período */
    var producaoTotal = 0, refugo = 0, retrabalho = 0;
    (p.eventosProducao || []).forEach(function (ev) {
      if (ev.ts < janIni || ev.ts > janFim) return;
      producaoTotal += seguro(ev.qtdTotal);
      refugo += seguro(ev.qtdRefugo);
      retrabalho += seguro(ev.qtdRetrabalho);
    });
    var producaoAprovada = Math.max(0, producaoTotal - refugo);

    var cicloIdealSeg = p.cicloIdealSeg || 0;

    /* Indicadores */
    var disponibilidade = dividir(tempoOperacionalSeg, tempoProducaoPlanejadoSeg);
    var performance = dividir(producaoTotal * cicloIdealSeg, tempoOperacionalSeg);
    var qualidade = dividir(producaoAprovada, producaoTotal);

    /* Ciclo real médio observado. */
    var cicloRealSeg = dividir(tempoOperacionalSeg, producaoTotal);

    /* Validação: indicadores acima de 100% indicam inconsistência de
       apontamento (ciclo ideal errado, produção lançada em excesso ou
       parada não registrada). Registramos a anomalia e limitamos o valor
       usado no OEE, preservando o valor bruto para auditoria. */
    var performanceBruta = performance;
    if (performance !== null && performance > 1) {
      anomalias.push({
        indicador: 'Performance',
        valorBruto: performance,
        mensagem: 'Performance acima de 100%: revise o ciclo ideal, o apontamento de produção ou paradas não registradas.'
      });
      performance = 1;
    }
    var disponibilidadeBruta = disponibilidade;
    if (disponibilidade !== null && disponibilidade > 1) {
      anomalias.push({
        indicador: 'Disponibilidade',
        valorBruto: disponibilidade,
        mensagem: 'Disponibilidade acima de 100%: há sobreposição de eventos de estado no período.'
      });
      disponibilidade = 1;
    }
    if (qualidade !== null && qualidade > 1) qualidade = 1;

    var oee = (disponibilidade === null || performance === null || qualidade === null)
      ? null
      : disponibilidade * performance * qualidade;

    /* MTBF / MTTR considerando apenas paradas não planejadas. */
    var falhas = (p.eventosParada || []).filter(function (ev) {
      return !ev.planejada && sobreposicaoMs(ev.inicio, ev.fim, janIni, janFim) > 0;
    });
    var tempoFalhasSeg = falhas.reduce(function (acc, ev) {
      return acc + sobreposicaoMs(ev.inicio, ev.fim, janIni, janFim) / 1000;
    }, 0);
    var mtbfSeg = falhas.length ? tempoOperacionalSeg / falhas.length : null;
    var mttrSeg = falhas.length ? tempoFalhasSeg / falhas.length : null;

    return {
      janela: { inicio: janIni, fim: janFim },
      tempoTotalSeg: tempoTotalSeg,
      paradaPlanejadaSeg: paradaPlanejadaSeg,
      paradaNaoPlanejadaSeg: paradaNaoPlanejadaSeg,
      tempoProducaoPlanejadoSeg: tempoProducaoPlanejadoSeg,
      tempoOperacionalSeg: tempoOperacionalSeg,
      temposPorEstado: tempos.porEstado,
      producaoTotal: producaoTotal,
      producaoAprovada: producaoAprovada,
      refugo: refugo,
      retrabalho: retrabalho,
      cicloIdealSeg: cicloIdealSeg,
      cicloRealSeg: cicloRealSeg,
      disponibilidade: disponibilidade,
      performance: performance,
      qualidade: qualidade,
      oee: oee,
      disponibilidadeBruta: disponibilidadeBruta,
      performanceBruta: performanceBruta,
      qtdParadas: falhas.length,
      tempoFalhasSeg: tempoFalhasSeg,
      mtbfSeg: mtbfSeg,
      mttrSeg: mttrSeg,
      anomalias: anomalias
    };
  }

  /* ---------------------------------------------------------------------
   * Agrupamentos usados nos dashboards
   * ------------------------------------------------------------------- */

  /**
   * Calcula OEE para cada grupo (máquina, linha, turno, produto...).
   * @param chaveFn recebe a máquina e devolve a chave do grupo.
   */
  function oeePorGrupo(dataset, maquinas, janIni, janFim, chaveFn, rotuloFn) {
    var grupos = {};

    maquinas.forEach(function (maq) {
      var chave = chaveFn(maq);
      if (chave === null || chave === undefined) return;
      if (!grupos[chave]) {
        grupos[chave] = { chave: chave, rotulo: rotuloFn ? rotuloFn(chave, maq) : String(chave), maquinas: [] };
      }
      grupos[chave].maquinas.push(maq);
    });

    return Object.keys(grupos).map(function (k) {
      var g = grupos[k];
      var ids = g.maquinas.map(function (m) { return m.id; });
      var res = calcularOEE({
        eventosEstado: dataset.eventosEstado.filter(function (e) { return ids.indexOf(e.maquinaId) >= 0; }),
        eventosProducao: dataset.eventosProducao.filter(function (e) { return ids.indexOf(e.maquinaId) >= 0; }),
        eventosParada: dataset.eventosParada.filter(function (e) { return ids.indexOf(e.maquinaId) >= 0; }),
        inicio: janIni,
        fim: janFim,
        cicloIdealSeg: cicloIdealMedio(dataset, ids, janIni, janFim),
        config: dataset.config
      });
      return { chave: g.chave, rotulo: g.rotulo, maquinas: g.maquinas, indicadores: res };
    });
  }

  /**
   * Ciclo ideal médio ponderado pela quantidade produzida de cada produto.
   * Necessário quando o grupo mistura produtos com ciclos diferentes.
   */
  function cicloIdealMedio(dataset, maquinaIds, janIni, janFim) {
    var somaPeso = 0, somaCiclo = 0;
    dataset.eventosProducao.forEach(function (ev) {
      if (maquinaIds.indexOf(ev.maquinaId) < 0) return;
      if (ev.ts < janIni || ev.ts > janFim) return;
      var ordem = dataset.ordens.filter(function (o) { return o.id === ev.ordemId; })[0];
      var ciclo = ordem ? ordem.cicloIdealSeg : null;
      if (!ciclo) {
        var prod = dataset.produtos.filter(function (p) { return p.id === ev.produtoId; })[0];
        ciclo = prod ? prod.cicloIdealSeg : 0;
      }
      somaCiclo += ciclo * ev.qtdTotal;
      somaPeso += ev.qtdTotal;
    });
    if (somaPeso > 0) return somaCiclo / somaPeso;

    /* Sem produção no período: usa o ciclo ideal cadastrado nas máquinas. */
    var maquinas = dataset.maquinas.filter(function (m) { return maquinaIds.indexOf(m.id) >= 0; });
    if (!maquinas.length) return 0;
    return maquinas.reduce(function (a, m) { return a + (m.cicloIdealSeg || 0); }, 0) / maquinas.length;
  }

  /* Pareto de paradas: agrupa por motivo ou categoria e ordena por tempo. */
  function pareto(eventosParada, janIni, janFim, campo, rotuloFn) {
    var mapa = {};
    eventosParada.forEach(function (ev) {
      var ms = sobreposicaoMs(ev.inicio, ev.fim, janIni, janFim);
      if (ms <= 0) return;
      var chave = ev[campo] || 'Outros';
      if (!mapa[chave]) mapa[chave] = { chave: chave, rotulo: rotuloFn ? rotuloFn(chave) : String(chave), tempoSeg: 0, ocorrencias: 0 };
      mapa[chave].tempoSeg += ms / 1000;
      mapa[chave].ocorrencias += 1;
    });

    var lista = Object.keys(mapa).map(function (k) { return mapa[k]; })
      .sort(function (a, b) { return b.tempoSeg - a.tempoSeg; });

    var total = lista.reduce(function (a, i) { return a + i.tempoSeg; }, 0);
    var acumulado = 0;
    lista.forEach(function (i) {
      i.participacao = total ? i.tempoSeg / total : 0;
      acumulado += i.participacao;
      i.acumulado = acumulado;
    });
    return { itens: lista, totalSeg: total };
  }

  /* Série temporal de OEE em buckets (hora ou dia). */
  function serieOEE(dataset, maquinaIds, janIni, janFim, bucketMs) {
    var pontos = [];
    var estados = dataset.eventosEstado.filter(function (e) { return maquinaIds.indexOf(e.maquinaId) >= 0; });
    var producao = dataset.eventosProducao.filter(function (e) { return maquinaIds.indexOf(e.maquinaId) >= 0; });
    var paradas = dataset.eventosParada.filter(function (e) { return maquinaIds.indexOf(e.maquinaId) >= 0; });

    for (var t = janIni; t < janFim; t += bucketMs) {
      var fimBucket = Math.min(t + bucketMs, janFim);
      var res = calcularOEE({
        eventosEstado: estados, eventosProducao: producao, eventosParada: paradas,
        inicio: t, fim: fimBucket,
        cicloIdealSeg: cicloIdealMedio(dataset, maquinaIds, t, fimBucket),
        config: dataset.config
      });
      pontos.push({ inicio: t, fim: fimBucket, indicadores: res });
    }
    return pontos;
  }

  /* Produção agregada por bucket de tempo (usada em "produção por hora"). */
  function producaoPorBucket(eventosProducao, janIni, janFim, bucketMs) {
    var buckets = [];
    for (var t = janIni; t < janFim; t += bucketMs) {
      buckets.push({ inicio: t, fim: Math.min(t + bucketMs, janFim), total: 0, aprovada: 0, refugo: 0 });
    }
    eventosProducao.forEach(function (ev) {
      if (ev.ts < janIni || ev.ts > janFim) return;
      var idx = Math.floor((ev.ts - janIni) / bucketMs);
      if (idx < 0 || idx >= buckets.length) return;
      buckets[idx].total += seguro(ev.qtdTotal);
      buckets[idx].refugo += seguro(ev.qtdRefugo);
      buckets[idx].aprovada += seguro(ev.qtdTotal) - seguro(ev.qtdRefugo);
    });
    return buckets;
  }

  /* Classificação simples para semáforo de OEE. */
  function faixaOEE(valor, meta) {
    if (valor === null || valor === undefined) return 'indefinido';
    var m = meta || 0.75;
    if (valor >= m) return 'bom';
    if (valor >= m * 0.8) return 'atencao';
    return 'critico';
  }

  OEE.Calc = {
    calcularOEE: calcularOEE,
    agregarTempos: agregarTempos,
    oeePorGrupo: oeePorGrupo,
    cicloIdealMedio: cicloIdealMedio,
    pareto: pareto,
    serieOEE: serieOEE,
    producaoPorBucket: producaoPorBucket,
    sobreposicaoMs: sobreposicaoMs,
    classeDoEstado: classeDoEstado,
    faixaOEE: faixaOEE,
    dividir: dividir,
    fmt: {
      percentual: formatarPercentual,
      numero: formatarNumero,
      duracao: formatarDuracao,
      cronometro: formatarCronometro,
      hora: formatarHora,
      dataHora: formatarDataHora
    }
  };
})(window);
