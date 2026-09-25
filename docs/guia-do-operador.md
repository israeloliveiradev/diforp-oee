# Guia do operador

Este texto é para quem está na máquina. Leia uma vez inteiro. Depois use o índice quando travar em um botão.

O endereço do sistema é o que o supervisor passou (na fábrica publicada, `https://diforp.rankia.cloud`). No computador de demonstração, com o Docker local, é `http://localhost`.

Você entra com o usuário **operador**. A senha da demonstração local é `operador`. Na fábrica, use a senha que a gestão te deu. Não use o usuário `gestao`.

O que esta conta enxerga no menu da esquerda:

- **Operação** — é a sua tela. Tudo que muda peça, parada e ordem acontece aqui.
- **O que fazer** — pergunta o estado da máquina e o passo do manual. Não liga a máquina e não aponta peça.
- **Configurações** — você só consulta. Não salva meta, não liga o simulador e não importa arquivo.

Sair fica no rodapé do menu: **Sair**.

## O que os números significam

A tela não inventa o OEE. Ela mostra o que o servidor calculou a partir do que você apontou.

Na Operação, peça, meta e OEE são **desta ordem aberta**, não do turno inteiro e não da ordem que você acabou de encerrar.

| Cartão | O que é | O que muda o número |
| --- | --- | --- |
| Produzido | Soma das peças lançadas nesta ordem | **Registrar produção**. Um refugo de lote novo também entra aqui. |
| Aprovado | Produzido menos rejeitado | Sobe com produção boa. Cai quando você marca refugo de peça que já estava contada. |
| Rejeitado | Peças ruins desta ordem | **Registrar refugo** |
| Retrabalho | Peças que voltam para retrabalho | **Registrar retrabalho**. Por padrão não tira peça do aprovado. |
| OEE | Disponibilidade × performance × qualidade desta ordem | Tempo produzindo, parada e peças desta ordem |
| Meta da ordem | Quantas peças a ordem pediu | Definida ao iniciar a ordem |

Se não há ordem aberta, produzido, aprovado, rejeitado e retrabalho ficam em **0**. O OEE fica sem valor (`—`). A frase na tela é: a produção da ordem anterior fica no histórico, não neste posto.

A frase debaixo da barra da meta decide o resto do turno:

- **Meta batida.** Você já passou da quantidade pedida.
- **Neste ritmo fecha às HH:MM.** No ritmo atual, a meta estoura antes do fim do turno.
- **Neste ritmo não fecha.** No ritmo atual, o turno acaba antes da meta.
- **Meta não definida.** A ordem não tem meta. Isso não deveria acontecer: a meta é obrigatória ao abrir a ordem.

O ritmo é peças por hora desde o início desta ordem.

A cor do cartão de estado não é o estado. Leia o nome: Produzindo, Setup, Parada não planejada, Microparada, Aguardando material, Aguardando operador, Manutenção, Limpeza, Parada planejada, Sem ordem de produção.

## Turnos

O relógio da fábrica é o de São Paulo.

| Turno | Começa | Termina |
| --- | --- | --- |
| Turno 1 | 06:00 | 14:00 |
| Turno 2 | 14:00 | 22:00 |
| Turno 3 | 22:00 | 06:00 do dia seguinte |

Na virada, o servidor corta o estado que estava aberto e recomeça a contagem no turno novo. O cronômetro do posto não continua a hora de ontem. A ordem aberta continua aberta: a virada não finaliza a ordem sozinha.

## Começo do turno, nesta ordem

1. Abra **Operação**.
2. No campo **Máquina**, escolha o equipamento em que você está. O sistema lembra a última máquina neste navegador.
3. No campo **Crachá**, digite a sua matrícula e toque em **Assumir**. O nome ao lado de **Operador** passa a ser o seu. O login continua sendo o usuário compartilhado `operador`. O apontamento seguinte grava o seu nome, não o de quem estava antes.
4. Se a matrícula não existir no cadastro, a tela diz **Crachá não encontrado.** Peça à gestão para cadastrar você em Cadastros, aba Operadores. Sem o crachá, a peça entra no operador que já estava na máquina, ou em branco.
5. Se **Ordem** diz **Sem ordem aberta**, toque em **Iniciar ordem** antes de qualquer peça. Sem ordem, **Registrar produção** é recusado.

### Iniciar ordem

Toque em **Iniciar ordem**. Preencha:

