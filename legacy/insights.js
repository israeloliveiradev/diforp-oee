/* =========================================================================
 * insights.js
 * Responsabilidade: gerar observações analíticas a partir dos indicadores.
 *
 * As regras aqui são determinísticas e auditáveis — não há modelo de IA.
 * Cada regra devolve um objeto com título, descrição, indicador relacionado,
 * criticidade, período analisado e ação recomendada. Os insights são apoio
 * à análise: nunca executam ação nem alteram dados.
 *
 * Para evoluir: cada regra é uma função pura em REGRAS[]; basta acrescentar
 * novas funções com a mesma assinatura (contexto) => insight|null|Array.
 * ========================================================================= */
(function (global) {
  'use strict';

  var OEE = (global.OEE = global.OEE || {});
  var Calc = OEE.Calc;
  var Model = OEE.Model;

  var CRITICIDADE = {
    INFORMATIVO: 'informativo',
    ATENCAO: 'atencao',
    CRITICO: 'critico',
    OPORTUNIDADE: 'oportunidade'
  };

  var HORA = 3600000;

  /* ---------------------------------------------------------------------
   * Helpers de contexto
   * ------------------------------------------------------------------- */

  function eventosDaMaquina(dataset, colecao, ids) {
    return dataset[colecao].filter(function (e) { return ids.indexOf(e.maquinaId) >= 0; });
  }

  function calcular(dataset, ids, ini, fim) {
    return Calc.calcularOEE({
      eventosEstado: eventosDaMaquina(dataset, 'eventosEstado', ids),
      eventosProducao: eventosDaMaquina(dataset, 'eventosProducao', ids),
      eventosParada: eventosDaMaquina(dataset, 'eventosParada', ids),
      inicio: ini, fim: fim,
      cicloIdealSeg: Calc.cicloIdealMedio(dataset, ids, ini, fim),
      config: dataset.config
    });
  }

  function nomeMaquina(dataset, id) {
    var m = dataset.maquinas.filter(function (x) { return x.id === id; })[0];
    return m ? m.nome : id;
  }

  function periodoTexto(ini, fim) {
    return Calc.fmt.dataHora(ini) + ' até ' + Calc.fmt.dataHora(fim);
  }

  function insight(o) {
    return {
      id: Model.novoId('INS'),
      titulo: o.titulo,
      descricao: o.descricao,
      indicador: o.indicador,
      criticidade: o.criticidade,
      periodo: o.periodo,
      acaoRecomendada: o.acaoRecomendada,
      maquinaId: o.maquinaId || null,
      valor: o.valor === undefined ? null : o.valor
    };
  }

  /* Janela do turno atual e do turno anterior. */
  function janelasDeComparacao(dataset, agora) {
    var atual = Model.turnoDoInstante(dataset.turnos, agora);
    var duracao = atual.fim - atual.inicio;
    return {
      atual: { inicio: atual.inicio, fim: Math.min(atual.fim, agora), turnoId: atual.turnoId, nome: atual.nome },
      anterior: (function () {
        var ant = Model.turnoDoInstante(dataset.turnos, atual.inicio - 60000);
        return { inicio: ant.inicio, fim: ant.fim, turnoId: ant.turnoId, nome: ant.nome };
      })(),
      duracaoTurnoMs: duracao
    };
  }

  /* ---------------------------------------------------------------------
   * Regras
   * ------------------------------------------------------------------- */
  var REGRAS = [];

  /* R1 — Queda de Disponibilidade em relação ao turno anterior. */
  REGRAS.push(function regraDisponibilidadeTurno(ctx) {
    var atual = calcular(ctx.dataset, ctx.ids, ctx.turnos.atual.inicio, ctx.turnos.atual.fim);
    var anterior = calcular(ctx.dataset, ctx.ids, ctx.turnos.anterior.inicio, ctx.turnos.anterior.fim);
    if (atual.disponibilidade === null || anterior.disponibilidade === null) return null;

    var delta = atual.disponibilidade - anterior.disponibilidade;
    if (Math.abs(delta) < 0.05) return null;

    var caiu = delta < 0;
    return insight({
      titulo: caiu
        ? 'Disponibilidade caiu ' + Calc.fmt.percentual(Math.abs(delta), 0) + ' em relação ao turno anterior'
        : 'Disponibilidade subiu ' + Calc.fmt.percentual(delta, 0) + ' em relação ao turno anterior',
      descricao: 'No ' + ctx.turnos.atual.nome + ' a Disponibilidade está em ' + Calc.fmt.percentual(atual.disponibilidade) +
        ', contra ' + Calc.fmt.percentual(anterior.disponibilidade) + ' no ' + ctx.turnos.anterior.nome +
        '. Tempo parado não planejado no turno atual: ' + Calc.fmt.duracao(atual.paradaNaoPlanejadaSeg) + '.',
      indicador: 'Disponibilidade',
      criticidade: caiu ? (Math.abs(delta) >= 0.12 ? CRITICIDADE.CRITICO : CRITICIDADE.ATENCAO) : CRITICIDADE.INFORMATIVO,
      periodo: periodoTexto(ctx.turnos.atual.inicio, ctx.turnos.atual.fim),
      acaoRecomendada: caiu
        ? 'Comparar os motivos de parada dos dois turnos na tela Paradas e verificar mudanças de setup, material ou equipe.'
        : 'Registrar a prática que melhorou o turno e replicar nas demais máquinas da linha.',
      valor: delta
    });
  });

  /* R2 — Concentração de tempo perdido em uma categoria (Pareto). */
  REGRAS.push(function regraParetoDominante(ctx) {
    var paradas = eventosDaMaquina(ctx.dataset, 'eventosParada', ctx.ids)
      .filter(function (e) { return !e.planejada; });
    var motivosIdx = {};
    ctx.dataset.motivos.forEach(function (m) { motivosIdx[m.id] = m; });

    var p = Calc.pareto(paradas, ctx.inicio, ctx.fim, 'motivoId', function (k) {
      return motivosIdx[k] ? motivosIdx[k].categoria + ' / ' + motivosIdx[k].nome : 'Não classificado';
    });
    if (!p.itens.length || p.totalSeg < 600) return null;

    var topo = p.itens[0];
    if (topo.participacao < 0.25) return null;

    return insight({
      titulo: topo.rotulo + ' representa ' + Calc.fmt.percentual(topo.participacao, 0) + ' do tempo total de parada',
      descricao: 'Foram ' + topo.ocorrencias + ' ocorrências somando ' + Calc.fmt.duracao(topo.tempoSeg) +
        ' de um total de ' + Calc.fmt.duracao(p.totalSeg) + ' de paradas não planejadas no período.',
      indicador: 'Disponibilidade',
      criticidade: topo.participacao >= 0.4 ? CRITICIDADE.CRITICO : CRITICIDADE.ATENCAO,
      periodo: periodoTexto(ctx.inicio, ctx.fim),
      acaoRecomendada: 'Abrir análise de causa raiz para este motivo. Ele concentra o maior potencial de ganho de Disponibilidade.',
      valor: topo.participacao
    });
  });

  /* R3 — Ciclo real distante do ciclo ideal. */
  REGRAS.push(function regraCicloReal(ctx) {
    var r = calcular(ctx.dataset, ctx.ids, ctx.inicio, ctx.fim);
    if (!r.cicloRealSeg || !r.cicloIdealSeg || r.producaoTotal < 20) return null;

    var desvio = (r.cicloRealSeg - r.cicloIdealSeg) / r.cicloIdealSeg;
    if (desvio <= 0.05) return null;

    return insight({
      titulo: 'Operação ' + Calc.fmt.percentual(desvio, 0) + ' acima do ciclo ideal',
      descricao: 'Ciclo ideal de ' + r.cicloIdealSeg.toFixed(1).replace('.', ',') + ' s/peça contra ciclo real médio de ' +
        r.cicloRealSeg.toFixed(1).replace('.', ',') + ' s/peça. Isso limita a Performance a ' +
        Calc.fmt.percentual(r.performance) + '.',
      indicador: 'Performance',
      criticidade: desvio >= 0.15 ? CRITICIDADE.CRITICO : CRITICIDADE.ATENCAO,
      periodo: periodoTexto(ctx.inicio, ctx.fim),
      acaoRecomendada: 'Verificar parâmetros de processo, desgaste de ferramenta e se o ciclo ideal cadastrado ainda reflete o produto atual.',
      valor: desvio
    });
  });

  /* R4 — Aumento de microparadas nas últimas 2 horas. */
  REGRAS.push(function regraMicroparadas(ctx) {
    var limite = (ctx.dataset.config.limiteMicroparadaSeg || 300);
    var paradas = eventosDaMaquina(ctx.dataset, 'eventosParada', ctx.ids);

    function contar(ini, fim) {
      return paradas.filter(function (e) {
        return !e.planejada && e.duracaoSeg <= limite && Calc.sobreposicaoMs(e.inicio, e.fim, ini, fim) > 0;
      }).length;
    }

    var recentes = contar(ctx.agora - 2 * HORA, ctx.agora);
    var anteriores = contar(ctx.agora - 4 * HORA, ctx.agora - 2 * HORA);
    if (recentes < 4 || recentes <= anteriores * 1.3) return null;

    return insight({
      titulo: 'Volume de microparadas aumentou nas últimas duas horas',
      descricao: recentes + ' microparadas (até ' + Calc.fmt.duracao(limite) + ') nas últimas 2 horas, contra ' +
        anteriores + ' nas 2 horas anteriores.',
      indicador: 'Disponibilidade',
      criticidade: CRITICIDADE.ATENCAO,
      periodo: periodoTexto(ctx.agora - 2 * HORA, ctx.agora),
      acaoRecomendada: 'Observar a máquina em operação: microparadas frequentes costumam indicar sensor sujo, alimentação irregular ou ajuste fino pendente.',
      valor: recentes
    });
  });

  /* R5 — Projeção da meta do turno no ritmo atual. */
  REGRAS.push(function regraMetaTurno(ctx) {
    if (ctx.ids.length !== 1) return null;              // regra é por máquina
    var maq = ctx.dataset.maquinas.filter(function (m) { return m.id === ctx.ids[0]; })[0];
    if (!maq || !maq.ordemAtualId) return null;
    var ordem = ctx.dataset.ordens.filter(function (o) { return o.id === maq.ordemAtualId; })[0];
    if (!ordem || !ordem.metaQtd) return null;

    var jan = ctx.turnos.atual;
    var r = calcular(ctx.dataset, ctx.ids, jan.inicio, ctx.agora);
    var decorridoH = (ctx.agora - jan.inicio) / HORA;
    if (decorridoH < 0.5) return null;

    var restanteH = (Model.turnoDoInstante(ctx.dataset.turnos, ctx.agora).fim - ctx.agora) / HORA;
    var ritmo = r.producaoTotal / decorridoH;
    var projecao = r.producaoTotal + ritmo * restanteH;
    var atingimento = projecao / ordem.metaQtd;
    if (atingimento >= 0.98) {
      return insight({
        titulo: 'Meta do turno deve ser atingida no ritmo atual',
        descricao: 'Ritmo de ' + Calc.fmt.numero(ritmo) + ' peças/h projeta ' + Calc.fmt.numero(projecao) +
          ' peças contra meta de ' + Calc.fmt.numero(ordem.metaQtd) + '.',
        indicador: 'Produção',
        criticidade: CRITICIDADE.INFORMATIVO,
        periodo: periodoTexto(jan.inicio, ctx.agora),
        acaoRecomendada: 'Manter o ritmo e registrar as condições atuais como referência.',
        maquinaId: maq.id,
        valor: atingimento
      });
    }

    return insight({
      titulo: 'Meta do turno não deve ser atingida no ritmo atual',
      descricao: 'Produzidas ' + Calc.fmt.numero(r.producaoTotal) + ' de ' + Calc.fmt.numero(ordem.metaQtd) +
        ' peças. No ritmo de ' + Calc.fmt.numero(ritmo) + ' peças/h, a projeção para o fim do turno é ' +
        Calc.fmt.numero(projecao) + ' peças (' + Calc.fmt.percentual(atingimento, 0) + ' da meta).',
      indicador: 'Produção',
      criticidade: atingimento < 0.85 ? CRITICIDADE.CRITICO : CRITICIDADE.ATENCAO,
      periodo: periodoTexto(jan.inicio, ctx.agora),
      acaoRecomendada: 'Priorizar a redução da maior perda do turno e avaliar reprogramação com o planejamento.',
      maquinaId: maq.id,
      valor: atingimento
    });
  });

  /* R6 — Tempo médio de setup acima da meta. */
  REGRAS.push(function regraSetup(ctx) {
    var setups = eventosDaMaquina(ctx.dataset, 'eventosParada', ctx.ids).filter(function (e) {
      return e.estado === 'SETUP' && Calc.sobreposicaoMs(e.inicio, e.fim, ctx.inicio, ctx.fim) > 0;
    });
    if (setups.length < 2) return null;

    var medioSeg = setups.reduce(function (a, e) { return a + e.duracaoSeg; }, 0) / setups.length;
    var metaSeg = (ctx.dataset.config.metaSetupMin || 20) * 60;
    if (medioSeg <= metaSeg) return null;

    return insight({
      titulo: 'Tempo médio de setup acima da meta',
      descricao: setups.length + ' setups no período, com média de ' + Calc.fmt.duracao(medioSeg) +
        ' contra meta de ' + Calc.fmt.duracao(metaSeg) + '. Total consumido em setup: ' +
        Calc.fmt.duracao(setups.reduce(function (a, e) { return a + e.duracaoSeg; }, 0)) + '.',
      indicador: 'Disponibilidade',
      criticidade: medioSeg > metaSeg * 1.5 ? CRITICIDADE.CRITICO : CRITICIDADE.ATENCAO,
      periodo: periodoTexto(ctx.inicio, ctx.fim),
      acaoRecomendada: 'Aplicar SMED: separar atividades internas e externas e preparar ferramental antes da parada.',
      valor: medioSeg
    });
  });

  /* R7 — Índice de refugo acima da média histórica. */
  REGRAS.push(function regraRefugo(ctx) {
    var r = calcular(ctx.dataset, ctx.ids, ctx.inicio, ctx.fim);
    if (r.producaoTotal < 30) return null;
    var taxa = r.refugo / r.producaoTotal;

    var historico = calcular(ctx.dataset, ctx.ids, ctx.agora - 7 * 24 * HORA, ctx.inicio);
    var taxaHist = historico.producaoTotal > 0 ? historico.refugo / historico.producaoTotal : null;
    var meta = ctx.dataset.config.metaRefugoPct || 0.02;
    var referencia = (taxaHist === null) ? meta : taxaHist;

    /* Dispara quando o refugo sobe em relação ao histórico OU quando fica
       cronicamente acima da meta — máquina sempre ruim também é desvio. */
    if (taxa <= referencia * 1.2 && taxa <= meta) return null;

    return insight({
      titulo: 'Índice de refugo acima da referência',
      descricao: 'Refugo de ' + Calc.fmt.percentual(taxa) + ' no período (' + Calc.fmt.numero(r.refugo) +
        ' de ' + Calc.fmt.numero(r.producaoTotal) + ' peças), contra referência histórica de ' +
        Calc.fmt.percentual(referencia) + ' e meta de ' + Calc.fmt.percentual(meta) + '.',
      indicador: 'Qualidade',
      criticidade: taxa > referencia * 2 ? CRITICIDADE.CRITICO : CRITICIDADE.ATENCAO,
      periodo: periodoTexto(ctx.inicio, ctx.fim),
      acaoRecomendada: 'Verificar as principais causas de refugo na tela Qualidade e conferir a última liberação de processo.',
      valor: taxa
    });
  });

  /* R8 — Maior oportunidade: espera (material/operador). */
  REGRAS.push(function regraEspera(ctx) {
    var esperas = eventosDaMaquina(ctx.dataset, 'eventosParada', ctx.ids).filter(function (e) {
      return (e.estado === 'AGUARDANDO_MATERIAL' || e.estado === 'AGUARDANDO_OPERADOR') &&
        Calc.sobreposicaoMs(e.inicio, e.fim, ctx.inicio, ctx.fim) > 0;
    });
    if (!esperas.length) return null;

    var tempo = esperas.reduce(function (a, e) { return a + Calc.sobreposicaoMs(e.inicio, e.fim, ctx.inicio, ctx.fim) / 1000; }, 0);
    var r = calcular(ctx.dataset, ctx.ids, ctx.inicio, ctx.fim);
    if (!r.tempoProducaoPlanejadoSeg || tempo / r.tempoProducaoPlanejadoSeg < 0.05) return null;

    var ganho = r.tempoProducaoPlanejadoSeg ? tempo / r.tempoProducaoPlanejadoSeg : 0;
    return insight({
      titulo: 'Reduzir o tempo de espera é a maior oportunidade do período',
      descricao: 'Esperas por material ou operador somam ' + Calc.fmt.duracao(tempo) + ' em ' + esperas.length +
        ' ocorrências, equivalentes a ' + Calc.fmt.percentual(ganho, 0) + ' do tempo de produção planejado.',
      indicador: 'Disponibilidade',
      criticidade: CRITICIDADE.OPORTUNIDADE,
      periodo: periodoTexto(ctx.inicio, ctx.fim),
      acaoRecomendada: 'Revisar o abastecimento da linha (kanban, ponto de pedido) e a cobertura de operadores nas trocas de turno.',
      valor: ganho
    });
  });

  /* R9 — Máquina parada agora há tempo relevante. */
  REGRAS.push(function regraParadaEmCurso(ctx) {
    var itens = [];
    ctx.dataset.maquinas.forEach(function (m) {
      if (ctx.ids.indexOf(m.id) < 0) return;
      var classe = Calc.classeDoEstado(m.estadoAtual, ctx.dataset.config);
      if (classe !== 'NAO_PLANEJADA') return;
      var duracaoSeg = (ctx.agora - m.estadoDesde) / 1000;
      if (duracaoSeg < 1800) return;
      itens.push(insight({
        titulo: nomeMaquina(ctx.dataset, m.id) + ' parada há ' + Calc.fmt.duracao(duracaoSeg),
        descricao: 'Estado atual: ' + Model.ESTADOS[m.estadoAtual].rotulo + ', desde ' + Calc.fmt.hora(m.estadoDesde) + '.',
        indicador: 'Disponibilidade',
        criticidade: duracaoSeg > 3600 ? CRITICIDADE.CRITICO : CRITICIDADE.ATENCAO,
        periodo: periodoTexto(m.estadoDesde, ctx.agora),
        acaoRecomendada: 'Confirmar se o atendimento foi acionado e se o motivo registrado continua válido.',
        maquinaId: m.id,
        valor: duracaoSeg
      }));
    });
    return itens;
  });

  /* R10 — Máquina de referência (OEE acima da meta). */
  REGRAS.push(function regraReferencia(ctx) {
    if (ctx.ids.length < 2) return null;
    var meta = ctx.dataset.config.metaOEE || 0.75;
    var grupos = Calc.oeePorGrupo(ctx.dataset, ctx.dataset.maquinas.filter(function (m) { return ctx.ids.indexOf(m.id) >= 0; }),
      ctx.inicio, ctx.fim, function (m) { return m.id; }, function (k) { return nomeMaquina(ctx.dataset, k); });

    var validos = grupos.filter(function (g) { return g.indicadores.oee !== null; })
      .sort(function (a, b) { return b.indicadores.oee - a.indicadores.oee; });
    if (!validos.length || validos[0].indicadores.oee < meta) return null;

    var melhor = validos[0];
    var pior = validos[validos.length - 1];
    return insight({
      titulo: melhor.rotulo + ' é a referência do período com OEE de ' + Calc.fmt.percentual(melhor.indicadores.oee),
      descricao: 'A diferença para a máquina de menor desempenho (' + pior.rotulo + ', ' +
        Calc.fmt.percentual(pior.indicadores.oee) + ') é de ' +
        Calc.fmt.percentual(melhor.indicadores.oee - pior.indicadores.oee, 0) + ' pontos de OEE.',
      indicador: 'OEE',
      criticidade: CRITICIDADE.OPORTUNIDADE,
      periodo: periodoTexto(ctx.inicio, ctx.fim),
      acaoRecomendada: 'Comparar setup, parâmetros e rotina de operação entre as duas máquinas para padronizar a prática melhor.',
      maquinaId: melhor.maquinas[0].id,
      valor: melhor.indicadores.oee
    });
  });

  /* ---------------------------------------------------------------------
   * Execução do motor
   * ------------------------------------------------------------------- */

  /**
   * @param dataset  conjunto completo de dados
   * @param opcoes   { maquinaIds, inicio, fim, agora }
   * @returns Array de insights ordenados por criticidade
   */
  function gerar(dataset, opcoes) {
    opcoes = opcoes || {};
    var agora = opcoes.agora || Date.now();
    var ids = opcoes.maquinaIds && opcoes.maquinaIds.length
      ? opcoes.maquinaIds
      : dataset.maquinas.map(function (m) { return m.id; });

    var ctx = {
      dataset: dataset,
      ids: ids,
      agora: agora,
      inicio: opcoes.inicio || (agora - 24 * HORA),
      fim: opcoes.fim || agora,
      turnos: janelasDeComparacao(dataset, agora)
    };

    var resultado = [];
    REGRAS.forEach(function (regra) {
      try {
        var saida = regra(ctx);
        if (!saida) return;
        if (Array.isArray(saida)) resultado = resultado.concat(saida);
        else resultado.push(saida);
      } catch (e) {
        /* Uma regra com defeito não pode derrubar a tela de insights. */
        console.error('Falha ao executar regra de insight:', e);
      }
    });

    var ordem = { critico: 0, atencao: 1, oportunidade: 2, informativo: 3 };
    return resultado.sort(function (a, b) { return ordem[a.criticidade] - ordem[b.criticidade]; });
  }

  OEE.Insights = {
    gerar: gerar,
    CRITICIDADE: CRITICIDADE,
    REGRAS: REGRAS
  };
})(window);
