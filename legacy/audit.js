/* =========================================================================
 * audit.js
 * Responsabilidade: trilha de auditoria — registrar quem fez o quê, quando,
 * sobre qual objeto, e com qual valor antes e depois.
 *
 * Por que isso importa numa aplicação de OEE: o indicador é resultado de
 * classificação humana. Quem reclassifica uma parada de "falha mecânica"
 * para "parada planejada" muda a Disponibilidade do turno; quem edita o
 * ciclo ideal de um produto muda a Performance de todo o histórico. Sem
 * trilha, o número existe mas não se sustenta numa discussão.
 *
 * Três princípios adotados aqui:
 *
 *  1. Somente inclusão. Não existe caminho na interface que altere ou apague
 *     um registro de auditoria. Editar um registro operacional gera um novo
 *     registro de auditoria; nunca reescreve o anterior.
 *
 *  2. Antes e depois. Registrar "alterou o motivo" não serve para nada. O
 *     que serve é "motivo: Falha mecânica → Ajuste de processo".
 *
 *  3. Encadeamento. Cada registro carrega o hash do anterior, formando uma
 *     corrente. Remover ou alterar um registro no meio quebra a corrente e a
 *     tela de auditoria denuncia.
 *
 * Limite honesto do item 3: isto é evidência de adulteração, não prevenção.
 * O hash não é criptográfico e a corrente inteira pode ser recalculada por
 * quem tenha acesso ao arquivo. Serve contra edição casual do JSON, não
 * contra um adversário. Trilha inviolável de verdade exige servidor com
 * escrita append-only e assinatura fora do alcance do cliente — está na
 * seção de arquitetura futura do README.
 * ========================================================================= */