- **Produto.** O que a máquina vai fazer agora.
- **Operador.** Quem responde pela ordem. Se você já assumiu o crachá, confira se o nome é o seu.
- **Ciclo ideal (s/peça).** Quantos segundos uma peça boa deveria levar. A tela sugere o ciclo do produto. Não deixe zero.
- **Meta do turno (peças).** Quantas peças esta ordem precisa fazer. A tela sugere um número a partir do tempo que falta no turno e do ciclo. Ajuste se o supervisor passou outra meta. Tem de ser maior que zero.

Toque em **Iniciar ordem**. A máquina vai para **Setup**. A ordem ganha um código `OP-…`. Os cartões de produção desta ordem começam em zero.

O setup é a troca, o ajuste e a primeira peça de acerto. Não lance a produção do lote enquanto ainda está em setup, a menos que o supervisor mande contar essas peças.

Quando a máquina estiver pronta para rodar, toque em **Finalizar setup**. O estado passa a **Produzindo**.

Se precisar voltar ao ajuste, toque em **Iniciar setup**.

## Registrar produção

Use quando saíram peças novas, boas ou ainda não separadas.

1. Toque em **Registrar produção**.
2. Some a quantidade com os atalhos `+1`, `+5`, `+10`, `+25`, `+50`, `+100`, ou digite o número.
3. Toque em **Registrar**.

O que acontece: **Produzido** sobe essa quantidade. **Aprovado** sobe a mesma quantidade, porque ainda não há refugo nesse lançamento. A barra da meta anda. O servidor grava um evento com a hora, a ordem, a máquina e o operador do crachá.

Não use este botão para peça ruim. Peça ruim é **Registrar refugo**.

Não dá para registrar zero. Não dá para registrar sem ordem aberta.

## Registrar refugo

Há dois casos. Errar o caso mente o produzido.

### Lote ruim novo

As peças ruins **não** tinham sido lançadas em **Registrar produção**. Elas aparecem agora e já nascem ruins.

1. Toque em **Registrar refugo**.
2. Informe a quantidade.
3. Escolha a **Causa**:
   - Dimensional fora de tolerância
   - Aspecto superficial
   - Contaminação
   - Falha de solda
   - Erro de montagem
   - Peça incompleta
4. Deixe **desmarcada** a caixa **Destas peças já estavam no produzido**.
5. Toque em **Registrar**.

O que acontece: a quantidade entra em **Produzido** e em **Rejeitado**. **Aprovado** não sobe. Exemplo: a ordem estava em 0. Você lança 2 de refugo de lote novo. Produzido fica 2, rejeitado fica 2, aprovado fica 0.

### Peça que já estava contada como boa

Você já lançou as peças em **Registrar produção**. Depois achou que algumas daquelas saíram ruins. Se lançar de novo como lote novo, o produzido cresce duas vezes.

1. Toque em **Registrar refugo**.
2. Informe só a quantidade que virou ruim, não o lote inteiro.
3. Escolha a causa.
4. **Marque** **Destas peças já estavam no produzido**. A tela avisa: não soma de novo em Produzido. Só move de aprovado para rejeitado.
5. Toque em **Registrar**.

Exemplo. Você lançou 25 boas. Produzido 25, aprovado 25, rejeitado 0. Depois descobre que 2 daquelas 25 estão ruins. Com a caixa marcada, o resultado fica:

- Produzido: **25** (não vira 27)
- Rejeitado: **2**
- Aprovado: **23**

Se você esquecer a caixa, o sistema entende lote novo: produzido vai a 27 e rejeitado a 2. Aprovado fica 25. Esse número está errado. Se aconteceu, chame a gestão. Ela ajusta com trilha na auditoria. Não lance a diferença "para compensar" por conta própria: isso cria outro evento e piora a conta.

## Registrar retrabalho

Use quando a peça não é sucata, mas volta para retrabalho.

1. Toque em **Registrar retrabalho**.
2. Informe a quantidade.
3. Toque em **Registrar**.

**Retrabalho** sobe. **Produzido** não sobe. Por padrão **Aprovado** também não cai: a peça continua contada como aprovada e, em separado, como retrabalho.

Se a planta decidiu que retrabalho é perda de qualidade, a gestão marca em Configurações a opção **Retrabalho conta como perda de qualidade**. Aí o aprovado passa a ser produzido menos rejeitado menos retrabalho. Você não muda essa regra na sua conta.

## Parada

Toque em **Registrar parada** assim que a máquina deixa de produzir. O formulário abre na hora. A sugestão de motivo pode entrar um segundo depois. Não espere a sugestão para abrir.

Escolha a categoria e o motivo. Os motivos mudam o estado:

