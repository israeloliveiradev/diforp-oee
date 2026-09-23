"""Gera 10 manuais PDF completos (texto extraível) para o posto."""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

FONTE = Path(r"C:\Windows\Fonts\arial.ttf")
FONTE_B = Path(r"C:\Windows\Fonts\arialbd.ttf")
SAIDA = Path(__file__).resolve().parent


class Manual(FPDF):
    def __init__(self, titulo: str, codigo: str):
        super().__init__(format="A4")
        self._titulo = titulo
        self._codigo = codigo
        self.set_auto_page_break(auto=True, margin=18)
        self.add_font("corpo", "", str(FONTE))
        self.add_font("corpo", "B", str(FONTE_B))
        self.set_title(titulo)
        self.set_lang("pt")

    def header(self):
        self.set_font("corpo", "B", 9)
        self.set_text_color(21, 82, 99)
        self.cell(0, 6, "Indústria Modelo S.A.  ·  Manual de posto — leia antes de agir", align="L")
        self.ln(4)
        self.set_draw_color(217, 123, 41)
        self.set_line_width(0.6)
        self.line(10, 14, 200, 14)
        self.ln(6)

    def footer(self):
        self.set_y(-14)
        self.set_font("corpo", "", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, f"{self._codigo}  ·  {self._titulo[:52]}  ·  p. {self.page_no()}", align="C")

    def titulo(self, texto: str):
        self.set_font("corpo", "B", 15)
        self.set_text_color(21, 82, 99)
        self.multi_cell(0, 8, texto)
        self.ln(1)
        self.set_font("corpo", "", 10)
        self.set_text_color(80, 80, 80)
        self.multi_cell(0, 5, f"Documento {self._codigo}  ·  Revisão 2.0  ·  Uso no posto. Se o passo não estiver aqui, chame o supervisor. Não invente procedimento.")
        self.ln(6)

    def h2(self, texto: str):
        self.ln(3)
        self.set_font("corpo", "B", 12)
        self.set_text_color(217, 123, 41)
        self.multi_cell(0, 7, texto)
        self.ln(1)

    def p(self, texto: str):
        self.set_font("corpo", "", 11)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 6, texto)
        self.ln(2)

    def item(self, texto: str):
        self.set_font("corpo", "", 11)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 6, texto)
        self.ln(1)


def _e_passo(par: str) -> bool:
    return len(par) >= 2 and par[0].isdigit() and par[1] in ".)"


def gravar(codigo: str, titulo: str, blocos: list[tuple[str, list[str]]], arquivo: str) -> Path:
    pdf = Manual(titulo, codigo)
    pdf.add_page()
    pdf.titulo(titulo)
    for secao, paragrafos in blocos:
        pdf.h2(secao)
        for par in paragrafos:
            if _e_passo(par):
                pdf.item(par)
            else:
                pdf.p(par)
    destino = SAIDA / arquivo
    pdf.output(str(destino))
    return destino


