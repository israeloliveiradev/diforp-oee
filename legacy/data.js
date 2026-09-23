/* =========================================================================
 * data.js
 * Responsabilidade: modelo de domínio (estados operacionais, motivos de
 * parada, hierarquia ISA-95) e geração do conjunto de dados de demonstração.
 *
 * Nenhuma dependência externa. Expõe:
 *   OEE.Model  -> constantes e definições do domínio
 *   OEE.Data   -> geradores de dataset de demonstração
 * ========================================================================= */
(function (global) {
  'use strict';

  var OEE = (global.OEE = global.OEE || {});

  /* ---------------------------------------------------------------------
   * 1. Estados operacionais
   *
   * "classe" define como o estado entra no cálculo de OEE:
   *   PRODUTIVO      -> tempo operacional (máquina agregando valor)
   *   PLANEJADA      -> sai do Tempo de Produção Planejado (não penaliza OEE)
   *   NAO_PLANEJADA  -> perda de Disponibilidade
   *
   * "padrao" é usado no CSS para diferenciar estados sem depender só de cor
   * (requisito de acessibilidade: ícone + texto + textura).
   * ------------------------------------------------------------------- */
  var ESTADOS = {
    PRODUZINDO:            { id: 'PRODUZINDO',            rotulo: 'Produzindo',           classe: 'PRODUTIVO',     icone: '\u25B6', padrao: 'solido' },
    SETUP:                 { id: 'SETUP',                 rotulo: 'Setup',                classe: 'NAO_PLANEJADA', icone: '\u21C4', padrao: 'diagonal' },
    MANUTENCAO:            { id: 'MANUTENCAO',            rotulo: 'Manutenção',           classe: 'NAO_PLANEJADA', icone: '\u2692', padrao: 'diagonal' },
    PARADA_NAO_PLANEJADA:  { id: 'PARADA_NAO_PLANEJADA',  rotulo: 'Parada não planejada', classe: 'NAO_PLANEJADA', icone: '\u25A0', padrao: 'diagonal' },
    MICROPARADA:           { id: 'MICROPARADA',           rotulo: 'Microparada',          classe: 'NAO_PLANEJADA', icone: '\u26A1', padrao: 'pontilhado' },
    AGUARDANDO_MATERIAL:   { id: 'AGUARDANDO_MATERIAL',   rotulo: 'Aguardando material',  classe: 'NAO_PLANEJADA', icone: '\u23F3', padrao: 'pontilhado' },
    AGUARDANDO_OPERADOR:   { id: 'AGUARDANDO_OPERADOR',   rotulo: 'Aguardando operador',  classe: 'NAO_PLANEJADA', icone: '\u263A', padrao: 'pontilhado' },
    LIMPEZA:               { id: 'LIMPEZA',               rotulo: 'Limpeza',              classe: 'PLANEJADA',     icone: '\u2727', padrao: 'listrado' },
    PARADA_PLANEJADA:      { id: 'PARADA_PLANEJADA',      rotulo: 'Parada planejada',     classe: 'PLANEJADA',     icone: '\u23F8', padrao: 'listrado' },
    SEM_ORDEM:             { id: 'SEM_ORDEM',             rotulo: 'Sem ordem de produção', classe: 'PLANEJADA',    icone: '\u2205', padrao: 'listrado' }
  };

  var ORDEM_ESTADOS = [
    'PRODUZINDO', 'SETUP', 'MANUTENCAO', 'PARADA_NAO_PLANEJADA', 'MICROPARADA',
    'AGUARDANDO_MATERIAL', 'AGUARDANDO_OPERADOR', 'LIMPEZA', 'PARADA_PLANEJADA', 'SEM_ORDEM'
  ];

  /* ---------------------------------------------------------------------
   * 2. Motivos de parada (hierarquia Categoria > Motivo)
   * ------------------------------------------------------------------- */
  var MOTIVOS_PADRAO = [
    { id: 'MOT-01', categoria: 'Máquina',   nome: 'Falha elétrica',            planejada: false, estadoSugerido: 'MANUTENCAO' },
    { id: 'MOT-02', categoria: 'Máquina',   nome: 'Falha mecânica',            planejada: false, estadoSugerido: 'MANUTENCAO' },
    { id: 'MOT-03', categoria: 'Máquina',   nome: 'Sensor',                    planejada: false, estadoSugerido: 'PARADA_NAO_PLANEJADA' },
    { id: 'MOT-04', categoria: 'Máquina',   nome: 'Ferramenta',                planejada: false, estadoSugerido: 'PARADA_NAO_PLANEJADA' },
    { id: 'MOT-05', categoria: 'Material',  nome: 'Falta de material',         planejada: false, estadoSugerido: 'AGUARDANDO_MATERIAL' },
    { id: 'MOT-06', categoria: 'Material',  nome: 'Material fora de especificação', planejada: false, estadoSugerido: 'PARADA_NAO_PLANEJADA' },
    { id: 'MOT-07', categoria: 'Material',  nome: 'Atraso no abastecimento',   planejada: false, estadoSugerido: 'AGUARDANDO_MATERIAL' },
    { id: 'MOT-08', categoria: 'Processo',  nome: 'Ajuste',                    planejada: false, estadoSugerido: 'PARADA_NAO_PLANEJADA' },
    { id: 'MOT-09', categoria: 'Processo',  nome: 'Limpeza',                   planejada: true,  estadoSugerido: 'LIMPEZA' },
    { id: 'MOT-10', categoria: 'Processo',  nome: 'Setup',                     planejada: false, estadoSugerido: 'SETUP' },
    { id: 'MOT-11', categoria: 'Processo',  nome: 'Troca de formato',          planejada: false, estadoSugerido: 'SETUP' },
    { id: 'MOT-12', categoria: 'Pessoas',   nome: 'Falta de operador',         planejada: false, estadoSugerido: 'AGUARDANDO_OPERADOR' },
    { id: 'MOT-13', categoria: 'Pessoas',   nome: 'Treinamento',               planejada: true,  estadoSugerido: 'PARADA_PLANEJADA' },
    { id: 'MOT-14', categoria: 'Pessoas',   nome: 'Aguardando aprovação',      planejada: false, estadoSugerido: 'AGUARDANDO_OPERADOR' },
    { id: 'MOT-15', categoria: 'Qualidade', nome: 'Inspeção',                  planejada: false, estadoSugerido: 'PARADA_NAO_PLANEJADA' },
    { id: 'MOT-16', categoria: 'Qualidade', nome: 'Bloqueio',                  planejada: false, estadoSugerido: 'PARADA_NAO_PLANEJADA' },
    { id: 'MOT-17', categoria: 'Qualidade', nome: 'Desvio',                    planejada: false, estadoSugerido: 'PARADA_NAO_PLANEJADA' },
    { id: 'MOT-18', categoria: 'Outros',    nome: 'Outros',                    planejada: false, estadoSugerido: 'PARADA_NAO_PLANEJADA' },
    { id: 'MOT-19', categoria: 'Outros',    nome: 'Refeição / intervalo',      planejada: true,  estadoSugerido: 'PARADA_PLANEJADA' },
    { id: 'MOT-20', categoria: 'Outros',    nome: 'Manutenção preventiva',     planejada: true,  estadoSugerido: 'PARADA_PLANEJADA' }
  ];

  /* Causas de refugo usadas na tela de Qualidade. */
  var CAUSAS_REFUGO = [
    'Dimensional fora de tolerância', 'Aspecto superficial', 'Contaminação',
    'Falha de solda', 'Erro de montagem', 'Peça incompleta'
  ];

  var TURNOS_PADRAO = [
    { id: 'T1', nome: 'Turno 1', inicio: '06:00', fim: '14:00' },
    { id: 'T2', nome: 'Turno 2', inicio: '14:00', fim: '22:00' },
    { id: 'T3', nome: 'Turno 3', inicio: '22:00', fim: '06:00' }
  ];

  /* ---------------------------------------------------------------------
   * 3. Utilidades internas
   * ------------------------------------------------------------------- */

  /* PRNG determinístico (mulberry32): o dataset de demonstração é sempre
     reproduzível, o que facilita testes e comparação de indicadores. */
  function criarRandom(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function escolher(rnd, lista) { return lista[Math.floor(rnd() * lista.length)]; }
  function entre(rnd, min, max) { return min + rnd() * (max - min); }
  function inteiroEntre(rnd, min, max) { return Math.floor(entre(rnd, min, max + 1)); }

  var _seq = 0;
  function novoId(prefixo) {
    _seq += 1;
    return prefixo + '-' + Date.now().toString(36) + '-' + _seq.toString(36);
  }

  function minutosParaMs(m) { return m * 60000; }

  /* Converte "HH:MM" em minutos desde a meia-noite. */
  function horaParaMinutos(hhmm) {
    var p = String(hhmm).split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }

  /* ---------------------------------------------------------------------
   * 4. Perfis de comportamento das máquinas
   *
   * Cada perfil produz uma "assinatura" diferente de OEE, garantindo que o
   * dashboard mostre situações distintas (requisito 8 do escopo).
   * ------------------------------------------------------------------- */
  var PERFIS = {
    BOM: {
      rotulo: 'Referência',
      duracaoProducaoMin: [35, 70],   // minutos produzindo entre eventos
      duracaoParadaMin: [3, 12],
      fatorRitmo: [0.97, 1.03],       // ciclo real = ciclo ideal * fator
      refugoPct: [0.004, 0.012],
      setupsPorTurno: [0, 1],
      duracaoSetupMin: [8, 15],
      pesoMotivos: { 'Máquina': 1, 'Material': 1, 'Processo': 1, 'Pessoas': 1, 'Qualidade': 1, 'Outros': 1 }
    },
    BAIXA_DISPONIBILIDADE: {
      rotulo: 'Baixa disponibilidade',
      duracaoProducaoMin: [10, 25],
      duracaoParadaMin: [12, 45],
      fatorRitmo: [1.0, 1.06],
      refugoPct: [0.006, 0.015],
      setupsPorTurno: [0, 1],
      duracaoSetupMin: [10, 20],
      pesoMotivos: { 'Máquina': 6, 'Material': 1, 'Processo': 1, 'Pessoas': 1, 'Qualidade': 1, 'Outros': 1 }
    },
    BAIXA_PERFORMANCE: {
      rotulo: 'Baixa performance',
      duracaoProducaoMin: [40, 80],
      duracaoParadaMin: [4, 10],
      fatorRitmo: [1.18, 1.35],
      refugoPct: [0.005, 0.012],
      setupsPorTurno: [0, 1],
      duracaoSetupMin: [8, 14],
      pesoMotivos: { 'Máquina': 1, 'Material': 1, 'Processo': 3, 'Pessoas': 1, 'Qualidade': 1, 'Outros': 1 }
    },
    QUALIDADE: {
      rotulo: 'Problemas de qualidade',
      duracaoProducaoMin: [30, 60],
      duracaoParadaMin: [5, 18],
      fatorRitmo: [1.0, 1.08],
      refugoPct: [0.05, 0.11],
      setupsPorTurno: [0, 1],
      duracaoSetupMin: [8, 16],
      pesoMotivos: { 'Máquina': 1, 'Material': 1, 'Processo': 1, 'Pessoas': 1, 'Qualidade': 6, 'Outros': 1 }
    },
    EXCESSO_SETUP: {
      rotulo: 'Excesso de setup',
      duracaoProducaoMin: [18, 35],
      duracaoParadaMin: [4, 10],
      fatorRitmo: [1.02, 1.1],
      setupsPorTurno: [3, 5],
      duracaoSetupMin: [22, 45],
      refugoPct: [0.01, 0.03],
      pesoMotivos: { 'Máquina': 1, 'Material': 2, 'Processo': 4, 'Pessoas': 1, 'Qualidade': 1, 'Outros': 1 }
    },
    MICROPARADAS: {
      rotulo: 'Muitas microparadas',
      duracaoProducaoMin: [4, 12],
      duracaoParadaMin: [1, 4],
      fatorRitmo: [1.05, 1.15],
      refugoPct: [0.01, 0.025],
      setupsPorTurno: [0, 1],
      duracaoSetupMin: [8, 14],
      microparada: true,
      pesoMotivos: { 'Máquina': 3, 'Material': 2, 'Processo': 2, 'Pessoas': 1, 'Qualidade': 1, 'Outros': 1 }
    },
    AGUARDA_MATERIAL: {
      rotulo: 'Espera por material',
      duracaoProducaoMin: [20, 45],
      duracaoParadaMin: [15, 50],
      fatorRitmo: [1.0, 1.07],
      refugoPct: [0.006, 0.014],
      setupsPorTurno: [0, 1],
      duracaoSetupMin: [8, 16],
      pesoMotivos: { 'Máquina': 1, 'Material': 8, 'Processo': 1, 'Pessoas': 2, 'Qualidade': 1, 'Outros': 1 }
    }
  };

  /* ---------------------------------------------------------------------
   * 5. Cadastros base da demonstração
   * ------------------------------------------------------------------- */
  function cadastrosBase() {
    var empresa = { id: 'EMP-1', nome: 'Indústria Modelo S.A.' };

    var plantas = [
      { id: 'PL-1', empresaId: 'EMP-1', nome: 'Planta Sul', cidade: 'Joinville' },
      { id: 'PL-2', empresaId: 'EMP-1', nome: 'Planta Norte', cidade: 'Camaçari' }
    ];

    var areas = [
      { id: 'AR-1', plantaId: 'PL-1', nome: 'Usinagem' },
      { id: 'AR-2', plantaId: 'PL-1', nome: 'Montagem' },
      { id: 'AR-3', plantaId: 'PL-2', nome: 'Injeção' }
    ];

    var linhas = [
      { id: 'LN-1', areaId: 'AR-1', nome: 'Linha 01 - Eixos' },
      { id: 'LN-2', areaId: 'AR-2', nome: 'Linha 02 - Conjuntos' },
      { id: 'LN-3', areaId: 'AR-3', nome: 'Linha 03 - Carcaças' }
    ];

    var produtos = [
      { id: 'PR-1', sku: 'EX-1020', nome: 'Eixo motriz 1020',      cicloIdealSeg: 42 },
      { id: 'PR-2', sku: 'EX-2040', nome: 'Eixo secundário 2040',  cicloIdealSeg: 55 },
      { id: 'PR-3', sku: 'CJ-3100', nome: 'Conjunto flange 3100',  cicloIdealSeg: 30 },
      { id: 'PR-4', sku: 'CR-4500', nome: 'Carcaça bomba 4500',    cicloIdealSeg: 24 },
      { id: 'PR-5', sku: 'CR-4800', nome: 'Carcaça reforçada 4800', cicloIdealSeg: 36 }
    ];

    var maquinas = [
      { id: 'MQ-1', nome: 'Torno CNC 01',   linhaId: 'LN-1', perfil: 'BOM',                   produtos: ['PR-1', 'PR-2'] },
      { id: 'MQ-2', nome: 'Torno CNC 02',   linhaId: 'LN-1', perfil: 'BAIXA_DISPONIBILIDADE', produtos: ['PR-1', 'PR-2'] },
      { id: 'MQ-3', nome: 'Retífica 01',    linhaId: 'LN-1', perfil: 'MICROPARADAS',          produtos: ['PR-1'] },
      { id: 'MQ-4', nome: 'Prensa 01',      linhaId: 'LN-2', perfil: 'BAIXA_PERFORMANCE',     produtos: ['PR-3'] },
      { id: 'MQ-5', nome: 'Montagem A',     linhaId: 'LN-2', perfil: 'AGUARDA_MATERIAL',      produtos: ['PR-3'] },
      { id: 'MQ-6', nome: 'Montagem B',     linhaId: 'LN-2', perfil: 'BOM',                   produtos: ['PR-3'] },
      { id: 'MQ-7', nome: 'Injetora 01',    linhaId: 'LN-3', perfil: 'EXCESSO_SETUP',         produtos: ['PR-4', 'PR-5'] },
      { id: 'MQ-8', nome: 'Injetora 02',    linhaId: 'LN-3', perfil: 'QUALIDADE',             produtos: ['PR-4', 'PR-5'] }
    ];

    var operadores = [
      { id: 'OP-1', matricula: '10234', nome: 'Ana Ribeiro',      turnoId: 'T1' },
      { id: 'OP-2', matricula: '10877', nome: 'Bruno Camargo',    turnoId: 'T1' },
      { id: 'OP-3', matricula: '11045', nome: 'Carla Menezes',    turnoId: 'T2' },
      { id: 'OP-4', matricula: '11298', nome: 'Diego Fontes',     turnoId: 'T2' },
      { id: 'OP-5', matricula: '11533', nome: 'Eduarda Prado',    turnoId: 'T3' },
      { id: 'OP-6', matricula: '11760', nome: 'Felipe Andrade',   turnoId: 'T3' }
    ];

    return {
      empresa: empresa, plantas: plantas, areas: areas, linhas: linhas,
      produtos: produtos, maquinas: maquinas, operadores: operadores,
      turnos: TURNOS_PADRAO.map(function (t) { return Object.assign({}, t); }),
      motivos: MOTIVOS_PADRAO.map(function (m) { return Object.assign({}, m); })
    };
  }

  /* ---------------------------------------------------------------------
   * 6. Janelas de turno
   *
   * Devolve as janelas de turno (início/fim em ms) que se sobrepõem ao
   * intervalo pedido. Turnos que cruzam a meia-noite são tratados.
   * ------------------------------------------------------------------- */
  function janelasDeTurno(turnos, diaBase) {
    var janelas = [];
    var inicioDia = new Date(diaBase.getFullYear(), diaBase.getMonth(), diaBase.getDate(), 0, 0, 0, 0).getTime();

    turnos.forEach(function (t) {
      var ini = horaParaMinutos(t.inicio);
      var fim = horaParaMinutos(t.fim);
      var duracao = fim > ini ? fim - ini : (24 * 60 - ini) + fim; // cruza meia-noite
      janelas.push({
        turnoId: t.id,
        nome: t.nome,
        inicio: inicioDia + minutosParaMs(ini),
        fim: inicioDia + minutosParaMs(ini + duracao)
      });
    });

    return janelas.sort(function (a, b) { return a.inicio - b.inicio; });
  }

  /* Descobre em qual turno cai um instante. */
  function turnoDoInstante(turnos, ts) {
    var d = new Date(ts);
    var candidatos = janelasDeTurno(turnos, new Date(d.getTime() - 86400000))
      .concat(janelasDeTurno(turnos, d));
    for (var i = 0; i < candidatos.length; i++) {
      if (ts >= candidatos[i].inicio && ts < candidatos[i].fim) return candidatos[i];
    }
    return candidatos[0];
  }

  /* ---------------------------------------------------------------------
   * 7. Geração do dataset de demonstração
   * ------------------------------------------------------------------- */
  function gerarDemo(opcoes) {
    opcoes = opcoes || {};
    var dias = opcoes.dias || 7;
    var agora = opcoes.agora || Date.now();
    var rnd = criarRandom(opcoes.seed || 20240517);

    var base = cadastrosBase();
    var ds = {
      meta: { versao: 1, geradoEm: new Date(agora).toISOString(), origem: 'demo' },
      empresa: base.empresa,
      plantas: base.plantas,
      areas: base.areas,
      linhas: base.linhas,
      maquinas: [],
      produtos: base.produtos,
      turnos: base.turnos,
      operadores: base.operadores,
      motivos: base.motivos,
      ordens: [],
      eventosEstado: [],
      eventosProducao: [],
      eventosParada: [],
      observacoes: [],
      /* A trilha de auditoria nasce vazia de propósito: o histórico de
         demonstração é gerado por software e não corresponde a ações que
         alguém tenha de fato executado. Inventar registros de auditoria
         seria fabricar prova. */
      auditoria: [],
      config: {
        metaOEE: 0.75,
        metaSetupMin: 20,
        metaRefugoPct: 0.02,
        simulacaoAtiva: false,
        intervaloSimulacaoSeg: 5,
        limiteMicroparadaSeg: 300,
        auditarSimulacao: true,
        acmpAtivo: true
      }
    };

    /* Máquinas com atributos operacionais. */
    base.maquinas.forEach(function (m) {
      var produtoPadrao = ds.produtos.filter(function (p) { return m.produtos.indexOf(p.id) >= 0; })[0];
      ds.maquinas.push({
        id: m.id,
        nome: m.nome,
        linhaId: m.linhaId,
        perfil: m.perfil,
        produtosHabilitados: m.produtos.slice(),
        cicloIdealSeg: produtoPadrao.cicloIdealSeg,
        estadoAtual: 'SEM_ORDEM',
        estadoDesde: agora,
        produtoAtualId: produtoPadrao.id,
        ordemAtualId: null,
        operadorAtualId: null,
        metaTurno: 0,
        ativa: true
      });
    });

    var contadorOP = 1000;

    /* Percorre dias e turnos gerando eventos coerentes por máquina. */
    for (var d = dias - 1; d >= 0; d--) {
      var dia = new Date(agora - d * 86400000);
      var janelas = janelasDeTurno(ds.turnos, dia);

      janelas.forEach(function (jan) {
        if (jan.inicio > agora) return;               // turno ainda não começou
        var fimJanela = Math.min(jan.fim, agora);      // turno em andamento
        if (fimJanela - jan.inicio < 60000) return;

        ds.maquinas.forEach(function (maq) {
          gerarTurnoDaMaquina(ds, maq, jan, fimJanela, rnd, agora, function () {
            contadorOP += 1;
            return contadorOP;
          });
        });
      });
    }

    /* Sincroniza o estado atual das máquinas com o último evento aberto. */
    ds.maquinas.forEach(function (maq) {
      var abertos = ds.eventosEstado.filter(function (e) { return e.maquinaId === maq.id && e.fim === null; });
      if (abertos.length) {
        var ultimo = abertos[abertos.length - 1];
        maq.estadoAtual = ultimo.estado;
        maq.estadoDesde = ultimo.inicio;
        maq.ordemAtualId = ultimo.ordemId;
        var ordem = ds.ordens.filter(function (o) { return o.id === ultimo.ordemId; })[0];
        if (ordem) {
          maq.produtoAtualId = ordem.produtoId;
          maq.metaTurno = ordem.metaQtd;
          maq.cicloIdealSeg = ordem.cicloIdealSeg;
          maq.operadorAtualId = ordem.operadorId;
        }
      }
    });

    return ds;
  }

  /* Gera a sequência de eventos de uma máquina dentro de uma janela de turno. */
  function gerarTurnoDaMaquina(ds, maq, janela, fimJanela, rnd, agora, proximoNumeroOP) {
    var perfil = PERFIS[maq.perfil] || PERFIS.BOM;
    var duracaoTurnoSeg = (janela.fim - janela.inicio) / 1000;

    /* Produto e ciclo ideal do turno. */
    var produtoId = escolher(rnd, maq.produtosHabilitados);
    var produto = ds.produtos.filter(function (p) { return p.id === produtoId; })[0];
    var cicloIdealSeg = produto.cicloIdealSeg;

    /* Operador do turno. */
    var operadoresTurno = ds.operadores.filter(function (o) { return o.turnoId === janela.turnoId; });
    var operador = operadoresTurno.length ? escolher(rnd, operadoresTurno) : ds.operadores[0];

    /* Meta = 85% do tempo de turno convertido em peças pelo ciclo ideal. */
    var metaQtd = Math.round((duracaoTurnoSeg * 0.85) / cicloIdealSeg);

    var ordem = {
      id: 'ORD-' + proximoNumeroOP(),
      codigo: 'OP-' + (100000 + proximoNumeroOP()),
      maquinaId: maq.id,
      produtoId: produtoId,
      turnoId: janela.turnoId,
      operadorId: operador.id,
      cicloIdealSeg: cicloIdealSeg,
      metaQtd: metaQtd,
      inicio: janela.inicio,
      fim: janela.fim <= agora ? janela.fim : null,
      status: janela.fim <= agora ? 'FINALIZADA' : 'EM_ANDAMENTO'
    };
    ds.ordens.push(ordem);

    var motivosPorCategoria = {};
    ds.motivos.forEach(function (m) {
      (motivosPorCategoria[m.categoria] = motivosPorCategoria[m.categoria] || []).push(m);
    });

    /* Sorteia um motivo respeitando os pesos do perfil da máquina e,
     * sobre eles, padrões condicionais que existem em fábrica de verdade.
     *
     * POR QUE ISSO IMPORTA: um sorteio puramente aleatório produz um
     * histórico sem estrutura, e qualquer classificador treinado sobre ele
     * empata com o palpite mais frequente — não por falha do método, mas
     * porque não há o que aprender. Os padrões abaixo são plausíveis e
     * documentados na literatura de TPM, mas continuam sendo SINTÉTICOS:
     * a acurácia medida na tela do ACMP demonstra o método, não prevê o
     * desempenho numa planta real.
     *
     * Padrões injetados:
     *  - turno da madrugada concentra falta de operador e espera por
     *    aprovação, porque a equipe é menor e a supervisão é remota;
     *  - início de turno concentra falta e atraso de material, quando o
     *    abastecimento ainda não estabilizou;
     *  - produtos de ciclo curto puxam troca de ferramenta, pelo desgaste
     *    proporcional ao número de peças;
     *  - falha elétrica e falha mecânica se repetem em sequência: causa
     *    mal resolvida volta na parada seguinte;
     *  - inspeção e bloqueio aparecem depois de desvio de qualidade.
     */
    var vieses = {
      T1: { 'MOT-05': 3, 'MOT-07': 2 },   // manhã: abastecimento
      T2: { 'MOT-08': 3, 'MOT-15': 2 },   // tarde: ajuste e inspeção
      T3: { 'MOT-12': 4, 'MOT-14': 3 }    // madrugada: equipe reduzida
    };

    function sortearMotivo(instante, motivoAnterior) {
      var pool = [];
      Object.keys(perfil.pesoMotivos).forEach(function (cat) {
        var peso = perfil.pesoMotivos[cat];
        var lista = motivosPorCategoria[cat] || [];
        for (var i = 0; i < peso; i++) pool = pool.concat(lista);
      });
      var candidatos = pool.filter(function (m) { return !m.planejada; });
      if (!candidatos.length) candidatos = ds.motivos;

      /* O reforço é proporcional ao tamanho do conjunto de candidatos, e não
       * um número fixo: perfis com peso alto numa categoria têm conjunto
       * muito maior, e algumas cópias fixas se diluiriam a ponto de não
       * produzir padrão nenhum. Peso 3 significa acrescentar cerca de 30%
       * do conjunto em cópias daquele motivo. */
      var base = candidatos.length;
      var reforco = function (id, peso) {
        var m = candidatos.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        var copias = Math.ceil(base * peso / 10);
        for (var i = 0; i < copias; i++) candidatos.push(m);
      };

      /* Assinatura de cada turno. Equipes diferentes, supervisão diferente,
         disponibilidade de apoio diferente — o padrão de parada muda junto,
         e esse é um sinal independente da máquina, que é justamente o que
         um classificador precisa para superar o palpite por equipamento. */
      var porTurno = vieses[janela.turnoId] || {};
      Object.keys(porTurno).forEach(function (id) { reforco(id, porTurno[id]); });

      /* Fase do turno. Início: abastecimento ainda instável. Fim: equipe
         desmobilizando, espera por operador e por aprovação. Meio: a máquina
         é quem manda. */
      var decorrido = instante - janela.inicio;
      var duracaoTurno = janela.fim - janela.inicio;
      if (decorrido < duracaoTurno * 0.2) {
        reforco('MOT-05', 4);
        reforco('MOT-07', 3);
      } else if (decorrido > duracaoTurno * 0.8) {
        reforco('MOT-12', 3);
        reforco('MOT-14', 3);
      } else {
        reforco('MOT-02', 2);
        reforco('MOT-03', 2);
      }

      /* Ciclo curto desgasta ferramenta mais rápido. */
      if (cicloIdealSeg <= 30) reforco('MOT-04', 4);
      else if (cicloIdealSeg >= 90) reforco('MOT-08', 2);

      /* Afinidade produto–motivo: cada item tem a sua dor característica,
         geralmente ligada à geometria, ao material ou ao ferramental. */
      var porProduto = {
        'PR-1': 'MOT-04', 'PR-2': 'MOT-06', 'PR-3': 'MOT-08',
        'PR-4': 'MOT-17', 'PR-5': 'MOT-03'
      };
      if (porProduto[ordem.produtoId]) reforco(porProduto[ordem.produtoId], 4);

      /* Repetição: causa mal resolvida volta. */
      if (motivoAnterior === 'MOT-01' || motivoAnterior === 'MOT-02') reforco(motivoAnterior, 5);
      if (motivoAnterior === 'MOT-17') { reforco('MOT-15', 4); reforco('MOT-16', 3); }
      if (motivoAnterior === 'MOT-05') reforco('MOT-07', 3);

      return escolher(rnd, candidatos);
    }

    var t = janela.inicio;
    var ultimoMotivoNaoPlanejado = maq.ultimoMotivoSimulado || null;
    var setupsRestantes = inteiroEntre(rnd, perfil.setupsPorTurno[0], perfil.setupsPorTurno[1]);
    var primeiroBloco = true;

    /* Intervalo planejado de refeição no meio do turno. */
    var inicioRefeicao = janela.inicio + (janela.fim - janela.inicio) / 2;
    var refeicaoFeita = false;

    while (t < fimJanela) {
      /* (a) Setup no início da ordem e eventualmente durante o turno. */
      if ((primeiroBloco && setupsRestantes > 0) || (!primeiroBloco && setupsRestantes > 0 && rnd() < 0.25)) {
        var durSetup = minutosParaMs(entre(rnd, perfil.duracaoSetupMin[0], perfil.duracaoSetupMin[1]));
        t = registrarSegmento(ds, maq, ordem, janela, t, durSetup, 'SETUP', 'MOT-10', fimJanela, agora, rnd, null);
        setupsRestantes -= 1;
        primeiroBloco = false;
        if (t >= fimJanela) break;
      }
      primeiroBloco = false;

      /* (b) Bloco de produção. */
      var durProd = minutosParaMs(entre(rnd, perfil.duracaoProducaoMin[0], perfil.duracaoProducaoMin[1]));
      var fatorRitmo = entre(rnd, perfil.fatorRitmo[0], perfil.fatorRitmo[1]);
      var refugoPct = entre(rnd, perfil.refugoPct[0], perfil.refugoPct[1]);
      t = registrarSegmento(ds, maq, ordem, janela, t, durProd, 'PRODUZINDO', null, fimJanela, agora, rnd, {
        cicloRealSeg: cicloIdealSeg * fatorRitmo,
        refugoPct: refugoPct,
        operadorId: operador.id
      });
      if (t >= fimJanela) break;

      /* (c) Parada planejada de refeição, uma vez por turno. */
      if (!refeicaoFeita && t >= inicioRefeicao) {
        refeicaoFeita = true;
        t = registrarSegmento(ds, maq, ordem, janela, t, minutosParaMs(entre(rnd, 15, 25)),
          'PARADA_PLANEJADA', 'MOT-19', fimJanela, agora, rnd, null);
        if (t >= fimJanela) break;
        continue;
      }

      /* (d) Parada não planejada com motivo sorteado pelo perfil e pelo
             contexto (turno, hora, ciclo do produto, parada anterior). */
      var motivo = sortearMotivo(t, ultimoMotivoNaoPlanejado);
      ultimoMotivoNaoPlanejado = motivo.id;
      var durParada = minutosParaMs(entre(rnd, perfil.duracaoParadaMin[0], perfil.duracaoParadaMin[1]));
      var estado = motivo.estadoSugerido;
      /* Perfil de microparadas: paradas curtas são classificadas como tal. */
      if (perfil.microparada && durParada <= ds.config.limiteMicroparadaSeg * 1000) estado = 'MICROPARADA';
      t = registrarSegmento(ds, maq, ordem, janela, t, durParada, estado, motivo.id, fimJanela, agora, rnd, null);
    }
  }

  /* Cria um evento de estado (e os eventos de parada/produção associados).
     Devolve o novo instante corrente. */
  function registrarSegmento(ds, maq, ordem, janela, inicio, duracao, estado, motivoId, fimJanela, agora, rnd, producao) {
    var fim = Math.min(inicio + duracao, fimJanela);
    var emAndamento = (fimJanela >= agora) && (inicio + duracao > agora);

    ds.eventosEstado.push({
      id: novoId('EST'),
      maquinaId: maq.id,
      ordemId: ordem.id,
      turnoId: janela.turnoId,
      estado: estado,
      motivoId: motivoId,
      inicio: inicio,
      fim: emAndamento ? null : fim
    });

    var duracaoReal = (emAndamento ? agora : fim) - inicio;
    if (duracaoReal <= 0) return fim;

    var def = ESTADOS[estado];

    /* Eventos de parada alimentam Pareto e MTBF/MTTR. */
    if (def && def.classe !== 'PRODUTIVO') {
      var motivo = ds.motivos.filter(function (m) { return m.id === motivoId; })[0];
      ds.eventosParada.push({
        id: novoId('PAR'),
        maquinaId: maq.id,
        ordemId: ordem.id,
        turnoId: janela.turnoId,
        estado: estado,
        motivoId: motivoId,
        categoria: motivo ? motivo.categoria : 'Outros',
        planejada: def.classe === 'PLANEJADA',
        inicio: inicio,
        fim: emAndamento ? null : fim,
        duracaoSeg: Math.round(duracaoReal / 1000),
        comentario: ''
      });
    }

    /* Eventos de produção fatiados em blocos de até 30 min, para dar
       granularidade aos gráficos de produção por hora. */
    if (producao) {
      var restante = duracaoReal;
      var cursor = inicio;
      while (restante > 0) {
        var fatia = Math.min(restante, minutosParaMs(30));
        var qtd = Math.floor((fatia / 1000) / producao.cicloRealSeg);
        if (qtd > 0) {
          var refugo = Math.round(qtd * producao.refugoPct * entre(rnd, 0.6, 1.4));
          if (refugo >= qtd) refugo = Math.max(0, qtd - 1);
          var retrabalho = rnd() < 0.25 ? Math.round(refugo * entre(rnd, 0.2, 0.6)) : 0;
          ds.eventosProducao.push({
            id: novoId('PRD'),
            maquinaId: maq.id,
            ordemId: ordem.id,
            turnoId: janela.turnoId,
            produtoId: ordem.produtoId,
            operadorId: producao.operadorId,
            ts: cursor + fatia,
            qtdTotal: qtd,
            qtdRefugo: refugo,
            qtdRetrabalho: retrabalho,
            causaRefugo: refugo > 0 ? escolher(rnd, CAUSAS_REFUGO) : null,
            origem: 'SIMULADO'
          });
        }
        cursor += fatia;
        restante -= fatia;
      }
    }

    return fim;
  }

  /* ---------------------------------------------------------------------
   * 8. Exportação do módulo
   * ------------------------------------------------------------------- */
  OEE.Model = {
    ESTADOS: ESTADOS,
    ORDEM_ESTADOS: ORDEM_ESTADOS,
    MOTIVOS_PADRAO: MOTIVOS_PADRAO,
    CAUSAS_REFUGO: CAUSAS_REFUGO,
    TURNOS_PADRAO: TURNOS_PADRAO,
    PERFIS: PERFIS,
    novoId: novoId,
    horaParaMinutos: horaParaMinutos,
    janelasDeTurno: janelasDeTurno,
    turnoDoInstante: turnoDoInstante,
    criarRandom: criarRandom
  };

  OEE.Data = {
    gerarDemo: gerarDemo,
    cadastrosBase: cadastrosBase
  };
})(window);