| Se aconteceu isto | Motivo | Estado em que a máquina fica |
| --- | --- | --- |
| Faltou peça, blank, resina, componente | Falta de material | Aguardando material |
| O abastecimento atrasou | Atraso no abastecimento | Aguardando material |
| Não há operador no posto | Falta de operador | Aguardando operador |
| Falha elétrica ou mecânica que pede manutenção | Falha elétrica ou Falha mecânica | Manutenção |
| Sensor, ferramenta, ajuste, inspeção, bloqueio | O motivo correspondente | Parada não planejada |
| Limpeza prevista, refeição, preventiva, treinamento | O motivo planejado | Limpeza ou Parada planejada |
| Troca de produto ou de formato | Setup ou Troca de formato | Setup |

Escreva uma observação curta se o motivo sozinho não explica (qual ferramenta, qual sensor). Toque em **Confirmar**.

Enquanto a parada está aberta:

- **Pausar produção** e **Registrar parada** ficam indisponíveis. A máquina já está parada.
- **Alterar motivo** corrige a causa se você escolheu a errada. Use isso em vez de finalizar e abrir outra parada.
- **Finalizar parada** é o botão de quando a máquina volta a produzir.

### Voltou rápido: vira microparada

O limite padrão é **300 segundos** (5 minutos). A gestão pode ter outro número em Configurações, campo **Limite de microparada (s)**.

Se você toca em **Finalizar parada** antes desse limite, e a parada era parada não planejada, aguardando material ou aguardando operador:

- a máquina volta para **Produzindo**;
- aquela parada deixa de ser parada cheia e passa a ser **Microparada**;
- não precisa escolher outro motivo na volta.

Setup, manutenção, limpeza e parada planejada **não** viram microparada, mesmo que durem pouco.

Se a parada passou do limite, **Finalizar parada** volta para Produzindo e a parada continua parada cheia, com o motivo que você escolheu.

### A máquina avisou sozinha

Se aparecer **A máquina sinalizou parada**, o equipamento (ou o simulador) avisou que parou e ainda não há motivo. Toque em **Confirmar motivo** e escolha a causa. Sem isso o tempo fica parado sem explicação e a gestão vê o alerta.

Um aviso repetido da mesma parada não abre outra parada. Você confirma o motivo uma vez.

### Produzindo há muito tempo sem peça

Se o estado é **Produzindo**, a ordem está aberta, e passou o limite sem nenhuma peça nesta ordem (padrão **20 minutos**; a gestão pode mudar em **Produzindo sem peça**), a Operação mostra o aviso no posto. Você tem dois caminhos, e precisa escolher um. Deixar o aviso na tela mente o OEE: a máquina parece produzindo e a peça não existe.

- **Registrar produção**, se as peças saíram e você ainda não lançou.
- **Falta de material**, se está sem peça, blank ou componente. Isso abre a parada já com o motivo Falta de material. A máquina vai para **Aguardando material**. Não fique em Produzindo esperando material.

O mesmo aviso também aparece para a gestão, na Visão geral.

### Manutenção

**Solicitar manutenção** pede um motivo da categoria Máquina (falha elétrica, falha mecânica, sensor, ferramenta). A máquina fica em **Manutenção**.

Quando a manutenção terminar e a máquina puder produzir, toque em **Finalizar parada**. O estado volta para **Produzindo**. Se a volta ainda não é produção, use **Iniciar setup** ou **Registrar parada** com o motivo certo, em vez de deixar em Produzindo parado.

## Passagem de turno

No fim do seu turno, com a ordem ainda aberta, toque em **Passagem de turno**.

A folha mostra:

- o turno e o código da ordem;
- produzido, rejeitado e aprovado desta ordem;
- se neste ritmo a meta fecha, a que horas, ou se não fecha;
- se há parada ainda aberta e desde quando.

No campo **O que o próximo operador precisa saber**, escreva o que não está no número: ferramenta frouxa, lote separado, falta de material pedida, inspeção no meio. Toque em **Deixar para o próximo**.

Isso grava uma observação na máquina. Não fecha a ordem e não zera os cartões. O próximo operador lê a observação com a gestão, ou pergunta em **O que fazer**.

A passagem só aparece com ordem aberta. Sem ordem, não há folha: os cartões já estão zerados.

## Finalizar ordem

Toque em **Finalizar ordem** quando o lote acabou ou o supervisor mandou encerrar. A tela pede confirmação: a ordem será encerrada e a máquina ficará sem ordem.

O que acontece:

- a ordem vai para o histórico, com status finalizada;
- a máquina fica **Sem ordem de produção**;
- produzido, aprovado, rejeitado, retrabalho e a meta **desta tela** voltam a zero;
- o OEE desta ordem deixa de aparecer no posto.

