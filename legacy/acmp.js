/* =========================================================================
 * acmp.js — Apoio à Classificação de Motivos de Parada
 *
 * Responsabilidade: sugerir ao operador os motivos mais prováveis no momento
 * em que ele registra uma parada, e permitir avaliar honestamente se essa
 * sugestão vale alguma coisa.
 *
 * O problema: o tempo parado é medido sozinho, mas a causa é digitada por
 * alguém com a máquina parada e a produção atrasando. Diante de vinte
 * opções, escolhe-se a primeira plausível. O erro não aparece no OEE —
 * aparece no Pareto, que decide onde a manutenção investe.
 *
 * Método: Naive Bayes multinomial sobre atributos categóricos, com
 * suavização de Laplace, treinado com o próprio histórico de apontamentos.
 *
 * Por que um modelo simples, e não o estado da arte:
 *   1. Treina em milissegundos dentro do navegador, sem servidor, sem GPU,
 *      sem etapa de treino offline — condição real de um terminal de fábrica.
 *   2. É explicável por construção. Dá para mostrar ao operador POR QUE a
 *      sugestão apareceu, e sugestão que o operador não entende é sugestão
 *      ignorada. Dois pontos de acurácia valem menos que isso aqui.
 *   3. Funciona com pouco dado, que é a situação de qualquer implantação
 *      nova.
 *
 * TRÊS ARMADILHAS TRATADAS EXPLICITAMENTE (ver comentários no código):
 *   - vazamento pelo estado da máquina;
 *   - uso de atributo indisponível no momento da inferência (duração);
 *   - divisão aleatória em série temporal.
 * ========================================================================= */
