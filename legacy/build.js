/* =========================================================================
 * build.js
 * Responsabilidade: gerar oee-ipad.html — um único arquivo autocontido com
 * todo o CSS, todo o JavaScript e a biblioteca de gráficos embutidos.
 *
 * Por que isso existe: o Safari do iPad não carrega arquivos irmãos
 * (styles.css, app.js...) quando a página é aberta a partir do app Arquivos.
 * A página abre em branco, sem erro visível. Com tudo dentro de um arquivo só
 * não há nada a buscar, e a aplicação roda.
 *
 * Uso:  node build.js
 * O arquivo modular continua sendo a fonte da verdade; este script apenas
 * empacota. Depois de editar qualquer módulo, rode de novo.
 * ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const raiz = __dirname;
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');

/* Dentro de <script> ou <style>, a sequência "</script" ou "</style" encerra
 * o bloco mesmo estando no meio de uma string JavaScript. A barra escapada
 * não muda o significado do código e evita o problema. */
const seguro = (txt) => txt.replace(/<\/(script|style)/gi, (m, tag) => '<\\/' + tag);

/* Inserção literal. String.replace interpreta cifrões na string de troca:
 * "$$" viraria "$", "$&" viraria o próprio trecho encontrado. O código-fonte
 * usa "$" e "$$" como nomes de funções utilitárias, e a substituição textual
 * os corrompia silenciosamente. Passar uma função como segundo argumento
 * desliga essa interpretação. */
const inserir = (alvo, padrao, conteudo) => alvo.replace(padrao, () => conteudo);

const MODULOS = ['data.js', 'calculations.js', 'storage.js', 'audit.js', 'acmp.js', 'insights.js', 'charts.js', 'app.js'];

const html = ler('index.html');
const marca = ler('brand.css');
const css = ler('styles.css');
const chart = ler('lib', 'chart.umd.min.js');

/* Cabeça: troca os <link> das folhas de estilo pelo CSS embutido. A ordem
 * importa — brand.css traz as fontes e o logotipo que styles.css consome. */
let saida = inserir(
  html,
  /[ \t]*<link rel="stylesheet" href="brand\.css">/,
  '  <style>\n' + seguro(marca) + '\n  </style>'
);

saida = inserir(
  saida,
  /[ \t]*<link rel="stylesheet" href="styles\.css">/,
  '  <style>\n' + seguro(css) + '\n  </style>'
);

/* Gráficos: troca o <script src="lib/..."> pela biblioteca embutida. */
saida = inserir(
  saida,
  /[ \t]*<script src="lib\/chart\.umd\.min\.js" defer><\/script>/,
  '  <script>\n' + seguro(chart) + '\n  </script>'
);

/* Módulos da aplicação, na mesma ordem de dependência do arquivo modular. */
const modulosInline = MODULOS
  .map((arq) => '  <!-- ' + arq + ' -->\n  <script>\n' + seguro(ler(arq)) + '\n  </script>')
  .join('\n\n');

saida = inserir(
  saida,
  new RegExp(MODULOS.map((m) => '[ \\t]*<script src="' + m + '"></script>').join('\\s*'), 'm'),
  modulosInline
);

/* Aviso no topo do arquivo gerado, para ninguém editar o lugar errado. */
saida = saida.replace(
  '<!DOCTYPE html>',
  '<!DOCTYPE html>\n<!--\n  ARQUIVO GERADO POR build.js — NÃO EDITE À MÃO.\n' +
  '  Edite os módulos da pasta oee-mvp/ e rode: node build.js\n' +
  '  Gerado em ' + new Date().toISOString() + '\n-->'
);

/* Conferência: nada pode ter sobrado apontando para um arquivo externo. */
const pendentes = saida.match(/<(script src|link rel="stylesheet")[^>]*>/g);
if (pendentes) {
  console.error('Ainda há referências externas no arquivo gerado:', pendentes);
  process.exit(1);
}

fs.writeFileSync(path.join(raiz, 'oee-ipad.html'), saida);
console.log('oee-ipad.html gerado com ' + (saida.length / 1024).toFixed(0) + ' KB.');
