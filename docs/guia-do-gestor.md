# Guia do gestor

Este texto é para quem decide com o número: supervisor, PCP, qualidade e manutenção. O operador tem o guia próprio em `docs/guia-do-operador.md`. Leia aquele também. O número que você cobra é o número que ele lança.

Entre com o usuário **gestao**. Na demonstração local a senha é `gestao`. Na fábrica, use a senha que foi definida no servidor. Não deixe a senha de exemplo publicada.

O endereço publicado da fábrica é `https://diforp.rankia.cloud`, se o túnel estiver no ar. No Docker da sua máquina, `http://localhost`.

Gestão vê o menu inteiro. No rodapé, **Alternar modo Operador / Gestão** mostra só as telas do posto (Operação, O que fazer, Configurações). Use isso para acompanhar o que o operador vê, sem sair da sua conta. **Sair** encerra a sessão neste navegador.

## O que cada tela responde

| Tela | A pergunta que ela responde | O recorte do número |
| --- | --- | --- |
| Visão geral | A planta está saudável agora, e o que pede ação? | Gráficos: o período do filtro. Andon: o turno que está aberto agora. |
| Operação | O que esta máquina está fazendo nesta ordem? | A ordem aberta. Sem ordem, zero. |
| Máquinas | Qual equipamento puxa o OEE para baixo no período? | O filtro |
| Produção | Quanto saiu, contra a meta de cada ordem? | O filtro |
| Paradas | Onde foi o tempo, e qual motivo se repete? | O filtro |
| Qualidade | Quanto foi refugo e retrabalho? | O filtro |
| Performance | O ciclo real está longe do ciclo ideal? | O filtro |
| O que olhar | Qual desvio tem uma ação escrita? | O filtro |
| ACMP | O modelo de motivo está acertando? | Amostras já gravadas |
| Manuais | O PDF do posto está indexado? | Por máquina |
| O que fazer | O que o operador perguntaria | Fato no banco, passo no PDF |
| Auditoria | Quem lançou o quê, e o registro foi alterado? | A trilha |
| Cadastros | Planta, linha, máquina, produto, turno, operador, motivo, ordem | Cadastro |
| Configurações | Quais limites e metas valem para a conta | Um conjunto para a aplicação |

O browser não recalcula OEE. Se duas telas discordam, quase sempre o recorte é outro: ordem contra turno, ou turno contra 24 horas. Não são dois cálculos.

## Filtro: a planta abre primeiro

No topo das telas de gestão há filtros: período, planta, área, linha, máquina, produto, ordem, turno, operador.

No primeiro acesso, a planta não vem vazia. O filtro abre na planta gravada neste navegador (`oee.planta`). Se não houver, abre a primeira planta do cadastro. Planta Sul e Planta Norte deixam de aparecer misturadas até você trocar o filtro de propósito.

Trocar a planta zera área, linha e máquina, para você não filtrar uma linha que não existe na planta nova.

Períodos: 1 hora, 8 horas, 24 horas, 7 dias, 30 dias, hoje, turno e um intervalo que você escolhe. **Turno** é o turno de agora, no horário de São Paulo (06:00–14:00, 14:00–22:00, 22:00–06:00).

Indicadores, paradas e qualidade pedem essa janela ao servidor. Não carregam o histórico inteiro da fábrica.

## Visão geral

### Para agir agora

Os cartões são condições abertas, não um histórico.

| Tipo | Quando aparece | O que você faz |
| --- | --- | --- |
| Parada longa | Parada não planejada, aguardando material ou aguardando operador passou do limite | Abra a Operação da máquina e confirme se alguém foi chamado e se o motivo ainda vale |
| Setup longo | Setup passou da meta de setup, em minutos | Veja o que trava a troca. Não entra como parada longa genérica: o texto diz a meta |
| Sem peça | Produzindo além do limite sem peça nesta janela do turno | O operador deve lançar a produção ou registrar falta de material. O aviso também está na Operação dele |
| Refugo | Refugo dividido pelo produzido passou da meta, com pelo menos 20 peças | Separe o lote e a causa antes de cobrar a meta |

Padrões, se ninguém mudou a configuração:

- parada longa: 15 minutos; crítica a partir de 30 minutos;
- sem peça: 20 minutos;
- refugo: 2%;
- setup: o campo **Meta de tempo de setup (min)**, padrão 20.

Parada planejada, limpeza e refeição não geram esse cartão.

Toque no texto do cartão para abrir a Operação daquela máquina.

**Vi, ocultar 1 h** esconde o cartão neste navegador por uma hora. A condição continua verdadeira. Outro computador da gestão continua vendo. Não grava responsável nem baixa o alerta no servidor. Use para não reler o mesmo cartão a cada atualização, não para dar o caso como encerrado.

