/* =========================================================================
 * storage.js
 * Responsabilidade: persistência e acesso aos dados.
 *
 * O restante da aplicação nunca fala com o LocalStorage diretamente: ele
 * usa a interface OEE.DataSource. Trocar a origem dos dados (REST, MQTT,
 * OPC UA, InfluxDB, historiador) significa fornecer outro objeto com os
 * mesmos métodos e registrá-lo em OEE.DataSource.usar(fonte).
 *
 * Contrato da interface:
 *   carregar()            -> Promise<dataset>
 *   salvar(dataset)       -> Promise<void>
 *   restaurarDemo()       -> Promise<dataset>
 *   disponivel()          -> boolean
 * ========================================================================= */
(function (global) {
  'use strict';

  var OEE = (global.OEE = global.OEE || {});

  var CHAVE_DATASET = 'oee.mvp.v1.dataset';
  var CHAVE_PREFERENCIAS = 'oee.mvp.v1.preferencias';

  /* ---------------------------------------------------------------------
   * Camada de LocalStorage tolerante a falhas.
   * Abrir index.html via file:// pode bloquear o LocalStorage em alguns
   * navegadores; nesse caso caímos para um armazenamento em memória e
   * avisamos a interface.
   * ------------------------------------------------------------------- */
  var memoria = {};
  var localDisponivel = (function () {
    try {
      var teste = '__oee_teste__';
      global.localStorage.setItem(teste, '1');
      global.localStorage.removeItem(teste);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function ler(chave) {
    try {
      return localDisponivel ? global.localStorage.getItem(chave) : (memoria[chave] || null);
    } catch (e) {
      return memoria[chave] || null;
    }
  }

  function escrever(chave, valor) {
    try {
      if (localDisponivel) global.localStorage.setItem(chave, valor);
      else memoria[chave] = valor;
      return true;
    } catch (e) {
      /* Cota excedida ou acesso negado: mantém em memória para não perder
         a sessão do operador. */
      memoria[chave] = valor;
      return false;
    }
  }

  function remover(chave) {
    try { if (localDisponivel) global.localStorage.removeItem(chave); } catch (e) { /* ignora */ }
    delete memoria[chave];
  }

  /* ---------------------------------------------------------------------
   * Validação mínima do dataset
   * ------------------------------------------------------------------- */
  var COLECOES = [
    'plantas', 'areas', 'linhas', 'maquinas', 'produtos', 'turnos',
    'operadores', 'motivos', 'ordens', 'eventosEstado', 'eventosProducao',
    'eventosParada', 'observacoes'
  ];

  function validarDataset(ds) {
    var erros = [];
    if (!ds || typeof ds !== 'object') { erros.push('Arquivo não contém um objeto de dados.'); return erros; }
    COLECOES.forEach(function (c) {
      if (!Array.isArray(ds[c])) erros.push('Coleção ausente ou inválida: ' + c + '.');
    });
    if (!ds.empresa) erros.push('Empresa não informada.');
    if (!ds.config) erros.push('Bloco de configuração ausente.');
    return erros;
  }

  /* Preenche coleções ausentes para manter compatibilidade entre versões. */
  function normalizar(ds) {
    COLECOES.forEach(function (c) { if (!Array.isArray(ds[c])) ds[c] = []; });
    /* Fora de COLECOES de propósito: arquivos exportados antes da trilha
       existir continuam válidos, apenas entram com a trilha vazia. */
    if (!Array.isArray(ds.auditoria)) ds.auditoria = [];
    ds.config = ds.config || {};
    if (ds.config.metaOEE === undefined) ds.config.metaOEE = 0.75;
    if (ds.config.metaSetupMin === undefined) ds.config.metaSetupMin = 20;
    if (ds.config.metaRefugoPct === undefined) ds.config.metaRefugoPct = 0.02;
    if (ds.config.limiteMicroparadaSeg === undefined) ds.config.limiteMicroparadaSeg = 300;
    if (ds.config.intervaloSimulacaoSeg === undefined) ds.config.intervaloSimulacaoSeg = 5;
    if (ds.config.simulacaoAtiva === undefined) ds.config.simulacaoAtiva = false;
    if (ds.config.auditarSimulacao === undefined) ds.config.auditarSimulacao = true;
    if (ds.config.acmpAtivo === undefined) ds.config.acmpAtivo = true;
    ds.meta = ds.meta || { versao: 1 };
    return ds;
  }

  /* ---------------------------------------------------------------------
   * Implementação LocalStorage da interface DataSource
   * ------------------------------------------------------------------- */
  var LocalStorageSource = {
    nome: 'LocalStorage',

    disponivel: function () { return true; },

    avisoPersistencia: function () {
      if (localDisponivel) return null;
      return ehIOS()
        ? 'O Safari bloqueou o armazenamento local neste contexto. A aplicação funciona normalmente, mas os dados ficam só na memória e se perdem ao fechar a aba. Para conservar o histórico, use Configurações › Exportar JSON e salve em Arquivos, ou abra a aplicação por HTTP.'
        : 'O navegador bloqueou o armazenamento local neste contexto. Os dados desta sessão ficam apenas na memória e serão perdidos ao fechar a aba. Sirva a pasta por HTTP para persistir.';
    },

    carregar: function () {
      return new Promise(function (resolve) {
        var bruto = ler(CHAVE_DATASET);
        if (!bruto) { resolve(null); return; }
        try {
          resolve(normalizar(JSON.parse(bruto)));
        } catch (e) {
          console.error('Dataset corrompido no armazenamento local. Gerando novo conjunto.', e);
          remover(CHAVE_DATASET);
          resolve(null);
        }
      });
    },

    salvar: function (dataset) {
      return new Promise(function (resolve, reject) {
        try {
          var ok = escrever(CHAVE_DATASET, JSON.stringify(dataset));
          if (!ok) console.warn('Gravação feita apenas em memória.');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    },

    restaurarDemo: function (opcoes) {
      var ds = OEE.Data.gerarDemo(opcoes || {});
      var self = this;
      return self.salvar(ds).then(function () { return ds; });
    },

    limpar: function () {
      remover(CHAVE_DATASET);
      return Promise.resolve();
    }
  };

  /* ---------------------------------------------------------------------
   * Exemplo (não ativo) de fonte remota — mostra o ponto de extensão.
   * Para usar no futuro: OEE.DataSource.usar(OEE.Storage.criarRestSource('/api'))
   * ------------------------------------------------------------------- */
  function criarRestSource(baseUrl) {
    return {
      nome: 'REST',
      disponivel: function () { return typeof fetch === 'function'; },
      avisoPersistencia: function () { return null; },
      carregar: function () {
        return fetch(baseUrl + '/dataset').then(function (r) { return r.json(); }).then(normalizar);
      },
      salvar: function (dataset) {
        return fetch(baseUrl + '/dataset', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataset)
        }).then(function () { return undefined; });
      },
      restaurarDemo: function () {
        return fetch(baseUrl + '/dataset/demo', { method: 'POST' })
          .then(function (r) { return r.json(); }).then(normalizar);
      }
    };
  }

  /* ---------------------------------------------------------------------
   * Fachada usada pela aplicação
   * ------------------------------------------------------------------- */
  var fonteAtual = LocalStorageSource;

  var DataSource = {
    usar: function (fonte) { fonteAtual = fonte; },
    atual: function () { return fonteAtual; },
    carregar: function () { return fonteAtual.carregar(); },
    salvar: function (ds) { return fonteAtual.salvar(ds); },
    restaurarDemo: function (o) { return fonteAtual.restaurarDemo(o); },
    aviso: function () { return fonteAtual.avisoPersistencia ? fonteAtual.avisoPersistencia() : null; }
  };

  /* ---------------------------------------------------------------------
   * Preferências de interface (modo, máquina selecionada, filtros)
   * ------------------------------------------------------------------- */
  function lerPreferencias() {
    try { return JSON.parse(ler(CHAVE_PREFERENCIAS) || '{}'); } catch (e) { return {}; }
  }
  function salvarPreferencias(prefs) { escrever(CHAVE_PREFERENCIAS, JSON.stringify(prefs)); }

  /* ---------------------------------------------------------------------
   * Exportação / importação
   * ------------------------------------------------------------------- */
  /* No iPad o atributo `download` é ignorado quando a página vem de file://:
   * o Safari abre o conteúdo numa aba em vez de salvar. A folha de
   * compartilhamento do próprio sistema resolve — ela oferece "Salvar em
   * Arquivos", e-mail, AirDrop — então tentamos por ela primeiro quando o
   * dispositivo souber compartilhar arquivos. O caminho clássico continua
   * valendo em desktop e Android. */
  function baixarArquivo(nome, conteudo, tipo) {
    var mime = tipo + ';charset=utf-8;';

    if (typeof File === 'function' && navigator.share && navigator.canShare) {
      try {
        var arquivo = new File([conteudo], nome, { type: tipo });
        if (navigator.canShare({ files: [arquivo] })) {
          navigator.share({ files: [arquivo], title: nome }).catch(function () {
            baixarPorLink(nome, conteudo, mime);
          });
          return;
        }
      } catch (e) { /* segue para o caminho clássico */ }
    }
    baixarPorLink(nome, conteudo, mime);
  }

  function baixarPorLink(nome, conteudo, mime) {
    var blob = new Blob([conteudo], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.rel = 'noopener';
    /* Sem o target o Safari substitui a aplicação pelo arquivo e o operador
     * perde a tela; abrindo em outra aba, ele volta com um toque. */
    if (ehIOS()) a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* iPadOS moderno se identifica como Macintosh; o que o denuncia é ter
   * tela sensível ao toque. */
  function ehIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
  }

  function carimboArquivo() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
      '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  }

  function exportarJSON(dataset) {
    baixarArquivo('oee-dados-' + carimboArquivo() + '.json', JSON.stringify(dataset, null, 2), 'application/json');
  }

  /* CSV com separador ponto e vírgula e BOM, para abrir direto no Excel pt-BR. */
  function paraCSV(linhas) {
    return '\ufeff' + linhas.map(function (linha) {
      return linha.map(function (celula) {
        var v = (celula === null || celula === undefined) ? '' : String(celula);
        if (/[";\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
        return v;
      }).join(';');
    }).join('\n');
  }

  function dataISO(ts) { return ts ? new Date(ts).toISOString() : ''; }

  function exportarCSV(dataset, tipo) {
    var linhas = [];
    var nome = 'oee-' + tipo + '-' + carimboArquivo() + '.csv';
    var indexar = function (colecao) {
      var m = {};
      (dataset[colecao] || []).forEach(function (i) { m[i.id] = i; });
      return m;
    };
    var maquinas = indexar('maquinas'), produtos = indexar('produtos'),
        ordens = indexar('ordens'), motivos = indexar('motivos'), operadores = indexar('operadores');

    if (tipo === 'producao') {
      linhas.push(['id', 'dataHora', 'maquina', 'ordem', 'produto', 'turno', 'operador', 'qtdTotal', 'qtdRefugo', 'qtdRetrabalho', 'causaRefugo']);
      dataset.eventosProducao.forEach(function (e) {
        linhas.push([e.id, dataISO(e.ts),
          (maquinas[e.maquinaId] || {}).nome, (ordens[e.ordemId] || {}).codigo,
          (produtos[e.produtoId] || {}).nome, e.turnoId,
          (operadores[e.operadorId] || {}).nome,
          e.qtdTotal, e.qtdRefugo, e.qtdRetrabalho, e.causaRefugo || '']);
      });
    } else if (tipo === 'paradas') {
      linhas.push(['id', 'maquina', 'ordem', 'turno', 'estado', 'categoria', 'motivo', 'planejada', 'inicio', 'fim', 'duracaoSeg', 'comentario']);
      dataset.eventosParada.forEach(function (e) {
        linhas.push([e.id, (maquinas[e.maquinaId] || {}).nome, (ordens[e.ordemId] || {}).codigo, e.turnoId,
          e.estado, e.categoria, (motivos[e.motivoId] || {}).nome, e.planejada ? 'sim' : 'não',
          dataISO(e.inicio), dataISO(e.fim), e.duracaoSeg, e.comentario || '']);
      });
    } else if (tipo === 'estados') {
      linhas.push(['id', 'maquina', 'ordem', 'turno', 'estado', 'inicio', 'fim', 'duracaoSeg']);
      dataset.eventosEstado.forEach(function (e) {
        var fim = e.fim || Date.now();
        linhas.push([e.id, (maquinas[e.maquinaId] || {}).nome, (ordens[e.ordemId] || {}).codigo, e.turnoId,
          e.estado, dataISO(e.inicio), dataISO(e.fim), Math.round((fim - e.inicio) / 1000)]);
      });
    } else if (tipo === 'ordens') {
      linhas.push(['id', 'codigo', 'maquina', 'produto', 'turno', 'metaQtd', 'cicloIdealSeg', 'status', 'inicio', 'fim']);
      dataset.ordens.forEach(function (o) {
        linhas.push([o.id, o.codigo, (maquinas[o.maquinaId] || {}).nome, (produtos[o.produtoId] || {}).nome,
          o.turnoId, o.metaQtd, o.cicloIdealSeg, o.status, dataISO(o.inicio), dataISO(o.fim)]);
      });
    } else if (tipo === 'auditoria') {
      linhas.push(['id', 'dataHora', 'origem', 'categoria', 'acao', 'sensivel', 'usuario',
        'maquina', 'ordem', 'turno', 'objeto', 'objetoId', 'descricao', 'antes', 'depois', 'contexto', 'hash', 'hashAnterior']);
      (dataset.auditoria || []).forEach(function (r) {
        linhas.push([r.id, dataISO(r.ts), r.origem, r.categoria, r.acao, r.sensivel ? 'sim' : 'não', r.usuario,
          (maquinas[r.maquinaId] || {}).nome || '', (ordens[r.ordemId] || {}).codigo || '', r.turnoId || '',
          r.entidade || '', r.entidadeId || '', r.descricao,
          r.antes ? JSON.stringify(r.antes) : '', r.depois ? JSON.stringify(r.depois) : '',
          r.detalhes ? JSON.stringify(r.detalhes) : '', r.hash, r.hashAnterior || '']);
      });
    } else if (tipo === 'oee-maquina') {
      linhas.push(['maquina', 'linha', 'oee', 'disponibilidade', 'performance', 'qualidade', 'producaoTotal', 'refugo', 'tempoOperacionalSeg', 'tempoParadoSeg']);
      var fim = Date.now(), ini = fim - 24 * 3600000;
      dataset.maquinas.forEach(function (m) {
        var r = OEE.Calc.calcularOEE({
          eventosEstado: dataset.eventosEstado.filter(function (e) { return e.maquinaId === m.id; }),
          eventosProducao: dataset.eventosProducao.filter(function (e) { return e.maquinaId === m.id; }),
          eventosParada: dataset.eventosParada.filter(function (e) { return e.maquinaId === m.id; }),
          inicio: ini, fim: fim,
          cicloIdealSeg: OEE.Calc.cicloIdealMedio(dataset, [m.id], ini, fim),
          config: dataset.config
        });
        var linha = (dataset.linhas.filter(function (l) { return l.id === m.linhaId; })[0] || {}).nome;
        linhas.push([m.nome, linha,
          r.oee === null ? '' : (r.oee * 100).toFixed(2),
          r.disponibilidade === null ? '' : (r.disponibilidade * 100).toFixed(2),
          r.performance === null ? '' : (r.performance * 100).toFixed(2),
          r.qualidade === null ? '' : (r.qualidade * 100).toFixed(2),
          r.producaoTotal, r.refugo, Math.round(r.tempoOperacionalSeg),
          Math.round(r.paradaNaoPlanejadaSeg + r.paradaPlanejadaSeg)]);
      });
    }

    baixarArquivo(nome, paraCSV(linhas), 'text/csv');
  }

  /* Lê um arquivo JSON escolhido pelo usuário e devolve o dataset validado. */
  function importarJSON(arquivo) {
    return new Promise(function (resolve, reject) {
      if (!arquivo) { reject(new Error('Nenhum arquivo selecionado.')); return; }
      var leitor = new FileReader();
      leitor.onload = function () {
        try {
          var ds = JSON.parse(leitor.result);
          var erros = validarDataset(ds);
          if (erros.length) { reject(new Error('Arquivo inválido. ' + erros.join(' '))); return; }
          resolve(normalizar(ds));
        } catch (e) {
          reject(new Error('Não foi possível ler o arquivo: ' + e.message));
        }
      };
      leitor.onerror = function () { reject(new Error('Falha na leitura do arquivo.')); };
      leitor.readAsText(arquivo);
    });
  }

  OEE.Storage = {
    LocalStorageSource: LocalStorageSource,
    criarRestSource: criarRestSource,
    lerPreferencias: lerPreferencias,
    salvarPreferencias: salvarPreferencias,
    exportarJSON: exportarJSON,
    exportarCSV: exportarCSV,
    importarJSON: importarJSON,
    validarDataset: validarDataset,
    normalizar: normalizar,
    ehIOS: ehIOS,
    localDisponivel: localDisponivel
  };

  OEE.DataSource = DataSource;
})(window);