(function (global) {
  'use strict';

  var OEE = global.OEE = global.OEE || {};
  var Model = OEE.Model;

  /* Teto de registros mantidos no navegador. O LocalStorage tem poucos
   * megabytes; num sistema real a trilha é imutável e vai para o servidor. */
  var LIMITE = 4000;
  var REMOVER_POR_VEZ = 500;

  var CATEGORIAS = {
    OPERACAO:     { rotulo: 'Operação',      icone: '\u25B6' },
    PRODUCAO:     { rotulo: 'Produção',      icone: '\u25A4' },
    PARADA:       { rotulo: 'Paradas',       icone: '\u23F8' },
    ORDEM:        { rotulo: 'Ordens',        icone: '\u2637' },
    CADASTRO:     { rotulo: 'Cadastros',     icone: '\u270E' },
    CONFIGURACAO: { rotulo: 'Configurações', icone: '\u2692' },
    DADOS:        { rotulo: 'Dados',         icone: '\u2913' },
    SESSAO:       { rotulo: 'Sessão',        icone: '\u25CE' }
  };

  var ORIGENS = {
    OPERADOR:  { rotulo: 'Operador',  descricao: 'Ação disparada na tela de chão de fábrica' },
    GESTAO:    { rotulo: 'Gestão',    descricao: 'Ação disparada nas telas gerenciais' },
    SIMULACAO: { rotulo: 'Simulação', descricao: 'Evento gerado pelo simulador de dados' },
    SISTEMA:   { rotulo: 'Sistema',   descricao: 'Rotina automática da própria aplicação' }
  };

  /* Cada ação declara sua categoria e se é considerada sensível — as
   * sensíveis mudam indicadores já apurados e ganham destaque na tela. */
  var ACOES = {
    ESTADO_ALTERADO:        { rotulo: 'Estado alterado',        categoria: 'OPERACAO' },
    PARADA_INICIADA:        { rotulo: 'Parada iniciada',        categoria: 'PARADA' },
    PARADA_FINALIZADA:      { rotulo: 'Parada finalizada',      categoria: 'PARADA' },
    MOTIVO_RECLASSIFICADO:  { rotulo: 'Motivo reclassificado',  categoria: 'PARADA', sensivel: true },
    SETUP_INICIADO:         { rotulo: 'Setup iniciado',         categoria: 'OPERACAO' },
    SETUP_FINALIZADO:       { rotulo: 'Setup finalizado',       categoria: 'OPERACAO' },
    MANUTENCAO_SOLICITADA:  { rotulo: 'Manutenção solicitada',  categoria: 'OPERACAO' },
    OBSERVACAO_REGISTRADA:  { rotulo: 'Observação registrada',  categoria: 'OPERACAO' },
    SUGESTAO_ACEITA:        { rotulo: 'Sugestão do ACMP aceita',   categoria: 'OPERACAO' },
    SUGESTAO_IGNORADA:      { rotulo: 'Sugestão do ACMP ignorada', categoria: 'OPERACAO' },

    PRODUCAO_APONTADA:      { rotulo: 'Produção apontada',      categoria: 'PRODUCAO' },
    REFUGO_APONTADO:        { rotulo: 'Refugo apontado',        categoria: 'PRODUCAO', sensivel: true },
    RETRABALHO_APONTADO:    { rotulo: 'Retrabalho apontado',    categoria: 'PRODUCAO' },
    APONTAMENTO_RECUSADO:   { rotulo: 'Apontamento recusado',   categoria: 'PRODUCAO' },

    ORDEM_ABERTA:           { rotulo: 'Ordem aberta',           categoria: 'ORDEM' },
    ORDEM_FINALIZADA:       { rotulo: 'Ordem finalizada',       categoria: 'ORDEM' },

    REGISTRO_CRIADO:        { rotulo: 'Registro criado',        categoria: 'CADASTRO' },
    REGISTRO_ALTERADO:      { rotulo: 'Registro alterado',      categoria: 'CADASTRO', sensivel: true },
    REGISTRO_EXCLUIDO:      { rotulo: 'Registro excluído',      categoria: 'CADASTRO', sensivel: true },
    EXCLUSAO_BLOQUEADA:     { rotulo: 'Exclusão bloqueada',     categoria: 'CADASTRO' },

    METAS_ALTERADAS:        { rotulo: 'Metas alteradas',        categoria: 'CONFIGURACAO', sensivel: true },
    SIMULACAO_ALTERADA:     { rotulo: 'Simulação alterada',     categoria: 'CONFIGURACAO' },
    ACMP_ALTERADO:          { rotulo: 'Assistente ACMP alterado', categoria: 'CONFIGURACAO' },

    DADOS_EXPORTADOS:       { rotulo: 'Dados exportados',       categoria: 'DADOS' },
    DADOS_IMPORTADOS:       { rotulo: 'Dados importados',       categoria: 'DADOS', sensivel: true },
    DEMO_RESTAURADA:        { rotulo: 'Demonstração restaurada', categoria: 'DADOS', sensivel: true },
    HISTORICO_PODADO:       { rotulo: 'Histórico podado',       categoria: 'DADOS' },
    TRILHA_PODADA:          { rotulo: 'Trilha podada',          categoria: 'DADOS' },

    APLICACAO_INICIADA:     { rotulo: 'Aplicação iniciada',     categoria: 'SESSAO' },
    MODO_ALTERADO:          { rotulo: 'Modo alterado',          categoria: 'SESSAO' }
  };

  /* ---------------------------------------------------------------------
   * Hash FNV-1a de 32 bits. Escolhido por ser curto, determinístico e
   * implementável em poucas linhas sem depender de Web Crypto — que é
   * assíncrono e indisponível em contexto file://, justamente o caso do
   * iPad. Não é resistente a colisão proposital; ver ressalva no topo.
   * ------------------------------------------------------------------- */
  function hashTexto(texto) {
    var h = 0x811c9dc5;
    for (var i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function estavel(valor) {
    if (valor === null || valor === undefined) return '';
    if (typeof valor !== 'object') return String(valor);
    /* Chaves ordenadas: a mesma informação sempre produz o mesmo hash,
       independentemente da ordem em que os campos foram montados. */
    return Object.keys(valor).sort().map(function (k) {
      return k + '=' + estavel(valor[k]);
    }).join(',');
  }

  function calcularHash(reg) {
    return hashTexto([
      reg.hashAnterior || 'inicio',
      reg.ts, reg.origem, reg.categoria, reg.acao,
      reg.usuario, reg.maquinaId || '', reg.ordemId || '',
      reg.entidade || '', reg.entidadeId || '',
      reg.descricao,
      estavel(reg.antes), estavel(reg.depois), estavel(reg.detalhes)
    ].join('|'));
  }

  /* ---------------------------------------------------------------------
   * Registro
   * ------------------------------------------------------------------- */
  function registrar(ds, ev) {
    if (!ds || !ev || !ev.acao) return null;
    if (!Array.isArray(ds.auditoria)) ds.auditoria = [];

    var def = ACOES[ev.acao] || {};
    var anterior = ds.auditoria[ds.auditoria.length - 1];

    var reg = {
      id: Model.novoId('AUD'),
      ts: ev.ts || Date.now(),
      origem: ev.origem || 'GESTAO',
      categoria: ev.categoria || def.categoria || 'SESSAO',
      acao: ev.acao,
      sensivel: !!def.sensivel,
      usuario: ev.usuario || 'não identificado',
      descricao: ev.descricao || def.rotulo || ev.acao,
      maquinaId: ev.maquinaId || null,
      ordemId: ev.ordemId || null,
      turnoId: ev.turnoId || null,
      operadorId: ev.operadorId || null,
      entidade: ev.entidade || null,
      entidadeId: ev.entidadeId || null,
      antes: ev.antes || null,
      depois: ev.depois || null,
      detalhes: ev.detalhes || null,
      hashAnterior: anterior ? anterior.hash : null
    };
    reg.hash = calcularHash(reg);

    ds.auditoria.push(reg);
    podar(ds);
    return reg;
  }

  /* A poda é ela própria auditada: sem esse registro, um intervalo em branco
   * na trilha seria indistinguível de apagamento deliberado. */
  function podar(ds) {
    if (ds.auditoria.length <= LIMITE) return;
    var removidos = ds.auditoria.splice(0, REMOVER_POR_VEZ);
    var marcador = {
      id: Model.novoId('AUD'),
      ts: Date.now(),
      origem: 'SISTEMA',
      categoria: 'DADOS',
      acao: 'TRILHA_PODADA',
      sensivel: false,
      usuario: 'sistema',
      descricao: removidos.length + ' registros antigos removidos da trilha por limite de armazenamento.',
      maquinaId: null, ordemId: null, turnoId: null, operadorId: null,
      entidade: 'auditoria', entidadeId: null,
      antes: null, depois: null,
      detalhes: {
        removidos: removidos.length,
        maisAntigoRemovido: removidos[0] ? removidos[0].ts : null,
        maisRecenteRemovido: removidos[removidos.length - 1] ? removidos[removidos.length - 1].ts : null,
        limite: LIMITE
      },
      hashAnterior: null
    };
    marcador.hash = calcularHash(marcador);
    ds.auditoria.unshift(marcador);
  }

  /* ---------------------------------------------------------------------
   * Comparação campo a campo — o coração de um "antes e depois" útil
   * ------------------------------------------------------------------- */
  function diferencas(antes, depois) {
    var lista = [];
    if (!antes && !depois) return lista;
    var chaves = {};
    Object.keys(antes || {}).forEach(function (k) { chaves[k] = true; });
    Object.keys(depois || {}).forEach(function (k) { chaves[k] = true; });

    Object.keys(chaves).forEach(function (k) {
      var de = antes ? antes[k] : undefined;
      var para = depois ? depois[k] : undefined;
      if (estavel(de) !== estavel(para)) lista.push({ campo: k, de: de, para: para });
    });
    return lista;
  }

  /* ---------------------------------------------------------------------
   * Verificação de integridade da corrente
   * ------------------------------------------------------------------- */
  function verificarIntegridade(ds) {
    var trilha = (ds && ds.auditoria) || [];
    var alterados = [];
    var quebras = [];

    for (var i = 0; i < trilha.length; i++) {
      var reg = trilha[i];
      /* Recalcula o hash com os valores atuais do registro. Diferente do
         gravado significa que algum campo foi editado depois do fato. */
      if (calcularHash(reg) !== reg.hash) alterados.push(reg);

      /* O elo com o registro anterior detecta remoção no meio da trilha. */
      if (i > 0) {
        var esperado = trilha[i - 1].hash;
        var truncadoLegitimo = trilha[i - 1].acao === 'TRILHA_PODADA' && reg.hashAnterior !== esperado;
        if (reg.hashAnterior !== esperado && !truncadoLegitimo) quebras.push(reg);
      }
    }
    return {
      total: trilha.length,
      alterados: alterados,
      quebras: quebras,
      integra: alterados.length === 0 && quebras.length === 0
    };
  }

  /* ---------------------------------------------------------------------
   * Consulta
   * ------------------------------------------------------------------- */
  function filtrar(ds, c) {
    var trilha = (ds && ds.auditoria) || [];
    c = c || {};
    var busca = (c.busca || '').trim().toLowerCase();

    return trilha.filter(function (r) {
      if (c.inicio && r.ts < c.inicio) return false;
      if (c.fim && r.ts > c.fim) return false;
      if (c.categoria && r.categoria !== c.categoria) return false;
      if (c.origem && r.origem !== c.origem) return false;
      if (c.acao && r.acao !== c.acao) return false;
      if (c.operadorId && r.operadorId !== c.operadorId) return false;
      if (c.turnoId && r.turnoId !== c.turnoId) return false;
      if (c.ordemId && r.ordemId !== c.ordemId) return false;
      /* Registros sem máquina (configuração, importação) são de escopo geral
         e continuam visíveis mesmo com uma máquina filtrada — omiti-los
         esconderia justamente as ações de maior impacto. */
      if (c.maquinaIds && r.maquinaId && c.maquinaIds.indexOf(r.maquinaId) < 0) return false;
      if (busca) {
        var alvo = [r.descricao, r.usuario, r.entidadeId, r.entidade,
          estavel(r.antes), estavel(r.depois), estavel(r.detalhes)].join(' ').toLowerCase();
        if (alvo.indexOf(busca) < 0) return false;
      }
      return true;
    });
  }

  function resumo(registros) {
    var porCategoria = {}, porOrigem = {}, sensiveis = 0, usuarios = {};
    registros.forEach(function (r) {
      porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + 1;
      porOrigem[r.origem] = (porOrigem[r.origem] || 0) + 1;
      usuarios[r.usuario] = true;
      if (r.sensivel) sensiveis += 1;
    });
    return {
      total: registros.length,
      sensiveis: sensiveis,
      usuarios: Object.keys(usuarios).length,
      porCategoria: porCategoria,
      porOrigem: porOrigem,
      primeiro: registros.length ? registros[0].ts : null,
      ultimo: registros.length ? registros[registros.length - 1].ts : null
    };
  }

  OEE.Audit = {
    CATEGORIAS: CATEGORIAS,
    ORIGENS: ORIGENS,
    ACOES: ACOES,
    LIMITE: LIMITE,
    registrar: registrar,
    filtrar: filtrar,
    resumo: resumo,
    diferencas: diferencas,
    verificarIntegridade: verificarIntegridade,
    hashTexto: hashTexto
  };
})(window);