Se em Configurações houver um **Endereço para aviso de alerta crítico**, o servidor envia o alerta crítico para esse endereço, no máximo uma vez por hora e por máquina. Sem endereço, o aviso só existe com a Visão geral aberta. Não há WhatsApp nem e-mail embutido: o endereço é o que você colar (um webhook que a sua empresa já tenha).

### Fechar o turno desta planta

O botão **Fechar o turno desta planta** confirma o número do turno que está aberto, na planta do filtro.

Depois do fecho:

- o operador não lança peça nem muda estado naquele intervalo, naquela planta;
- a tela dele diz que o turno já foi fechado;
- você, na conta gestão, ainda consegue ajustar. Cada ajuste fica na Auditoria;
- fechar de novo o mesmo turno não duplica o fecho.

Reabrir é um chamado de gestão, `POST /turnos/reabrir/{id}`, não um botão da Visão geral. Sem reabrir, o operador continua bloqueado até o intervalo daquele turno passar.

Feche quando o número daquele turno estiver aceito. Não feche no meio do turno se o operador ainda precisa lançar a última hora.

### Os cartões de OEE do período

OEE, disponibilidade, performance, qualidade, produção, tempo e MTBF/MTTR são do **filtro**, não do relógio do andon. Um filtro de 7 dias ao lado de um relógio de agora é de propósito nos gráficos. O andon, abaixo, é outro relógio.

**Verificar apontamentos** aparece se a performance ou a disponibilidade passaram de 100%. Isso é sobreposição de estado, ciclo ideal curto demais, ou peça lançada sem a parada correspondente. Não comemore performance acima de 100%. Abra a Auditoria da máquina.

### Seis grandes perdas

É o plano da semana, no período do filtro.

| Perda | O que mede | Unidade |
| --- | --- | --- |
| Parada | Tempo de parada não planejada, sem contar a microparada | Tempo |
| Setup | Tempo em setup | Tempo |
| Microparada | Paradas que voltaram dentro do limite | Tempo |
| Ciclo lento | Tempo operando menos o tempo que as peças deveriam ter levado no ciclo ideal | Tempo |
| Refugo | Peças rejeitadas | Peças |
| Retrabalho | Peças em retrabalho | Peças |

Ataque a maior perda, não o OEE no abstrato. Parada pede manutenção e motivo. Setup pede a meta de minutos. Ciclo lento pede o ciclo ideal do produto e a velocidade real. Refugo pede a causa lançada pelo operador.

### Estado das máquinas agora

Cada cartão é uma máquina da planta filtrada. Mostra o estado pelo nome, há quanto tempo nesse estado **neste turno**, e **OEE do turno**. Esse OEE é o mesmo turno da Operação, não o OEE de 24 horas ou de 7 dias dos gráficos de cima.

Toque no cartão para abrir a Operação da máquina.

## Operação, do lado da gestão

Você pode lançar no lugar do operador. O lançamento entra com origem gestão e aparece na auditoria. Use isso para corrigir, não para produzir no lugar de quem está no posto.

A produção da tela é a ordem aberta. Encerrar a ordem zera os cartões do posto. O histórico da ordem continua em Produção e na Auditoria.

Se o operador lançou refugo de peça já contada sem marcar a caixa, o produzido ficou inflado. O conserto é um ajuste com trilha, não um lançamento negativo. O sistema recusa quantidade negativa.

O crachá é a matrícula do cadastro de Operadores. Sem matrícula cadastrada, o posto não assume o nome.

## Máquinas

Tabela do período: hierarquia, estado agora, OEE, disponibilidade, performance, qualidade, produção, refugo, parada não planejada e quantidade de paradas. O nome da máquina abre a Operação.

O gráfico ao lado compara disponibilidade, performance e qualidade entre máquinas do filtro. A barra mais baixa é por onde começar.

## Produção

Produção total, aprovada, refugo, retrabalho, ciclo ideal médio e ciclo real médio, no filtro.

**Produção realizada versus meta por ordem** coloca, lado a lado, o que a ordem pediu e o que foi lançado. A tabela **Ordens no período** repete código, máquina, produto, meta, realizado e o percentual da meta.

Uma ordem finalizada no posto continua nesta tabela. O posto zerou a tela; o histórico não.

## Paradas

Tempo parado total, não planejado, planejado, quantidade, MTBF e MTTR.

MTBF é o tempo operando dividido pelo número de falhas. MTTR é o tempo dessas falhas dividido pela quantidade. Os dois só existem se houve falha no período. Sem falha, o cartão fica sem valor, e isso é bom.

O Pareto lista os motivos das paradas não planejadas, do maior tempo para o menor. A outra pizza agrupa por categoria: Máquina, Material, Processo, Pessoas, Qualidade, Outros.

