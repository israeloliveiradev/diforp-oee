/* =========================================================================
 * app.js
 * Responsabilidade: interface, navegação, ações do operador, telas de
 * gestão, cadastros e o simulador de dados em tempo próximo ao real.
 *
 * Regras de negócio de cálculo ficam em calculations.js; geração de
 * insights em insights.js; persistência em storage.js. Este arquivo
 * orquestra os módulos e desenha a interface.
 * ========================================================================= */
(function (global) {
  'use strict';

  var OEE = (global.OEE = global.OEE || {});
  var Calc = OEE.Calc;
  var Model = OEE.Model;
  var Charts = OEE.Charts;

  var HORA = 3600000;

  /* ---------------------------------------------------------------------
   * Estado da aplicação
   * ------------------------------------------------------------------- */
  var ds = null;                 // dataset completo
  var prefs = {};                // preferências de interface
  var simTimer = null;           // timer do simulador
  var relogioTimer = null;       // timer do cronômetro do operador
  var simEstado = {};            // acumuladores do simulador (não persistidos)
  var timerSalvar = null;

  var ROTAS = [
    { id: 'visao-geral',   rotulo: 'Visão Geral',   icone: '\u25A6', modo: 'gestao' },
    { id: 'operacao',      rotulo: 'Operação',      icone: '\u25B6', modo: 'ambos' },
    { id: 'maquinas',      rotulo: 'Máquinas',      icone: '\u2699', modo: 'gestao' },
    { id: 'producao',      rotulo: 'Produção',      icone: '\u25A4', modo: 'gestao' },
    { id: 'paradas',       rotulo: 'Paradas',       icone: '\u23F8', modo: 'gestao' },
    { id: 'qualidade',     rotulo: 'Qualidade',     icone: '\u2713', modo: 'gestao' },
    { id: 'performance',   rotulo: 'Performance',   icone: '\u2197', modo: 'gestao' },
    { id: 'insights',      rotulo: 'Insights',      icone: '\u2726', modo: 'gestao' },
    { id: 'assistente',    rotulo: 'ACMP',          icone: '\u2699', modo: 'gestao' },
    { id: 'auditoria',     rotulo: 'Auditoria',     icone: '\u2611', modo: 'gestao' },
    { id: 'cadastros',     rotulo: 'Cadastros',     icone: '\u2637', modo: 'gestao' },
    { id: 'configuracoes', rotulo: 'Configurações', icone: '\u2692', modo: 'ambos' }
  ];

  var FILTROS_PADRAO = {
    periodo: '24h', dataInicio: '', dataFim: '',
    plantaId: '', areaId: '', linhaId: '', maquinaId: '',
    produtoId: '', ordemId: '', turnoId: '', operadorId: '',
    /* Filtros exclusivos da trilha de auditoria. Ficam no mesmo objeto para
       que a barra de filtros e lerFiltros() continuem com um caminho só. */
    audCategoria: '', audOrigem: '', audAcao: '', audBusca: ''
  };

  /* ---------------------------------------------------------------------
   * Utilidades de DOM
   * ------------------------------------------------------------------- */
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }

  /* Escapa texto vindo de dados do usuário antes de injetar em HTML. */
  function esc(txt) {
    if (txt === null || txt === undefined) return '';
    return String(txt)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function notificar(mensagem, tipo) {
    var area = $('#area-avisos');
    if (!area) return;
    var el = document.createElement('div');
    el.className = 'aviso aviso--' + (tipo || 'ok');
    el.setAttribute('role', 'status');
    el.textContent = mensagem;
    area.appendChild(el);
    setTimeout(function () {
      el.classList.add('aviso--saindo');
      setTimeout(function () { el.remove(); }, 300);
    }, 4000);
  }

  /* ---------------------------------------------------------------------
   * Persistência
   * ------------------------------------------------------------------- */
  function salvar() {
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(function () {
      OEE.DataSource.salvar(ds).catch(function (e) {
        notificar('Não foi possível gravar os dados: ' + e.message, 'erro');
      });
    }, 300);
  }

  function salvarPrefs() { OEE.Storage.salvarPreferencias(prefs); }

  /* ---------------------------------------------------------------------
   * Auditoria
   *
   * Ponto único de entrada da trilha. Preenche sozinho o contexto que a
   * chamada não precisa repetir: quem, em que máquina, em que ordem, em que
   * turno e a partir de qual tela. Assim, instrumentar uma ação nova custa
   * uma linha, e o que é registrado não depende de o autor da chamada
   * lembrar de preencher tudo.
   * ------------------------------------------------------------------- */
  var origemAtual = 'GESTAO';   // trocado para SIMULACAO durante o tick

  /* Não há autenticação neste MVP: o "usuário" é o operador vinculado à
   * máquina, quando existe. Isso identifica o posto, não a pessoa — e é
   * exatamente o que a tela de auditoria declara ao leitor. */
  function usuarioAtual(maq) {
    if (origemAtual === 'SIMULACAO') return 'simulador';
    if (maq && maq.operadorAtualId) {
      var op = porId('operadores', maq.operadorAtualId);
      if (op) return op.nome + ' (' + op.matricula + ')';
    }
    return prefs.modo === 'operador' ? 'operador não identificado' : 'gestão não identificada';
  }

  function auditar(ev) {
    if (!ds) return null;
    if (origemAtual === 'SIMULACAO' && ds.config.auditarSimulacao === false) return null;

    var maq = ev.maquina || (ev.maquinaId ? porId('maquinas', ev.maquinaId) : null);
    var ts = ev.ts || Date.now();

    /* A origem não vem da tela em que o usuário está, e sim da natureza da
     * ação: apontar produção é ato de chão de fábrica mesmo quando disparado
     * de um dashboard. O simulador sempre prevalece. */
    if (origemAtual === 'SIMULACAO') {
      ev.origem = 'SIMULACAO';
    } else if (!ev.origem) {
      var cat = (OEE.Audit.ACOES[ev.acao] || {}).categoria;
      ev.origem = ['OPERACAO', 'PRODUCAO', 'PARADA', 'ORDEM'].indexOf(cat) >= 0 ? 'OPERADOR' : 'GESTAO';
    }
    ev.usuario = ev.usuario || usuarioAtual(maq);
    if (maq) {
      ev.maquinaId = maq.id;
      if (!ev.ordemId) ev.ordemId = maq.ordemAtualId || null;
      if (!ev.operadorId) ev.operadorId = maq.operadorAtualId || null;
    }
    if (!ev.turnoId) ev.turnoId = Model.turnoDoInstante(ds.turnos, ts).turnoId;
    delete ev.maquina;
    return OEE.Audit.registrar(ds, ev);
  }

  /* Une duas trilhas sem duplicar registros, ordenando por instante. Usada
   * na importação, quando o arquivo recebido traz a sua própria trilha. */
  function fundirTrilhas(a, b) {
    var vistos = {};
    return a.concat(b)
      .filter(function (r) {
        if (!r || !r.id || vistos[r.id]) return false;
        vistos[r.id] = true;
        return true;
      })
      .sort(function (x, y) { return x.ts - y.ts; });
  }

  /* ---------------------------------------------------------------------
   * ACMP — apoio à classificação de motivos de parada
   *
   * O modelo é treinado sob demanda e mantido em memória. Treinar custa
   * poucos milissegundos, mas refazer isso a cada abertura de modal, com o
   * operador esperando, seria desperdício; o cache é invalidado sempre que
   * uma nova parada classificada entra na base.
   * ------------------------------------------------------------------- */
  var modeloACMP = null;
  var assinaturaModelo = null;

  function modeloAtualACMP(comDuracao) {
    var assinatura = (ds.eventosParada || []).length + '|' + (comDuracao ? 'curso' : 'inicio');
    if (modeloACMP && assinaturaModelo === assinatura) return modeloACMP;

    var amostras = OEE.ACMP.extrairAmostras(ds);
    if (amostras.length < OEE.ACMP.MINIMO_AMOSTRAS) { modeloACMP = null; return null; }

    modeloACMP = OEE.ACMP.treinar(amostras,
      comDuracao ? OEE.ACMP.ATRIBUTOS_EM_CURSO : OEE.ACMP.ATRIBUTOS_INICIO);
    assinaturaModelo = assinatura;
    return modeloACMP;
  }

  function sugestoesACMP(opcoes) {
    /* Habilitação explícita por chamada, e não pela simples presença de uma
     * máquina no contexto.
     *
     * O modelo é treinado com paradas classificadas e responde à pergunta
     * "por que este equipamento parou". Solicitar manutenção é outra
     * pergunta: o operador já sabe o que quer, e a lista ali é restrita à
     * categoria Máquina. Sugerir naquele contexto empurra o histórico de
     * paradas para dentro de uma decisão que não é de classificação —
     * ruído, no melhor caso; indução ao motivo errado, no pior.
     *
     * Só habilitam sugestão os pontos em que o ato é classificar uma
     * parada: registrar, pausar e reclassificar. */
    if (!opcoes.acmp) return [];
    if (ds.config.acmpAtivo === false) return [];
    var maq = opcoes.maquina || porId('maquinas', prefs.maquinaId);
    if (!maq) return [];

    /* Reclassificação de parada em curso: o tempo decorrido já é conhecido
       e entra como atributo. No registro de uma parada nova, não é. */
    var comDuracao = opcoes.duracaoSeg !== undefined && opcoes.duracaoSeg !== null;
    var modelo = modeloAtualACMP(comDuracao);
    if (!modelo) return [];

    var ctx = OEE.ACMP.contextoAtual(ds, maq, {
      agora: Date.now(),
      duracaoSeg: opcoes.duracaoSeg
    });
    return OEE.ACMP.sugerir(modelo, ctx, 3);
  }

  /* Mede a aceitação. Sem esse registro não há como saber se a sugestão
   * ajuda ou se o operador a ignora — que é a única métrica que importa
   * depois que o modelo sai do papel. */
  function registrarDesfechoACMP(sugestoes, motivoEscolhido, posicaoAceita, opcoes) {
    if (!sugestoes.length) return;
    var maq = opcoes.maquina || porId('maquinas', prefs.maquinaId);
    var nomes = sugestoes.map(function (s) { return nomeDe('motivos', s.motivoId); });
    var estavaNaLista = sugestoes.filter(function (s) { return s.motivoId === motivoEscolhido; })[0];

    auditar({
      acao: posicaoAceita ? 'SUGESTAO_ACEITA' : 'SUGESTAO_IGNORADA',
      maquina: maq,
      descricao: posicaoAceita
        ? 'Sugestão do ACMP aceita na posição ' + posicaoAceita + ': ' + nomeDe('motivos', motivoEscolhido) + '.'
        : 'Sugestão do ACMP não utilizada; motivo escolhido manualmente: ' + nomeDe('motivos', motivoEscolhido) + '.',
      detalhes: {
        sugeridos: nomes.join(', '),
        escolhido: nomeDe('motivos', motivoEscolhido),
        posicaoAceita: posicaoAceita || null,
        escolhidoEstavaEntreOsSugeridos: !!estavaNaLista,
        probabilidadeDoEscolhido: estavaNaLista ? estavaNaLista.probabilidade : null
      }
    });
  }

  /* Valores nulos precisam aparecer como algo legível: "— → 30" comunica,
   * "null → 30" faz o leitor parar para decifrar. */
  function formatarValorAud(v) {
    if (v === null || v === undefined || v === '') return '\u2014';
    if (v === true) return 'sim';
    if (v === false) return 'não';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /* ---------------------------------------------------------------------
   * Consultas ao dataset
   * ------------------------------------------------------------------- */
  function porId(colecao, id) {
    var lista = ds[colecao] || [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  function nomeDe(colecao, id, campo) {
    var o = porId(colecao, id);
    return o ? o[campo || 'nome'] : '—';
  }

  function linhaDaMaquina(maq) { return porId('linhas', maq.linhaId); }
  function areaDaLinha(linha) { return linha ? porId('areas', linha.areaId) : null; }
  function plantaDaArea(area) { return area ? porId('plantas', area.plantaId) : null; }

  function caminhoDaMaquina(maq) {
    var l = linhaDaMaquina(maq), a = areaDaLinha(l), p = plantaDaArea(a);
    return {
      linha: l, area: a, planta: p,
      texto: [p && p.nome, a && a.nome, l && l.nome].filter(Boolean).join(' › ')
    };
  }

  /* Janela de tempo definida pelo filtro de período. */
  function janelaDoFiltro() {
    var agora = Date.now();
    var f = prefs.filtros;
    switch (f.periodo) {
      case 'turno': {
        var t = Model.turnoDoInstante(ds.turnos, agora);
        return { inicio: t.inicio, fim: Math.min(t.fim, agora), rotulo: 'Turno atual (' + t.nome + ')' };
      }
      case 'hoje': {
        var d = new Date(); d.setHours(0, 0, 0, 0);
        return { inicio: d.getTime(), fim: agora, rotulo: 'Hoje' };
      }
      case '7d': return { inicio: agora - 7 * 24 * HORA, fim: agora, rotulo: 'Últimos 7 dias' };
      case '30d': return { inicio: agora - 30 * 24 * HORA, fim: agora, rotulo: 'Últimos 30 dias' };
      case 'personalizado': {
        var ini = parseDataLocal(f.dataInicio, agora - 24 * HORA);
        var fim = parseDataLocal(f.dataFim, agora);
        if (fim <= ini) fim = ini + HORA;
        return { inicio: ini, fim: fim, rotulo: 'Período personalizado' };
      }
      default: return { inicio: agora - 24 * HORA, fim: agora, rotulo: 'Últimas 24 horas' };
    }
  }

  /* Converte o valor de um <input type="datetime-local"> ("2026-07-27T14:30")
   * em milissegundos no fuso local. O construtor Date aceita esse formato nos
   * navegadores atuais, mas o Safari é historicamente rigoroso com strings de
   * data e devolve NaN diante de qualquer variação — um NaN aqui derrubaria
   * todos os indicadores da tela. Montar a data campo a campo elimina a
   * dependência do analisador do navegador. */
  function parseDataLocal(valor, padrao) {
    if (!valor) return padrao;
    var p = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!p) return padrao;
    var d = new Date(+p[1], +p[2] - 1, +p[3], +(p[4] || 0), +(p[5] || 0), 0, 0);
    var ms = d.getTime();
    return isNaN(ms) ? padrao : ms;
  }

  /* Máquinas que atendem aos filtros de hierarquia. */
  function maquinasDoFiltro() {
    var f = prefs.filtros;
    return ds.maquinas.filter(function (m) {
      if (f.maquinaId && m.id !== f.maquinaId) return false;
      var c = caminhoDaMaquina(m);
      if (f.linhaId && m.linhaId !== f.linhaId) return false;
      if (f.areaId && (!c.area || c.area.id !== f.areaId)) return false;
      if (f.plantaId && (!c.planta || c.planta.id !== f.plantaId)) return false;
      return true;
    });
  }

  /* Contexto de análise: máquinas + eventos filtrados + janela. */
  function contexto() {
    var jan = janelaDoFiltro();
    var maquinas = maquinasDoFiltro();
    var ids = maquinas.map(function (m) { return m.id; });
    var f = prefs.filtros;

    function filtrar(colecao, temProduto, temOperador) {
      return ds[colecao].filter(function (e) {
        if (ids.indexOf(e.maquinaId) < 0) return false;
        if (f.turnoId && e.turnoId !== f.turnoId) return false;
        if (f.ordemId && e.ordemId !== f.ordemId) return false;
        if (f.produtoId) {
          if (temProduto) { if (e.produtoId !== f.produtoId) return false; }
          else {
            var o = porId('ordens', e.ordemId);
            if (!o || o.produtoId !== f.produtoId) return false;
          }
        }
        if (f.operadorId) {
          if (temOperador) { if (e.operadorId !== f.operadorId) return false; }
          else {
            var o2 = porId('ordens', e.ordemId);
            if (!o2 || o2.operadorId !== f.operadorId) return false;
          }
        }
        return true;
      });
    }

    return {
      inicio: jan.inicio, fim: jan.fim, rotuloPeriodo: jan.rotulo,
      maquinas: maquinas, ids: ids,
      eventosEstado: filtrar('eventosEstado', false, false),
      eventosProducao: filtrar('eventosProducao', true, true),
      eventosParada: filtrar('eventosParada', false, false)
    };
  }

  function indicadoresDoContexto(ctx) {
    return Calc.calcularOEE({
      eventosEstado: ctx.eventosEstado,
      eventosProducao: ctx.eventosProducao,
      eventosParada: ctx.eventosParada,
      inicio: ctx.inicio, fim: ctx.fim,
      cicloIdealSeg: Calc.cicloIdealMedio(ds, ctx.ids, ctx.inicio, ctx.fim),
      config: ds.config
    });
  }

  /* Indicadores de uma única máquina em uma janela. */
  function indicadoresDaMaquina(maquinaId, ini, fim) {
    return Calc.calcularOEE({
      eventosEstado: ds.eventosEstado.filter(function (e) { return e.maquinaId === maquinaId; }),
      eventosProducao: ds.eventosProducao.filter(function (e) { return e.maquinaId === maquinaId; }),
      eventosParada: ds.eventosParada.filter(function (e) { return e.maquinaId === maquinaId; }),
      inicio: ini, fim: fim,
      cicloIdealSeg: Calc.cicloIdealMedio(ds, [maquinaId], ini, fim),
      config: ds.config
    });
  }

  /* ---------------------------------------------------------------------
   * Máquina de estados do apontamento
   * ------------------------------------------------------------------- */

  /* Fecha eventos abertos (estado e parada) da máquina. */
  function fecharEventosAbertos(maquinaId, ts) {
    ds.eventosEstado.forEach(function (e) {
      if (e.maquinaId === maquinaId && e.fim === null) e.fim = ts;
    });
    ds.eventosParada.forEach(function (e) {
      if (e.maquinaId === maquinaId && e.fim === null) {
        e.fim = ts;
        e.duracaoSeg = Math.round((ts - e.inicio) / 1000);
      }
    });
  }

  /**
   * Transição de estado da máquina. É o único caminho para alterar
   * maq.estadoAtual — garante que a timeline nunca fique inconsistente.
   */
  function mudarEstado(maq, novoEstado, motivoId, comentario, opcoesAud) {
    var ts = Date.now();
    if (maq.estadoAtual === novoEstado && !motivoId) return;

    /* Fotografia do estado anterior antes de qualquer mutação — é o "antes"
       do registro de auditoria e a base para medir quanto durou. */
    var estadoAnterior = maq.estadoAtual;
    var paradaAnterior = paradaAberta(maq.id);
    var duracaoAnteriorSeg = maq.estadoDesde ? Math.round((ts - maq.estadoDesde) / 1000) : null;

    fecharEventosAbertos(maq.id, ts);

    var turno = Model.turnoDoInstante(ds.turnos, ts);
    var def = Model.ESTADOS[novoEstado];
    if (!def) { notificar('Estado desconhecido: ' + novoEstado, 'erro'); return; }

    ds.eventosEstado.push({
      id: Model.novoId('EST'),
      maquinaId: maq.id,
      ordemId: maq.ordemAtualId,
      turnoId: turno.turnoId,
      estado: novoEstado,
      motivoId: motivoId || null,
      inicio: ts,
      fim: null
    });

    if (Calc.classeDoEstado(novoEstado, ds.config) !== 'PRODUTIVO') {
      var motivo = motivoId ? porId('motivos', motivoId) : null;
      ds.eventosParada.push({
        id: Model.novoId('PAR'),
        maquinaId: maq.id,
        ordemId: maq.ordemAtualId,
        turnoId: turno.turnoId,
        estado: novoEstado,
        motivoId: motivoId || null,
        categoria: motivo ? motivo.categoria : 'Outros',
        planejada: Calc.classeDoEstado(novoEstado, ds.config) === 'PLANEJADA',
        inicio: ts,
        fim: null,
        duracaoSeg: 0,
        comentario: comentario || ''
      });
    }

    maq.estadoAtual = novoEstado;
    maq.estadoDesde = ts;

    var eraProdutivo = Calc.classeDoEstado(estadoAnterior, ds.config) === 'PRODUTIVO';
    var ehProdutivo = Calc.classeDoEstado(novoEstado, ds.config) === 'PRODUTIVO';
    var motivoNovo = motivoId ? porId('motivos', motivoId) : null;
    var aud = opcoesAud || {};

    auditar({
      acao: aud.acao || (eraProdutivo && !ehProdutivo ? 'PARADA_INICIADA'
        : (!eraProdutivo && ehProdutivo ? 'PARADA_FINALIZADA' : 'ESTADO_ALTERADO')),
      maquina: maq,
      ts: ts,
      descricao: aud.descricao || (maq.nome + ': ' +
        rotuloEstado(estadoAnterior) + ' \u2192 ' + rotuloEstado(novoEstado) +
        (motivoNovo ? ' (motivo: ' + motivoNovo.nome + ')' : '')),
      antes: {
        estado: rotuloEstado(estadoAnterior),
        motivo: paradaAnterior && paradaAnterior.motivoId ? nomeDe('motivos', paradaAnterior.motivoId) : null
      },
      depois: {
        estado: rotuloEstado(novoEstado),
        motivo: motivoNovo ? motivoNovo.nome : null,
        categoria: motivoNovo ? motivoNovo.categoria : null
      },
      detalhes: {
        duracaoEstadoAnteriorSeg: duracaoAnteriorSeg,
        classeAnterior: Calc.classeDoEstado(estadoAnterior, ds.config),
        classeNova: Calc.classeDoEstado(novoEstado, ds.config),
        comentario: comentario || null
      }
    });

    salvar();
  }

  function rotuloEstado(estadoId) {
    var def = Model.ESTADOS[estadoId];
    return def ? def.rotulo : estadoId;
  }

  function paradaAberta(maquinaId) {
    var abertas = ds.eventosParada.filter(function (e) { return e.maquinaId === maquinaId && e.fim === null; });
    return abertas.length ? abertas[abertas.length - 1] : null;
  }

  function apontarProducao(maq, qtdTotal, qtdRefugo, qtdRetrabalho, causaRefugo) {
    var ordem = maq.ordemAtualId ? porId('ordens', maq.ordemAtualId) : null;

    /* Tentativa recusada também vai para a trilha. Um operador batendo
       repetidamente numa validação é sinal de processo mal desenhado ou de
       tentativa de forçar número — nos dois casos, é o tipo de coisa que a
       auditoria existe para revelar. */
    function recusar(motivo) {
      notificar(motivo, 'erro');
      auditar({
        acao: 'APONTAMENTO_RECUSADO',
        maquina: maq,
        descricao: maq.nome + ': apontamento recusado — ' + motivo,
        detalhes: { qtdTotal: qtdTotal, qtdRefugo: qtdRefugo, qtdRetrabalho: qtdRetrabalho, motivo: motivo }
      });
      salvar();
      return false;
    }

    if (!ordem) return recusar('Abra uma ordem de produção antes de apontar.');
    if (qtdTotal < 0 || qtdRefugo < 0 || qtdRetrabalho < 0) return recusar('Quantidades não podem ser negativas.');
    if (qtdRefugo > qtdTotal && qtdTotal > 0) return recusar('O refugo não pode ser maior que a quantidade produzida.');
    if (qtdTotal === 0 && qtdRefugo === 0 && qtdRetrabalho === 0) return recusar('Informe ao menos uma quantidade.');

    var ts = Date.now();
    ds.eventosProducao.push({
      id: Model.novoId('PRD'),
      maquinaId: maq.id,
      ordemId: ordem.id,
      turnoId: Model.turnoDoInstante(ds.turnos, ts).turnoId,
      produtoId: ordem.produtoId,
      operadorId: maq.operadorAtualId || ordem.operadorId,
      ts: ts,
      qtdTotal: qtdTotal,
      qtdRefugo: qtdRefugo,
      qtdRetrabalho: qtdRetrabalho,
      causaRefugo: causaRefugo || null,
      origem: 'MANUAL'
    });

    var acao = qtdRefugo > 0 ? 'REFUGO_APONTADO'
      : (qtdRetrabalho > 0 && qtdTotal === 0 ? 'RETRABALHO_APONTADO' : 'PRODUCAO_APONTADA');
    var partes = [];
    if (qtdTotal) partes.push(qtdTotal + ' produzidas');
    if (qtdRefugo) partes.push(qtdRefugo + ' de refugo' + (causaRefugo ? ' (' + causaRefugo + ')' : ''));
    if (qtdRetrabalho) partes.push(qtdRetrabalho + ' para retrabalho');

    auditar({
      acao: acao,
      maquina: maq,
      ts: ts,
      descricao: maq.nome + ' / ordem ' + ordem.codigo + ': ' + partes.join(', ') + '.',
      entidade: 'eventosProducao',
      entidadeId: ds.eventosProducao[ds.eventosProducao.length - 1].id,
      depois: { qtdTotal: qtdTotal, qtdRefugo: qtdRefugo, qtdRetrabalho: qtdRetrabalho, causaRefugo: causaRefugo || null },
      detalhes: { produto: nomeDe('produtos', ordem.produtoId), ordem: ordem.codigo }
    });

    salvar();
    return true;
  }

  /* ---------------------------------------------------------------------
   * Modal genérico
   * ------------------------------------------------------------------- */
  var modalAberto = false;

  function abrirModal(opcoes) {
    fecharModal();
    modalAberto = true;
    var fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.id = 'modal-fundo';
    fundo.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(opcoes.titulo) + '">' +
        '<header class="modal__cabecalho">' +
          '<h2>' + esc(opcoes.titulo) + '</h2>' +
          '<button type="button" class="botao-icone" data-acao="fechar-modal" aria-label="Fechar">\u2715</button>' +
        '</header>' +
        '<div class="modal__corpo" id="modal-corpo">' + (opcoes.conteudo || '') + '</div>' +
        '<footer class="modal__rodape" id="modal-rodape"></footer>' +
      '</div>';
    document.body.appendChild(fundo);

    var rodape = $('#modal-rodape');
    (opcoes.acoes || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao ' + (a.classe || 'botao--secundario');
      b.textContent = a.rotulo;
      b.addEventListener('click', function () { a.aoClicar(); });
      rodape.appendChild(b);
    });

    fundo.addEventListener('click', function (ev) { if (ev.target === fundo) fecharModal(); });
    if (opcoes.aoAbrir) opcoes.aoAbrir($('#modal-corpo'));
    var primeiro = $('#modal-corpo input, #modal-corpo select, #modal-corpo textarea, #modal-corpo button');
    if (primeiro) primeiro.focus();
  }

  function fecharModal() {
    var f = $('#modal-fundo');
    if (f) f.remove();
    modalAberto = false;
  }

  function confirmar(titulo, texto, aoConfirmar) {
    abrirModal({
      titulo: titulo,
      conteudo: '<p>' + esc(texto) + '</p>',
      acoes: [
        { rotulo: 'Cancelar', aoClicar: fecharModal },
        { rotulo: 'Confirmar', classe: 'botao--perigo', aoClicar: function () { fecharModal(); aoConfirmar(); } }
      ]
    });
  }

  /* ---------------------------------------------------------------------
   * Componentes reutilizáveis de HTML
   * ------------------------------------------------------------------- */

  function cardKPI(rotulo, valor, opcoes) {
    opcoes = opcoes || {};
    return '<article class="kpi ' + (opcoes.classe || '') + '">' +
      '<span class="kpi__rotulo">' + esc(rotulo) + '</span>' +
      '<strong class="kpi__valor">' + valor + '</strong>' +
      (opcoes.detalhe ? '<span class="kpi__detalhe">' + opcoes.detalhe + '</span>' : '') +
      '</article>';
  }

  function selo(estadoId) {
    var def = Model.ESTADOS[estadoId] || Model.ESTADOS.SEM_ORDEM;
    return '<span class="selo estado--' + estadoId + ' padrao--' + def.padrao + '">' +
      '<span aria-hidden="true">' + def.icone + '</span> ' + esc(def.rotulo) + '</span>';
  }

  function blocoGrafico(id, titulo, altura) {
    return '<section class="painel">' +
      '<h3 class="painel__titulo">' + esc(titulo) + '</h3>' +
      '<div class="grafico" id="' + id + '" style="height:' + (altura || 260) + 'px"></div>' +
      '</section>';
  }

  function tabela(cabecalhos, linhas, opcoes) {
    opcoes = opcoes || {};
    if (!linhas.length) return '<p class="vazio">' + esc(opcoes.vazio || 'Nenhum registro no período.') + '</p>';
    return '<div class="tabela-rolagem"><table class="tabela">' +
      '<thead><tr>' + cabecalhos.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + linhas.map(function (l) {
        return '<tr>' + l.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function barraProgresso(valor, meta, rotulo) {
    var pct = meta > 0 ? Math.min(1.5, valor / meta) : 0;
    var classe = pct >= 1 ? 'bom' : (pct >= 0.85 ? 'atencao' : 'critico');
    return '<div class="progresso" role="meter" aria-valuenow="' + Math.round(pct * 100) + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(rotulo || 'Progresso da meta') + '">' +
      '<div class="progresso__trilha"><div class="progresso__preenchimento faixa--' + classe + '" style="width:' + Math.min(100, pct * 100) + '%"></div></div>' +
      '<span class="progresso__texto">' + Calc.fmt.numero(valor) + ' / ' + Calc.fmt.numero(meta) + ' (' + Calc.fmt.percentual(meta > 0 ? valor / meta : null, 0) + ')</span>' +
      '</div>';
  }

  function opcoesSelect(lista, selecionado, campoTexto, vazio) {
    var html = vazio ? '<option value="">' + esc(vazio) + '</option>' : '';
    lista.forEach(function (i) {
      html += '<option value="' + esc(i.id) + '"' + (i.id === selecionado ? ' selected' : '') + '>' +
        esc(i[campoTexto || 'nome']) + '</option>';
    });
    return html;
  }

  /* ---------------------------------------------------------------------
   * Barra de filtros (telas de gestão)
   * ------------------------------------------------------------------- */
  /* `extras` recebe campos adicionais de telas específicas. A barra continua
     sendo um só componente: mesma aparência, mesma leitura, mesmo botão de
     limpar em todas as telas. */
  function barraFiltros(extras) {
    var f = prefs.filtros;
    var areas = ds.areas.filter(function (a) { return !f.plantaId || a.plantaId === f.plantaId; });
    var linhas = ds.linhas.filter(function (l) {
      if (f.areaId) return l.areaId === f.areaId;
      if (f.plantaId) { var a = porId('areas', l.areaId); return a && a.plantaId === f.plantaId; }
      return true;
    });
    var maquinas = ds.maquinas.filter(function (m) {
      if (f.linhaId) return m.linhaId === f.linhaId;
      return linhas.some(function (l) { return l.id === m.linhaId; });
    });
    var ordens = ds.ordens.slice(-60).reverse();

    return '<form class="filtros" id="form-filtros">' +
      '<div class="filtros__campo"><label for="f-periodo">Período</label>' +
        '<select id="f-periodo" name="periodo">' +
          ['turno:Turno atual', 'hoje:Hoje', '24h:Últimas 24 horas', '7d:Últimos 7 dias', '30d:Últimos 30 dias', 'personalizado:Personalizado']
            .map(function (o) {
              var p = o.split(':');
              return '<option value="' + p[0] + '"' + (f.periodo === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
            }).join('') +
        '</select></div>' +
      (f.periodo === 'personalizado'
        ? '<div class="filtros__campo"><label for="f-ini">De</label><input type="datetime-local" id="f-ini" name="dataInicio" value="' + esc(f.dataInicio) + '"></div>' +
          '<div class="filtros__campo"><label for="f-fim">Até</label><input type="datetime-local" id="f-fim" name="dataFim" value="' + esc(f.dataFim) + '"></div>'
        : '') +
      '<div class="filtros__campo"><label for="f-planta">Planta</label><select id="f-planta" name="plantaId">' + opcoesSelect(ds.plantas, f.plantaId, 'nome', 'Todas') + '</select></div>' +
      '<div class="filtros__campo"><label for="f-area">Área</label><select id="f-area" name="areaId">' + opcoesSelect(areas, f.areaId, 'nome', 'Todas') + '</select></div>' +
      '<div class="filtros__campo"><label for="f-linha">Linha</label><select id="f-linha" name="linhaId">' + opcoesSelect(linhas, f.linhaId, 'nome', 'Todas') + '</select></div>' +
      '<div class="filtros__campo"><label for="f-maquina">Máquina</label><select id="f-maquina" name="maquinaId">' + opcoesSelect(maquinas, f.maquinaId, 'nome', 'Todas') + '</select></div>' +
      '<div class="filtros__campo"><label for="f-produto">Produto</label><select id="f-produto" name="produtoId">' + opcoesSelect(ds.produtos, f.produtoId, 'nome', 'Todos') + '</select></div>' +
      '<div class="filtros__campo"><label for="f-ordem">Ordem</label><select id="f-ordem" name="ordemId">' + opcoesSelect(ordens, f.ordemId, 'codigo', 'Todas') + '</select></div>' +
      '<div class="filtros__campo"><label for="f-turno">Turno</label><select id="f-turno" name="turnoId">' + opcoesSelect(ds.turnos, f.turnoId, 'nome', 'Todos') + '</select></div>' +
      '<div class="filtros__campo"><label for="f-operador">Operador</label><select id="f-operador" name="operadorId">' + opcoesSelect(ds.operadores, f.operadorId, 'nome', 'Todos') + '</select></div>' +
      (extras || '') +
      '<div class="filtros__acoes">' +
        '<button type="button" class="botao botao--secundario" data-acao="limpar-filtros">Limpar</button>' +
      '</div>' +
      '</form>';
  }

  function lerFiltros() {
    var form = $('#form-filtros');
    if (!form) return;
    Object.keys(FILTROS_PADRAO).forEach(function (k) {
      var campo = form.elements[k];
      if (campo) prefs.filtros[k] = campo.value;
    });
    /* Consistência da hierarquia: trocar o pai limpa os filhos inválidos. */
    if (prefs.filtros.plantaId) {
      var area = porId('areas', prefs.filtros.areaId);
      if (area && area.plantaId !== prefs.filtros.plantaId) { prefs.filtros.areaId = ''; prefs.filtros.linhaId = ''; prefs.filtros.maquinaId = ''; }
    }
    salvarPrefs();
    renderizar();
  }

  /* =====================================================================
   * TELA DO OPERADOR
   * =================================================================== */
  function viewOperacao() {
    if (!ds.maquinas.length) return '<p class="vazio">Cadastre uma máquina para iniciar a operação.</p>';

    var maq = porId('maquinas', prefs.maquinaId) || ds.maquinas[0];
    prefs.maquinaId = maq.id;

    var caminho = caminhoDaMaquina(maq);
    var ordem = maq.ordemAtualId ? porId('ordens', maq.ordemAtualId) : null;
    var turno = Model.turnoDoInstante(ds.turnos, Date.now());
    var def = Model.ESTADOS[maq.estadoAtual];
    var classe = Calc.classeDoEstado(maq.estadoAtual, ds.config);
    var parada = paradaAberta(maq.id);

    /* Indicadores do turno corrente da máquina. */
    var ini = turno.inicio, fim = Date.now();
    var r = indicadoresDaMaquina(maq.id, ini, fim);
    var meta = ordem ? ordem.metaQtd : 0;
    var decorridoH = Math.max(0.001, (fim - ini) / HORA);
    var ritmo = r.producaoTotal / decorridoH;

    var produzindo = maq.estadoAtual === 'PRODUZINDO';
    var emSetup = maq.estadoAtual === 'SETUP';
    var parado = classe !== 'PRODUTIVO' && !emSetup;

    var html = '';

    /* Cabeçalho de contexto */
    html += '<section class="op-cabecalho">' +
      '<div class="op-cabecalho__maquina">' +
        '<label class="rotulo-campo" for="sel-maquina">Máquina</label>' +
        '<select id="sel-maquina" class="seletor-grande" data-acao="trocar-maquina">' +
          opcoesSelect(ds.maquinas, maq.id) +
        '</select>' +
        '<p class="op-cabecalho__caminho">' + esc(caminho.texto) + '</p>' +
      '</div>' +
      '<dl class="op-contexto">' +
        '<div><dt>Ordem</dt><dd>' + (ordem ? esc(ordem.codigo) : 'Sem ordem aberta') + '</dd></div>' +
        '<div><dt>Produto</dt><dd>' + (ordem ? esc(nomeDe('produtos', ordem.produtoId)) : '—') + '</dd></div>' +
        '<div><dt>Turno</dt><dd>' + esc(turno.nome) + '</dd></div>' +
        '<div><dt>Operador</dt><dd>' + esc(maq.operadorAtualId ? nomeDe('operadores', maq.operadorAtualId) : (ordem ? nomeDe('operadores', ordem.operadorId) : '—')) + '</dd></div>' +
      '</dl>' +
      '</section>';

    /* Faixa de estado — elemento de destaque da tela */
    html += '<section class="faixa-estado estado-fundo estado--' + maq.estadoAtual + ' padrao--' + def.padrao + '" aria-live="polite">' +
      '<div class="faixa-estado__conteudo">' +
        '<span class="faixa-estado__icone" aria-hidden="true">' + def.icone + '</span>' +
        '<div>' +
          '<p class="faixa-estado__rotulo">Estado atual</p>' +
          '<h2 class="faixa-estado__nome">' + esc(def.rotulo) + '</h2>' +
          (parada && parada.motivoId ? '<p class="faixa-estado__motivo">' + esc(nomeDe('motivos', parada.motivoId)) + (parada.comentario ? ' · ' + esc(parada.comentario) : '') + '</p>' : '') +
        '</div>' +
      '</div>' +
      '<div class="faixa-estado__tempo">' +
        '<span class="rotulo-campo">Há</span>' +
        '<strong id="cronometro-estado" class="cronometro">' + Calc.fmt.cronometro((Date.now() - maq.estadoDesde) / 1000) + '</strong>' +
        '<span class="faixa-estado__desde">desde ' + Calc.fmt.hora(maq.estadoDesde) + '</span>' +
      '</div>' +
      '</section>';

    /* Indicadores */
    html += '<section class="op-indicadores">' +
      cardKPI('OEE', Calc.fmt.percentual(r.oee), { classe: 'kpi--destaque faixa--' + Calc.faixaOEE(r.oee, ds.config.metaOEE), detalhe: 'Meta ' + Calc.fmt.percentual(ds.config.metaOEE, 0) }) +
      cardKPI('Disponibilidade', Calc.fmt.percentual(r.disponibilidade)) +
      cardKPI('Performance', Calc.fmt.percentual(r.performance)) +
      cardKPI('Qualidade', Calc.fmt.percentual(r.qualidade)) +
      '</section>';

    /* Produção e ritmo */
    html += '<section class="painel">' +
      '<h3 class="painel__titulo">Produção do turno</h3>' +
      '<div class="op-producao">' +
        cardKPI('Produzido', Calc.fmt.numero(r.producaoTotal)) +
        cardKPI('Aprovado', Calc.fmt.numero(r.producaoAprovada)) +
        cardKPI('Rejeitado', Calc.fmt.numero(r.refugo), { detalhe: r.producaoTotal ? Calc.fmt.percentual(r.refugo / r.producaoTotal) : '—' }) +
        cardKPI('Retrabalho', Calc.fmt.numero(r.retrabalho)) +
        cardKPI('Ritmo atual', Calc.fmt.numero(ritmo) + ' <small>pç/h</small>') +
        cardKPI('Ciclo ideal', (r.cicloIdealSeg ? r.cicloIdealSeg.toFixed(1).replace('.', ',') : '—') + ' <small>s</small>') +
        cardKPI('Ciclo real médio', (r.cicloRealSeg ? r.cicloRealSeg.toFixed(1).replace('.', ',') : '—') + ' <small>s</small>') +
      '</div>' +
      '<div class="op-meta"><span class="rotulo-campo">Meta do turno</span>' + barraProgresso(r.producaoTotal, meta, 'Meta do turno') + '</div>' +
      '</section>';

    /* Botões de ação */
    html += '<section class="painel">' +
      '<h3 class="painel__titulo">Apontamentos</h3>' +
      '<div class="acoes-operador">';

    if (!ordem) {
      html += botaoOp('abrir-ordem', '\u2295', 'Iniciar ordem', 'primario');
    } else {
      html += botaoOp('iniciar-producao', '\u25B6', 'Iniciar produção', 'primario', produzindo);
      html += botaoOp('pausar-producao', '\u23F8', 'Pausar produção', 'secundario', !produzindo);
      html += botaoOp('registrar-parada', '\u25A0', 'Registrar parada', 'alerta', parado);
      html += botaoOp('finalizar-parada', '\u2713', 'Finalizar parada', 'primario', !parado);
      html += botaoOp('alterar-motivo', '\u21BB', 'Alterar motivo', 'secundario', !parado);
      html += botaoOp('apontar-producao', '\u2795', 'Registrar produção', 'primario');
      html += botaoOp('apontar-refugo', '\u2716', 'Registrar refugo', 'alerta');
      html += botaoOp('apontar-retrabalho', '\u267B', 'Registrar retrabalho', 'secundario');
      html += botaoOp(emSetup ? 'finalizar-setup' : 'iniciar-setup', '\u21C4', emSetup ? 'Finalizar setup' : 'Iniciar setup', 'secundario');
      html += botaoOp('solicitar-manutencao', '\u2692', 'Solicitar manutenção', 'alerta');
      html += botaoOp('adicionar-observacao', '\u270E', 'Adicionar observação', 'secundario');
      html += botaoOp('finalizar-ordem', '\u23CF', 'Finalizar ordem', 'perigo');
    }
    html += '</div></section>';

    /* Linha do tempo do turno */
    html += '<section class="painel">' +
      '<h3 class="painel__titulo">Linha do tempo do turno</h3>' +
      '<div class="timeline" id="timeline-operador"></div>' +
      legendaEstados() +
      '</section>';

    /* Últimos eventos */
    var ultimos = ds.eventosEstado.filter(function (e) { return e.maquinaId === maq.id; }).slice(-8).reverse();
    html += '<section class="painel">' +
      '<h3 class="painel__titulo">Últimos eventos</h3>' +
      tabela(['Início', 'Estado', 'Motivo', 'Duração'], ultimos.map(function (e) {
        var fimE = e.fim || Date.now();
        return [Calc.fmt.hora(e.inicio), selo(e.estado),
          e.motivoId ? esc(nomeDe('motivos', e.motivoId)) : '—',
          Calc.fmt.duracao((fimE - e.inicio) / 1000)];
      })) +
      '</section>';

    return html;
  }

  function botaoOp(acao, icone, rotulo, tom, desabilitado) {
    return '<button type="button" class="botao-op botao-op--' + tom + '" data-acao="' + acao + '"' +
      (desabilitado ? ' disabled' : '') + '>' +
      '<span class="botao-op__icone" aria-hidden="true">' + icone + '</span>' +
      '<span class="botao-op__rotulo">' + esc(rotulo) + '</span></button>';
  }

  function legendaEstados() {
    return '<ul class="legenda">' + Model.ORDEM_ESTADOS.map(function (id) {
      var d = Model.ESTADOS[id];
      return '<li><span class="legenda__amostra estado-fundo estado--' + id + ' padrao--' + d.padrao + '"></span>' +
        '<span aria-hidden="true">' + d.icone + '</span> ' + esc(d.rotulo) + '</li>';
    }).join('') + '</ul>';
  }

  function depoisDeRenderizarOperacao() {
    var maq = porId('maquinas', prefs.maquinaId);
    if (!maq) return;
    var turno = Model.turnoDoInstante(ds.turnos, Date.now());
    var segmentos = ds.eventosEstado.filter(function (e) {
      return e.maquinaId === maq.id && (e.fim === null || e.fim > turno.inicio) && e.inicio < turno.fim;
    });
    Charts.desenharTimeline($('#timeline-operador'), segmentos, turno.inicio, Math.min(turno.fim, Date.now()), { marcas: 8 });
  }

  /* ---------------------------------------------------------------------
   * Modais do operador
   * ------------------------------------------------------------------- */

  /* Seleção hierárquica de motivos: categoria → motivo → comentário. */
  function modalMotivo(titulo, aoConfirmar, filtroCategoria, opcoesMotivo) {
    opcoesMotivo = opcoesMotivo || {};
    var categorias = [];
    ds.motivos.forEach(function (m) {
      if (filtroCategoria && m.categoria !== filtroCategoria) return;
      if (categorias.indexOf(m.categoria) < 0) categorias.push(m.categoria);
    });
    var selecionada = categorias[0];
    var motivoEscolhido = null;

    /* Sugestões do ACMP. Calculadas uma vez, na abertura do modal: recalcular
       a cada troca de aba mudaria a lista debaixo do dedo do operador. */
    var sugestoes = sugestoesACMP(opcoesMotivo);
    var sugestaoUsada = null;   // posição da sugestão aceita, se houver

    function blocoSugestoes() {
      if (!sugestoes.length) return '';
      return '<div class="acmp" role="group" aria-label="Sugestões de motivo">' +
        '<p class="acmp__titulo">Sugestões do ACMP ' +
          '<span class="acmp__nota">apoio à classificação — a decisão é sua</span></p>' +
        sugestoes.map(function (sg) {
          var m = porId('motivos', sg.motivoId);
          if (!m) return '';
          var evid = sg.evidencias.map(function (e) {
            return esc(e.rotulo + ': ' + Calc.fmt.percentual(e.proporcao, 0) +
              ' de ' + e.suporte + ' paradas');
          }).join(' &middot; ');
          return '<button type="button" class="acmp__opcao' +
              (motivoEscolhido === sg.motivoId ? ' acmp__opcao--ativa' : '') + '" ' +
              'data-sugestao="' + esc(sg.motivoId) + '" data-posicao="' + sg.posicao + '">' +
            '<span class="acmp__prob">' + esc(Calc.fmt.percentual(sg.probabilidade, 0)) + '</span>' +
            '<span class="acmp__nome">' + esc(m.nome) +
              '<small class="acmp__categoria">' + esc(m.categoria) + '</small></span>' +
            (evid ? '<span class="acmp__evidencia">' + evid + '</span>' : '') +
            '</button>';
        }).join('') +
        '</div>';
    }

    function corpo() {
      return '<div class="motivos">' +
        blocoSugestoes() +
        '<div class="motivos__categorias" role="group" aria-label="Categorias de motivo">' +
          categorias.map(function (c) {
            return '<button type="button" class="chip' + (c === selecionada ? ' chip--ativo' : '') + '" data-categoria="' + esc(c) + '">' + esc(c) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="motivos__lista" role="group" aria-label="Motivos">' +
          ds.motivos.filter(function (m) { return m.categoria === selecionada; }).map(function (m) {
            return '<button type="button" class="motivo' + (motivoEscolhido === m.id ? ' motivo--ativo' : '') + '" data-motivo="' + esc(m.id) + '">' +
              esc(m.nome) + (m.planejada ? '<span class="etiqueta">planejada</span>' : '') + '</button>';
          }).join('') +
        '</div>' +
        '<label class="rotulo-campo" for="motivo-comentario">Comentário (opcional)</label>' +
        '<textarea id="motivo-comentario" rows="2" placeholder="Ex.: aguardando eletricista"></textarea>' +
        '<p class="erro-campo" id="motivo-erro" hidden>Selecione um motivo para continuar.</p>' +
      '</div>';
    }

    function ligar(container) {
      $$('[data-categoria]', container).forEach(function (b) {
        b.addEventListener('click', function () {
          selecionada = b.getAttribute('data-categoria');
          motivoEscolhido = null;
          var comentario = $('#motivo-comentario').value;
          container.innerHTML = corpo();
          $('#motivo-comentario').value = comentario;
          ligar(container);
        });
      });
      $$('[data-motivo]', container).forEach(function (b) {
        b.addEventListener('click', function () {
          motivoEscolhido = b.getAttribute('data-motivo');
          /* Escolha manual invalida a atribuição à sugestão, mesmo que
             coincida com ela: aceitar por atalho e chegar ao mesmo motivo
             navegando pela árvore são comportamentos diferentes, e medir a
             taxa de aceitação exige distinguir os dois. */
          sugestaoUsada = null;
          $$('[data-motivo]', container).forEach(function (x) { x.classList.remove('motivo--ativo'); });
          $$('[data-sugestao]', container).forEach(function (x) { x.classList.remove('acmp__opcao--ativa'); });
          b.classList.add('motivo--ativo');
          $('#motivo-erro').hidden = true;
        });
      });
      $$('[data-sugestao]', container).forEach(function (b) {
        b.addEventListener('click', function () {
          motivoEscolhido = b.getAttribute('data-sugestao');
          sugestaoUsada = parseInt(b.getAttribute('data-posicao'), 10);
          $$('[data-sugestao]', container).forEach(function (x) { x.classList.remove('acmp__opcao--ativa'); });
          $$('[data-motivo]', container).forEach(function (x) { x.classList.remove('motivo--ativo'); });
          b.classList.add('acmp__opcao--ativa');
          $('#motivo-erro').hidden = true;
        });
      });
    }

    abrirModal({
      titulo: titulo,
      conteudo: corpo(),
      aoAbrir: ligar,
      acoes: [
        { rotulo: 'Cancelar', aoClicar: fecharModal },
        {
          rotulo: 'Confirmar', classe: 'botao--primario', aoClicar: function () {
            if (!motivoEscolhido) { $('#motivo-erro').hidden = false; return; }
            var comentario = $('#motivo-comentario').value.trim();
            registrarDesfechoACMP(sugestoes, motivoEscolhido, sugestaoUsada, opcoesMotivo);
            fecharModal();
            aoConfirmar(motivoEscolhido, comentario);
          }
        }
      ]
    });
  }

  /* Teclado numérico grande para apontamento por toque. */
  function modalQuantidade(opcoes) {
    var valor = opcoes.inicial || 0;

    function corpo() {
      return '<div class="quantidade">' +
        '<output class="quantidade__valor" id="qtd-valor">' + valor + '</output>' +
        '<div class="quantidade__atalhos">' +
          [1, 5, 10, 25, 50, 100].map(function (n) {
            return '<button type="button" class="botao botao--secundario" data-incremento="' + n + '">+' + n + '</button>';
          }).join('') +
          '<button type="button" class="botao botao--secundario" data-incremento="-1">−1</button>' +
          '<button type="button" class="botao botao--secundario" data-zerar="1">Zerar</button>' +
        '</div>' +
        '<label class="rotulo-campo" for="qtd-manual">Ou digite a quantidade</label>' +
        '<input type="number" id="qtd-manual" min="0" step="1" value="' + valor + '" inputmode="numeric">' +
        (opcoes.pedirCausa
          ? '<label class="rotulo-campo" for="qtd-causa">Causa</label><select id="qtd-causa">' +
            Model.CAUSAS_REFUGO.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>'
          : '') +
        '<p class="erro-campo" id="qtd-erro" hidden></p>' +
        '</div>';
    }

    abrirModal({
      titulo: opcoes.titulo,
      conteudo: corpo(),
      aoAbrir: function (container) {
        function atualizar() {
          $('#qtd-valor', container).textContent = valor;
          $('#qtd-manual', container).value = valor;
        }
        $$('[data-incremento]', container).forEach(function (b) {
          b.addEventListener('click', function () {
            valor = Math.max(0, valor + parseInt(b.getAttribute('data-incremento'), 10));
            atualizar();
          });
        });
        $('[data-zerar]', container).addEventListener('click', function () { valor = 0; atualizar(); });
        $('#qtd-manual', container).addEventListener('input', function (e) {
          valor = Math.max(0, parseInt(e.target.value, 10) || 0);
          $('#qtd-valor', container).textContent = valor;
        });
      },
      acoes: [
        { rotulo: 'Cancelar', aoClicar: fecharModal },
        {
          rotulo: 'Registrar', classe: 'botao--primario', aoClicar: function () {
            if (valor <= 0) {
              var e = $('#qtd-erro');
              e.textContent = 'Informe uma quantidade maior que zero.';
              e.hidden = false;
              return;
            }
            var causa = opcoes.pedirCausa ? $('#qtd-causa').value : null;
            fecharModal();
            opcoes.aoConfirmar(valor, causa);
          }
        }
      ]
    });
  }

  function modalNovaOrdem(maq) {
    var produtos = ds.produtos.filter(function (p) {
      return !maq.produtosHabilitados || maq.produtosHabilitados.indexOf(p.id) >= 0;
    });
    if (!produtos.length) produtos = ds.produtos;
    var turno = Model.turnoDoInstante(ds.turnos, Date.now());
    var operadores = ds.operadores.filter(function (o) { return o.turnoId === turno.turnoId; });
    if (!operadores.length) operadores = ds.operadores;
    var duracaoTurnoSeg = (turno.fim - turno.inicio) / 1000;
    var sugestao = Math.round(duracaoTurnoSeg * 0.85 / (produtos[0].cicloIdealSeg || 60));

    abrirModal({
      titulo: 'Iniciar ordem de produção',
      conteudo:
        '<div class="formulario">' +
          '<label for="o-codigo">Código da ordem</label><input id="o-codigo" value="OP-' + (100000 + ds.ordens.length + 1) + '">' +
          '<label for="o-produto">Produto</label><select id="o-produto">' + opcoesSelect(produtos, produtos[0].id) + '</select>' +
          '<label for="o-meta">Meta do turno (peças)</label><input id="o-meta" type="number" min="1" step="1" value="' + sugestao + '">' +
          '<label for="o-ciclo">Ciclo ideal (s/peça)</label><input id="o-ciclo" type="number" min="1" step="0.1" value="' + produtos[0].cicloIdealSeg + '">' +
          '<label for="o-operador">Operador</label><select id="o-operador">' + opcoesSelect(operadores, operadores[0].id) + '</select>' +
          '<p class="erro-campo" id="o-erro" hidden></p>' +
        '</div>',
      aoAbrir: function (c) {
        $('#o-produto', c).addEventListener('change', function (e) {
          var p = porId('produtos', e.target.value);
          if (p) {
            $('#o-ciclo', c).value = p.cicloIdealSeg;
            $('#o-meta', c).value = Math.round(duracaoTurnoSeg * 0.85 / p.cicloIdealSeg);
          }
        });
      },
      acoes: [
        { rotulo: 'Cancelar', aoClicar: fecharModal },
        {
          rotulo: 'Iniciar ordem', classe: 'botao--primario', aoClicar: function () {
            var codigo = $('#o-codigo').value.trim();
            var produtoId = $('#o-produto').value;
            var meta = parseInt($('#o-meta').value, 10);
            var ciclo = parseFloat($('#o-ciclo').value);
            var erro = $('#o-erro');

            if (!codigo) { erro.textContent = 'Informe o código da ordem.'; erro.hidden = false; return; }
            if (ds.ordens.some(function (o) { return o.codigo === codigo && o.status !== 'FINALIZADA'; })) {
              erro.textContent = 'Já existe uma ordem aberta com este código.'; erro.hidden = false; return;
            }
            if (!meta || meta <= 0) { erro.textContent = 'A meta deve ser maior que zero.'; erro.hidden = false; return; }
            if (!ciclo || ciclo <= 0) { erro.textContent = 'O ciclo ideal deve ser maior que zero.'; erro.hidden = false; return; }

            var ordem = {
              id: Model.novoId('ORD'),
              codigo: codigo,
              maquinaId: maq.id,
              produtoId: produtoId,
              turnoId: turno.turnoId,
              operadorId: $('#o-operador').value,
              cicloIdealSeg: ciclo,
              metaQtd: meta,
              inicio: Date.now(),
              fim: null,
              status: 'EM_ANDAMENTO'
            };
            ds.ordens.push(ordem);
            var cicloAnterior = maq.cicloIdealSeg;
            maq.ordemAtualId = ordem.id;
            maq.produtoAtualId = produtoId;
            maq.cicloIdealSeg = ciclo;
            maq.metaTurno = meta;
            maq.operadorAtualId = ordem.operadorId;

            auditar({
              acao: 'ORDEM_ABERTA',
              maquina: maq,
              ordemId: ordem.id,
              descricao: 'Ordem ' + codigo + ' aberta em ' + maq.nome + ' (' + nomeDe('produtos', produtoId) + ').',
              entidade: 'ordens',
              entidadeId: ordem.id,
              depois: {
                codigo: codigo, produto: nomeDe('produtos', produtoId),
                metaQtd: meta, cicloIdealSeg: ciclo,
                operador: nomeDe('operadores', ordem.operadorId)
              },
              /* O ciclo ideal informado na abertura define a Performance da
                 ordem inteira; guardar o valor anterior da máquina permite
                 explicar um salto de indicador. */
              detalhes: { cicloIdealAnteriorDaMaquina: cicloAnterior }
            });

            fecharModal();
            mudarEstado(maq, 'SETUP', 'MOT-10', 'Preparação da ordem ' + codigo, { acao: 'SETUP_INICIADO' });
            notificar('Ordem ' + codigo + ' iniciada em setup.', 'ok');
            renderizar();
          }
        }
      ]
    });
  }

  /* Executa as ações dos botões da tela do operador. */
  function acaoOperador(acao) {
    var maq = porId('maquinas', prefs.maquinaId);
    if (!maq) return;

    switch (acao) {
      case 'abrir-ordem':
        modalNovaOrdem(maq);
        break;

      case 'iniciar-producao':
        mudarEstado(maq, 'PRODUZINDO', null, '');
        notificar('Produção iniciada.', 'ok');
        renderizar();
        break;

      case 'pausar-producao':
        modalMotivo('Motivo da pausa', function (motivoId, comentario) {
          var motivo = porId('motivos', motivoId);
          mudarEstado(maq, motivo.estadoSugerido || 'PARADA_NAO_PLANEJADA', motivoId, comentario);
          notificar('Produção pausada.', 'ok');
          renderizar();
        }, null, { maquina: maq, acmp: true });
        break;

      case 'registrar-parada':
        modalMotivo('Registrar parada', function (motivoId, comentario) {
          var motivo = porId('motivos', motivoId);
          mudarEstado(maq, motivo.estadoSugerido || 'PARADA_NAO_PLANEJADA', motivoId, comentario);
          notificar('Parada registrada: ' + motivo.nome, 'ok');
          renderizar();
        }, null, { maquina: maq, acmp: true });
        break;

      case 'finalizar-parada':
        mudarEstado(maq, 'PRODUZINDO', null, '');
        notificar('Parada finalizada. Produção retomada.', 'ok');
        renderizar();
        break;

      case 'alterar-motivo': {
        var aberta = paradaAberta(maq.id);
        if (!aberta) { notificar('Não há parada em andamento para alterar.', 'erro'); return; }
        modalMotivo('Alterar motivo da parada', function (motivoId, comentario) {
          var motivo = porId('motivos', motivoId);
          var motivoAnterior = aberta.motivoId ? porId('motivos', aberta.motivoId) : null;
          var antes = {
            motivo: motivoAnterior ? motivoAnterior.nome : null,
            categoria: aberta.categoria,
            planejada: aberta.planejada,
            comentario: aberta.comentario || null
          };

          aberta.motivoId = motivoId;
          aberta.categoria = motivo.categoria;
          if (comentario) aberta.comentario = comentario;
          /* Mantém o evento de estado coerente com o novo motivo. */
          var evAberto = ds.eventosEstado.filter(function (e) { return e.maquinaId === maq.id && e.fim === null; })[0];
          if (evAberto) evAberto.motivoId = motivoId;

          /* Reclassificar uma parada muda a Disponibilidade já apurada do
             turno. É a alteração de maior impacto que o operador pode fazer
             e a que mais precisa ficar rastreável. */
          auditar({
            acao: 'MOTIVO_RECLASSIFICADO',
            maquina: maq,
            descricao: maq.nome + ': motivo da parada em curso alterado de ' +
              (antes.motivo || 'sem motivo') + ' para ' + motivo.nome + '.',
            entidade: 'eventosParada',
            entidadeId: aberta.id,
            antes: antes,
            depois: { motivo: motivo.nome, categoria: motivo.categoria, planejada: aberta.planejada, comentario: aberta.comentario || null },
            detalhes: { paradaIniciadaEm: aberta.inicio, impacto: 'Altera a classificação do tempo parado já registrado.' }
          });
          salvar();
          notificar('Motivo atualizado para ' + motivo.nome + '.', 'ok');
          renderizar();
        }, null, { maquina: maq, acmp: true,
          duracaoSeg: Math.round((Date.now() - aberta.inicio) / 1000) });
        break;
      }

      case 'apontar-producao':
        modalQuantidade({
          titulo: 'Registrar produção',
          inicial: 0,
          aoConfirmar: function (qtd) {
            if (apontarProducao(maq, qtd, 0, 0, null)) {
              notificar(qtd + ' peças registradas.', 'ok');
              renderizar();
            }
          }
        });
        break;

      case 'apontar-refugo':
        modalQuantidade({
          titulo: 'Registrar refugo',
          inicial: 0,
          pedirCausa: true,
          aoConfirmar: function (qtd, causa) {
            /* Refugo é lançado como produção já contabilizada como rejeito. */
            if (apontarProducao(maq, qtd, qtd, 0, causa)) {
              notificar(qtd + ' peças de refugo registradas.', 'alerta');
              renderizar();
            }
          }
        });
        break;

      case 'apontar-retrabalho':
        modalQuantidade({
          titulo: 'Registrar retrabalho',
          inicial: 0,
          aoConfirmar: function (qtd) {
            if (apontarProducao(maq, 0, 0, qtd, null)) {
              notificar(qtd + ' peças enviadas para retrabalho.', 'ok');
              renderizar();
            }
          }
        });
        break;

      case 'iniciar-setup':
        mudarEstado(maq, 'SETUP', 'MOT-10', '', { acao: 'SETUP_INICIADO' });
        notificar('Setup iniciado.', 'ok');
        renderizar();
        break;

      case 'finalizar-setup':
        mudarEstado(maq, 'PRODUZINDO', null, '',
          maq.estadoAtual === 'SETUP' ? { acao: 'SETUP_FINALIZADO' } : null);
        notificar('Setup finalizado.', 'ok');
        renderizar();
        break;

      case 'solicitar-manutencao':
        modalMotivo('Solicitar manutenção', function (motivoId, comentario) {
          mudarEstado(maq, 'MANUTENCAO', motivoId, comentario, { acao: 'MANUTENCAO_SOLICITADA' });
          notificar('Manutenção solicitada. A máquina ficou em estado de manutenção.', 'alerta');
          renderizar();
        }, 'Máquina', { maquina: maq });   /* sem acmp: não é classificação de parada */
        break;

      case 'adicionar-observacao':
        abrirModal({
          titulo: 'Adicionar observação',
          conteudo: '<div class="formulario"><label for="obs-texto">Observação</label>' +
            '<textarea id="obs-texto" rows="4" placeholder="Registro livre para o supervisor"></textarea>' +
            '<p class="erro-campo" id="obs-erro" hidden>Escreva a observação antes de salvar.</p></div>',
          acoes: [
            { rotulo: 'Cancelar', aoClicar: fecharModal },
            {
              rotulo: 'Salvar', classe: 'botao--primario', aoClicar: function () {
                var texto = $('#obs-texto').value.trim();
                if (!texto) { $('#obs-erro').hidden = false; return; }
                var obs = {
                  id: Model.novoId('OBS'),
                  maquinaId: maq.id,
                  ordemId: maq.ordemAtualId,
                  ts: Date.now(),
                  texto: texto,
                  autorId: maq.operadorAtualId
                };
                ds.observacoes.push(obs);
                auditar({
                  acao: 'OBSERVACAO_REGISTRADA',
                  maquina: maq,
                  descricao: maq.nome + ': observação registrada.',
                  entidade: 'observacoes',
                  entidadeId: obs.id,
                  depois: { texto: texto }
                });
                salvar();
                fecharModal();
                notificar('Observação registrada.', 'ok');
                renderizar();
              }
            }
          ]
        });
        break;

      case 'finalizar-ordem': {
        var ordemAtual = porId('ordens', maq.ordemAtualId);
        if (!ordemAtual) return;
        confirmar('Finalizar ordem', 'A ordem ' + ordemAtual.codigo + ' será encerrada e a máquina ficará sem ordem de produção. Deseja continuar?', function () {
          var apurado = Calc.calcularOEE({
            eventosEstado: ds.eventosEstado.filter(function (e) { return e.ordemId === ordemAtual.id; }),
            eventosProducao: ds.eventosProducao.filter(function (e) { return e.ordemId === ordemAtual.id; }),
            inicio: ordemAtual.inicio,
            fim: Date.now(),
            cicloIdealSeg: ordemAtual.cicloIdealSeg,
            config: ds.config
          });

          ordemAtual.status = 'FINALIZADA';
          ordemAtual.fim = Date.now();

          auditar({
            acao: 'ORDEM_FINALIZADA',
            maquina: maq,
            ordemId: ordemAtual.id,
            descricao: 'Ordem ' + ordemAtual.codigo + ' finalizada em ' + maq.nome + '.',
            entidade: 'ordens',
            entidadeId: ordemAtual.id,
            antes: { status: 'EM_ANDAMENTO', fim: null },
            depois: { status: 'FINALIZADA', fim: ordemAtual.fim },
            /* Congela o resultado apurado no encerramento: se alguém
               reclassificar eventos depois, dá para comparar. */
            detalhes: {
              produzido: apurado.producaoTotal,
              aprovado: apurado.producaoAprovada,
              refugo: apurado.refugo,
              metaQtd: ordemAtual.metaQtd,
              oeeNoEncerramento: apurado.oee
            }
          });

          maq.ordemAtualId = null;
          mudarEstado(maq, 'SEM_ORDEM', null, '');
          notificar('Ordem ' + ordemAtual.codigo + ' finalizada.', 'ok');
          renderizar();
        });
        break;
      }
    }
  }

  /* =====================================================================
   * TELAS DE GESTÃO
   * =================================================================== */

  function viewVisaoGeral() {
    var ctx = contexto();
    var r = indicadoresDoContexto(ctx);

    var html = barraFiltros();

    html += '<section class="kpis">' +
      cardKPI('OEE', Calc.fmt.percentual(r.oee), { classe: 'kpi--destaque faixa--' + Calc.faixaOEE(r.oee, ds.config.metaOEE), detalhe: 'Meta ' + Calc.fmt.percentual(ds.config.metaOEE, 0) }) +
      cardKPI('Disponibilidade', Calc.fmt.percentual(r.disponibilidade)) +
      cardKPI('Performance', Calc.fmt.percentual(r.performance)) +
      cardKPI('Qualidade', Calc.fmt.percentual(r.qualidade)) +
      cardKPI('Produção total', Calc.fmt.numero(r.producaoTotal)) +
      cardKPI('Produção aprovada', Calc.fmt.numero(r.producaoAprovada)) +
      cardKPI('Rejeitos', Calc.fmt.numero(r.refugo)) +
      cardKPI('Tempo produtivo', Calc.fmt.duracao(r.tempoOperacionalSeg)) +
      cardKPI('Tempo parado', Calc.fmt.duracao(r.paradaNaoPlanejadaSeg + r.paradaPlanejadaSeg), { detalhe: 'Não planejado: ' + Calc.fmt.duracao(r.paradaNaoPlanejadaSeg) }) +
      cardKPI('Quantidade de paradas', Calc.fmt.numero(r.qtdParadas)) +
      cardKPI('MTBF', Calc.fmt.duracao(r.mtbfSeg)) +
      cardKPI('MTTR', Calc.fmt.duracao(r.mttrSeg)) +
      '</section>';

    if (r.anomalias.length) {
      html += '<div class="alerta-inconsistencia" role="alert"><strong>Verificar apontamentos.</strong> ' +
        r.anomalias.map(function (a) { return esc(a.mensagem); }).join(' ') + '</div>';
    }

    html += '<div class="grade-2">' +
      blocoGrafico('g-tendencia', 'Tendência do OEE — ' + ctx.rotuloPeriodo) +
      blocoGrafico('g-oee-maquina', 'OEE por máquina') +
      '</div>';

    /* Painel de estado das máquinas, no estilo Andon. */
    html += '<section class="painel"><h3 class="painel__titulo">Estado das máquinas agora</h3><div class="andon">';
    ctx.maquinas.forEach(function (m) {
      var ind = indicadoresDaMaquina(m.id, ctx.inicio, ctx.fim);
      var def = Model.ESTADOS[m.estadoAtual];
      html += '<button type="button" class="andon__card estado-borda estado--' + m.estadoAtual + '" data-acao="abrir-maquina" data-id="' + m.id + '">' +
        '<span class="andon__nome">' + esc(m.nome) + '</span>' +
        '<span class="andon__estado padrao--' + def.padrao + ' estado-fundo estado--' + m.estadoAtual + '">' + def.icone + ' ' + esc(def.rotulo) + '</span>' +
        '<span class="andon__tempo">' + Calc.fmt.duracao((Date.now() - m.estadoDesde) / 1000) + '</span>' +
        '<span class="andon__oee faixa--' + Calc.faixaOEE(ind.oee, ds.config.metaOEE) + '">OEE ' + Calc.fmt.percentual(ind.oee, 0) + '</span>' +
        '</button>';
    });
    html += '</div></section>';

    return html;
  }

  function depoisVisaoGeral() {
    var ctx = contexto();
    var duracao = ctx.fim - ctx.inicio;
    var bucket = duracao > 3 * 24 * HORA ? 24 * HORA : (duracao > 12 * HORA ? 2 * HORA : HORA);
    var serie = Calc.serieOEE(ds, ctx.ids, ctx.inicio, ctx.fim, bucket);

    Charts.desenhar($('#g-tendencia'), {
      tipo: 'linha',
      rotulos: serie.map(function (p) { return bucket >= 24 * HORA ? new Date(p.inicio).toLocaleDateString('pt-BR') : Calc.fmt.hora(p.inicio); }),
      series: [
        { nome: 'OEE', valores: serie.map(function (p) { return p.indicadores.oee; }), tipo: 'linha', cor: '#D97B29' },
        { nome: 'Disponibilidade', valores: serie.map(function (p) { return p.indicadores.disponibilidade; }), tipo: 'linha', cor: '#9FB6BC' },
        { nome: 'Performance', valores: serie.map(function (p) { return p.indicadores.performance; }), tipo: 'linha', cor: '#6FA383' },
        { nome: 'Qualidade', valores: serie.map(function (p) { return p.indicadores.qualidade; }), tipo: 'linha', cor: '#6E9FB5' }
      ],
      opcoes: { percentual: true }
    });

    var porMaquina = Calc.oeePorGrupo(ds, ctx.maquinas, ctx.inicio, ctx.fim,
      function (m) { return m.id; }, function (k) { return nomeDe('maquinas', k); })
      .sort(function (a, b) { return (b.indicadores.oee || 0) - (a.indicadores.oee || 0); });

    Charts.desenhar($('#g-oee-maquina'), {
      tipo: 'barra',
      rotulos: porMaquina.map(function (g) { return g.rotulo; }),
      series: [{
        nome: 'OEE',
        valores: porMaquina.map(function (g) { return g.indicadores.oee; }),
        cores: porMaquina.map(function (g) {
          var f = Calc.faixaOEE(g.indicadores.oee, ds.config.metaOEE);
          return f === 'bom' ? '#6FA383' : (f === 'atencao' ? '#D97B29' : '#DC6C57');
        })
      }],
      opcoes: { percentual: true }
    });
  }

  function viewMaquinas() {
    var ctx = contexto();
    var html = barraFiltros();
    var linhas = ctx.maquinas.map(function (m) {
      var r = indicadoresDaMaquina(m.id, ctx.inicio, ctx.fim);
      var c = caminhoDaMaquina(m);
      return [
        '<button type="button" class="link" data-acao="abrir-maquina" data-id="' + m.id + '">' + esc(m.nome) + '</button>',
        esc(c.texto),
        selo(m.estadoAtual),
        '<span class="faixa--' + Calc.faixaOEE(r.oee, ds.config.metaOEE) + '">' + Calc.fmt.percentual(r.oee) + '</span>',
        Calc.fmt.percentual(r.disponibilidade),
        Calc.fmt.percentual(r.performance),
        Calc.fmt.percentual(r.qualidade),
        Calc.fmt.numero(r.producaoTotal),
        Calc.fmt.numero(r.refugo),
        Calc.fmt.duracao(r.paradaNaoPlanejadaSeg),
        Calc.fmt.numero(r.qtdParadas)
      ];
    });

    html += '<section class="painel"><h3 class="painel__titulo">Máquinas — ' + esc(ctx.rotuloPeriodo) + '</h3>' +
      tabela(['Máquina', 'Hierarquia', 'Estado', 'OEE', 'Disp.', 'Perf.', 'Qual.', 'Produção', 'Refugo', 'Parada não planejada', 'Paradas'], linhas) +
      '</section>';

    html += blocoGrafico('g-maquinas-dpq', 'Disponibilidade, Performance e Qualidade por máquina', 320);
    return html;
  }

  function depoisMaquinas() {
    var ctx = contexto();
    var grupos = Calc.oeePorGrupo(ds, ctx.maquinas, ctx.inicio, ctx.fim,
      function (m) { return m.id; }, function (k) { return nomeDe('maquinas', k); });

    Charts.desenhar($('#g-maquinas-dpq'), {
      tipo: 'barra',
      rotulos: grupos.map(function (g) { return g.rotulo; }),
      series: [
        { nome: 'Disponibilidade', valores: grupos.map(function (g) { return g.indicadores.disponibilidade; }), cor: '#9FB6BC' },
        { nome: 'Performance', valores: grupos.map(function (g) { return g.indicadores.performance; }), cor: '#6FA383' },
        { nome: 'Qualidade', valores: grupos.map(function (g) { return g.indicadores.qualidade; }), cor: '#6E9FB5' }
      ],
      opcoes: { percentual: true }
    });
  }

  function viewProducao() {
    var ctx = contexto();
    var r = indicadoresDoContexto(ctx);
    var html = barraFiltros();

    html += '<section class="kpis">' +
      cardKPI('Produção total', Calc.fmt.numero(r.producaoTotal)) +
      cardKPI('Aprovada', Calc.fmt.numero(r.producaoAprovada)) +
      cardKPI('Refugo', Calc.fmt.numero(r.refugo)) +
      cardKPI('Retrabalho', Calc.fmt.numero(r.retrabalho)) +
      cardKPI('Ciclo ideal médio', (r.cicloIdealSeg ? r.cicloIdealSeg.toFixed(1).replace('.', ',') : '—') + ' <small>s</small>') +
      cardKPI('Ciclo real médio', (r.cicloRealSeg ? r.cicloRealSeg.toFixed(1).replace('.', ',') : '—') + ' <small>s</small>') +
      '</section>';

    html += '<div class="grade-2">' +
      blocoGrafico('g-prod-hora', 'Produção por período') +
      blocoGrafico('g-prod-meta', 'Produção realizada versus meta por ordem') +
      '</div>';

    var ordens = ds.ordens.filter(function (o) {
      return ctx.ids.indexOf(o.maquinaId) >= 0 && o.inicio < ctx.fim && (o.fim === null || o.fim > ctx.inicio);
    }).sort(function (a, b) { return b.inicio - a.inicio; }).slice(0, 40);

    html += '<section class="painel"><h3 class="painel__titulo">Ordens no período</h3>' +
      tabela(['Ordem', 'Máquina', 'Produto', 'Turno', 'Início', 'Status', 'Meta', 'Produzido', 'Atingimento'],
        ordens.map(function (o) {
          var prod = ds.eventosProducao.filter(function (e) { return e.ordemId === o.id; });
          var total = prod.reduce(function (a, e) { return a + e.qtdTotal; }, 0);
          return [esc(o.codigo), esc(nomeDe('maquinas', o.maquinaId)), esc(nomeDe('produtos', o.produtoId)),
            esc(nomeDe('turnos', o.turnoId)), Calc.fmt.dataHora(o.inicio),
            '<span class="etiqueta">' + esc(o.status === 'EM_ANDAMENTO' ? 'Em andamento' : 'Finalizada') + '</span>',
            Calc.fmt.numero(o.metaQtd), Calc.fmt.numero(total),
            Calc.fmt.percentual(o.metaQtd ? total / o.metaQtd : null, 0)];
        })) +
      '</section>';

    return html;
  }

  function depoisProducao() {
    var ctx = contexto();
    var duracao = ctx.fim - ctx.inicio;
    var bucket = duracao > 3 * 24 * HORA ? 24 * HORA : HORA;
    var buckets = Calc.producaoPorBucket(ctx.eventosProducao, ctx.inicio, ctx.fim, bucket);

    Charts.desenhar($('#g-prod-hora'), {
      tipo: 'barra',
      rotulos: buckets.map(function (b) { return bucket >= 24 * HORA ? new Date(b.inicio).toLocaleDateString('pt-BR') : Calc.fmt.hora(b.inicio); }),
      series: [
        { nome: 'Aprovada', valores: buckets.map(function (b) { return b.aprovada; }), cor: '#6FA383' },
        { nome: 'Refugo', valores: buckets.map(function (b) { return b.refugo; }), cor: '#DC6C57' }
      ],
      opcoes: { empilhado: true }
    });

    var ordens = ds.ordens.filter(function (o) {
      return ctx.ids.indexOf(o.maquinaId) >= 0 && o.inicio < ctx.fim && (o.fim === null || o.fim > ctx.inicio);
    }).sort(function (a, b) { return b.inicio - a.inicio; }).slice(0, 12).reverse();

    Charts.desenhar($('#g-prod-meta'), {
      tipo: 'barra',
      rotulos: ordens.map(function (o) { return o.codigo; }),
      series: [
        {
          nome: 'Realizado',
          valores: ordens.map(function (o) {
            return ds.eventosProducao.filter(function (e) { return e.ordemId === o.id; })
              .reduce(function (a, e) { return a + e.qtdTotal; }, 0);
          }),
          cor: '#9FB6BC'
        },
        { nome: 'Meta', valores: ordens.map(function (o) { return o.metaQtd; }), tipo: 'linha', cor: '#D97B29' }
      ]
    });
  }

  function viewParadas() {
    var ctx = contexto();
    var r = indicadoresDoContexto(ctx);
    var html = barraFiltros();

    html += '<section class="kpis">' +
      cardKPI('Tempo parado total', Calc.fmt.duracao(r.paradaNaoPlanejadaSeg + r.paradaPlanejadaSeg)) +
      cardKPI('Não planejado', Calc.fmt.duracao(r.paradaNaoPlanejadaSeg)) +
      cardKPI('Planejado', Calc.fmt.duracao(r.paradaPlanejadaSeg)) +
      cardKPI('Ocorrências', Calc.fmt.numero(r.qtdParadas)) +
      cardKPI('MTBF', Calc.fmt.duracao(r.mtbfSeg)) +
      cardKPI('MTTR', Calc.fmt.duracao(r.mttrSeg)) +
      '</section>';

    html += '<div class="grade-2">' +
      blocoGrafico('g-pareto-motivo', 'Pareto de motivos de parada', 320) +
      blocoGrafico('g-pareto-tempo', 'Pareto de tempo perdido por categoria', 320) +
      '</div>';

    html += '<div class="grade-2">' +
      blocoGrafico('g-perdas-categoria', 'Distribuição das perdas por categoria') +
      '<section class="painel"><h3 class="painel__titulo">Timeline de estados</h3>' +
        '<div id="timelines-maquinas"></div>' + legendaEstados() + '</section>' +
      '</div>';

    var paradas = ctx.eventosParada.filter(function (e) {
      return Calc.sobreposicaoMs(e.inicio, e.fim, ctx.inicio, ctx.fim) > 0;
    }).sort(function (a, b) { return b.inicio - a.inicio; }).slice(0, 60);

    html += '<section class="painel"><h3 class="painel__titulo">Registros de parada</h3>' +
      tabela(['Início', 'Máquina', 'Estado', 'Categoria', 'Motivo', 'Duração', 'Tipo', 'Comentário'],
        paradas.map(function (e) {
          return [Calc.fmt.dataHora(e.inicio), esc(nomeDe('maquinas', e.maquinaId)), selo(e.estado),
            esc(e.categoria), esc(e.motivoId ? nomeDe('motivos', e.motivoId) : '—'),
            Calc.fmt.duracao(e.fim ? e.duracaoSeg : (Date.now() - e.inicio) / 1000),
            e.planejada ? 'Planejada' : 'Não planejada', esc(e.comentario || '')];
        })) +
      '</section>';

    return html;
  }

  function depoisParadas() {
    var ctx = contexto();
    var naoPlanejadas = ctx.eventosParada.filter(function (e) { return !e.planejada; });

    var pMotivo = Calc.pareto(naoPlanejadas, ctx.inicio, ctx.fim, 'motivoId', function (k) {
      var m = porId('motivos', k);
      return m ? m.nome : 'Não classificado';
    });
    var top = pMotivo.itens.slice(0, 10);

    Charts.desenhar($('#g-pareto-motivo'), {
      tipo: 'barra',
      rotulos: top.map(function (i) { return i.rotulo; }),
      series: [
        { nome: 'Tempo perdido', valores: top.map(function (i) { return i.tempoSeg; }), cor: '#DC6C57' },
        { nome: '% acumulado', valores: top.map(function (i) { return i.acumulado; }), tipo: 'linha', cor: '#D97B29', eixo: 'y2' }
      ],
      opcoes: { duracao: true }
    });

    var pCategoria = Calc.pareto(naoPlanejadas, ctx.inicio, ctx.fim, 'categoria');
    Charts.desenhar($('#g-pareto-tempo'), {
      tipo: 'barraHorizontal',
      rotulos: pCategoria.itens.map(function (i) { return i.rotulo; }),
      series: [{ nome: 'Tempo perdido', valores: pCategoria.itens.map(function (i) { return i.tempoSeg; }), cor: '#9FB6BC' }],
      opcoes: { duracao: true }
    });

    Charts.desenhar($('#g-perdas-categoria'), {
      tipo: 'rosca',
      rotulos: pCategoria.itens.map(function (i) { return i.rotulo; }),
      series: [{ nome: 'Tempo perdido', valores: pCategoria.itens.map(function (i) { return i.tempoSeg; }) }],
      opcoes: { duracao: true }
    });

    /* Timelines por máquina (limitadas a 6 para não poluir a tela). */
    var alvo = $('#timelines-maquinas');
    if (alvo) {
      alvo.innerHTML = '';
      ctx.maquinas.slice(0, 6).forEach(function (m) {
        var bloco = document.createElement('div');
        bloco.className = 'timeline-linha';
        bloco.innerHTML = '<span class="timeline-linha__rotulo">' + esc(m.nome) + '</span><div class="timeline"></div>';
        alvo.appendChild(bloco);
        var segs = ds.eventosEstado.filter(function (e) {
          return e.maquinaId === m.id && (e.fim === null || e.fim > ctx.inicio) && e.inicio < ctx.fim;
        });
        Charts.desenharTimeline($('.timeline', bloco), segs, ctx.inicio, ctx.fim, { marcas: 6 });
      });
    }
  }

  function viewQualidade() {
    var ctx = contexto();
    var r = indicadoresDoContexto(ctx);
    var html = barraFiltros();

    var taxa = r.producaoTotal ? r.refugo / r.producaoTotal : null;
    html += '<section class="kpis">' +
      cardKPI('Qualidade', Calc.fmt.percentual(r.qualidade), { classe: 'kpi--destaque' }) +
      cardKPI('Produção total', Calc.fmt.numero(r.producaoTotal)) +
      cardKPI('Aprovada', Calc.fmt.numero(r.producaoAprovada)) +
      cardKPI('Refugo', Calc.fmt.numero(r.refugo), { detalhe: 'Taxa ' + Calc.fmt.percentual(taxa) }) +
      cardKPI('Retrabalho', Calc.fmt.numero(r.retrabalho)) +
      cardKPI('Meta de refugo', Calc.fmt.percentual(ds.config.metaRefugoPct, 1)) +
      '</section>';

    html += '<div class="grade-2">' +
      blocoGrafico('g-refugo-periodo', 'Rejeitos por período') +
      blocoGrafico('g-causas-refugo', 'Principais causas de perda de qualidade', 300) +
      '</div>';

    html += blocoGrafico('g-qualidade-maquina', 'Taxa de refugo por máquina', 280);
    return html;
  }

  function depoisQualidade() {
    var ctx = contexto();
    var duracao = ctx.fim - ctx.inicio;
    var bucket = duracao > 3 * 24 * HORA ? 24 * HORA : HORA;
    var buckets = Calc.producaoPorBucket(ctx.eventosProducao, ctx.inicio, ctx.fim, bucket);

    Charts.desenhar($('#g-refugo-periodo'), {
      tipo: 'barra',
      rotulos: buckets.map(function (b) { return bucket >= 24 * HORA ? new Date(b.inicio).toLocaleDateString('pt-BR') : Calc.fmt.hora(b.inicio); }),
      series: [{ nome: 'Refugo', valores: buckets.map(function (b) { return b.refugo; }), cor: '#DC6C57' }]
    });

    var causas = {};
    ctx.eventosProducao.forEach(function (e) {
      if (!e.qtdRefugo || !e.causaRefugo) return;
      causas[e.causaRefugo] = (causas[e.causaRefugo] || 0) + e.qtdRefugo;
    });
    var lista = Object.keys(causas).map(function (k) { return { rotulo: k, valor: causas[k] }; })
      .sort(function (a, b) { return b.valor - a.valor; });

    Charts.desenhar($('#g-causas-refugo'), {
      tipo: 'barraHorizontal',
      rotulos: lista.map(function (i) { return i.rotulo; }),
      series: [{ nome: 'Peças refugadas', valores: lista.map(function (i) { return i.valor; }), cor: '#6E9FB5' }]
    });

    var grupos = Calc.oeePorGrupo(ds, ctx.maquinas, ctx.inicio, ctx.fim,
      function (m) { return m.id; }, function (k) { return nomeDe('maquinas', k); });

    Charts.desenhar($('#g-qualidade-maquina'), {
      tipo: 'barra',
      rotulos: grupos.map(function (g) { return g.rotulo; }),
      series: [{
        nome: 'Taxa de refugo',
        valores: grupos.map(function (g) {
          var i = g.indicadores;
          return i.producaoTotal ? i.refugo / i.producaoTotal : null;
        }),
        cor: '#DC6C57'
      }],
      opcoes: { percentual: true }
    });
  }

  function viewPerformance() {
    var ctx = contexto();
    var html = barraFiltros();

    html += '<div class="grade-2">' +
      blocoGrafico('g-oee-turno', 'OEE por turno') +
      blocoGrafico('g-oee-linha', 'OEE por linha') +
      '</div>';

    html += '<div class="grade-2">' +
      blocoGrafico('g-dpq', 'Disponibilidade, Performance e Qualidade no período') +
      blocoGrafico('g-ciclo', 'Ciclo ideal versus ciclo real por máquina') +
      '</div>';

    /* Comparação entre turnos em tabela, útil para reunião de passagem. */
    var linhasTabela = ds.turnos.map(function (t) {
      var eventosTurno = {
        eventosEstado: ctx.eventosEstado.filter(function (e) { return e.turnoId === t.id; }),
        eventosProducao: ctx.eventosProducao.filter(function (e) { return e.turnoId === t.id; }),
        eventosParada: ctx.eventosParada.filter(function (e) { return e.turnoId === t.id; })
      };
      var r = Calc.calcularOEE({
        eventosEstado: eventosTurno.eventosEstado,
        eventosProducao: eventosTurno.eventosProducao,
        eventosParada: eventosTurno.eventosParada,
        inicio: ctx.inicio, fim: ctx.fim,
        cicloIdealSeg: Calc.cicloIdealMedio(ds, ctx.ids, ctx.inicio, ctx.fim),
        config: ds.config
      });
      return [esc(t.nome), esc(t.inicio + ' – ' + t.fim),
        Calc.fmt.percentual(r.oee), Calc.fmt.percentual(r.disponibilidade),
        Calc.fmt.percentual(r.performance), Calc.fmt.percentual(r.qualidade),
        Calc.fmt.numero(r.producaoTotal), Calc.fmt.duracao(r.paradaNaoPlanejadaSeg), Calc.fmt.numero(r.qtdParadas)];
    });

    html += '<section class="painel"><h3 class="painel__titulo">Comparação entre turnos</h3>' +
      tabela(['Turno', 'Horário', 'OEE', 'Disp.', 'Perf.', 'Qual.', 'Produção', 'Parada não planejada', 'Paradas'], linhasTabela) +
      '</section>';

    return html;
  }

  function depoisPerformance() {
    var ctx = contexto();

    /* OEE por turno: recalcula filtrando eventos pelo turnoId. */
    var porTurno = ds.turnos.map(function (t) {
      var r = Calc.calcularOEE({
        eventosEstado: ctx.eventosEstado.filter(function (e) { return e.turnoId === t.id; }),
        eventosProducao: ctx.eventosProducao.filter(function (e) { return e.turnoId === t.id; }),
        eventosParada: ctx.eventosParada.filter(function (e) { return e.turnoId === t.id; }),
        inicio: ctx.inicio, fim: ctx.fim,
        cicloIdealSeg: Calc.cicloIdealMedio(ds, ctx.ids, ctx.inicio, ctx.fim),
        config: ds.config
      });
      return { rotulo: t.nome, oee: r.oee };
    });

    Charts.desenhar($('#g-oee-turno'), {
      tipo: 'barra',
      rotulos: porTurno.map(function (t) { return t.rotulo; }),
      series: [{ nome: 'OEE', valores: porTurno.map(function (t) { return t.oee; }), cor: '#D97B29' }],
      opcoes: { percentual: true }
    });

    var porLinha = Calc.oeePorGrupo(ds, ctx.maquinas, ctx.inicio, ctx.fim,
      function (m) { return m.linhaId; }, function (k) { return nomeDe('linhas', k); });

    Charts.desenhar($('#g-oee-linha'), {
      tipo: 'barra',
      rotulos: porLinha.map(function (g) { return g.rotulo; }),
      series: [{ nome: 'OEE', valores: porLinha.map(function (g) { return g.indicadores.oee; }), cor: '#9FB6BC' }],
      opcoes: { percentual: true }
    });

    var r = indicadoresDoContexto(ctx);
    Charts.desenhar($('#g-dpq'), {
      tipo: 'barra',
      rotulos: ['Disponibilidade', 'Performance', 'Qualidade', 'OEE'],
      series: [{
        nome: 'Período',
        valores: [r.disponibilidade, r.performance, r.qualidade, r.oee],
        cores: ['#9FB6BC', '#6FA383', '#6E9FB5', '#D97B29']
      }],
      opcoes: { percentual: true }
    });

    var grupos = Calc.oeePorGrupo(ds, ctx.maquinas, ctx.inicio, ctx.fim,
      function (m) { return m.id; }, function (k) { return nomeDe('maquinas', k); });

    Charts.desenhar($('#g-ciclo'), {
      tipo: 'barra',
      rotulos: grupos.map(function (g) { return g.rotulo; }),
      series: [
        { nome: 'Ciclo ideal (s)', valores: grupos.map(function (g) { return g.indicadores.cicloIdealSeg; }), cor: '#6FA383' },
        { nome: 'Ciclo real (s)', valores: grupos.map(function (g) { return g.indicadores.cicloRealSeg; }), cor: '#DC6C57' }
      ],
      opcoes: { casas: 1 }
    });
  }

  function viewInsights() {
    var ctx = contexto();
    var lista = OEE.Insights.gerar(ds, { maquinaIds: ctx.ids, inicio: ctx.inicio, fim: ctx.fim, agora: Date.now() });

    var html = barraFiltros();
    html += '<p class="nota">Os insights são gerados por regras determinísticas sobre os dados apontados. ' +
      'Servem como apoio à análise: nenhuma ação é executada automaticamente.</p>';

    if (!lista.length) {
      html += '<p class="vazio">Nenhum desvio relevante identificado no período selecionado.</p>';
      return html;
    }

    html += '<div class="insights">' + lista.map(function (i) {
      return '<article class="insight insight--' + i.criticidade + '">' +
        '<header class="insight__cabecalho">' +
          '<span class="insight__criticidade">' + esc(rotuloCriticidade(i.criticidade)) + '</span>' +
          '<span class="insight__indicador">' + esc(i.indicador) + '</span>' +
        '</header>' +
        '<h3 class="insight__titulo">' + esc(i.titulo) + '</h3>' +
        '<p class="insight__descricao">' + esc(i.descricao) + '</p>' +
        (i.maquinaId ? '<p class="insight__maquina">Máquina: ' + esc(nomeDe('maquinas', i.maquinaId)) + '</p>' : '') +
        '<p class="insight__periodo">Período analisado: ' + esc(i.periodo) + '</p>' +
        '<p class="insight__acao"><strong>Ação sugerida:</strong> ' + esc(i.acaoRecomendada) + '</p>' +
        '</article>';
    }).join('') + '</div>';

    return html;
  }

  /* =====================================================================
   * ACMP — TELA DE AVALIAÇÃO
   * =================================================================== */

  function viewAssistente() {
    var ctx = contexto();
    var amostras = OEE.ACMP.extrairAmostras(ds, {
      maquinaIds: ctx.ids, inicio: ctx.inicio, fim: ctx.fim
    });

    var html = barraFiltros();

    html += '<p class="nota"><strong>ACMP — Apoio à Classificação de Motivos de Parada.</strong> ' +
      'Classificador Naive Bayes treinado com o histórico de paradas já classificadas por operadores. ' +
      'Sugere os três motivos mais prováveis no momento do apontamento; a decisão permanece com o operador. ' +
      'Nada é preenchido automaticamente.</p>';

    if (amostras.length < OEE.ACMP.MINIMO_AMOSTRAS * 2) {
      return html + '<p class="vazio">Amostras insuficientes para avaliar: ' + amostras.length +
        ' paradas classificadas no recorte, mínimo de ' + (OEE.ACMP.MINIMO_AMOSTRAS * 2) + '. ' +
        'Amplie o período ou remova filtros de máquina.</p>';
    }

    var avInicio = OEE.ACMP.avaliar(amostras, { atributos: OEE.ACMP.ATRIBUTOS_INICIO });
    var avCurso = OEE.ACMP.avaliar(amostras, { atributos: OEE.ACMP.ATRIBUTOS_EM_CURSO });

    /* Ganho sobre a referência é o que decide se o módulo se paga. */
    var ganhoTop1 = avInicio.acuraciaTop1 - avInicio.acuraciaBaseline;
    var ganhoTop3 = avInicio.acuraciaTop3 - avInicio.acuraciaBaselineTop3;

    html += '<div class="kpis">' +
      cardKPI('Acurácia top-1', Calc.fmt.percentual(avInicio.acuraciaTop1, 1), {
        classe: 'kpi--destaque',
        detalhe: 'Referência: ' + Calc.fmt.percentual(avInicio.acuraciaBaseline, 1) +
          ' (' + (ganhoTop1 >= 0 ? '+' : '') + Calc.fmt.percentual(ganhoTop1, 1) + ')'
      }) +
      cardKPI('Acurácia top-3', Calc.fmt.percentual(avInicio.acuraciaTop3, 1), {
        classe: 'kpi--destaque',
        detalhe: 'Referência: ' + Calc.fmt.percentual(avInicio.acuraciaBaselineTop3, 1) +
          ' (' + (ganhoTop3 >= 0 ? '+' : '') + Calc.fmt.percentual(ganhoTop3, 1) + ')'
      }) +
      cardKPI('F1 macro', avInicio.f1Macro.toFixed(3), { detalhe: 'Média não ponderada entre classes' }) +
      cardKPI('Amostras', Calc.fmt.numero(avInicio.totalAmostras), {
        detalhe: avInicio.treino + ' treino / ' + avInicio.teste + ' teste'
      }) +
      '</div>';

    html += '<section class="painel"><h3 class="painel__titulo">Protocolo de avaliação</h3>' +
      '<div class="tabela-rolagem"><table class="tabela"><tbody>' +
        '<tr><th scope="row">Divisão</th><td>Temporal, 75% / 25%. As amostras são ordenadas por data e o corte ' +
          'é único. Divisão aleatória permitiria treinar com paradas posteriores às de teste, inflando o resultado ' +
          'em algo que a operação real nunca teria.</td></tr>' +
        '<tr><th scope="row">Período de treino</th><td class="mono">' +
          esc(Calc.fmt.dataHora(avInicio.periodoTreino.inicio)) + ' a ' + esc(Calc.fmt.dataHora(avInicio.periodoTreino.fim)) + '</td></tr>' +
        '<tr><th scope="row">Período de teste</th><td class="mono">' +
          (avInicio.periodoTeste ? esc(Calc.fmt.dataHora(avInicio.periodoTeste.inicio)) + ' a ' + esc(Calc.fmt.dataHora(avInicio.periodoTeste.fim)) : '—') + '</td></tr>' +
        '<tr><th scope="row">Referência</th><td>Motivo mais frequente daquela máquina (top-1) e três mais frequentes ' +
          'daquela máquina (top-3). Comparar o top-3 do modelo com o top-1 da referência inflaria o ganho.</td></tr>' +
        '<tr><th scope="row">Atributos</th><td>' +
          esc(avInicio.atributos.map(function (a) { return OEE.ACMP.ROTULOS_ATRIBUTO[a] || a; }).join(', ')) + '</td></tr>' +
        '<tr><th scope="row">Suavização</th><td>Laplace (α = 1), para que um valor inédito não zere a classe inteira.</td></tr>' +
      '</tbody></table></div></section>';

    /* Comparação entre os dois cenários de disponibilidade de atributos. */
    html += '<section class="painel"><h3 class="painel__titulo">Momento da sugestão importa</h3>' +
      '<p class="nota">A duração da parada só existe depois que ela termina. Usá-la no treino e não tê-la na ' +
      'inferência é o erro silencioso mais comum neste tipo de trabalho: o número do artigo não se reproduz em campo. ' +
      'Por isso o modelo do registro não usa duração — ela só entra na reclassificação de uma parada em curso, ' +
      'onde o tempo decorrido é conhecido de fato.</p>' +
      tabela(['Cenário', 'Atributos', 'Top-1', 'Top-3', 'F1 macro'], [
        ['Registro da parada <small>(duração desconhecida)</small>',
          String(avInicio.atributos.length),
          Calc.fmt.percentual(avInicio.acuraciaTop1, 1),
          Calc.fmt.percentual(avInicio.acuraciaTop3, 1),
          avInicio.f1Macro.toFixed(3)],
        ['Parada em curso <small>(duração conhecida)</small>',
          String(avCurso.atributos.length),
          Calc.fmt.percentual(avCurso.acuraciaTop1, 1),
          Calc.fmt.percentual(avCurso.acuraciaTop3, 1),
          avCurso.f1Macro.toFixed(3)],
        ['<strong>Referência (mais frequente da máquina)</strong>', '—',
          '<strong>' + Calc.fmt.percentual(avInicio.acuraciaBaseline, 1) + '</strong>',
          '<strong>' + Calc.fmt.percentual(avInicio.acuraciaBaselineTop3, 1) + '</strong>', '—']
      ]) +
      '</section>';

    html += matrizConfusaoHTML(avInicio);

    html += '<section class="painel"><h3 class="painel__titulo">Desempenho por classe</h3>' +
      '<p class="nota">Acurácia sozinha engana com classes desbalanceadas: um modelo que respondesse sempre o motivo ' +
      'dominante teria acurácia razoável e seria inútil. O F1 por classe expõe onde o modelo realmente funciona.</p>' +
      tabela(['Motivo', 'Suporte', 'Precisão', 'Revocação', 'F1'],
        avInicio.porClasse.filter(function (p) { return p.suporte > 0; }).map(function (p) {
          return [
            esc(nomeDe('motivos', p.classe) || p.classe),
            Calc.fmt.numero(p.suporte),
            p.precisao === null ? '—' : Calc.fmt.percentual(p.precisao, 1),
            p.revocacao === null ? '—' : Calc.fmt.percentual(p.revocacao, 1),
            '<span class="' + (p.f1 >= 0.3 ? 'valor-depois' : '') + '">' + p.f1.toFixed(3) + '</span>'
          ];
        }), { vazio: 'Nenhuma classe presente no conjunto de teste.' }) +
      '</section>';

    html += blocoGrafico('g-acmp-f1', 'F1 por motivo (10 de maior suporte)', 300);

    html += blocoAceitacaoACMP();

    html += '<section class="painel"><h3 class="painel__titulo">Limitações declaradas</h3>' +
      '<ul class="lista-notas">' +
        '<li><strong>Realimentação de viés.</strong> O modelo aprende os rótulos históricos, inclusive os errados. ' +
          'Se a planta classificava tudo como falha mecânica, o modelo sugere isso, o operador aceita e o viés se ' +
          'consolida. Por isso a sugestão nunca preenche o campo sozinha — e por isso vale comparar a distribuição ' +
          'de motivos antes e depois da implantação.</li>' +
        '<li><strong>Independência condicional é falsa aqui.</strong> Máquina e produto são correlacionados, e o ' +
          'Naive Bayes conta essa evidência duas vezes. Na prática o ranking sobrevive, mas as probabilidades ' +
          'exibidas são mais extremas do que deveriam: leia-as como ordenação, não como calibração.</li>' +
        '<li><strong>Dados de demonstração são sintéticos.</strong> O gerador injeta padrões plausíveis (assinatura ' +
          'de turno, fase do turno, afinidade produto–motivo, repetição de falha). Os números desta tela demonstram ' +
          'o método; não são evidência sobre uma planta real.</li>' +
        '<li><strong>Sem validação cruzada.</strong> Um único corte temporal dá uma estimativa, não um intervalo de ' +
          'confiança. Validação em janelas deslizantes é o próximo passo natural.</li>' +
      '</ul></section>';

    return html;
  }

  /* Matriz de confusão. Limitada às classes mais frequentes: com 17 motivos
   * a matriz completa tem 289 células e deixa de ser legível — o que anula
   * o propósito dela, que é justamente enxergar onde o modelo confunde. */
  function matrizConfusaoHTML(av) {
    var MAX_CLASSES = 8;
    var principais = av.porClasse
      .filter(function (p) { return p.suporte > 0; })
      .slice(0, MAX_CLASSES)
      .map(function (p) { return p.classe; });

    if (!principais.length) return '';

    var rotulo = function (c) { return nomeDe('motivos', c) || c; };

    /* Maior valor fora da diagonal define a intensidade do sombreado: com a
       diagonal incluída, os erros ficariam todos apagados. */
    var maiorErro = 1;
    principais.forEach(function (real) {
      principais.forEach(function (prev) {
        if (real === prev) return;
        var v = (av.matriz[real] || {})[prev] || 0;
        if (v > maiorErro) maiorErro = v;
      });
    });

    var cabecalho = '<tr><th class="mc__canto">Real \\ Previsto</th>' +
      principais.map(function (c) {
        return '<th class="mc__col"><span>' + esc(rotulo(c)) + '</span></th>';
      }).join('') + '<th class="mc__col">Outros</th></tr>';

    var linhas = principais.map(function (real) {
      var linhaTotal = Object.keys(av.matriz[real] || {}).reduce(function (s, k) {
        return s + av.matriz[real][k];
      }, 0);
      var celulas = principais.map(function (prev) {
        var v = (av.matriz[real] || {})[prev] || 0;
        var diagonal = real === prev;
        var intensidade = diagonal
          ? (linhaTotal ? v / linhaTotal : 0)
          : Math.min(1, v / maiorErro) * 0.8;
        var estilo = v
          ? ' style="background:' + (diagonal
              ? 'rgba(74,107,87,' + (0.25 + intensidade * 0.65).toFixed(2) + ')'
              : 'rgba(178,58,46,' + (0.12 + intensidade * 0.5).toFixed(2) + ')') + '"'
          : '';
        return '<td class="mc__celula' + (diagonal ? ' mc__celula--diagonal' : '') + '"' + estilo +
          ' title="' + esc(rotulo(real) + ' classificado como ' + rotulo(prev) + ': ' + v) + '">' +
          (v || '') + '</td>';
      }).join('');

      var outros = Object.keys(av.matriz[real] || {}).reduce(function (s, k) {
        return principais.indexOf(k) >= 0 ? s : s + av.matriz[real][k];
      }, 0);

      return '<tr><th scope="row" class="mc__linha">' + esc(rotulo(real)) + '</th>' + celulas +
        '<td class="mc__celula">' + (outros || '') + '</td></tr>';
    }).join('');

    return '<section class="painel"><h3 class="painel__titulo">Matriz de confusão</h3>' +
      '<p class="nota">Linhas: motivo real apontado pelo operador. Colunas: motivo previsto pelo modelo. ' +
      'A diagonal em verde são os acertos; o vermelho fora dela mostra <em>quais</em> motivos o modelo troca entre si — ' +
      'que costuma ser mais útil que a acurácia. Exibidas as ' + MAX_CLASSES + ' classes de maior suporte.</p>' +
      '<div class="tabela-rolagem"><table class="tabela mc">' +
        '<thead>' + cabecalho + '</thead><tbody>' + linhas + '</tbody></table></div>' +
      '</section>';
  }

  /* Taxa de aceitação: a métrica de campo. Acurácia mede o modelo; aceitação
   * mede se o modelo serviu para alguma coisa no chão de fábrica. */
  function blocoAceitacaoACMP() {
    var jan = janelaDoFiltro();
    var registros = (ds.auditoria || []).filter(function (r) {
      return (r.acao === 'SUGESTAO_ACEITA' || r.acao === 'SUGESTAO_IGNORADA') &&
        r.ts >= jan.inicio && r.ts <= jan.fim;
    });

    if (!registros.length) {
      return '<section class="painel"><h3 class="painel__titulo">Aceitação em uso</h3>' +
        '<p class="vazio">Nenhuma sugestão apresentada no período. Registre uma parada na tela de Operação ' +
        'para que a taxa de aceitação comece a ser medida.</p></section>';
    }

    var aceitas = registros.filter(function (r) { return r.acao === 'SUGESTAO_ACEITA'; });
    var porPosicao = [1, 2, 3].map(function (p) {
      return aceitas.filter(function (r) { return r.detalhes.posicaoAceita === p; }).length;
    });
    var acertouSemAceitar = registros.filter(function (r) {
      return r.acao === 'SUGESTAO_IGNORADA' && r.detalhes.escolhidoEstavaEntreOsSugeridos;
    }).length;

    return '<section class="painel"><h3 class="painel__titulo">Aceitação em uso</h3>' +
      '<p class="nota">Medida a partir da trilha de auditoria, que registra cada sugestão apresentada e o que o ' +
      'operador fez com ela. É a métrica que a acurácia offline não captura.</p>' +
      '<div class="kpis">' +
        cardKPI('Sugestões apresentadas', Calc.fmt.numero(registros.length)) +
        cardKPI('Taxa de aceitação', Calc.fmt.percentual(aceitas.length / registros.length, 1), {
          detalhe: aceitas.length + ' de ' + registros.length
        }) +
        cardKPI('Aceitas na 1ª posição', Calc.fmt.numero(porPosicao[0]), {
          detalhe: '2ª: ' + porPosicao[1] + ' · 3ª: ' + porPosicao[2]
        }) +
        cardKPI('Sugestão correta ignorada', Calc.fmt.numero(acertouSemAceitar), {
          classe: acertouSemAceitar ? 'kpi--alerta' : '',
          detalhe: 'Motivo estava na lista, escolhido pela árvore'
        }) +
      '</div></section>';
  }

  function depoisAssistente() {
    var ctx = contexto();
    var amostras = OEE.ACMP.extrairAmostras(ds, { maquinaIds: ctx.ids, inicio: ctx.inicio, fim: ctx.fim });
    if (amostras.length < OEE.ACMP.MINIMO_AMOSTRAS * 2) return;
    var av = OEE.ACMP.avaliar(amostras, { atributos: OEE.ACMP.ATRIBUTOS_INICIO });
    var alvo = $('#g-acmp-f1');
    if (!alvo || !av.suficiente) return;

    var top = av.porClasse.filter(function (p) { return p.suporte > 0; }).slice(0, 10);
    Charts.desenhar(alvo, {
      tipo: 'barraHorizontal',
      rotulos: top.map(function (p) { return nomeDe('motivos', p.classe) || p.classe; }),
      series: [{ nome: 'F1', valores: top.map(function (p) { return p.f1; }), cor: '#9FB6BC' }],
      opcoes: { casas: 2 },
      descricaoAcessivel: 'F1 por motivo'
    });
  }

  function rotuloCriticidade(c) {
    return { informativo: 'Informativo', atencao: 'Atenção', critico: 'Crítico', oportunidade: 'Oportunidade' }[c] || c;
  }

  /* =====================================================================
   * TRILHA DE AUDITORIA
   * =================================================================== */

  /* Critérios da trilha = filtros comuns da aplicação + os específicos. */
  function criteriosAuditoria() {
    var jan = janelaDoFiltro();
    var f = prefs.filtros;
    return {
      inicio: jan.inicio,
      fim: jan.fim,
      rotuloPeriodo: jan.rotulo,
      maquinaIds: maquinasDoFiltro().map(function (m) { return m.id; }),
      turnoId: f.turnoId || '',
      ordemId: f.ordemId || '',
      operadorId: f.operadorId || '',
      categoria: f.audCategoria || '',
      origem: f.audOrigem || '',
      acao: f.audAcao || '',
      busca: f.audBusca || ''
    };
  }

  function filtrosExtrasAuditoria() {
    var f = prefs.filtros;
    var A = OEE.Audit;

    var opcoesDe = function (mapa, selecionado, vazio) {
      return '<option value="">' + esc(vazio) + '</option>' +
        Object.keys(mapa).map(function (k) {
          return '<option value="' + esc(k) + '"' + (selecionado === k ? ' selected' : '') + '>' +
            esc(mapa[k].rotulo) + '</option>';
        }).join('');
    };

    return '<div class="filtros__campo"><label for="f-aud-categoria">Categoria</label>' +
        '<select id="f-aud-categoria" name="audCategoria">' + opcoesDe(A.CATEGORIAS, f.audCategoria, 'Todas') + '</select></div>' +
      '<div class="filtros__campo"><label for="f-aud-origem">Origem</label>' +
        '<select id="f-aud-origem" name="audOrigem">' + opcoesDe(A.ORIGENS, f.audOrigem, 'Todas') + '</select></div>' +
      '<div class="filtros__campo"><label for="f-aud-acao">Ação</label>' +
        '<select id="f-aud-acao" name="audAcao">' + opcoesDe(A.ACOES, f.audAcao, 'Todas') + '</select></div>' +
      '<div class="filtros__campo filtros__campo--largo"><label for="f-aud-busca">Buscar (Enter para aplicar)</label>' +
        '<input type="text" id="f-aud-busca" name="audBusca" value="' + esc(f.audBusca) + '" ' +
        'placeholder="usuário, registro, valor..."></div>';
  }

  function viewAuditoria() {
    var criterios = criteriosAuditoria();
    var registros = OEE.Audit.filtrar(ds, criterios);
    var res = OEE.Audit.resumo(registros);
    var integridade = OEE.Audit.verificarIntegridade(ds);

    var html = barraFiltros(filtrosExtrasAuditoria());

    html += '<p class="nota">Trilha somente de inclusão: nenhuma ação da interface altera ou remove um registro já gravado. ' +
      'Editar um dado operacional gera um novo registro com o valor anterior e o novo. ' +
      'Não há autenticação neste MVP, então o campo Usuário identifica o posto de trabalho, não a pessoa.</p>';

    /* O estado da corrente vem antes de qualquer número: se a trilha não
       está íntegra, os números abaixo dela não merecem confiança. */
    html += integridade.integra
      ? '<div class="aviso-integridade aviso-integridade--ok" role="status">' +
          '<strong>\u2713 Corrente íntegra.</strong> ' + Calc.fmt.numero(integridade.total) +
          ' registros verificados, nenhuma alteração ou remoção detectada.</div>'
      : '<div class="alerta-inconsistencia" role="alert">' +
          '<strong>Corrente inconsistente.</strong> ' +
          integridade.alterados.length + ' registro(s) com conteúdo alterado após a gravação e ' +
          integridade.quebras.length + ' elo(s) rompido(s), o que indica remoção de registros intermediários. ' +
          'Trate os dados deste conjunto como não auditáveis.</div>';

    html += '<div class="kpis">' +
      cardKPI('Registros no período', Calc.fmt.numero(res.total), { detalhe: esc(criterios.rotuloPeriodo) }) +
      cardKPI('Ações sensíveis', Calc.fmt.numero(res.sensiveis), {
        classe: res.sensiveis ? 'kpi--alerta' : '',
        detalhe: 'Alteram indicadores já apurados'
      }) +
      cardKPI('Usuários distintos', Calc.fmt.numero(res.usuarios)) +
      cardKPI('Trilha completa', Calc.fmt.numero((ds.auditoria || []).length), {
        detalhe: 'Limite de ' + Calc.fmt.numero(OEE.Audit.LIMITE) + ' registros'
      }) +
      '</div>';

    html += '<div class="grade-2">' +
      blocoGrafico('g-aud-categoria', 'Registros por categoria', 240) +
      blocoGrafico('g-aud-origem', 'Registros por origem', 240) +
      '</div>';

    html += '<section class="painel">' +
      '<div class="painel__cabecalho">' +
        '<h3 class="painel__titulo">Registros</h3>' +
        '<div class="linha-controles">' +
          '<button type="button" class="botao botao--pequeno" data-acao="verificar-integridade">Verificar integridade</button>' +
          '<button type="button" class="botao botao--pequeno" data-acao="exportar-csv" data-tipo="auditoria">Exportar CSV</button>' +
        '</div>' +
      '</div>';

    /* Mais recente primeiro: numa investigação, a pergunta quase sempre é
       "o que aconteceu por último". */
    var ordenados = registros.slice().reverse();
    var MAX = 300;
    var exibidos = ordenados.slice(0, MAX);

    html += tabela(
      ['Data e hora', 'Origem', 'Categoria', 'Ação', 'Usuário', 'Máquina', 'Descrição', ''],
      exibidos.map(function (r) {
        var cat = OEE.Audit.CATEGORIAS[r.categoria] || { rotulo: r.categoria, icone: '' };
        var acaoDef = OEE.Audit.ACOES[r.acao] || { rotulo: r.acao };
        return [
          '<span class="mono">' + esc(Calc.fmt.dataHora(r.ts)) + '</span>',
          '<span class="etiqueta etiqueta--origem-' + esc(r.origem) + '">' +
            esc((OEE.Audit.ORIGENS[r.origem] || {}).rotulo || r.origem) + '</span>',
          esc(cat.icone + ' ' + cat.rotulo),
          (r.sensivel ? '<span class="marca-sensivel" title="Altera indicadores já apurados">\u25C6</span> ' : '') +
            esc(acaoDef.rotulo),
          esc(r.usuario),
          esc(r.maquinaId ? nomeDe('maquinas', r.maquinaId) : '\u2014'),
          esc(r.descricao),
          '<button type="button" class="botao botao--pequeno" data-acao="ver-auditoria" data-id="' + esc(r.id) + '">Detalhes</button>'
        ];
      }),
      { vazio: 'Nenhuma ação registrada com os filtros atuais.' }
    );

    if (ordenados.length > MAX) {
      html += '<p class="nota">Exibindo os ' + MAX + ' registros mais recentes de ' +
        Calc.fmt.numero(ordenados.length) + '. Restrinja o período ou use a busca para ver os demais; ' +
        'a exportação em CSV inclui todos os registros filtrados.</p>';
    }

    html += '</section>';
    return html;
  }

  function depoisAuditoria() {
    var registros = OEE.Audit.filtrar(ds, criteriosAuditoria());
    var res = OEE.Audit.resumo(registros);

    var cats = Object.keys(res.porCategoria).sort(function (a, b) {
      return res.porCategoria[b] - res.porCategoria[a];
    });
    Charts.desenhar($('#g-aud-categoria'), {
      tipo: 'barraHorizontal',
      rotulos: cats.map(function (c) { return (OEE.Audit.CATEGORIAS[c] || {}).rotulo || c; }),
      series: [{ nome: 'Registros', valores: cats.map(function (c) { return res.porCategoria[c]; }), cor: '#9FB6BC' }],
      descricaoAcessivel: 'Quantidade de registros de auditoria por categoria'
    });

    var origens = Object.keys(res.porOrigem);
    var coresOrigem = { OPERADOR: '#6FA383', GESTAO: '#D97B29', SIMULACAO: '#6E9FB5', SISTEMA: '#7FA0A8' };
    Charts.desenhar($('#g-aud-origem'), {
      tipo: 'rosca',
      rotulos: origens.map(function (o) { return (OEE.Audit.ORIGENS[o] || {}).rotulo || o; }),
      series: [{
        nome: 'Registros',
        valores: origens.map(function (o) { return res.porOrigem[o]; }),
        cores: origens.map(function (o) { return coresOrigem[o] || '#A7AAA2'; })
      }],
      descricaoAcessivel: 'Distribuição dos registros de auditoria por origem'
    });
  }

  /* Detalhe de um registro: é aqui que o "antes e depois" fica legível. */
  function modalAuditoria(id) {
    var r = (ds.auditoria || []).filter(function (x) { return x.id === id; })[0];
    if (!r) { notificar('Registro não encontrado na trilha.', 'erro'); return; }

    var acaoDef = OEE.Audit.ACOES[r.acao] || { rotulo: r.acao };
    var cat = OEE.Audit.CATEGORIAS[r.categoria] || { rotulo: r.categoria };
    var mudancas = OEE.Audit.diferencas(r.antes, r.depois);

    var ficha = [
      ['Data e hora', Calc.fmt.dataHora(r.ts)],
      ['Ação', acaoDef.rotulo + (r.sensivel ? ' (sensível)' : '')],
      ['Categoria', cat.rotulo],
      ['Origem', (OEE.Audit.ORIGENS[r.origem] || {}).rotulo || r.origem],
      ['Usuário', r.usuario],
      ['Máquina', r.maquinaId ? nomeDe('maquinas', r.maquinaId) : '\u2014'],
      ['Ordem', r.ordemId ? nomeDe('ordens', r.ordemId, 'codigo') : '\u2014'],
      ['Turno', r.turnoId ? nomeDe('turnos', r.turnoId) : '\u2014'],
      ['Objeto', r.entidade ? r.entidade + (r.entidadeId ? ' / ' + r.entidadeId : '') : '\u2014'],
      ['Identificador', r.id],
      ['Hash', r.hash + (r.hashAnterior ? ' \u2190 ' + r.hashAnterior : ' (início da corrente)')]
    ];

    var corpo = '<p>' + esc(r.descricao) + '</p>' +
      '<h4 class="subtitulo">Ficha</h4>' +
      '<div class="tabela-rolagem"><table class="tabela"><tbody>' +
      ficha.map(function (l) {
        return '<tr><th scope="row">' + esc(l[0]) + '</th><td class="mono">' + esc(l[1]) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    if (mudancas.length) {
      corpo += '<h4 class="subtitulo">Alterações</h4>' +
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>' +
        mudancas.map(function (m) {
          return '<tr><td>' + esc(m.campo) + '</td>' +
            '<td class="valor-antes">' + esc(formatarValorAud(m.de)) + '</td>' +
            '<td class="valor-depois">' + esc(formatarValorAud(m.para)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } else if (r.depois) {
      corpo += '<h4 class="subtitulo">Valores registrados</h4>' +
        '<div class="tabela-rolagem"><table class="tabela"><tbody>' +
        Object.keys(r.depois).map(function (k) {
          return '<tr><th scope="row">' + esc(k) + '</th><td>' + esc(formatarValorAud(r.depois[k])) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    if (r.detalhes) {
      corpo += '<h4 class="subtitulo">Contexto</h4>' +
        '<div class="tabela-rolagem"><table class="tabela"><tbody>' +
        Object.keys(r.detalhes).map(function (k) {
          return '<tr><th scope="row">' + esc(k) + '</th><td>' + esc(formatarValorAud(r.detalhes[k])) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    abrirModal({
      titulo: 'Registro de auditoria',
      conteudo: corpo,
      acoes: [{ rotulo: 'Fechar', classe: 'botao--primario', aoClicar: fecharModal }]
    });
  }

  /* ---------------------------------------------------------------------
   * Cadastros
   * ------------------------------------------------------------------- */
  function entidades() {
    return {
      plantas: {
        rotulo: 'Plantas', singular: 'planta', prefixo: 'PL',
        campos: [
          { k: 'nome', r: 'Nome', tipo: 'texto', obrigatorio: true },
          { k: 'cidade', r: 'Cidade', tipo: 'texto' }
        ],
        colunas: ['nome', 'cidade']
      },
      areas: {
        rotulo: 'Áreas', singular: 'área', prefixo: 'AR',
        campos: [
          { k: 'nome', r: 'Nome', tipo: 'texto', obrigatorio: true },
          { k: 'plantaId', r: 'Planta', tipo: 'ref', colecao: 'plantas', obrigatorio: true }
        ],
        colunas: ['nome', 'plantaId']
      },
      linhas: {
        rotulo: 'Linhas', singular: 'linha', prefixo: 'LN',
        campos: [
          { k: 'nome', r: 'Nome', tipo: 'texto', obrigatorio: true },
          { k: 'areaId', r: 'Área', tipo: 'ref', colecao: 'areas', obrigatorio: true }
        ],
        colunas: ['nome', 'areaId']
      },
      maquinas: {
        rotulo: 'Máquinas', singular: 'máquina', prefixo: 'MQ',
        campos: [
          { k: 'nome', r: 'Nome', tipo: 'texto', obrigatorio: true },
          { k: 'linhaId', r: 'Linha', tipo: 'ref', colecao: 'linhas', obrigatorio: true },
          { k: 'cicloIdealSeg', r: 'Ciclo ideal (s/peça)', tipo: 'numero', obrigatorio: true, min: 0.1 },
          { k: 'metaTurno', r: 'Meta por turno (peças)', tipo: 'numero', min: 0 },
          { k: 'perfil', r: 'Perfil de simulação', tipo: 'lista', opcoes: Object.keys(Model.PERFIS) }
        ],
        colunas: ['nome', 'linhaId', 'cicloIdealSeg', 'metaTurno'],
        padroes: { estadoAtual: 'SEM_ORDEM', estadoDesde: function () { return Date.now(); }, ordemAtualId: null, ativa: true, perfil: 'BOM' }
      },
      produtos: {
        rotulo: 'Produtos', singular: 'produto', prefixo: 'PR',
        campos: [
          { k: 'sku', r: 'Código (SKU)', tipo: 'texto', obrigatorio: true },
          { k: 'nome', r: 'Nome', tipo: 'texto', obrigatorio: true },
          { k: 'cicloIdealSeg', r: 'Ciclo ideal (s/peça)', tipo: 'numero', obrigatorio: true, min: 0.1 }
        ],
        colunas: ['sku', 'nome', 'cicloIdealSeg']
      },
      ordens: {
        rotulo: 'Ordens de produção', singular: 'ordem', prefixo: 'ORD',
        campos: [
          { k: 'codigo', r: 'Código', tipo: 'texto', obrigatorio: true },
          { k: 'maquinaId', r: 'Máquina', tipo: 'ref', colecao: 'maquinas', obrigatorio: true },
          { k: 'produtoId', r: 'Produto', tipo: 'ref', colecao: 'produtos', obrigatorio: true },
          { k: 'turnoId', r: 'Turno', tipo: 'ref', colecao: 'turnos' },
          { k: 'operadorId', r: 'Operador', tipo: 'ref', colecao: 'operadores' },
          { k: 'metaQtd', r: 'Meta (peças)', tipo: 'numero', obrigatorio: true, min: 1 },
          { k: 'cicloIdealSeg', r: 'Ciclo ideal (s/peça)', tipo: 'numero', obrigatorio: true, min: 0.1 },
          { k: 'status', r: 'Status', tipo: 'lista', opcoes: ['PLANEJADA', 'EM_ANDAMENTO', 'FINALIZADA'] }
        ],
        colunas: ['codigo', 'maquinaId', 'produtoId', 'metaQtd', 'status'],
        padroes: { inicio: function () { return Date.now(); }, fim: null, status: 'PLANEJADA' }
      },
      turnos: {
        rotulo: 'Turnos', singular: 'turno', prefixo: 'TRN',
        campos: [
          { k: 'nome', r: 'Nome', tipo: 'texto', obrigatorio: true },
          { k: 'inicio', r: 'Início (HH:MM)', tipo: 'hora', obrigatorio: true },
          { k: 'fim', r: 'Fim (HH:MM)', tipo: 'hora', obrigatorio: true }
        ],
        colunas: ['nome', 'inicio', 'fim']
      },
      operadores: {
        rotulo: 'Operadores', singular: 'operador', prefixo: 'OPR',
        campos: [
          { k: 'matricula', r: 'Matrícula', tipo: 'texto', obrigatorio: true },
          { k: 'nome', r: 'Nome', tipo: 'texto', obrigatorio: true },
          { k: 'turnoId', r: 'Turno', tipo: 'ref', colecao: 'turnos' }
        ],
        colunas: ['matricula', 'nome', 'turnoId']
      },
      motivos: {
        rotulo: 'Motivos de parada', singular: 'motivo', prefixo: 'MOT',
        campos: [
          { k: 'categoria', r: 'Categoria', tipo: 'texto', obrigatorio: true },
          { k: 'nome', r: 'Motivo', tipo: 'texto', obrigatorio: true },
          { k: 'planejada', r: 'Parada planejada', tipo: 'booleano' },
          { k: 'estadoSugerido', r: 'Estado sugerido', tipo: 'lista', opcoes: Model.ORDEM_ESTADOS, obrigatorio: true }
        ],
        colunas: ['categoria', 'nome', 'planejada', 'estadoSugerido']
      }
    };
  }

  function viewCadastros() {
    var ENT = entidades();
    var valido = prefs.cadastroAtual && (ENT[prefs.cadastroAtual] || prefs.cadastroAtual === 'metas');
    var atual = valido ? prefs.cadastroAtual : 'maquinas';
    prefs.cadastroAtual = atual;
    var def = ENT[atual];

    var html = '<nav class="abas" aria-label="Cadastros">' +
      Object.keys(ENT).map(function (k) {
        return '<button type="button" class="aba' + (k === atual ? ' aba--ativa' : '') + '" data-acao="aba-cadastro" data-entidade="' + k + '">' +
          esc(ENT[k].rotulo) + '</button>';
      }).join('') +
      '<button type="button" class="aba' + (atual === 'metas' ? ' aba--ativa' : '') + '" data-acao="aba-cadastro" data-entidade="metas">Metas e ciclos</button>' +
      '</nav>';

    if (prefs.cadastroAtual === 'metas') return html + viewMetas();

    html += '<section class="painel">' +
      '<div class="painel__cabecalho">' +
        '<h3 class="painel__titulo">' + esc(def.rotulo) + '</h3>' +
        '<button type="button" class="botao botao--primario" data-acao="cadastro-novo" data-entidade="' + atual + '">Adicionar ' + esc(def.singular) + '</button>' +
      '</div>';

    var linhas = ds[atual].map(function (item) {
      var celulas = def.colunas.map(function (c) {
        var campo = def.campos.filter(function (x) { return x.k === c; })[0];
        var valor = item[c];
        if (campo && campo.tipo === 'ref') valor = nomeDe(campo.colecao, valor, campo.colecao === 'produtos' ? 'nome' : (campo.colecao === 'ordens' ? 'codigo' : 'nome'));
        if (campo && campo.tipo === 'booleano') valor = valor ? 'Sim' : 'Não';
        return esc(valor);
      });
      celulas.push(
        '<button type="button" class="botao botao--pequeno" data-acao="cadastro-editar" data-entidade="' + atual + '" data-id="' + item.id + '">Editar</button> ' +
        '<button type="button" class="botao botao--pequeno botao--perigo" data-acao="cadastro-excluir" data-entidade="' + atual + '" data-id="' + item.id + '">Excluir</button>'
      );
      return celulas;
    });

    html += tabela(def.colunas.map(function (c) {
      var campo = def.campos.filter(function (x) { return x.k === c; })[0];
      return campo ? campo.r : c;
    }).concat(['Ações']), linhas, { vazio: 'Nenhum registro cadastrado.' });

    return html + '</section>';
  }

  function viewMetas() {
    return '<section class="painel"><h3 class="painel__titulo">Metas e ciclos ideais</h3>' +
      '<form class="formulario formulario--grade" id="form-metas">' +
        '<label for="m-oee">Meta de OEE (%)</label><input id="m-oee" type="number" min="1" max="100" step="1" value="' + Math.round((ds.config.metaOEE || 0.75) * 100) + '">' +
        '<label for="m-setup">Meta de tempo de setup (min)</label><input id="m-setup" type="number" min="1" step="1" value="' + (ds.config.metaSetupMin || 20) + '">' +
        '<label for="m-refugo">Meta de refugo (%)</label><input id="m-refugo" type="number" min="0" max="100" step="0.1" value="' + ((ds.config.metaRefugoPct || 0.02) * 100).toFixed(1) + '">' +
        '<label for="m-micro">Limite de microparada (s)</label><input id="m-micro" type="number" min="10" step="10" value="' + (ds.config.limiteMicroparadaSeg || 300) + '">' +
      '</form>' +
      '<button type="button" class="botao botao--primario" data-acao="salvar-metas">Salvar metas</button>' +
      '<h4 class="subtitulo">Ciclos ideais cadastrados</h4>' +
      tabela(['Produto', 'SKU', 'Ciclo ideal (s)'], ds.produtos.map(function (p) {
        return [esc(p.nome), esc(p.sku), Calc.fmt.numero(p.cicloIdealSeg, 1)];
      })) +
      '<p class="nota">O ciclo ideal por produto é editado na aba Produtos; o ciclo padrão de cada equipamento, na aba Máquinas.</p>' +
      '</section>';
  }

  function modalCadastro(entidade, id) {
    var ENT = entidades();
    var def = ENT[entidade];
    var item = id ? porId(entidade, id) : null;
    var novo = !item;

    /* Cópia dos campos editáveis antes de qualquer alteração: é o "antes"
       da auditoria. Feita por rótulo, para que a trilha fique legível para
       quem não conhece os nomes internos dos campos. */
    var estadoOriginal = null;
    if (item) {
      estadoOriginal = {};
      def.campos.forEach(function (c) { estadoOriginal[c.r] = item[c.k]; });
    }

    var campos = def.campos.map(function (c) {
      var valor = item ? item[c.k] : '';
      var idCampo = 'c-' + c.k;
      var entrada;
      if (c.tipo === 'ref') {
        entrada = '<select id="' + idCampo + '">' +
          opcoesSelect(ds[c.colecao] || [], valor, c.colecao === 'ordens' ? 'codigo' : 'nome', c.obrigatorio ? null : '—') + '</select>';
      } else if (c.tipo === 'lista') {
        entrada = '<select id="' + idCampo + '">' + c.opcoes.map(function (o) {
          return '<option value="' + esc(o) + '"' + (o === valor ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('') + '</select>';
      } else if (c.tipo === 'booleano') {
        entrada = '<input type="checkbox" id="' + idCampo + '"' + (valor ? ' checked' : '') + '>';
      } else if (c.tipo === 'numero') {
        entrada = '<input type="number" id="' + idCampo + '" step="any" value="' + esc(valor) + '">';
      } else if (c.tipo === 'hora') {
        entrada = '<input type="time" id="' + idCampo + '" value="' + esc(valor) + '">';
      } else {
        entrada = '<input type="text" id="' + idCampo + '" value="' + esc(valor) + '">';
      }
      return '<label for="' + idCampo + '">' + esc(c.r) + (c.obrigatorio ? ' *' : '') + '</label>' + entrada;
    }).join('');

    abrirModal({
      titulo: (novo ? 'Adicionar ' : 'Editar ') + def.singular,
      conteudo: '<div class="formulario">' + campos + '<p class="erro-campo" id="cad-erro" hidden></p></div>',
      acoes: [
        { rotulo: 'Cancelar', aoClicar: fecharModal },
        {
          rotulo: 'Salvar', classe: 'botao--primario', aoClicar: function () {
            var registro = item || {};
            var erro = $('#cad-erro');
            for (var i = 0; i < def.campos.length; i++) {
              var c = def.campos[i];
              var el = $('#c-' + c.k);
              var valor = c.tipo === 'booleano' ? el.checked : el.value;

              if (c.tipo === 'numero') {
                valor = parseFloat(valor);
                if (isNaN(valor)) valor = null;
              }
              if (c.obrigatorio && (valor === '' || valor === null || valor === undefined)) {
                erro.textContent = 'O campo ' + c.r + ' é obrigatório.';
                erro.hidden = false;
                return;
              }
              if (c.tipo === 'numero' && c.min !== undefined && valor !== null && valor < c.min) {
                erro.textContent = 'O campo ' + c.r + ' deve ser maior ou igual a ' + c.min + '.';
                erro.hidden = false;
                return;
              }
              registro[c.k] = valor;
            }

            if (novo) {
              /* ID com carimbo de tempo + sequência, único entre sessões. */
              registro.id = def.prefixo + '-' + Model.novoId('x').slice(2);
              Object.keys(def.padroes || {}).forEach(function (k) {
                var v = def.padroes[k];
                registro[k] = (typeof v === 'function') ? v() : v;
              });
              ds[entidade].push(registro);
            }

            var depois = {};
            def.campos.forEach(function (c) { depois[c.r] = registro[c.k]; });
            var mudancas = OEE.Audit.diferencas(estadoOriginal, depois);

            auditar({
              acao: novo ? 'REGISTRO_CRIADO' : 'REGISTRO_ALTERADO',
              descricao: def.singular + ' ' + (registro.nome || registro.codigo || registro.id) +
                (novo ? ' cadastrado.' : ': ' + (mudancas.length
                  ? mudancas.map(function (m) { return m.campo + ' ' + formatarValorAud(m.de) + ' \u2192 ' + formatarValorAud(m.para); }).join('; ')
                  : 'salvo sem alterações.')),
              entidade: entidade,
              entidadeId: registro.id,
              antes: novo ? null : estadoOriginal,
              depois: depois,
              detalhes: novo ? null : { camposAlterados: mudancas.length }
            });

            salvar();
            fecharModal();
            notificar('Registro salvo.', 'ok');
            renderizar();
          }
        }
      ]
    });
  }

  /* Impede exclusão que quebraria a integridade referencial. */
  function dependenciasDe(entidade, id) {
    var mapa = {
      plantas: [{ colecao: 'areas', campo: 'plantaId', rotulo: 'áreas' }],
      areas: [{ colecao: 'linhas', campo: 'areaId', rotulo: 'linhas' }],
      linhas: [{ colecao: 'maquinas', campo: 'linhaId', rotulo: 'máquinas' }],
      maquinas: [
        { colecao: 'ordens', campo: 'maquinaId', rotulo: 'ordens' },
        { colecao: 'eventosEstado', campo: 'maquinaId', rotulo: 'eventos de estado' }
      ],
      produtos: [{ colecao: 'ordens', campo: 'produtoId', rotulo: 'ordens' }],
      turnos: [{ colecao: 'operadores', campo: 'turnoId', rotulo: 'operadores' }],
      operadores: [{ colecao: 'ordens', campo: 'operadorId', rotulo: 'ordens' }],
      motivos: [{ colecao: 'eventosParada', campo: 'motivoId', rotulo: 'registros de parada' }],
      ordens: [{ colecao: 'eventosProducao', campo: 'ordemId', rotulo: 'apontamentos de produção' }]
    };
    var checagens = mapa[entidade] || [];
    var impedimentos = [];
    checagens.forEach(function (c) {
      var qtd = (ds[c.colecao] || []).filter(function (i) { return i[c.campo] === id; }).length;
      if (qtd) impedimentos.push(qtd + ' ' + c.rotulo);
    });
    return impedimentos;
  }

  /* ---------------------------------------------------------------------
   * Configurações
   * ------------------------------------------------------------------- */
  function viewConfiguracoes() {
    var fonte = OEE.DataSource.atual();
    var aviso = OEE.DataSource.aviso();

    return (aviso ? '<div class="alerta-inconsistencia" role="alert">' + esc(aviso) + '</div>' : '') +
      '<section class="painel"><h3 class="painel__titulo">Simulação de dados</h3>' +
        '<p class="nota">A simulação avança produção e eventos das máquinas para demonstrar a tela em tempo próximo ao real. ' +
        'Ela substitui, no MVP, a leitura de CLP, OPC UA ou MQTT.</p>' +
        '<div class="linha-controles">' +
          '<label class="interruptor"><input type="checkbox" id="chk-simulacao"' + (ds.config.simulacaoAtiva ? ' checked' : '') + '> ' +
          '<span>Simulação ativa</span></label>' +
          '<label for="int-simulacao">Intervalo (s)</label>' +
          '<input type="number" id="int-simulacao" min="1" max="60" value="' + (ds.config.intervaloSimulacaoSeg || 5) + '" style="width:90px">' +
          '<label class="interruptor"><input type="checkbox" id="chk-auditar-simulacao"' +
            (ds.config.auditarSimulacao !== false ? ' checked' : '') + '> ' +
          '<span>Auditar eventos simulados</span></label>' +
          '<button type="button" class="botao botao--secundario" data-acao="salvar-simulacao">Aplicar</button>' +
        '</div>' +
        '<p class="nota">Os eventos do simulador entram na trilha marcados como origem <em>Simulação</em>, ' +
        'nunca como ação humana. Desmarque a auditoria da simulação se quiser a trilha limpa para uma demonstração.</p>' +
      '</section>' +

      '<section class="painel"><h3 class="painel__titulo">Assistente ACMP</h3>' +
        '<p class="nota">Sugere ao operador os três motivos mais prováveis ao registrar uma parada, com a evidência ' +
        'de cada sugestão. Treina com o histórico da própria planta, dentro do navegador. Desligado, a árvore de ' +
        'motivos funciona exatamente como antes.</p>' +
        '<div class="linha-controles">' +
          '<label class="interruptor"><input type="checkbox" id="chk-acmp"' +
            (ds.config.acmpAtivo !== false ? ' checked' : '') + '> ' +
          '<span>Sugestões ativas na tela do operador</span></label>' +
          '<button type="button" class="botao botao--secundario" data-acao="salvar-acmp">Aplicar</button>' +
          '<a class="botao botao--secundario" href="#/assistente">Ver avaliação do modelo</a>' +
        '</div>' +
      '</section>' +

      '<section class="painel"><h3 class="painel__titulo">Dados</h3>' +
        '<p class="nota">Origem atual dos dados: <strong>' + esc(fonte.nome) + '</strong>. ' +
        'Registros armazenados: ' + Calc.fmt.numero(ds.eventosEstado.length) + ' eventos de estado, ' +
        Calc.fmt.numero(ds.eventosProducao.length) + ' apontamentos de produção, ' +
        Calc.fmt.numero(ds.eventosParada.length) + ' paradas, ' +
        Calc.fmt.numero((ds.auditoria || []).length) + ' registros de auditoria.</p>' +
        '<div class="linha-controles">' +
          '<button type="button" class="botao botao--primario" data-acao="exportar-json">Exportar JSON</button>' +
          '<button type="button" class="botao botao--secundario" data-acao="importar-json">Importar JSON</button>' +
          '<input type="file" id="arquivo-json" accept="application/json,.json" hidden>' +
          '<button type="button" class="botao botao--perigo" data-acao="restaurar-demo">Restaurar dados de demonstração</button>' +
        '</div>' +
        '<h4 class="subtitulo">Exportar CSV</h4>' +
        '<div class="linha-controles">' +
          ['producao:Produção', 'paradas:Paradas', 'estados:Estados', 'ordens:Ordens',
            'oee-maquina:OEE por máquina', 'auditoria:Trilha de auditoria']
            .map(function (o) {
              var p = o.split(':');
              return '<button type="button" class="botao botao--secundario" data-acao="exportar-csv" data-tipo="' + p[0] + '">' + p[1] + '</button>';
            }).join('') +
        '</div>' +
      '</section>' +

      '<section class="painel"><h3 class="painel__titulo">Sobre este MVP</h3>' +
        '<p class="nota">Aplicação local em HTML, CSS e JavaScript puro, sem servidor e sem banco SQL. ' +
        'Os módulos de cálculo, insights e persistência são independentes da interface, ' +
        'preparados para receber dados de API REST, MQTT, OPC UA ou historiador industrial no lugar do LocalStorage.</p>' +
        '<p class="nota">Biblioteca de gráficos: ' + (Charts.temChartJs() ? 'Chart.js carregada via CDN.' : 'CDN indisponível — usando o renderizador interno simplificado.') + '</p>' +
      '</section>';
  }

  /* ---------------------------------------------------------------------
   * Simulador
   * ------------------------------------------------------------------- */
  function pararSimulacao() {
    if (simTimer) { clearInterval(simTimer); simTimer = null; }
  }

  function iniciarSimulacao() {
    pararSimulacao();
    if (!ds.config.simulacaoAtiva) return;
    var intervalo = Math.max(1, ds.config.intervaloSimulacaoSeg || 5) * 1000;
    simTimer = setInterval(tickSimulacao, intervalo);
  }

  /* Avança o estado das máquinas: produz peças, gera paradas e retornos. */
  function tickSimulacao() {
    var agora = Date.now();
    /* Tudo o que o simulador dispara nasce marcado como tal; sem isso, um
       evento gerado por software apareceria na trilha como ação humana. */
    origemAtual = 'SIMULACAO';
    try {
      executarTick(agora);
    } finally {
      origemAtual = prefs.modo === 'operador' ? 'OPERADOR' : 'GESTAO';
    }
  }

  function executarTick(agora) {
    var intervaloSeg = Math.max(1, ds.config.intervaloSimulacaoSeg || 5);

    ticksDesdePoda += 1;
    if (ticksDesdePoda > 200) { ticksDesdePoda = 0; podarEventos(); }

    ds.maquinas.forEach(function (maq) {
      if (!maq.ativa) return;
      var perfil = Model.PERFIS[maq.perfil] || Model.PERFIS.BOM;
      var st = simEstado[maq.id] || (simEstado[maq.id] = { acumulado: 0, fimPrevisto: 0 });

      /* Máquina sem ordem: abre ordem automaticamente para manter o fluxo. */
      if (!maq.ordemAtualId) {
        criarOrdemAutomatica(maq);
        mudarEstado(maq, 'SETUP', 'MOT-10', 'Setup automático da simulação');
        st.fimPrevisto = agora + aleatorioMin(perfil.duracaoSetupMin) * 60000;
        return;
      }

      if (maq.estadoAtual === 'PRODUZINDO') {
        var ordem = porId('ordens', maq.ordemAtualId);
        var cicloReal = (ordem ? ordem.cicloIdealSeg : maq.cicloIdealSeg) *
          aleatorioMin(perfil.fatorRitmo);
        st.acumulado += intervaloSeg / cicloReal;
        var qtd = Math.floor(st.acumulado);
        if (qtd > 0) {
          st.acumulado -= qtd;
          var refugoPct = aleatorioMin(perfil.refugoPct);
          var refugo = Math.random() < refugoPct * qtd * 2 ? 1 : 0;

          /* Agrega no último apontamento simulado do minuto corrente.
             Sem isso, um tick de 5 s geraria 720 registros por hora e por
             máquina, estourando rapidamente a cota do LocalStorage. */
          var ultimo = st.ultimoEvento;
          if (ultimo && ultimo.ordemId === maq.ordemAtualId && (agora - ultimo.ts) < 60000) {
            ultimo.qtdTotal += qtd;
            ultimo.qtdRefugo += refugo;
            ultimo.ts = agora;
            if (refugo && !ultimo.causaRefugo) {
              ultimo.causaRefugo = Model.CAUSAS_REFUGO[Math.floor(Math.random() * Model.CAUSAS_REFUGO.length)];
            }
          } else {
            var novoEvento = {
              id: Model.novoId('PRD'),
              maquinaId: maq.id,
              ordemId: maq.ordemAtualId,
              turnoId: Model.turnoDoInstante(ds.turnos, agora).turnoId,
              produtoId: ordem ? ordem.produtoId : maq.produtoAtualId,
              operadorId: maq.operadorAtualId,
              ts: agora,
              qtdTotal: qtd,
              qtdRefugo: refugo,
              qtdRetrabalho: 0,
              causaRefugo: refugo ? Model.CAUSAS_REFUGO[Math.floor(Math.random() * Model.CAUSAS_REFUGO.length)] : null,
              origem: 'SIMULADO'
            };
            ds.eventosProducao.push(novoEvento);
            st.ultimoEvento = novoEvento;
          }
        }

        /* Probabilidade de parar proporcional à duração média de produção. */
        var duracaoMediaMin = (perfil.duracaoProducaoMin[0] + perfil.duracaoProducaoMin[1]) / 2;
        var probParada = intervaloSeg / (duracaoMediaMin * 60);
        if (Math.random() < probParada) {
          var motivo = sortearMotivoSimulado(perfil);
          var estado = motivo.estadoSugerido;
          var duracaoMin = aleatorioMin(perfil.duracaoParadaMin);
          if (perfil.microparada && duracaoMin * 60 <= (ds.config.limiteMicroparadaSeg || 300)) estado = 'MICROPARADA';
          mudarEstado(maq, estado, motivo.id, 'Evento gerado pela simulação');
          st.fimPrevisto = agora + duracaoMin * 60000;
        }
      } else if (Calc.classeDoEstado(maq.estadoAtual, ds.config) !== 'PRODUTIVO') {
        if (!st.fimPrevisto) st.fimPrevisto = agora + aleatorioMin(perfil.duracaoParadaMin) * 60000;
        if (agora >= st.fimPrevisto) {
          mudarEstado(maq, 'PRODUZINDO', null, '');
          st.fimPrevisto = 0;
        }
      }
    });

    salvar();
    if (!modalAberto) renderizar({ preservarRolagem: true });
  }

  function aleatorioMin(faixa) {
    return faixa[0] + Math.random() * (faixa[1] - faixa[0]);
  }

  /* Mantém o histórico dentro de uma janela de retenção. O LocalStorage tem
     cota de poucos megabytes; em produção, o histórico ficaria no
     historiador industrial ou em um banco de séries temporais. */
  var RETENCAO_DIAS = 14;
  var ticksDesdePoda = 0;

  function podarEventos() {
    var limite = Date.now() - RETENCAO_DIAS * 24 * HORA;
    var antes = ds.eventosEstado.length + ds.eventosProducao.length + ds.eventosParada.length;

    ds.eventosEstado = ds.eventosEstado.filter(function (e) { return e.fim === null || e.fim > limite; });
    ds.eventosProducao = ds.eventosProducao.filter(function (e) { return e.ts > limite; });
    ds.eventosParada = ds.eventosParada.filter(function (e) { return e.fim === null || e.fim > limite; });
    ds.ordens = ds.ordens.filter(function (o) { return o.status !== 'FINALIZADA' || o.fim > limite; });

    var depois = ds.eventosEstado.length + ds.eventosProducao.length + ds.eventosParada.length;
    if (depois < antes) {
      console.info('Poda de histórico: ' + (antes - depois) + ' registros removidos.');
      auditar({
        acao: 'HISTORICO_PODADO',
        origem: 'SISTEMA',
        usuario: 'sistema',
        descricao: (antes - depois) + ' eventos com mais de ' + RETENCAO_DIAS + ' dias removidos do histórico operacional.',
        detalhes: { removidos: antes - depois, retencaoDias: RETENCAO_DIAS }
      });
    }
  }

  function sortearMotivoSimulado(perfil) {
    var pool = [];
    Object.keys(perfil.pesoMotivos).forEach(function (cat) {
      var peso = perfil.pesoMotivos[cat];
      ds.motivos.filter(function (m) { return m.categoria === cat && !m.planejada; })
        .forEach(function (m) { for (var i = 0; i < peso; i++) pool.push(m); });
    });
    if (!pool.length) pool = ds.motivos;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function criarOrdemAutomatica(maq) {
    var turno = Model.turnoDoInstante(ds.turnos, Date.now());
    var produtoId = (maq.produtosHabilitados && maq.produtosHabilitados[0]) || (ds.produtos[0] && ds.produtos[0].id);
    var produto = porId('produtos', produtoId);
    var operador = ds.operadores.filter(function (o) { return o.turnoId === turno.turnoId; })[0] || ds.operadores[0];
    var duracaoTurnoSeg = (turno.fim - turno.inicio) / 1000;
    var ciclo = produto ? produto.cicloIdealSeg : maq.cicloIdealSeg;

    var ordem = {
      id: Model.novoId('ORD'),
      codigo: 'OP-' + (200000 + ds.ordens.length + 1),
      maquinaId: maq.id,
      produtoId: produtoId,
      turnoId: turno.turnoId,
      operadorId: operador ? operador.id : null,
      cicloIdealSeg: ciclo,
      metaQtd: Math.round(duracaoTurnoSeg * 0.85 / ciclo),
      inicio: Date.now(),
      fim: null,
      status: 'EM_ANDAMENTO'
    };
    ds.ordens.push(ordem);
    maq.ordemAtualId = ordem.id;
    maq.produtoAtualId = produtoId;
    maq.cicloIdealSeg = ciclo;
    maq.metaTurno = ordem.metaQtd;
    maq.operadorAtualId = ordem.operadorId;
  }

  /* ---------------------------------------------------------------------
   * Renderização e roteamento
   * ------------------------------------------------------------------- */
  function rotaAtual() {
    var hash = (location.hash || '').replace('#/', '');
    var achou = ROTAS.filter(function (r) { return r.id === hash; })[0];
    return achou ? achou.id : (prefs.modo === 'operador' ? 'operacao' : 'visao-geral');
  }

  function renderizar(opcoes) {
    opcoes = opcoes || {};
    var rota = rotaAtual();
    var conteudo = $('#conteudo');
    var rolagem = opcoes.preservarRolagem ? global.scrollY : 0;

    document.body.setAttribute('data-modo', prefs.modo);
    document.body.setAttribute('data-rota', rota);

    var html = '';
    switch (rota) {
      case 'operacao': html = viewOperacao(); break;
      case 'visao-geral': html = viewVisaoGeral(); break;
      case 'maquinas': html = viewMaquinas(); break;
      case 'producao': html = viewProducao(); break;
      case 'paradas': html = viewParadas(); break;
      case 'qualidade': html = viewQualidade(); break;
      case 'performance': html = viewPerformance(); break;
      case 'insights': html = viewInsights(); break;
      case 'assistente': html = viewAssistente(); break;
      case 'auditoria': html = viewAuditoria(); break;
      case 'cadastros': html = viewCadastros(); break;
      case 'configuracoes': html = viewConfiguracoes(); break;
      default: html = viewVisaoGeral();
    }

    conteudo.innerHTML = html;
    atualizarMenu(rota);

    /* Ganchos pós-render: gráficos e componentes que precisam do DOM. */
    try {
      if (rota === 'operacao') depoisDeRenderizarOperacao();
      if (rota === 'visao-geral') depoisVisaoGeral();
      if (rota === 'maquinas') depoisMaquinas();
      if (rota === 'producao') depoisProducao();
      if (rota === 'paradas') depoisParadas();
      if (rota === 'qualidade') depoisQualidade();
      if (rota === 'performance') depoisPerformance();
      if (rota === 'assistente') depoisAssistente();
      if (rota === 'auditoria') depoisAuditoria();
    } catch (e) {
      console.error('Falha ao desenhar os gráficos da tela ' + rota + ':', e);
      notificar('Alguns gráficos não puderam ser desenhados. Verifique o console.', 'erro');
    }

    ligarFormularioFiltros();
    if (opcoes.preservarRolagem) global.scrollTo(0, rolagem);
  }

  function ligarFormularioFiltros() {
    var form = $('#form-filtros');
    if (!form) return;
    $$('select, input', form).forEach(function (campo) {
      campo.addEventListener('change', lerFiltros);
    });
  }

  function atualizarMenu(rota) {
    $$('#menu a').forEach(function (a) {
      var ativo = a.getAttribute('href') === '#/' + rota;
      a.classList.toggle('menu__item--ativo', ativo);
      if (ativo) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    var indice = -1;
    ROTAS.forEach(function (r, i) { if (r.id === rota) indice = i; });
    var titulo = indice >= 0 ? ROTAS[indice] : null;
    $('#titulo-rota').textContent = titulo ? titulo.rotulo : '';
    /* Índice de seção em mono âmbar, no padrão "§ 01" do press kit. */
    var eyebrow = $('#indice-rota');
    if (eyebrow) eyebrow.textContent = titulo ? '\u00A7 ' + ('0' + (indice + 1)).slice(-2) : '';
  }

  function montarMenu() {
    $('#menu').innerHTML = ROTAS.map(function (r, i) {
      return '<a href="#/' + r.id + '" class="menu__item" data-modo="' + r.modo + '">' +
        '<span class="menu__icone" aria-hidden="true">' + r.icone + '</span>' +
        '<span class="menu__rotulo">' + esc(r.rotulo) + '</span></a>';
    }).join('');
  }

  /* Atualiza apenas o cronômetro, sem redesenhar a tela inteira. */
  function tiquetaqueRelogio() {
    var el = $('#cronometro-estado');
    if (el) {
      var maq = porId('maquinas', prefs.maquinaId);
      if (maq) el.textContent = Calc.fmt.cronometro((Date.now() - maq.estadoDesde) / 1000);
    }
    var relogio = $('#relogio');
    if (relogio) {
      var d = new Date();
      relogio.textContent = d.toLocaleDateString('pt-BR') + ' · ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
    }
  }

  /* ---------------------------------------------------------------------
   * Delegação de eventos
   * ------------------------------------------------------------------- */
  function ligarEventosGlobais() {
    document.addEventListener('click', function (ev) {
      var alvo = ev.target.closest('[data-acao]');
      if (!alvo) return;
      var acao = alvo.getAttribute('data-acao');

      switch (acao) {
        case 'fechar-modal': fecharModal(); return;

        case 'alternar-modo': {
          var modoAnterior = prefs.modo;
          prefs.modo = prefs.modo === 'operador' ? 'gestao' : 'operador';
          auditar({
            acao: 'MODO_ALTERADO',
            origem: modoAnterior === 'operador' ? 'OPERADOR' : 'GESTAO',
            descricao: 'Interface alternada de ' + modoAnterior + ' para ' + prefs.modo + '.',
            antes: { modo: modoAnterior },
            depois: { modo: prefs.modo }
          });
          salvar();
          salvarPrefs();
          location.hash = '#/' + (prefs.modo === 'operador' ? 'operacao' : 'visao-geral');
          renderizar();
          return;
        }

        case 'abrir-maquina':
          prefs.maquinaId = alvo.getAttribute('data-id');
          salvarPrefs();
          location.hash = '#/operacao';
          return;

        case 'limpar-filtros':
          prefs.filtros = Object.assign({}, FILTROS_PADRAO);
          salvarPrefs();
          renderizar();
          return;

        case 'aba-cadastro':
          prefs.cadastroAtual = alvo.getAttribute('data-entidade');
          salvarPrefs();
          renderizar();
          return;

        case 'ver-auditoria':
          modalAuditoria(alvo.getAttribute('data-id'));
          return;

        case 'verificar-integridade': {
          var res = OEE.Audit.verificarIntegridade(ds);
          notificar(res.integra
            ? 'Corrente verificada: ' + res.total + ' registros íntegros.'
            : res.alterados.length + ' registro(s) alterado(s) e ' + res.quebras.length + ' elo(s) rompido(s).',
            res.integra ? 'ok' : 'erro');
          renderizar();
          return;
        }

        case 'cadastro-novo':
          modalCadastro(alvo.getAttribute('data-entidade'), null);
          return;

        case 'cadastro-editar':
          modalCadastro(alvo.getAttribute('data-entidade'), alvo.getAttribute('data-id'));
          return;

        case 'cadastro-excluir': {
          var entidade = alvo.getAttribute('data-entidade');
          var id = alvo.getAttribute('data-id');
          var deps = dependenciasDe(entidade, id);
          if (deps.length) {
            notificar('Não é possível excluir: existem ' + deps.join(' e ') + ' vinculados a este registro.', 'erro');
            auditar({
              acao: 'EXCLUSAO_BLOQUEADA',
              descricao: 'Exclusão de ' + (nomeDe(entidade, id) || id) + ' impedida por vínculos: ' + deps.join(', ') + '.',
              entidade: entidade,
              entidadeId: id,
              detalhes: { dependencias: deps }
            });
            salvar();
            return;
          }
          confirmar('Excluir registro', 'Esta ação não pode ser desfeita. Deseja excluir o registro?', function () {
            /* Guarda o registro inteiro: excluído do cadastro, ele só existe
               na trilha, e sem ele não há como explicar dados históricos que
               ainda apontam para este identificador. */
            var removido = porId(entidade, id);
            ds[entidade] = ds[entidade].filter(function (i) { return i.id !== id; });
            auditar({
              acao: 'REGISTRO_EXCLUIDO',
              descricao: 'Registro excluído de ' + entidade + ': ' + ((removido && (removido.nome || removido.codigo)) || id) + '.',
              entidade: entidade,
              entidadeId: id,
              antes: removido ? JSON.parse(JSON.stringify(removido)) : null,
              depois: null
            });
            salvar();
            notificar('Registro excluído.', 'ok');
            renderizar();
          });
          return;
        }

        case 'salvar-metas': {
          var oee = parseFloat($('#m-oee').value) / 100;
          var setup = parseFloat($('#m-setup').value);
          var refugo = parseFloat($('#m-refugo').value) / 100;
          var micro = parseFloat($('#m-micro').value);
          if (!(oee > 0 && oee <= 1) || !(setup > 0) || !(refugo >= 0 && refugo < 1) || !(micro > 0)) {
            notificar('Revise os valores das metas: use percentuais entre 0 e 100 e tempos positivos.', 'erro');
            return;
          }
          var metasAntes = {
            'Meta de OEE': ds.config.metaOEE,
            'Meta de setup (min)': ds.config.metaSetupMin,
            'Meta de refugo': ds.config.metaRefugoPct,
            'Limite de microparada (s)': ds.config.limiteMicroparadaSeg
          };
          ds.config.metaOEE = oee;
          ds.config.metaSetupMin = setup;
          ds.config.metaRefugoPct = refugo;
          ds.config.limiteMicroparadaSeg = micro;
          var metasDepois = {
            'Meta de OEE': oee,
            'Meta de setup (min)': setup,
            'Meta de refugo': refugo,
            'Limite de microparada (s)': micro
          };
          auditar({
            acao: 'METAS_ALTERADAS',
            descricao: 'Metas e limites alterados: ' +
              (OEE.Audit.diferencas(metasAntes, metasDepois).map(function (m) {
                return m.campo + ' ' + formatarValorAud(m.de) + ' \u2192 ' + formatarValorAud(m.para);
              }).join('; ') || 'nenhuma mudança efetiva'),
            entidade: 'config',
            antes: metasAntes,
            depois: metasDepois,
            /* O limite de microparada reclassifica retroativamente eventos
               curtos; alterá-lo muda números já publicados. */
            detalhes: { impacto: 'Altera a leitura de indicadores já apurados e a régua dos insights.' }
          });
          salvar();
          notificar('Metas atualizadas.', 'ok');
          renderizar();
          return;
        }

        case 'salvar-acmp': {
          var acmpAntes = ds.config.acmpAtivo !== false;
          ds.config.acmpAtivo = $('#chk-acmp').checked;
          auditar({
            acao: 'ACMP_ALTERADO',
            descricao: 'Sugestões do ACMP ' + (ds.config.acmpAtivo ? 'ativadas' : 'desativadas') + '.',
            entidade: 'config',
            antes: { 'Sugestões ativas': acmpAntes },
            depois: { 'Sugestões ativas': ds.config.acmpAtivo }
          });
          salvar();
          notificar(ds.config.acmpAtivo ? 'Sugestões do ACMP ativadas.' : 'Sugestões do ACMP desativadas.', 'ok');
          renderizar();
          return;
        }

        case 'salvar-simulacao': {
          var simAntes = {
            'Simulação ativa': ds.config.simulacaoAtiva,
            'Intervalo (s)': ds.config.intervaloSimulacaoSeg,
            'Auditar simulação': ds.config.auditarSimulacao !== false
          };
          ds.config.simulacaoAtiva = $('#chk-simulacao').checked;
          ds.config.intervaloSimulacaoSeg = Math.max(1, parseInt($('#int-simulacao').value, 10) || 5);
          var chkAud = $('#chk-auditar-simulacao');
          if (chkAud) ds.config.auditarSimulacao = chkAud.checked;
          auditar({
            acao: 'SIMULACAO_ALTERADA',
            origem: 'GESTAO',
            descricao: 'Configuração da simulação alterada.',
            entidade: 'config',
            antes: simAntes,
            depois: {
              'Simulação ativa': ds.config.simulacaoAtiva,
              'Intervalo (s)': ds.config.intervaloSimulacaoSeg,
              'Auditar simulação': ds.config.auditarSimulacao !== false
            }
          });
          salvar();
          iniciarSimulacao();
          notificar(ds.config.simulacaoAtiva ? 'Simulação ativada.' : 'Simulação desativada.', 'ok');
          renderizar();
          return;
        }

        case 'exportar-json':
          /* Auditado antes de exportar, para que o arquivo gerado já contenha
             o registro da própria exportação. */
          auditar({
            acao: 'DADOS_EXPORTADOS',
            descricao: 'Exportação completa dos dados em JSON.',
            detalhes: { formato: 'JSON', registrosDeAuditoria: (ds.auditoria || []).length }
          });
          OEE.Storage.exportarJSON(ds);
          salvar();
          notificar('Arquivo JSON gerado.', 'ok');
          return;

        case 'exportar-csv':
          auditar({
            acao: 'DADOS_EXPORTADOS',
            descricao: 'Exportação em CSV: ' + alvo.getAttribute('data-tipo') + '.',
            detalhes: { formato: 'CSV', conjunto: alvo.getAttribute('data-tipo') }
          });
          OEE.Storage.exportarCSV(ds, alvo.getAttribute('data-tipo'));
          salvar();
          notificar('Arquivo CSV gerado.', 'ok');
          return;

        case 'importar-json':
          $('#arquivo-json').click();
          return;

        case 'restaurar-demo':
          confirmar('Restaurar demonstração',
            'Todos os dados atuais serão substituídos pelo conjunto de demonstração. Deseja continuar?',
            function () {
              var trilhaPreservada = (ds.auditoria || []).slice();
              OEE.DataSource.restaurarDemo({ dias: 7 }).then(function (novo) {
                ds = novo;
                /* A trilha sobrevive à troca do conjunto de dados: apagá-la
                   junto permitiria zerar o histórico de ações restaurando a
                   demonstração — exatamente o que uma auditoria deve impedir. */
                ds.auditoria = trilhaPreservada;
                auditar({
                  acao: 'DEMO_RESTAURADA',
                  descricao: 'Todos os dados foram substituídos pelo conjunto de demonstração.',
                  detalhes: { diasGerados: 7, trilhaPreservada: trilhaPreservada.length }
                });
                simEstado = {};
                iniciarSimulacao();
                notificar('Dados de demonstração restaurados.', 'ok');
                renderizar();
              });
            });
          return;
      }

      /* Ações da tela do operador. */
      if (['abrir-ordem', 'iniciar-producao', 'pausar-producao', 'registrar-parada', 'finalizar-parada',
        'alterar-motivo', 'apontar-producao', 'apontar-refugo', 'apontar-retrabalho', 'iniciar-setup',
        'finalizar-setup', 'solicitar-manutencao', 'adicionar-observacao', 'finalizar-ordem'].indexOf(acao) >= 0) {
        acaoOperador(acao);
      }
    });

    document.addEventListener('change', function (ev) {
      if (ev.target.id === 'sel-maquina') {
        prefs.maquinaId = ev.target.value;
        salvarPrefs();
        renderizar();
      }
      if (ev.target.id === 'arquivo-json') {
        var arquivo = ev.target.files[0];
        var trilhaLocal = (ds.auditoria || []).slice();
        OEE.Storage.importarJSON(arquivo).then(function (novo) {
          ds = novo;
          /* Une a trilha local à do arquivo, sem duplicar: as duas são
             registros legítimos de coisas que aconteceram, e descartar a
             local abriria uma via para apagar rastros via importação. */
          ds.auditoria = fundirTrilhas(trilhaLocal, novo.auditoria || []);
          auditar({
            acao: 'DADOS_IMPORTADOS',
            descricao: 'Conjunto de dados substituído pelo arquivo ' + (arquivo ? arquivo.name : 'importado') + '.',
            detalhes: {
              arquivo: arquivo ? arquivo.name : null,
              maquinasImportadas: (novo.maquinas || []).length,
              registrosDeAuditoriaNoArquivo: (novo.auditoria || []).length,
              registrosDeAuditoriaLocais: trilhaLocal.length
            }
          });
          simEstado = {};
          return OEE.DataSource.salvar(ds);
        }).then(function () {
          notificar('Dados importados com sucesso.', 'ok');
          iniciarSimulacao();
          renderizar();
        }).catch(function (e) {
          notificar(e.message, 'erro');
        });
        ev.target.value = '';
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') fecharModal();
    });

    global.addEventListener('hashchange', function () { renderizar(); });
  }

  /* ---------------------------------------------------------------------
   * Inicialização
   * ------------------------------------------------------------------- */
  var iniciado = false;

  function iniciar() {
    /* Guarda contra inicialização dupla. Sem ela, um segundo disparo do
     * evento de carga registraria o tratador de cliques outra vez e cada
     * ação do usuário passaria a ser executada duas vezes — apontamento
     * dobrado, parada aberta e reaberta, dois registros de auditoria para
     * o mesmo ato. É um defeito silencioso e caro; o custo de evitá-lo é
     * uma variável. */
    if (iniciado) return;
    iniciado = true;

    prefs = OEE.Storage.lerPreferencias();
    prefs.modo = prefs.modo || 'gestao';
    prefs.filtros = Object.assign({}, FILTROS_PADRAO, prefs.filtros || {});

    montarMenu();
    ligarEventosGlobais();

    OEE.DataSource.carregar().then(function (carregado) {
      if (carregado) return carregado;
      notificar('Gerando conjunto de dados de demonstração...', 'ok');
      return OEE.DataSource.restaurarDemo({ dias: 7 });
    }).then(function (dataset) {
      ds = dataset;
      if (!prefs.maquinaId || !porId('maquinas', prefs.maquinaId)) {
        prefs.maquinaId = ds.maquinas.length ? ds.maquinas[0].id : null;
      }
      salvarPrefs();

      var aviso = OEE.DataSource.aviso();
      if (aviso) notificar(aviso, 'alerta');

      auditar({
        acao: 'APLICACAO_INICIADA',
        origem: 'SISTEMA',
        usuario: 'sistema',
        descricao: 'Sessão iniciada em modo ' + prefs.modo + '.',
        detalhes: {
          persistencia: aviso ? 'somente memória' : OEE.DataSource.atual().nome,
          maquinas: ds.maquinas.length,
          registrosDeAuditoria: (ds.auditoria || []).length
        }
      });
      salvar();

      if (!location.hash) location.hash = '#/' + (prefs.modo === 'operador' ? 'operacao' : 'visao-geral');
      renderizar();
      iniciarSimulacao();
      relogioTimer = setInterval(tiquetaqueRelogio, 1000);
      tiquetaqueRelogio();
    }).catch(function (e) {
      console.error(e);
      document.getElementById('conteudo').innerHTML =
        '<div class="alerta-inconsistencia" role="alert"><strong>Não foi possível iniciar a aplicação.</strong> ' +
        esc(e.message) + ' Recarregue a página ou restaure os dados de demonstração.</div>';
    });
  }

  OEE.App = {
    iniciar: iniciar,
    renderizar: renderizar,
    dataset: function () { return ds; },
    preferencias: function () { return prefs; },
    /* Superfície mínima para inspeção e testes automatizados. São as três
     * funções com regra de negócio que não têm como ser exercitadas só pela
     * interface: a validação de apontamento, um passo do simulador e a fusão
     * de trilhas na importação. */
    apontar: function (maquinaId, total, refugo, retrabalho, causa) {
      var maq = porId('maquinas', maquinaId);
      return maq ? apontarProducao(maq, total, refugo, retrabalho, causa || null) : false;
    },
    tick: function () { tickSimulacao(); },
    fundirTrilhas: fundirTrilhas
  };

  /* No arquivo modular os scripts vêm antes do fim do documento e o evento
   * ainda vai disparar. No arquivo único de distribuição eles são inline e o
   * DOM pode já estar pronto, então também tratamos esse caso. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    setTimeout(iniciar, 0);
  }
})(window);