(function (global) {
  'use strict';

  var OEE = global.OEE = global.OEE || {};

  /* Amostras mínimas para o módulo se pronunciar. Abaixo disso, a sugestão
   * seria ruído com aparência de conhecimento — pior que não sugerir. */
  var MINIMO_AMOSTRAS = 30;
  var ALFA = 1;              // suavização de Laplace

  /* ---------------------------------------------------------------------
   * 1. Atributos
   *
   * ATRIBUTOS_INICIO é o conjunto disponível no instante em que o operador
   * aperta "registrar parada". Tudo o que ele não sabe nesse momento está
   * fora — inclusive coisas que melhorariam a acurácia medida.
   *
   * Duas exclusões deliberadas:
   *
   * (a) ESTADO DA MÁQUINA. Na aplicação, o estado é derivado do motivo
   *     escolhido (motivo.estadoSugerido). Treinar com ele daria acurácia
   *     altíssima e completamente falsa: o modelo estaria lendo a resposta.
   *     É o caso clássico de vazamento de alvo.
   *
   * (b) DURAÇÃO DA PARADA. Só existe depois que a parada termina. Usá-la no
   *     treino e não tê-la na inferência é o erro silencioso mais comum
   *     neste tipo de trabalho: o número do artigo não se reproduz em campo.
   *     Ela aparece apenas em ATRIBUTOS_EM_CURSO, usado na reclassificação
   *     de uma parada já em andamento — aí o tempo decorrido é conhecido de
   *     fato. A tela de avaliação compara os dois cenários lado a lado.
   * ------------------------------------------------------------------- */
  var ATRIBUTOS_INICIO = ['maquina', 'turno', 'faixaHora', 'produto', 'motivoAnterior'];
  var ATRIBUTOS_EM_CURSO = ATRIBUTOS_INICIO.concat(['faixaDuracao']);

  var ROTULOS_ATRIBUTO = {
    maquina: 'máquina',
    turno: 'turno',
    faixaHora: 'faixa horária',
    produto: 'produto',
    motivoAnterior: 'parada anterior',
    faixaDuracao: 'duração'
  };

  function faixaHoraria(ts) {
    var h = new Date(ts).getHours();
    if (h < 4) return '00h-04h';
    if (h < 8) return '04h-08h';
    if (h < 12) return '08h-12h';
    if (h < 16) return '12h-16h';
    if (h < 20) return '16h-20h';
    return '20h-24h';
  }

  function faixaDuracao(seg) {
    if (seg === null || seg === undefined) return 'desconhecida';
    if (seg <= 60) return 'até 1 min';
    if (seg <= 300) return 'até 5 min';
    if (seg <= 900) return 'até 15 min';
    if (seg <= 3600) return 'até 1 h';
    return 'acima de 1 h';
  }

  /* ---------------------------------------------------------------------
   * 2. Extração de amostras
   *
   * Cada parada já classificada por um humano é uma amostra rotulada. Não
   * há custo de anotação: o rótulo é o trabalho que o operador já faz.
   * ------------------------------------------------------------------- */
  function extrairAmostras(ds, opcoes) {
    opcoes = opcoes || {};
    var ordens = {};
    (ds.ordens || []).forEach(function (o) { ordens[o.id] = o; });

    var paradas = (ds.eventosParada || [])
      .filter(function (p) {
        if (!p.motivoId) return false;                       // sem rótulo, não serve
        if (opcoes.maquinaIds && opcoes.maquinaIds.indexOf(p.maquinaId) < 0) return false;
        if (opcoes.inicio && p.inicio < opcoes.inicio) return false;
        if (opcoes.fim && p.inicio > opcoes.fim) return false;
        return true;
      })
      .sort(function (a, b) { return a.inicio - b.inicio; });

    /* "Motivo da parada anterior na mesma máquina" precisa da ordem
       cronológica e do estado de cada máquina até aquele ponto. */
    var anteriorPorMaquina = {};

    return paradas.map(function (p) {
      var ordem = ordens[p.ordemId];
      var amostra = {
        id: p.id,
        ts: p.inicio,
        maquinaId: p.maquinaId,
        classe: p.motivoId,
        atributos: {
          maquina: p.maquinaId,
          turno: p.turnoId || 'sem-turno',
          faixaHora: faixaHoraria(p.inicio),
          produto: ordem ? ordem.produtoId : 'sem-ordem',
          motivoAnterior: anteriorPorMaquina[p.maquinaId] || 'nenhuma',
          faixaDuracao: faixaDuracao(p.duracaoSeg)
        }
      };
      anteriorPorMaquina[p.maquinaId] = p.motivoId;
      return amostra;
    });
  }

  /* Contexto de inferência: o que se sabe no instante do apontamento. */
  function contextoAtual(ds, maquina, opcoes) {
    opcoes = opcoes || {};
    var agora = opcoes.agora || Date.now();
    var ordem = maquina.ordemAtualId
      ? (ds.ordens || []).filter(function (o) { return o.id === maquina.ordemAtualId; })[0]
      : null;

    /* Última parada encerrada desta máquina — a "parada anterior". */
    var anteriores = (ds.eventosParada || []).filter(function (p) {
      return p.maquinaId === maquina.id && p.motivoId && p.inicio < agora;
    }).sort(function (a, b) { return a.inicio - b.inicio; });
    var anterior = anteriores[anteriores.length - 1];

    var turno = OEE.Model.turnoDoInstante(ds.turnos, agora);

    return {
      maquina: maquina.id,
      turno: turno.turnoId,
      faixaHora: faixaHoraria(agora),
      produto: ordem ? ordem.produtoId : 'sem-ordem',
      motivoAnterior: anterior ? anterior.motivoId : 'nenhuma',
      faixaDuracao: faixaDuracao(opcoes.duracaoSeg === undefined ? null : opcoes.duracaoSeg)
    };
  }

  /* ---------------------------------------------------------------------
   * 3. Treino
   *
   * Naive Bayes: P(classe | atributos) ∝ P(classe) · Π P(atributo | classe),
   * assumindo independência condicional entre atributos. A suposição é
   * falsa aqui (máquina e produto são correlacionados, por exemplo), e
   * ainda assim o classificador costuma acertar o ranking — é o resultado
   * conhecido de que Naive Bayes tolera dependência sem perder a ordenação.
   * ------------------------------------------------------------------- */
  function treinar(amostras, atributos) {
    atributos = atributos || ATRIBUTOS_INICIO;

    var contagemClasse = {};
    var contagem = {};        // contagem[atributo][classe][valor]
    var valores = {};         // conjunto de valores distintos por atributo
    var total = 0;

    atributos.forEach(function (a) { contagem[a] = {}; valores[a] = {}; });

    amostras.forEach(function (am) {
      var c = am.classe;
      contagemClasse[c] = (contagemClasse[c] || 0) + 1;
      total += 1;
      atributos.forEach(function (a) {
        var v = am.atributos[a];
        if (!contagem[a][c]) contagem[a][c] = {};
        contagem[a][c][v] = (contagem[a][c][v] || 0) + 1;
        valores[a][v] = true;
      });
    });

    return {
      atributos: atributos,
      classes: Object.keys(contagemClasse),
      contagemClasse: contagemClasse,
      contagem: contagem,
      cardinalidade: Object.keys(valores).reduce(function (acc, a) {
        acc[a] = Object.keys(valores[a]).length; return acc;
      }, {}),
      total: total,
      treinadoEm: Date.now()
    };
  }

  /* ---------------------------------------------------------------------
   * 4. Inferência
   *
   * Somatório de logaritmos em vez de produto de probabilidades: com cinco
   * atributos e probabilidades pequenas, o produto direto chega a zero por
   * limite de precisão e todas as classes empatam.
   * ------------------------------------------------------------------- */
  function pontuar(modelo, ctx) {
    if (!modelo || !modelo.total) return [];

    var pontos = modelo.classes.map(function (c) {
      var log = Math.log(modelo.contagemClasse[c] / modelo.total);

      modelo.atributos.forEach(function (a) {
        var porClasse = modelo.contagem[a][c] || {};
        var n = porClasse[ctx[a]] || 0;
        var totalClasse = modelo.contagemClasse[c];
        var k = modelo.cardinalidade[a] || 1;
        /* Laplace: valor nunca visto para esta classe recebe probabilidade
           pequena, não zero. Sem isso, um único atributo inédito zeraria a
           classe inteira, por mais evidência que houvesse no resto. */
        log += Math.log((n + ALFA) / (totalClasse + ALFA * k));
      });

      return { classe: c, log: log };
    });

    /* Normalização estável: subtrai o maior log antes de exponenciar. */
    var maior = Math.max.apply(null, pontos.map(function (p) { return p.log; }));
    var soma = 0;
    pontos.forEach(function (p) { p.exp = Math.exp(p.log - maior); soma += p.exp; });
    pontos.forEach(function (p) { p.prob = p.exp / soma; });

    return pontos.sort(function (a, b) { return b.prob - a.prob; });
  }

  /* Evidência legível. Em vez de mostrar P(atributo|classe), que é o que o
   * modelo usa mas ninguém interpreta, mostramos a leitura direta: entre as
   * paradas com este valor de atributo, que fatia foi deste motivo. É a
   * frase que o operador consegue conferir com a própria experiência. */
  function evidencias(modelo, ctx, classe, limite) {
    var lista = modelo.atributos.map(function (a) {
      var valor = ctx[a];
      var comEsseValor = 0;
      var dessaClasse = (modelo.contagem[a][classe] || {})[valor] || 0;
      modelo.classes.forEach(function (c) {
        comEsseValor += (modelo.contagem[a][c] || {})[valor] || 0;
      });
      return {
        atributo: a,
        rotulo: ROTULOS_ATRIBUTO[a] || a,
        valor: valor,
        proporcao: comEsseValor ? dessaClasse / comEsseValor : 0,
        suporte: comEsseValor,
        ocorrencias: dessaClasse
      };
    });

    return lista
      .filter(function (e) { return e.suporte >= 3 && e.proporcao > 0; })
      .sort(function (x, y) { return y.proporcao - x.proporcao; })
      .slice(0, limite || 2);
  }

  function sugerir(modelo, ctx, quantidade) {
    if (!modelo || modelo.total < MINIMO_AMOSTRAS) return [];
    return pontuar(modelo, ctx).slice(0, quantidade || 3).map(function (p, i) {
      return {
        motivoId: p.classe,
        probabilidade: p.prob,
        posicao: i + 1,
        evidencias: evidencias(modelo, ctx, p.classe, 2)
      };
    });
  }

  /* ---------------------------------------------------------------------
   * 5. Referência de comparação
   *
   * Sem baseline, qualquer acurácia parece boa. A régua honesta aqui é o
   * que um sistema sem modelo nenhum já faria: oferecer o motivo mais
   * frequente daquela máquina. Se o classificador não superar isso, ele não
   * paga a própria complexidade.
   * ------------------------------------------------------------------- */
  function baseline(amostrasTreino) {
    var porMaquina = {}, geralMapa = {};
    amostrasTreino.forEach(function (a) {
      porMaquina[a.maquinaId] = porMaquina[a.maquinaId] || {};
      porMaquina[a.maquinaId][a.classe] = (porMaquina[a.maquinaId][a.classe] || 0) + 1;
      geralMapa[a.classe] = (geralMapa[a.classe] || 0) + 1;
    });
    var ordenar = function (mapa) {
      return Object.keys(mapa).sort(function (x, y) { return mapa[y] - mapa[x]; });
    };
    var geralOrdenado = ordenar(geralMapa);
    var porMaq = {}, porMaqTop3 = {};
    Object.keys(porMaquina).forEach(function (m) {
      var lista = ordenar(porMaquina[m]);
      porMaq[m] = lista[0] || null;
      porMaqTop3[m] = lista.slice(0, 3);
    });
    return {
      porMaquina: porMaq,
      porMaquinaTop3: porMaqTop3,
      geral: geralOrdenado[0] || null,
      geralTop3: geralOrdenado.slice(0, 3)
    };
  }

  /* ---------------------------------------------------------------------
   * 6. Avaliação
   *
   * DIVISÃO TEMPORAL, NUNCA ALEATÓRIA. Embaralhar as amostras deixaria o
   * modelo treinar com paradas de quinta e testar com paradas de terça da
   * mesma máquina, no mesmo turno, com o mesmo problema em curso. A acurácia
   * subiria vários pontos e não significaria nada: em produção, o modelo
   * sempre prevê o futuro a partir do passado.
   * ------------------------------------------------------------------- */
  function avaliar(amostras, opcoes) {
    opcoes = opcoes || {};
    var atributos = opcoes.atributos || ATRIBUTOS_INICIO;
    var fracaoTreino = opcoes.fracaoTreino || 0.75;

    if (amostras.length < MINIMO_AMOSTRAS * 2) {
      return { suficiente: false, totalAmostras: amostras.length, minimo: MINIMO_AMOSTRAS * 2 };
    }

    var ordenadas = amostras.slice().sort(function (a, b) { return a.ts - b.ts; });
    var corte = Math.floor(ordenadas.length * fracaoTreino);
    var treino = ordenadas.slice(0, corte);
    var teste = ordenadas.slice(corte);

    var modelo = treinar(treino, atributos);
    var ref = baseline(treino);

    var acertosTop1 = 0, acertosTop3 = 0, acertosBaseline = 0, acertosBaselineTop3 = 0;
    var matriz = {};      // matriz[real][previsto]
    var classesVistas = {};

    teste.forEach(function (am) {
      var ranking = pontuar(modelo, am.atributos);
      var previsto = ranking.length ? ranking[0].classe : null;
      var top3 = ranking.slice(0, 3).map(function (p) { return p.classe; });

      if (previsto === am.classe) acertosTop1 += 1;
      if (top3.indexOf(am.classe) >= 0) acertosTop3 += 1;
      if ((ref.porMaquina[am.maquinaId] || ref.geral) === am.classe) acertosBaseline += 1;
      /* Comparação justa para uma interface que mostra três sugestões:
         os três motivos mais frequentes daquela máquina. Confrontar o
         top-3 do modelo com o top-1 da referência inflaria o ganho. */
      var refTop3 = ref.porMaquinaTop3[am.maquinaId] || ref.geralTop3;
      if (refTop3.indexOf(am.classe) >= 0) acertosBaselineTop3 += 1;

      matriz[am.classe] = matriz[am.classe] || {};
      matriz[am.classe][previsto] = (matriz[am.classe][previsto] || 0) + 1;
      classesVistas[am.classe] = true;
      if (previsto) classesVistas[previsto] = true;
    });

    /* Métricas por classe. Acurácia sozinha engana com classes
       desbalanceadas: um modelo que só responde "falha mecânica" pode
       acertar 40% e ser inútil. F1 por classe expõe isso. */
    var classes = Object.keys(classesVistas);
    var porClasse = classes.map(function (c) {
      var vp = (matriz[c] || {})[c] || 0;
      var fn = Object.keys(matriz[c] || {}).reduce(function (s, prev) {
        return s + (prev === c ? 0 : matriz[c][prev]);
      }, 0);
      var fp = classes.reduce(function (s, real) {
        if (real === c) return s;
        return s + ((matriz[real] || {})[c] || 0);
      }, 0);
      var precisao = (vp + fp) ? vp / (vp + fp) : null;
      var revocacao = (vp + fn) ? vp / (vp + fn) : null;
      var f1 = (precisao && revocacao) ? 2 * precisao * revocacao / (precisao + revocacao) : 0;
      return { classe: c, suporte: vp + fn, precisao: precisao, revocacao: revocacao, f1: f1 };
    }).sort(function (a, b) { return b.suporte - a.suporte; });

    var comSuporte = porClasse.filter(function (p) { return p.suporte > 0; });
    var f1Macro = comSuporte.length
      ? comSuporte.reduce(function (s, p) { return s + p.f1; }, 0) / comSuporte.length
      : 0;

    return {
      suficiente: true,
      modelo: modelo,
      atributos: atributos,
      totalAmostras: ordenadas.length,
      treino: treino.length,
      teste: teste.length,
      corteEm: teste.length ? teste[0].ts : null,
      periodoTreino: { inicio: treino[0].ts, fim: treino[treino.length - 1].ts },
      periodoTeste: teste.length ? { inicio: teste[0].ts, fim: teste[teste.length - 1].ts } : null,
      acuraciaTop1: teste.length ? acertosTop1 / teste.length : 0,
      acuraciaTop3: teste.length ? acertosTop3 / teste.length : 0,
      acuraciaBaseline: teste.length ? acertosBaseline / teste.length : 0,
      acuraciaBaselineTop3: teste.length ? acertosBaselineTop3 / teste.length : 0,
      f1Macro: f1Macro,
      matriz: matriz,
      classes: classes,
      porClasse: porClasse
    };
  }

  OEE.ACMP = {
    ATRIBUTOS_INICIO: ATRIBUTOS_INICIO,
    ATRIBUTOS_EM_CURSO: ATRIBUTOS_EM_CURSO,
    ROTULOS_ATRIBUTO: ROTULOS_ATRIBUTO,
    MINIMO_AMOSTRAS: MINIMO_AMOSTRAS,
    extrairAmostras: extrairAmostras,
    contextoAtual: contextoAtual,
    treinar: treinar,
    pontuar: pontuar,
    sugerir: sugerir,
    evidencias: evidencias,
    baseline: baseline,
    avaliar: avaliar,
    faixaHoraria: faixaHoraria,
    faixaDuracao: faixaDuracao
  };
})(window);