MANUAIS: list[dict] = [
    {
        "codigo": "MAN-MQ1",
        "titulo": "Torno CNC 01 — operação, alarme de ferramenta e troca de eixo",
        "maquina_id": "MQ-1",
        "arquivo": "man-mq1-torno-cnc-01.pdf",
        "blocos": [
            (
                "Para que serve esta máquina",
                [
                    "O Torno CNC 01 (código MQ-1) fica na Linha 01 de Eixos, Planta Sul, Joinville. Ele usina o Eixo motriz 1020 (ciclo ideal 42 segundos) e o Eixo secundário 2040 (ciclo ideal 55 segundos).",
                    "Você opera o painel, troca ferramenta, faz setup e aponta no OEE. Você não abre o painel elétrico, não zera alarme sem olhar a ferramenta e não produz sem ordem aberta.",
                ],
            ),
            (
                "Começo de turno — checklist",
                [
                    "1. Confira se há ordem aberta no OEE para o CNC 01. Sem ordem: não aponte peça.",
                    "2. Veja o estado no cartão: Produzindo, Setup, Parada ou Sem ordem. O nome do estado vale mais que a cor.",
                    "3. Nível de óleo da cabeçote visível na janela. Abaixo da marca: chame manutenção, não complete com óleo errado.",
                    "4. Ar comprimido no manômetro da linha: 6 bar ou mais. Abaixo de 5,5 bar a porta pode não travar.",
                    "5. Porta da cabine fecha e o sensor de porta acende verde. Porta aberta = ciclo não arma.",
                    "6. Primeira peça do turno: meça diâmetro e comprimento. Só então continue produzindo.",
                ],
            ),
            (
                "Alarme F-41 — quebra ou desgaste de insert",
                [
                    "O F-41 para o ciclo sozinho. Significa insert quebrado, gasto ou solto. Não aperte CICLO, não dê RESET cego e não force o fuso.",
                    "1. No OEE, registre Parada não planejada com motivo Ferramenta.",
                    "2. Espere o fuso zerar no visor (0 rpm). Só então abra a porta.",
                    "3. Use luva e retire o insert. Se o porta-insert estiver lascado ou a cunha torta, troque o conjunto inteiro. Não reaproveite insert trincado.",
                    "4. Coloque insert novo TNMG 160408, classe P20. Aperto: 8 N·m com o torquímetro do posto (gaveta 2). Sem torquímetro: chame o líder, não aperte no feeling.",
                    "5. No CNC, abra CORRETOR. T01 = desbaste. T02 = acabamento. Zere o offset da ferramenta que quebrou.",
                    "6. Feche a porta. Rode UMA peça de conferência em modo único (não automático).",
                    "7. Meça a peça: diâmetro ±0,05 mm e comprimento ±0,10 mm. Se passar, peça ao supervisor o OK verbal e volte para Produzindo.",
                    "8. Se o F-41 voltar em menos de 10 peças: pare, registre Manutenção (possível folga no revolver) e NÃO continue.",
                ],
            ),
            (
                "Outros alarmes comuns neste torno",
                [
                    "Alarme P-12 porta aberta: feche a porta até o verde. Se já está fechada e o alarme fica, registre Sensor e chame manutenção. Não cole fita no sensor.",
                    "Alarme L-03 lubrificação: olhe o reservatório. Vazio: manutenção. Cheio e alarme: sensor ou bomba — manutenção. Você não fura o alarme.",
                    "Alarme C-22 sobrecarga do fuso: peça provavelmente prendeu. Pare, abra depois de 0 rpm, retire a peça com o extrator. Se o mandril não abre, manutenção.",
                ],
            ),
            (
                "Setup: trocar EX-1020 por EX-2040 (ou o contrário)",
                [
                    "Meta: até 20 minutos. Passe de 30: escreva na observação o motivo (programa, morsa, medição, falta de kit).",
                    "1. Finalize a ordem antiga no OEE. A máquina vai para Setup sozinha ao abrir a ordem nova.",
                    "2. Abra a ordem do SKU certo (EX-1020 ou EX-2040) com a meta do turno.",
                    "3. Carregue o programa P-1020 ou P-2040. Programa errado usina o eixo no tamanho do outro.",
                    "4. Troque as morsas: kit A no 1020, kit B no 2040. Confira o batente axial com o gabarito da gaveta 1.",
                    "5. Ajuste o contraponto. Toque de referência no eixo Z até o visor pedir OK.",
                    "6. Produza 2 peças de setup em modo único. Meça as duas.",
                    "7. Só mude para Produzindo depois da segunda peça aprovada. As peças de setup não entram como produção boa até o líder liberar.",
                ],
            ),
            (
                "Qualidade no posto",
                [
                    "A cada 20 peças: paquímetro no diâmetro do fuso e no comprimento total. Fora da faixa: isole as últimas 8 peças, registre Desvio e chame o técnico de processo.",
                    "Marca de chatter (vibração): reduza rotação 10% só se o líder autorizar. Sem autorização, pare e registre Ajuste.",
                    "Refugo: aponte quantidade e causa (Dimensional fora de tolerância ou Aspecto superficial). Não esconda peça ruim na caixa boa.",
                ],
            ),
            (
                "Quando chamar manutenção neste torno",
                [
                    "Chame se: F-41 repetir; cheiro de queimado; fuso não para; porta não trava; óleo vazando na base; alarme elétrico que volta depois de um reset autorizado.",
                    "Não chame por: insert gasto pela primeira vez (você troca); porta mal fechada; programa errado (você carrega o certo).",
                ],
            ),
            (
                "Perguntas frequentes",
                [
                    "P: Alarme F-41, o que eu faço agora? R: Pare no OEE como Ferramenta, espere 0 rpm, troque o insert TNMG 160408 P20 com 8 N·m, zere T01 ou T02, faça uma peça e meça. Se repetir, manutenção.",
                    "P: Qual insert e torque? R: TNMG 160408 classe P20, 8 N·m. Sem torquímetro, não aperte.",
                    "P: Como trocar do 1020 para o 2040? R: Fecha ordem, abre a nova, programa P-2040, morsa kit B, referência Z, duas peças medidas, só então Produzindo.",
                    "P: Posso zerar o alarme e continuar? R: Não. Sem olhar a ferramenta você quebra o revolver.",
                    "P: A primeira peça do setup conta produção? R: Não, até o líder liberar.",
                    "P: Quebrou o insert de novo em menos de 10 peças? R: Pare. Motivo Manutenção. Possível folga no revolver. Não continue trocando insert.",
                    "P: Sem torquímetro no posto, aperto no feeling? R: Não. Chame o líder. Torque errado solta ou racha o porta-insert.",
                ],
            ),
            (
                "Fim de turno neste torno",
                [
                    "1. Não deixe peça no mandril. Anote no quadro: ordem, SKU, última peça boa.",
                    "2. Insert reserva na gaveta 2. Se usou o último TNMG 160408, avise o líder agora.",
                    "3. F-41 que repetiu: deixe recado mesmo que a máquina tenha voltado.",
                    "4. Feche o apontamento. Não deixe Produzindo vazio.",
                ],
            ),
        ],
    },
    {
        "codigo": "MAN-MQ2",
        "titulo": "Torno CNC 02 — falha elétrica, falha mecânica e religamento",
        "maquina_id": "MQ-2",
        "arquivo": "man-mq2-torno-cnc-02.pdf",
        "blocos": [
            (
                "Para que serve esta máquina",
                [
                    "O Torno CNC 02 (MQ-2) faz os mesmos eixos do CNC 01, na mesma linha. Ele para mais que o 01: inversor (alarme E-07) e folga no carro X. Por isso o procedimento de energia e de ruído é mais rígido.",
                ],
            ),
            (
                "Começo de turno",
                [
                    "1. Ordem aberta no OEE. Sem ordem, não produza.",
                    "2. Olhe o LED do inversor no painel traseiro (visível pelo visor): deve estar verde fixo. Vermelho ou piscando: não ligue o fuso.",
                    "3. Faça um deslocamento lento em X e Z no jog. Travamento ou barulho metálico: pare e leia a seção de falha mecânica.",
                    "4. Primeira peça medida como no CNC 01 (±0,05 mm diâmetro).",
                ],
            ),
            (
                "Alarme E-07 — sobrecorrente do inversor",
                [
                    "E-07 é falha elétrica. Você NÃO religa em sequência. Dois religamentos seguidos queimam o inversor.",
                    "1. No OEE: Parada, motivo Falha elétrica, e toque Solicitar manutenção.",
                    "2. Escreva na observação: E-07 + se houve cheiro, fumaça ou estalo.",
                    "3. Desligue a seccionadora Q1 no painel traseiro. Só eletricista autorizado mexe depois disso.",
                    "4. Aplique LOTO: seu cadeado + etiqueta com matrícula. Veja o manual de segurança se não souber o cadeado.",
                    "5. Espere 5 minutos. O LED do inversor tem que apagar (descarga).",
                    "6. Se houver cheiro de queimado ou marca preta nos cabos U/V/W: não peça para religar. Abra OS elétrica e deixe a máquina em Manutenção.",
                    "7. Sem cheiro: o eletricista testa em jog. Você só volta a produzir quando ele disser LIBERADO e você retirar o cadeado.",
                    "8. Se o E-07 voltar na primeira peça depois da liberação: pare de novo. Não aceite um segundo reset no mesmo turno sem o supervisor.",
                ],
            ),
            (
                "Ruído ou batida no carro X",
                [
                    "1. Interrompa o ciclo no vermelho. Não mande a máquina para o zero se ela estiver travando.",
                    "2. OEE: motivo Falha mecânica.",
                    "3. Com 0 rpm, abra e olhe as réguas. Cavaco grosso: limpe com pincel. Nunca use ar comprimido no encoder.",
                    "4. Se depois de limpar o jog ainda bater ou o relógio comparador mostrar folga maior que 0,08 mm: manutenção. A máquina fica parada.",
                    "5. Depois do reparo, rode o programa de aquecimento WH-02 por 10 minutos antes da primeira peça boa.",
                ],
            ),
            (
                "Queda de energia — como religar",
                [
                    "1. Confirme ar comprimido ≥ 6 bar. Sem ar a porta não segura.",
                    "2. Q1 ligado. Botão verde POWER. Espere o boot (~90 segundos). Não aperte reset no meio.",
                    "3. Retorno aos zeros na ordem X, depois Z, depois C. Fora dessa ordem o CNC perde a peça.",
                    "4. Recarregue o programa da ordem atual. A peça que estava no mandril: tire e isole. Não continue uma peça pela metade.",
                    "5. Uma peça de conferência medida. Aí sim Produzindo.",
                ],
            ),
            (
                "O que você pode e não pode",
                [
                    "Pode: limpar cavaco com pincel, trocar insert (mesmo procedimento do CNC 01), recarregar programa, medir peça.",
                    "Não pode: abrir o painel do inversor, pular LOTO, usar ar no encoder, forçar zero com ruído, produzir sem ordem.",
                ],
            ),
            (
                "Perguntas frequentes",
                [
                    "P: Alarme E-07, o que fazer? R: Falha elétrica, manutenção, Q1 desligado, LOTO, 5 minutos, sem cheiro só o eletricista religa. Você não dá reset duas vezes.",
                    "P: Caiu a energia, como religar? R: Ar 6 bar, POWER, boot 90 s, zeros X-Z-C, recarrega programa, tira a peça pela metade, uma peça medida.",
                    "P: Tem ruído no carro X, paro ou continuo? R: Para. Limpa régua com pincel. Se continuar o barulho ou folga > 0,08 mm, manutenção.",
                    "P: Posso religar o E-07 para não perder o turno? R: Não. Dois religamentos queimam o inversor e a linha para o dia.",
                    "P: A peça ficou pela metade na queda de energia? R: Tira, isola, não continua. Uma peça nova de conferência.",
                    "P: Posso usar ar comprimido para limpar o encoder? R: Não. Só pincel. Ar no encoder mata o sensor.",
                ],
            ),
            (
                "Fim de turno neste torno",
                [
                    "1. Não deixe peça no mandril. Se a ordem continua no próximo turno, deixe o programa carregado e anote no quadro: ordem, SKU, última peça boa.",
                    "2. Cavaco na bandeja: esvazie. Cavaco no encoder: pincel, sem ar.",
                    "3. Se o E-07 ou o ruído do X aconteceu no turno: deixe no quadro “manutenção pendente” mesmo que a máquina tenha voltado. O próximo turno precisa saber.",
                    "4. Feche o apontamento. Não deixe o cartão em Produzindo se você já saiu.",
                ],
            ),
        ],
    },
    {
        "codigo": "MAN-MQ3",
        "titulo": "Retífica 01 — dressing, sensor de peça e queima de rebolo",
        "maquina_id": "MQ-3",
        "arquivo": "man-mq3-retifica-01.pdf",
        "blocos": [
            (
                "Para que serve esta máquina",
                [
                    "A Retífica 01 (MQ-3) pega o Eixo motriz 1020 depois do torno e faz o acabamento. Ciclo ideal 42 s. Ela para pouco tempo, várias vezes: isso é microparada de dressing ou sensor. Acima de 5 minutos (300 s) deixe de ser microparada e vire parada com motivo.",
                ],
            ),
            (
                "Começo de turno",
                [
                    "1. Ordem aberta. Rebolo sem lasca visível. Diamante de dressing na posição, ponta inteira.",
                    "2. Refrigeração cheia e jato acertando a peça, não o chão.",
                    "3. Sensor S3 (entrada de peça) limpo. LED pisca quando você aproxima um eixo de teste.",
                    "4. Primeira peça: rugosidade Ra ≤ 0,4 µm no padrão do posto (comparador visual + peça-padrão).",
                ],
            ),
            (
                "Dressing automático — o que é e quando parar",
                [
                    "A cada 40 peças a máquina afia o rebolo sozinha. O ícone DRESS acende. Isso é normal e pode durar até 90 segundos.",
                    "1. DRESS aceso: não abra a porta. Não cancele. Espere.",
                    "2. Se passar de 2 minutos com DRESS travado: OEE motivo Ajuste. Não force o ciclo.",
                    "3. Olhe o diamante. Ponta quebrada: troque o diamante (gaveta 3, código DIA-04) e peça ao técnico a nova referência de rebolo. Você não inventa a cota.",
                    "4. Depois do dressing, a primeira peça é de conferência de rugosidade. Ruim: mais um dressing de 0,02 mm ou chame processo.",
                ],
            ),
            (
                "Sensor de peça não detecta (S3)",
                [
                    "1. Limpe S3 com pano seco. Cavaco com óleo é a causa mais comum.",
                    "2. Distância certa: 1,5 a 2,0 mm da face do eixo. Mais longe o sensor “não vê”; mais perto ele bate na peça.",
                    "3. Aproxime um eixo na mão. LED tem que piscar. Sem piscar: OEE motivo Sensor, solicite manutenção. É proibido pular o sensor com fio ou ímã.",
                    "4. Pular o sensor deixa passar eixo torto e o rebolo quebra. Isso é falta grave.",
                ],
            ),
            (
                "Peça queimada ou mancha de têmpera",
                [
                    "Cheiro de queimado, mancha azul/marrom ou Ra estourando = rebolo vidrado ou avanço alto.",
                    "1. Pare o automático. OEE: Qualidade / Desvio.",
                    "2. Isole as últimas 8 peças na caixa amarela da retífica. Escreva a hora e a ordem.",
                    "3. Dressing manual: 0,02 mm em 3 passes, com refrigeração ligada.",
                    "4. Uma peça de prova. Se ainda queimar: pare, chame processo. Não “vá tentando” avanço.",
                    "5. Só volte ao avanço padrão com o líder. Enquanto isso, se autorizado, avance 10% menor.",
                ],
            ),
            (
                "Microparada versus parada",
                [
                    "Até 5 minutos (300 s) e a causa é dressing ou um sensor sujo que você limpou: pode ser microparada.",
                    "Mais de 5 minutos, diamante quebrado, sensor morto ou peça queimada em série: parada com motivo. Se ficar em microparada o OEE mente e a manutenção não vem.",
                ],
            ),
            (
                "Perguntas frequentes",
                [
                    "P: O dressing travou, o que eu faço? R: Se passou de 2 minutos, pare como Ajuste, veja o diamante. Ponta boa: técnico. Ponta quebrada: troca DIA-04 e referência nova.",
                    "P: O sensor não vê a peça? R: Limpa S3, confere 1,5–2,0 mm, testa o LED. Sem LED: Sensor + manutenção. Sem jumper.",
                    "P: A peça saiu queimada? R: Para, isola 8 peças, dressing 0,02 mm × 3, uma prova. Se queimar de novo, processo.",
                    "P: Posso cancelar o DRESS para ganhar peça? R: Não. Rebolo sem dressing queima o eixo e o rebolo.",
                    "P: O jato de refrigeração está no chão. Continuo? R: Não. Acerto o bico na peça. Sem refrigeração a peça queima em poucos ciclos.",
                    "P: Quantas peças eu isolo se queimou? R: As últimas 8, caixa amarela, hora e ordem escritas.",
                ],
            ),
            (
                "Fim de turno na retífica",
                [
                    "1. Deixe o diamante no lugar. Se a ponta lascou no fim do turno, troque agora ou deixe recado no quadro: “DIA-04 trocar”.",
                    "2. Limpe S3. Sensor sujo de um turno vira microparada no outro.",
                    "3. Nível de refrigeração na marca. Abaixo: avise o líder — você não completa com água da torneira.",
                    "4. Feche o apontamento. Peças da caixa amarela não voltam para o pallet sem o inspetor.",
                ],
            ),
        ],
    },
    {
        "codigo": "MAN-MQ4",
        "titulo": "Prensa 01 — ciclo, fim de curso, pressão e segurança",
        "maquina_id": "MQ-4",
        "arquivo": "man-mq4-prensa-01.pdf",
        "blocos": [
            (
                "Para que serve esta máquina",
                [
                    "A Prensa 01 (MQ-4) forma o Conjunto flange 3100 na Linha 02. Ciclo ideal 30 segundos. Performance baixa quase sempre é pressão fraca, temporizador alto ou operador segurando o bipedestal.",
                    "Esta máquina mata. Cortina de luz, dois botões e calço não são opcionais.",
                ],
            ),
            (
                "Começo de turno",
                [
                    "1. Cortina de luz: passe a mão na frente. A prensa NÃO pode armar. Se armar com a cortina cortada, pare a linha e chame segurança. Não produza.",
                    "2. Pressão no manômetro: 140 a 160 bar. Abaixo de 130: Ajuste + manutenção hidráulica.",
                    "3. Temporizador T-RETORNO no relé: 1,2 s. Se estiver em 2 s ou mais, a peça demora sem ganho. Peça ao técnico para voltar a 1,2 s. Você não muda relé sem ordem.",
                    "4. Molde limpo, sem flange preso. Extrator livre.",
                    "5. Ordem aberta no OEE.",
                ],
            ),
            (
                "Ciclo mais lento que 30 segundos",
                [
                    "1. Olhe o manômetro no ciclo. Se cai abaixo de 130 bar no fechamento: pare, Ajuste, manutenção. Não “empurre” mais o botão.",
                    "2. Confira T-RETORNO. Acima de 2,0 s: chame o técnico (Ajuste de processo).",
                    "3. Solte os dois botões assim que o martelo chegar ao fim. Segurar até o fim do retorno come o tempo.",
                    "4. Peça presa: use só o extrator. Alavanca, chave de fenda ou a mão no molde com pressão = acidente.",
                    "5. Se depois disso o ciclo real no OEE continuar pior que 36 s: chame o líder. Pode ser molde gasto, não “jeito” de operador.",
                ],
            ),
            (
                "Alarme FC-2 — fim de curso",
                [
                    "O FC-2 diz que o martelo chegou embaixo. Sem ele a prensa não abre o retorno.",
                    "1. Três ciclos sem FC-2: pare. Motivo Sensor.",
                    "2. Limpe a régua do martelo (cavaco é a causa número 1).",
                    "3. Peça ao técnico o teste em modo manutenção. Sem pulso no FC-2: OS elétrica. Você não gambiara o sensor.",
                    "4. Depois do reparo: 5 peças e meça a altura do flange 18,0 ± 0,1 mm.",
                ],
            ),
            (
                "Segurança — o que é proibido",
                [
                    "1. Tampar, desviar ou colar a cortina de luz: proibido. É falta grave.",
                    "2. Um botão só ou pedra no botão: proibido. São dois botões, duas mãos.",
                    "3. Entrar no molde: Q2 desligado, LOTO, calço mecânico no martelo. Sem calço o martelo pode descer com a pressão residual.",
                    "4. Emergência: cogumelo vermelho, afaste as pessoas, ramal 199 se alguém se machucou.",
                ],
            ),
            (
                "Perguntas frequentes",
                [
                    "P: O ciclo está lento, o que checar? R: Pressão 140–160 bar, T-RETORNO 1,2 s, não segurar o botão, extrator se a peça prendeu. Sem isso, líder.",
                    "P: Alarme FC-2, o que fazer? R: Para no terceiro ciclo, limpa a régua, técnico testa. Sem pulso: manutenção. Depois, 5 peças a 18,0 ± 0,1 mm.",
                    "P: Posso tampar a cortina de luz? R: Não. Nunca. Se a cortina falhar e a prensa armar, pare a linha e chame segurança.",
                    "P: A peça prendeu, posso puxar com a mão? R: Não. Extrator. Mão no molde com pressão é acidente.",
                    "P: A cortina falhou e a prensa armou. E agora? R: Pare a linha, chame segurança. Não produza. Não “teste de novo”.",
                    "P: Posso mudar o relé T-RETORNO sozinho? R: Não. Peça ao técnico. Você não mexe em relé sem ordem.",
                ],
            ),
            (
                "Fim de turno na prensa",
                [
                    "1. Molde sem flange preso. Extrator livre.",
                    "2. Teste a cortina de novo (mão na frente, não arma). Se falhou, deixe a máquina em Manutenção e avise segurança — o próximo turno não pode ligar.",
                    "3. Pressão no manômetro: anote se caiu no turno. Manutenção hidráulica de manhã custa menos que um turno lento.",
                    "4. Feche o apontamento. Não deixe Produzindo vazio.",
                ],
            ),
        ],
    },
    {
        "codigo": "MAN-MQ5",
        "titulo": "Montagem A — kit do flange, falta de material e torque",
        "maquina_id": "MQ-5",
        "arquivo": "man-mq5-montagem-a.pdf",
        "blocos": [
            (
                "Para que serve este posto",
                [
                    "Montagem A (MQ-5) junta o Eixo (que veio da usinagem) com o flange 3100: retentor + 4 parafusos M8. Sem este posto a Montagem B não trabalha. A parada mais comum é falta de kit.",
                ],
            ),
            (
                "Kit padrão KIT-FL-3100 — o que tem que ter",
                [
                    "Cada kit: 1 flange, 4 parafusos M8×20 classe 8.8, 1 retentor, 1 etiqueta em branco. Faltou um item = kit incompleto. Não complete com parafuso de outro posto.",
                    "Conte 20 kits no supermercado do posto no começo do turno. Abaixo de 10: avise logística no rádio canal 3 ANTES de acabar.",
                ],
            ),
            (
                "Acabou o material — como apontar",
                [
                    "1. Pare o posto. OEE: Aguardando material, motivo Falta de material.",
                    "2. Rádio canal 3: “Montagem A, zero KIT-FL-3100, ordem tal”. Anote a hora na observação.",
                    "3. Não pegue kit da Montagem B nem da prensa “para não parar”. Isso só muda a falta de lugar.",
                    "4. Quando o material chegar: conte 20 kits completos. Kit rasgado ou sem retentor volta para a logística, não entra na linha.",
                    "5. Só então volte para Produzindo.",
                ],
            ),
            (
                "Atraso no abastecimento (tem pedido, não chegou)",
                [
                    "Se passaram 10 minutos do chamado e o kit não chegou: troque o motivo para Atraso no abastecimento e atualize a observação com o horário do primeiro chamado.",
                    "O pulmão de 30 kits da linha só pode ser usado com o supervisor. Sem registro no OEE o pulmão “some” e o próximo turno fica sem.",
                ],
            ),
            (
                "Como montar certo — sequência e torque",
                [
                    "1. Retentor com o aplicador P-12. Face do retentor seca e limpa. Retentor torto ou virado = vazamento = refugo Erro de montagem.",
                    "2. Encaixe o flange no eixo. Os 4 furos têm que coincidir sem forçar.",
                    "3. Parafusos em cruz: aperto de mão e depois torquímetro 22 N·m. Ordem: superior esquerdo, inferior direito, superior direito, inferior esquerdo.",
                    "4. Sem torquímetro no posto: pare e peça o do líder. Aperto no feeling solta no cliente.",
                    "5. Carimbo do turno na face do flange: T1 amarelo, T2 azul, T3 verde. Sem carimbo a peça NÃO sai. A Montagem B vai devolver.",
                    "6. Aponte a peça boa no OEE. Peça ruim: refugo com causa Erro de montagem ou Peça incompleta.",
                ],
            ),
            (
                "Perguntas frequentes",
                [
                    "P: Acabou o kit, como apontar? R: Aguardando material / Falta de material, rádio canal 3, hora na observação. Não roube kit do vizinho.",
                    "P: Qual o torque dos parafusos? R: 22 N·m em cruz, M8 classe 8.8. Sem torquímetro, para.",
                    "P: O abastecimento atrasou, qual motivo? R: Depois de 10 minutos do chamado, Atraso no abastecimento. Pulmão só com supervisor.",
                    "P: Posso usar parafuso de outro flange? R: Não. Mistura classe e o torque mente.",
                    "P: Esqueci o carimbo? R: A peça fica no posto até carimbar. Sem carimbo a B rejeita.",
                    "P: Posso completar o kit com parafuso da prensa? R: Não. Kit incompleto volta para a logística.",
                    "P: O torquímetro sumiu. Aperto no feeling? R: Não. Pare e peça o do líder. Feeling solta no cliente.",
                ],
            ),
            (
                "Fim de turno na Montagem A",
                [
                    "1. Conte os kits que sobraram. Abaixo de 10: já chame o canal 3 para o próximo turno.",
                    "2. Torquímetro na gaveta. Sem ferramenta o posto não abre.",
                    "3. Peças sem carimbo não passam para a B. Carimbe ou isole.",
                    "4. Feche o apontamento. Kit aberto e incompleto não fica no supermercado — volta para logística.",
                ],
            ),
        ],
    },
    {
        "codigo": "MAN-MQ6",
        "titulo": "Montagem B — anel, etiqueta, retrabalho e falta de gente",
        "maquina_id": "MQ-6",
        "arquivo": "man-mq6-montagem-b.pdf",
        "blocos": [
            (
                "Para que serve este posto",
                [
                    "Montagem B (MQ-6) fecha o Conjunto flange 3100: anel elástico, etiqueta de rastreio e teste de giro. Só recebe peça carimbada da Montagem A.",
                ],
            ),
            (
                "Sequência do posto",
                [
                    "1. Olhe o carimbo (amarelo/azul/verde). Sem carimbo: devolva para a A. Não complete o conjunto.",
                    "2. Anel elástico com o alicate A-7. Anel torto, aberto ou pela metade: refugo Erro de montagem. Não “quebre o anel no jeito”.",
                    "3. Etiqueta com o código da ordem que está aberta no OEE. Etiqueta da ordem de ontem = rastreio errado = bloqueio.",
                    "4. Gire o conjunto com a mão. Ponto duro, raspa ou folga grande: retrabalho. Não force.",
                    "5. Peça boa: aponte produção. Peça de retrabalho: botão Retrabalho, nunca Produção e nunca Refugo (refugo é sucata).",
                ],
            ),
            (
                "Retrabalho — regra clara",
                [
                    "Retrabalho = dá para consertar no mesmo turno. Exemplos: anel torto que você tira e põe outro; etiqueta errada que você troca.",
                    "Se o retentor da A foi violado (óleo, retentor fora do lugar): a peça volta para a fila da Montagem A. Você não remonta retentor aqui.",
                    "Sem ordem aberta não aponta retrabalho. Abre a ordem ou chama o líder.",
                    "Quantidade: só as peças que realmente retrabalhou. Não “arredonde” no fim do turno.",
                ],
            ),
            (
                "Falta de operador",
                [
                    "1. Posto vazio no início do turno: o líder aponta Aguardando operador / Falta de operador. Não deixe o cartão em Produzindo vazio.",
                    "2. Juntar A e B num operador só: só com autorização escrita do supervisor. Sem isso o ciclo passa de 30 s para mais de 50 s e a performance cai nos dois postos.",
                    "3. Treinamento no posto: motivo Treinamento (parada planejada). Não misture com falta de gente.",
                    "4. Intervalo/refeição: Parada planejada / Refeição. Não deixe como Falta de operador.",
                ],
            ),
            (
                "Perguntas frequentes",
                [
                    "P: A peça veio sem carimbo? R: Devolve para a Montagem A. Não monta anel nem etiqueta.",
                    "P: Não tem operador, qual motivo? R: Aguardando operador / Falta de operador. Treinamento e refeição são outros motivos.",
                    "P: Como apontar retrabalho certo? R: Ordem aberta, botão Retrabalho, só a quantidade real. Retentor violado volta para a A.",
                    "P: Posso usar a etiqueta da ordem anterior? R: Não. A etiqueta é da ordem aberta agora.",
                    "P: Posso fazer A e B sozinho para não parar? R: Só com o supervisor. Sem isso os dois postos ficam lentos e o OEE mente.",
                    "P: O anel abriu ao meio. Forço no lugar? R: Não. Refugo Erro de montagem. Anel novo.",
                    "P: O conjunto tem ponto duro no giro. É produção? R: Não. Retrabalho. Se o retentor foi violado, volta para a A.",
                ],
            ),
            (
                "Fim de turno na Montagem B",
                [
                    "1. Etiquetas da ordem de hoje no posto. Sobra de ontem vai para o lixo de etiqueta, não para a gaveta.",
                    "2. Alicate A-7 no lugar. Sem ele o próximo turno aponta falta de ferramenta como se fosse falta de gente.",
                    "3. Peças sem carimbo empilhadas: devolve para a A agora, não deixe para o outro turno “resolver”.",
                    "4. Feche o apontamento. Retrabalho do fim do turno aponta agora, não amanhã.",
                ],
            ),
        ],
    },
    {
        "codigo": "MAN-MQ7",
        "titulo": "Injetora 01 — troca de molde, temperatura e primeira peça",
        "maquina_id": "MQ-7",
        "arquivo": "man-mq7-injetora-01.pdf",
        "blocos": [
            (
                "Para que serve esta máquina",
                [
                    "Injetora 01 (MQ-7), Linha 03 Carcaças, Planta Norte. Faz Carcaça bomba 4500 (ciclo 24 s, molde M-4500, molde a 45 °C) e Carcaça reforçada 4800 (ciclo 36 s, molde M-4800, molde a 55 °C).",
                    "Esta máquina perde tempo em setup. O setup bem feito evita a primeira hora de refugo.",
                ],
            ),
            (
                "Começo de turno",
                [
                    "1. Ordem aberta do SKU certo. Molde no número certo (M-4500 ou M-4800) gravado na placa.",
                    "2. Temperaturas no painel: canhão na receita do SKU; molde 45 °C (4500) ou 55 °C (4800). Abaixo disso não injete.",
                    "3. Proteções fechadas. Portas laterais com sensor verde.",
                    "4. Pote de purga vazio e identificado.",
                ],
            ),
            (
                "Troca de molde (4500 para 4800 ou o contrário)",
                [
                    "1. Finalize a ordem. Abra a ordem nova. O OEE vai para Setup. Motivo Setup ou Troca de formato.",
                    "2. Esfrie o canhão até 160 °C. Acima de 180 °C é proibido abrir o molde. Queimadura e empeno.",
                    "3. Duas pessoas: uma no rádio, uma no comando da ponte. Dispositivo D-MOLDE. Sem a segunda pessoa, não içe.",
                    "4. Molde no cavalete certo. Confira o pino-guia antes de fechar a máquina.",
                    "5. Aqueça o molde na temperatura do SKU (45 ou 55 °C). Relógio do molde, não “achismo da mão”.",
                    "6. Meta 20 minutos. Passou de 30: observação com o motivo (molde sujo, sem auxiliar, temperatura, ponte ocupada).",
                    "7. Purgue 3 ciclos no pote. As 3 primeiras não são produção.",
                    "8. Primeira peça dimensional da boca: 82,0 ± 0,2 mm no 4500 (confira a ficha do 4800 no quadro). Inspetor ou líder libera. Sem liberação, não aperte Produzindo.",
                ],
            ),
            (
                "Alarme TZ-1 — temperatura da zona 1",
                [
                    "TZ-1 aceso = zona 1 fria demais. Injetar agora gera peça incompleta e pode travar o parafuso.",
                    "1. Não injete. OEE: se em 10 minutos não subir 5 °C, motivo Falha elétrica e manutenção.",
                    "2. Olhe o termopar da zona 1: tem que estar encaixado até o fundo. Solto é a causa mais comum — você pode encaixar. Não puxe o fio.",
                    "3. Resistência fria ao toque (com canhão já há tempo ligado): manutenção. Você não troca resistência.",
                    "4. Depois de TZ-1 apagar: 2 ciclos de purga e uma peça medida.",
                ],
            ),
            (
                "Quando a primeira peça vale como produção",
                [
                    "Vale quando: setup terminado, temperatura ok, 3 purgas feitas, dimensional da boca aprovado pelo líder ou inspetor, estado Produzindo no OEE.",
                    "Não vale: peça de purga, peça torta de início de setup, peça feita com TZ-1 aceso, peça sem ordem.",
                ],
            ),
            (
                "Perguntas frequentes",
                [
                    "P: Como trocar o molde da 4500 para a 4800? R: Fecha ordem, abre a nova, canhão ≤ 160 °C, duas pessoas + D-MOLDE, molde M-4800, aquece 55 °C, 3 purgas, boca medida, líder libera, Produzindo.",
                    "P: Alarme TZ-1, o que fazer? R: Não injeta. Encaixa o termopar. Se em 10 min não subir 5 °C, Falha elétrica + manutenção. Depois, 2 purgas e uma medida.",
                    "P: Quando a primeira peça vale produção? R: Depois da liberação do dimensional. Purga e setup não contam.",
                    "P: Posso trocar o molde sozinho para ir mais rápido? R: Não. Duas pessoas. Setup malfeito custa a hora seguinte em refugo.",
                    "P: Injetei com TZ-1 aceso. As peças valem? R: Não. Isole, aponte refugo Peça incompleta, 2 purgas e uma medida quando o alarme apagar.",
                    "P: O molde está a 40 °C e a receita pede 55. Espero? R: Sim. Sem a temperatura do relógio do molde, não injete.",
                ],
            ),
            (
                "Fim de turno na injetora 01",
                [
                    "1. Se o próximo turno continua o mesmo SKU: deixe o molde na temperatura, canhão na receita, pote de purga vazio.",
                    "2. Se troca de SKU no próximo turno: avise no quadro o molde que tem que entrar. Não deixe o molde errado “para eles verem”.",
                    "3. TZ-1 que apareceu no turno: recado no quadro mesmo que tenha apagado.",
                    "4. Feche o apontamento. Purga e setup não entram como produção.",
                ],
            ),
        ],
    },
    {
        "codigo": "MAN-MQ8",
        "titulo": "Injetora 02 — refugo, rebarba, contaminação e bloqueio",
        "maquina_id": "MQ-8",
        "arquivo": "man-mq8-injetora-02.pdf",
        "blocos": [
            (
                "Para que serve esta máquina",
                [
                    "Injetora 02 (MQ-8) faz as mesmas carcaças da 01. O problema dela é qualidade: rebarba (flash), porosidade, contaminação de cor e lote misturado. Aqui o apontamento de refugo tem que ser honesto, senão a Qualidade do OEE fica falsa e o cliente leva peça ruim.",
                ],
            ),
            (
                "Como apontar refugo — passo a passo",
                [
                    "1. Peça que não pode ir para o cliente = refugo. Não é retrabalho (retrabalho a 02 quase não tem: carcaça flashada não conserta).",
                    "2. No OEE: Registrar refugo. Quantidade real. Causa obrigatória.",
                    "3. Causas deste posto: Aspecto superficial (rebarba, mancha), Contaminação (cor misturada), Dimensional fora de tolerância (boca 82,0 ± 0,2 mm), Peça incompleta (falta material, TZ baixo).",
                    "4. Não some refugo na produção boa “para o gráfico ficar bonito”. Qualidade = aprovadas / total.",
                    "5. Meta da planta: no máximo 2% de refugo no turno. Passou de 2%: pare o automático e chame o técnico de processo. Não “vá tocando”.",
                ],
            ),
            (
                "Saiu rebarba (flash) — isolo o lote?",
                [
                    "Sim. Rebarba no plano de fechamento significa força baixa ou plano sujo. As peças de trás provavelmente estão iguais.",
                    "1. Pare a injeção. OEE motivo Desvio.",
                    "2. Isole as últimas 15 peças na caixa vermelha BLOQUEIO-IQ. Escreva ordem, hora e “flash”.",
                    "3. Veja a força de fechamento: 180 t ± 5%. Abaixo: técnico. Você não sobe tonelagem no feeling.",
                    "4. Limpe o plano de partição com o pano do posto. Resina no plano gera flash na seguinte.",
                    "5. Três peças de prova sem flash e boca ok. Aí o inspetor libera o bloqueio. Sem liberação, a caixa vermelha não volta para o pallet bom.",
                ],
            ),
            (
                "Contaminação e troca de material (4500 ↔ 4800)",
                [
                    "1. Purgue no mínimo 8 ciclos até a cor sair homogênea. As 8 vão para sucata, causa Contaminação.",
                    "2. Material misturado NÃO vai para retrabalho. É sucata.",
                    "3. Se um pallet já saiu com cor duvidosa: motivo Bloqueio, chame o inspetor. A máquina só volta com liberação escrita no quadro da linha.",
                ],
            ),
            (
                "Inspeção no posto a cada 30 peças",
                [
                    "Meça a boca com o paquímetro do posto. Fora de 82,0 ± 0,2 mm: motivo Inspeção, separe o ninho (as peças desde a última medida boa). Não espere o fim do turno para medir.",
                ],
            ),
            (
                "Perguntas frequentes",
                [
                    "P: Como apontar refugo nesta injetora? R: Botão refugo, quantidade real, causa (aspecto, contaminação, dimensional, incompleta). Não junte com produção boa.",
                    "P: Saiu rebarba, isolo o lote? R: Sim. Últimas 15 na caixa vermelha, Desvio, força 180 t, limpa plano, 3 provas, inspetor libera.",
                    "P: Quando o refugo passa de 2%? R: Pare o automático e chame processo. Meta da planta é 2%.",
                    "P: Posso retrabalhar carcaça com flash? R: Não. Sucata. Retrabalho não existe para flash neste posto.",
                    "P: Posso misturar as 3 primeiras da troca de cor na caixa boa? R: Não. Contaminação. Sucata.",
                    "P: A boca está 82,4 mm. Continuo? R: Não. Fora de 82,0 ± 0,2. Motivo Inspeção, separe desde a última medida boa.",
                    "P: O pallet já saiu com cor duvidosa. O que faço? R: Bloqueio, inspetor. Máquina só volta com liberação no quadro.",
                ],
            ),
            (
                "Fim de turno na injetora 02",
                [
                    "1. Caixa vermelha BLOQUEIO-IQ: se tiver peça, o inspetor tem que ver antes do turno acabar. Não deixe bloqueio “para amanhã”.",
                    "2. Conte o refugo do turno. Se passou de 2%, deixe recado para processo mesmo que a máquina esteja rodando.",
                    "3. Plano de partição limpo. Resina no plano vira flash na primeira peça da manhã.",
                    "4. Feche o apontamento. Refugo apontado no fim com número chutado bagunça a Qualidade.",
                ],
            ),
        ],
    },
    {
        "codigo": "MAN-SEG",
        "titulo": "Segurança da planta — LOTO, emergência e o que ninguém pula",
        "maquina_id": None,
        "arquivo": "man-seg-loto-emergencia.pdf",
        "blocos": [
            (
                "Para quem é este manual",
                [
                    "Para todo mundo na Planta Sul (Joinville) e Planta Norte (Camaçari). Vale torno, retífica, prensa, montagem e injetora. O manual da máquina nunca cancela este.",
                ],
            ),
            (
                "LOTO — travar antes de abrir painel ou molde",
                [
                    "LOTO quer dizer: desligar a energia, travar com o SEU cadeado e pôr a SUA etiqueta. Assim ninguém liga a máquina com você dentro.",
                    "1. Diga o que você vai travar: elétrica (Q1 ou Q2), hidráulica, ar, ou o martelo da prensa (gravidade).",
                    "2. Desligue. Teste: botão de liga não pode acender nada. Manômetro em zero. Se ainda tem luz ou pressão, não abra.",
                    "3. Cadeado pessoal + etiqueta com matrícula e nome. Cada pessoa que entrar coloca o próprio cadeado. Um cadeado só do líder não vale para três pessoas.",
                    "4. Faça o serviço.",
                    "5. Só tira o cadeado quem colocou. Se a pessoa foi embora: supervisor com ata, nunca “um colega tira para ajudar”.",
                    "6. No OEE a máquina fica em Manutenção enquanto o LOTO está posto.",
                ],
            ),
            (
                "Quando você DEVE fazer LOTO",
                [
                    "Abrir painel elétrico. Trocar inversor ou sensor atrás da chapa. Entrar no molde da prensa ou da injetora. Limpar régua com a máquina que pode andar sozinha. Qualquer hora que uma parte do corpo entre na área de esmagamento.",
                    "Você NÃO precisa de LOTO só para trocar insert com a porta aberta e 0 rpm, nem para limpar sensor S3 na frente da retífica com ciclo parado — mas a porta tem que estar aberta e o ciclo não pode armar.",
                ],
            ),
            (
                "Emergência — alguém se machucou ou quase",
                [
                    "1. Cogumelo vermelho mais perto.",
                    "2. Afaste as pessoas. Não puxe o acidentado se tiver carga suspensa ou energia.",
                    "3. Ramal 199. Fale: planta, máquina (ex.: Prensa 01), o que aconteceu, se tem sangramento.",
                    "4. OEE: Manutenção. Ninguém religa até segurança liberar.",
                ],
            ),
            (
                "EPI mínimo",
                [
                    "Usinagem (tornos e retífica): óculos, protetor de ouvido, calçado, cabelo preso. Sem anel, pulseira, cordão.",
                    "Prensa e injetora: o mesmo. Luva de vaqueta só com a máquina parada e LOTO. Luva no ciclo puxa a mão.",
                    "Montagem: luva de montagem. Óculos se houver mola ou anel que possa pular.",
                ],
            ),
            (
                "Perguntas frequentes",
                [
                    "P: Como travar a máquina (LOTO) antes de abrir o painel? R: Desliga Q1/Q2, testa que não liga, cadeado e etiqueta seus, cada pessoa com o dela. Só quem travou destrava.",
                    "P: Preciso de LOTO para trocar insert? R: Não, se o fuso está 0 rpm e a porta aberta impede o ciclo. Precisa de LOTO para painel, molde e área de esmagamento.",
                    "P: O colega pode tirar meu cadeado? R: Não. Só você ou o supervisor com ata.",
                    "P: Apertei o cogumelo sem querer. E agora? R: Avise o líder, gire e puxe o cogumelo, veja se a máquina pede reset. Se for prensa ou injetora, confirme cortina e portas antes de armar.",
                    "P: Preciso entrar no molde da prensa. Qual a ordem? R: Q2 desligado, LOTO, calço no martelo. Sem calço o martelo pode descer.",
                    "P: Posso usar luva no ciclo da prensa? R: Não. Luva no ciclo puxa a mão. Luva só com máquina parada e LOTO.",
                ],
            ),
            (
                "O que ninguém negocia nesta planta",
                [
                    "Cortina de luz da prensa e portas da injetora não se tampam. Painel elétrico não se abre sem LOTO. Relato de quase-acidente vai para o ramal 199 e para o líder no mesmo turno. Quem viu e não falou responde igual a quem fez.",
                    "Se o manual da máquina e este manual de segurança discordarem, vale o mais restrito. Na dúvida, pare e chame o supervisor.",
                ],
            ),
        ],
    },
    {
        "codigo": "MAN-OEE",
        "titulo": "Como apontar no OEE — estados, peça, refugo e quando chamar gente",
        "maquina_id": None,
        "arquivo": "man-oee-apontamento.pdf",
        "blocos": [
            (
                "Para que serve o OEE neste chão",
                [
                    "O OEE mostra se a máquina estava produzindo, parada ou fazendo peça ruim. Se você aponta errado, o gráfico mente e o líder manda a ação errada. A cor do cartão não basta: o nome do estado é o que vale.",
                    "Você não precisa entender fórmula. Precisa acertar três coisas: o estado, a ordem e a quantidade.",
                ],
            ),
            (
                "Os estados — em português claro",
                [
                    "Produzindo: a máquina está fazendo peça da ordem aberta.",
                    "Setup: trocando produto, ferramenta ou molde. Abrir ordem já começa o setup.",
                    "Parada não planejada: quebrou, alarmou, faltou condição. Sempre com motivo (Ferramenta, Elétrica, Material…).",
                    "Microparada: parou pouco, até 5 minutos (300 s), e você já resolveu (sensor sujo, dressing). Mais que 5 minutos: vire parada com motivo.",
                    "Aguardando material: não tem kit ou bar.",
                    "Aguardando operador: não tem gente no posto.",
                    "Limpeza / Parada planejada: limpeza, refeição, preventiva, treinamento.",
                    "Manutenção: você pediu manutenção ou está em LOTO. Você não religa sozinho.",
                    "Sem ordem: não tem OP. Proibido apontar peça.",
                ],
            ),
            (
                "Posso apontar produção sem ordem?",
                [
                    "Não. O sistema bloqueia. Se a máquina está rodando sem ordem: pare, chame o líder, abram a ordem, aí apontam. Peça feita “no escuro” não entra no turno e bagunça a meta.",
                ],
            ),
            (
                "Produção, refugo e retrabalho — não misture",
                [
                    "Produção: peça que pode ir para o próximo posto ou para o cliente.",
                    "Refugo: peça que não tem conserto neste turno (flash, dimensional fora, insert quebrou a peça). Sempre com causa.",
                    "Retrabalho: dá para consertar (anel, etiqueta, rebarba pequena na montagem). Não é produção boa.",
                    "Aponte ao longo do turno, não um número chutado às 13:50. Quantidade zero o sistema não grava.",
                ],
            ),
            (
                "Quando chamar manutenção (não “ajuste”)",
                [
                    "Chame manutenção (botão Solicitar manutenção + observação do sintoma) quando: alarme elétrico volta; ruído metálico novo; sensor morto depois de limpo; vazamento de óleo ou hidráulico; porta ou cortina que não trava; qualquer risco de esmagar ou queimar.",
                    "Ajuste é o que você ou o técnico de processo resolve no posto: insert, programa, kit, T-RETORNO com ordem, termopar encaixado.",
                    "Na dúvida: chame. Manutenção à toa custa menos que uma mão na prensa.",
                ],
            ),
            (
                "Diferença entre parada e microparada",
                [
                    "Microparada: durou pouco (até 5 min) e você já voltou a produzir sem manutenção. Exemplo: dressing normal, sensor que você limpou.",
                    "Parada: durou mais, precisa de motivo, ou precisa de outra pessoa (manutenção, logística, líder). Exemplo: E-07, kit zero, F-41 que repetiu.",
                    "Se você deixar 40 minutos como microparada, o gráfico diz que a máquina “quase não parou” e ninguém vem ajudar.",
                ],
            ),
            (
                "Perguntas frequentes",
                [
                    "P: Posso apontar produção sem ordem aberta? R: Não. Abra a ordem ou chame o líder.",
                    "P: Quando eu chamo a manutenção? R: Alarme elétrico, ruído novo, sensor morto, vazamento, trava de segurança falhou, risco de acidente. Insert e kit você resolve.",
                    "P: Qual a diferença entre parada e microparada? R: Microparada até 5 min e já voltou. O resto é parada com motivo.",
                    "P: Refugo e retrabalho são a mesma coisa? R: Não. Refugo é sucata. Retrabalho ainda vira peça boa.",
                    "P: Esqueci de apontar a manhã toda. Ponho tudo agora? R: Aponte o que for verdade, com a hora que conseguir. Avise o líder. Não invente quantidade para fechar a meta.",
                    "P: A máquina está em Setup. Posso apontar peça boa? R: Só depois da liberação do líder e do estado Produzindo. Peça de setup não é produção.",
                    "P: O cartão está verde mas o estado diz Parada. Qual vale? R: O nome do estado. A cor sozinha não conta.",
                ],
            ),
            (
                "Fim de turno no OEE",
                [
                    "1. Nenhuma máquina do seu posto pode ficar em Produzindo sem gente.",
                    "2. Parada aberta precisa de motivo. Microparada de 40 minutos não existe — vire parada.",
                    "3. Quantidade do turno apontada. Zero o sistema não grava; chute o líder não aceita.",
                    "4. Se pediu manutenção e ela não veio: deixe a observação com hora do chamado. O próximo turno não recomeça do zero.",
                ],
            ),
        ],
    },
]


def main() -> None:
    SAIDA.mkdir(parents=True, exist_ok=True)
    for spec in MANUAIS:
        dest = gravar(spec["codigo"], spec["titulo"], spec["blocos"], spec["arquivo"])
        print(dest.name, dest.stat().st_size)


if __name__ == "__main__":
    main()