A tabela **Registros de parada** é o evento: máquina, motivo, início, fim, duração. Microparada aparece com esse estado se a volta foi dentro do limite.

## Qualidade

Qualidade é aprovado dividido pelo produzido.

Aprovado, por padrão, é produzido menos refugo. Retrabalho fica ao lado e não entra nessa conta.

Se em Configurações estiver marcado **Retrabalho conta como perda de qualidade**, aprovado passa a ser produzido menos refugo menos retrabalho. A qualidade cai quando há retrabalho. Decida isso com a planta e deixe marcado ou desmarcado de forma estável. Mudar no meio do mês muda o OEE do período inteiro, porque a fórmula é aplicada na hora da consulta, não gravada dentro de cada peça antiga.

A meta de refugo (padrão 2%) é a linha do alerta. Abaixo dela, com volume pequeno (menos de 20 peças), o alerta não dispara, para um refugo de uma peça não pintar a planta inteira.

## Performance

Performance é o tempo que as peças deveriam ter levado (quantidade × ciclo ideal) dividido pelo tempo em que a máquina estava operando.

Ciclo ideal vem do produto na ordem, ou do ciclo da máquina se a ordem não tiver. Ciclo ideal errado no cadastro mente a performance: curto demais empurra a performance para cima de 100%; longo demais faz a máquina parecer lenta.

Ciclo real é o tempo operando dividido pelas peças. Compare com o ideal na própria tela.

## O que olhar

Desvios do período, cada um com uma ação escrita ("Faça agora"). É leitura. A ação de verdade continua sendo a parada, o manual ou o cadastro. Não substitui o cartão **Para agir agora**, que é o turno vivo.

## ACMP

O ACMP sugere o motivo da parada. Não escolhe sozinho. O operador confirma.

Na Operação, o formulário de parada abre na hora. A lista de sugestão entra em seguida. O worker calcula o top 3 de cada máquina e guarda por alguns minutos. Se o cache existir, a lista não espera o modelo. Se não existir, a tela calcula na hora.

Com menos de 30 paradas classificadas, o modelo cai no cálculo simples herdado da prova de conceito. Com amostra suficiente, usa o modelo treinado. A tela **ACMP** mostra se o acerto está bom. **Treinar** dispara um treino agora. O worker também retreina de tempos em tempos quando já há paradas bastantes.

Cada vez que o operador aceita ou ignora a sugestão, isso fica registrado. Use essa taxa para saber se o modelo ajuda ou atrapalha. Sugestão ruim demais: desligue **ACMP ativo** em Configurações. A parada continua, só sem a lista sugerida.

## Manuais

Só gestão envia PDF.

1. Abra **Manuais**.
2. Escolha a máquina. Um manual sem máquina vale como geral da planta.
3. Envie o PDF.
4. Espere o status **Pronto**, com páginas e trechos maiores que zero. O worker indexa. Enquanto está **Processando**, o chat ainda não usa esse arquivo.
5. **Erro** significa que a indexação falhou. O motivo mais comum é a ausência da chave do Gemini no servidor. Reprocesse depois de corrigir.

O chat de procedimento só responde o que está nesses trechos. Trocar o PDF muda a resposta guardada: a pergunta antiga não fica presa à versão velha.

Sem chave do Gemini, o fato do posto (ordem, falha, OEE, produção) continua respondendo. O passo a passo não.

## O que fazer, para conferir

A mesma tela do operador. Use para checar se o banco e o manual respondem o que você espera, na máquina certa.

Perguntas de ordem, últimas ordens e última falha têm de responder só isso. Se a resposta voltar um bloco enorme de estado, produção, turno anterior e lista de paradas, o navegador está com a tela antiga. Atualize duas vezes com Ctrl+F5.

## Auditoria

Cada apontamento, abertura e fechamento de ordem, crachá, fechamento de turno e mudança de cadastro gera uma linha: hora, usuário, ação, máquina e o antes/depois.

Ações que interessam na cobrança do número:

- Produção apontada
- Refugo apontado
- Retrabalho apontado
- Ordem aberta e Ordem finalizada
- Estado alterado, parada iniciada, parada finalizada
- Operador assumiu o posto
- Turno fechado e Turno reaberto
- Metas alteradas

Abra o registro para ver quantidade, causa e se o refugo entrou com quantidade total zero (peça já contada) ou com quantidade total igual ao refugo (lote novo).

A trilha tem hash encadeado. Se alguém alterar a linha no banco, a verificação de integridade marca a quebra. A tela não oferece edição da trilha.

## Cadastros

Abas: plantas, áreas, linhas, máquinas, produtos, turnos, operadores, motivos, ordens e metas.

O que muda o número de verdade:

