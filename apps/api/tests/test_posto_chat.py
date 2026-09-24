from oee.domain.chat_posto import classificar, tipo_pergunta


def test_pergunta_de_posto_nao_vai_para_o_manual():
    assert classificar("Qual a ordem de produção atual da máquina?") == "ordem"
    assert classificar("Quais foram as últimas ordens de produção?") == "ordens"
    assert classificar("Quando foi a ultima falha?") == "falha"
    assert tipo_pergunta("Quando foi a ultima falha?") == "posto"
    assert tipo_pergunta("como trocar a ferramenta") == "manual"


def test_pedido_dos_dois_traz_fato_e_manual():
    assert tipo_pergunta("o que fazer na falta de material") == "ambos"