A ordem encerrada não some do mundo. A gestão vê as peças em Produção e na Auditoria. Você não vê mais esse número no posto. A ordem nova começa do zero. Se os números da ordem velha continuarem na tela depois de finalizar, atualize a página duas vezes (Ctrl+F5). Se ainda continuarem, chame a gestão: a tela que você está vendo é antiga.

Não finalize a ordem só porque o turno virou. A virada corta o relógio. A ordem continua até alguém tocar em **Finalizar ordem**.

## Linha do tempo e últimos eventos

**Linha do tempo da ordem** mostra os estados desta ordem, do início da ordem até agora. Sem ordem, fica **Sem ordem aberta.**

**Últimos eventos** lista os estados recentes desta ordem: hora, nome do estado, motivo e duração. Parada de outra ordem não entra aqui.

## O que fazer

Menu **O que fazer**. Escolha a máquina antes de perguntar. Sem máquina, a resposta pede para escolher ou dizer o nome dela na frase.

Toque numa pergunta pronta ou escreva a sua. A resposta muda conforme a frase:

| Você pergunta | O que volta | De onde sai |
| --- | --- | --- |
| Qual a ordem de produção atual? | Código, produto, meta e se está aberta | Banco, na hora |
| Quais foram as últimas ordens de produção? | As últimas ordens desta máquina, da mais recente para a antiga | Banco, na hora |
| Quando foi a última falha? | A última parada não planejada, com hora, motivo e duração. Setup e "sem ordem" não contam como falha | Banco, na hora |
| Qual o status desta máquina agora? | Estado, desde quando neste turno, turno e ordem aberta | Banco, na hora |
| Quanto já produziu neste turno? | Peças do turno (produzidas, aprovadas, refugo, retrabalho) e a última peça lançada | Banco, na hora |
| Qual o OEE deste turno e a meta foi batida? | OEE, disponibilidade, performance, qualidade e peças do turno | Banco, na hora |
| O que fazer quando falta material? | O estado do posto e, se o manual tiver, o passo a passo | Banco na hora; o passo vem do manual |

Pergunta de ordem, falha ou produção **não** responde "isso não está no manual". Se não houver o registro, a frase diz que não há esse registro nesta máquina.

Pergunta de procedimento (como trocar, como apontar, alarme, passo a passo) lê o PDF daquela máquina. A resposta tem no máximo cinco ações e uma linha: chame manutenção, ou não precisa. Se o manual não tem o passo, a resposta manda chamar o supervisor. Ela não inventa torque, código de alarme nem nome de peça.

O chat não aperta botão por você. Se ele disser que faltou material, você ainda precisa tocar em **Registrar parada** ou em **Falta de material** na Operação.

A produção que o chat chama de "neste turno" é a soma do turno. Os cartões da Operação são a soma da ordem aberta. Os dois podem diferir se houve outra ordem no mesmo turno. Para decidir se a meta desta ordem fecha, olhe a Operação, não essa frase do chat.

## Sem rede no tablet

Se a rede cair no momento em que você registra produção, refugo, retrabalho ou muda o estado, o tablet guarda o lançamento. A mensagem é: **Sem rede. O apontamento ficou neste tablet e sobe quando a conexão voltar, sem duplicar.**

Não lance a mesma quantidade de novo "porque não entrou". Quando a rede volta, o tablet envia sozinho. O servidor reconhece a chave e não soma a peça duas vezes.

Se a tela inteira não abre, o túnel caiu. Espere a rede ou chame a gestão. O que já estava guardado no tablet sobe depois. O que você só pensou em lançar e não tocou em Registrar não está guardado.

## O que você não faz

- Não altera meta de OEE, meta de refugo, limite de parada nem o endereço de aviso. Isso é Configurações da gestão.
- Não envia PDF de manual.
- Não fecha o turno da planta. Quem fecha é a gestão, em Visão geral. Se o turno foi fechado, a Operação recusa apontamento novo com a frase de que o turno já foi fechado. Pare e chame o supervisor. Não tente "ajustar" lançando em outra máquina.
- Não usa o chat para ligar ou desligar a máquina.

## Se algo parecer mentira

1. Confira se a ordem da tela é a ordem que você está fazendo. O título é **Produção da ordem** mais o código.
2. Confira se o refugo foi de lote novo ou de peça já contada.
3. Confira se você está na máquina certa, no seletor do topo.
4. Atualize a página duas vezes.
5. Se o número continuar errado, chame a gestão e diga a hora, a máquina, o código da ordem e o botão que você tocou. A auditoria tem o evento. Não apague lançando o contrário.