- **Operadores.** Matrícula é o crachá. Sem matrícula igual à que o operador digita, o posto não assume o nome.
- **Produtos.** Ciclo ideal em segundos por peça. É o denominador da performance.
- **Máquinas.** Ciclo padrão do equipamento, usado quando a ordem não traz outro. Meta por turno é referência de cadastro. A meta que a Operação mostra é a meta da ordem aberta.
- **Linhas.** **Parada longa (min)** e **Sem peça (min)**. Vazio usa o número geral de Configurações. Preencha quando injetora e torno não podem ter o mesmo limite.
- **Motivos.** Categoria, se é planejada, e o estado que a máquina assume. Não apague um motivo que já foi usado em parada: a auditoria aponta para o código.
- **Turnos.** 06:00, 14:00 e 22:00. Mudar o horário muda o corte do OEE do turno. Faça isso parado, com a gestão de acordo, não no meio de um turno que você vai fechar.
- **Ordens.** Dá para consultar e corrigir cadastro. A ordem do dia a dia nasce em **Iniciar ordem** na Operação, não nesta aba.

## Configurações

Aba **Metas e ciclos**. Toque em **Salvar metas** depois de mudar. A auditoria registra **Metas alteradas**.

| Campo | O que faz | Padrão |
| --- | --- | --- |
| Meta de OEE (%) | A faixa bom / atenção / crítico nos cartões | 75% |
| Meta de tempo de setup (min) | Acima disso, a Visão geral alerta setup longo | 20 |
| Meta de refugo (%) | Acima disso, com pelo menos 20 peças, alerta de refugo | 2% |
| Limite de microparada (s) | Voltou antes disso: a parada vira microparada | 300 |
| Parada longa (min) | Acima disso, alerta de parada. A linha pode ter outro número | 15 |
| Produzindo sem peça (min) | Acima disso, sem peça, alerta no posto e na gestão | 20 |
| Retrabalho conta como perda de qualidade | Se marcado, retrabalho sai do aprovado | Desmarcado |
| Endereço para aviso de alerta crítico | Para onde o crítico é enviado. Vazio = só a tela | Vazio |

Simulação, quando ligada, faz o worker inventar sinal de máquina e apontamento. Serve para demonstração. Na fábrica real, deixe desligada. Simulação ligada mistura peça fictícia com peça do operador.

## OEE, em uma conta

Para a janela que a tela pediu (a ordem, o turno ou o filtro):

- **Disponibilidade** = tempo em que a máquina podia produzir, descontada a parada não planejada, dividido pelo tempo descontada só a parada planejada. Parada planejada (refeição, preventiva) sai dos dois lados e não pune a disponibilidade.
- **Performance** = peças × ciclo ideal, dividido pelo tempo operando.
- **Qualidade** = aprovado dividido pelo produzido.
- **OEE** = os três multiplicados. Se falta um dos três (por exemplo, zero peças, então qualidade não existe), o OEE fica sem valor. A tela mostra `—`, não zero. Zero seria uma máquina que produziu e teve OEE nulo. Sem peça, o OEE não foi calculado.

Peça lançada só como refugo de lote novo entra no produzido e no rejeitado. Qualidade cai. Peça marcada como "já estava no produzido" não aumenta o produzido e aumenta o rejeitado. Qualidade cai do mesmo jeito, sem inflar o volume.

## Sinal da máquina

`POST /operacao/sinal` avisa se a máquina está produzindo ou parada.

- Parou: abre parada não planejada sem motivo. O posto pede **Confirmar motivo**.
- Voltou: volta para Produzindo.
- O mesmo aviso de parada, repetido, não abre segunda parada.

Se a máquina tiver um token gravado, o equipamento precisa enviar o cabeçalho `X-Maquina-Token` com esse valor. Sem o token certo, o aviso é recusado. Enquanto a máquina não tem token, o aviso ainda aceita um usuário logado. É assim que o simulador funciona. O CLP da fábrica ainda não está ligado a esse contrato. Quando estiver, grave o token na máquina e não compartilhe o token do torno com a prensa.

## Cópia do banco

O script `infra/scripts/backup-postgres.sh` gera um `pg_dump` compactado. O comando de restauração está impresso no final da execução do script. A restauração não foi executada no banco que está no ar. Não rode a restauração em cima do banco de produção para "testar": ela reescreve os dados. Teste num banco vazio.

## O que ainda não está no chão

- Nenhum CLP real chama o sinal. O simulador faz esse papel quando a simulação está ligada.
- **Vi, ocultar 1 h** não tem responsável no servidor.
- O aviso fora da tela só existe se você colar um endereço.
- O teste automático que grava no Postgres, vira o turno e confere o cartão não roda fora do Docker, porque a biblioteca de vetor do manual não está instalada no Python solto. A conta de refugo, microparada, chat e retrabalho tem teste sem banco.
