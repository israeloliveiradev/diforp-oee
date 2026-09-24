from oee.domain.apontamento import acumulado, quantidades_refugo, vira_microparada


def test_refugo_de_peca_ja_contada_nao_aumenta_produzido():
    ruins = quantidades_refugo(2, destas=True)
    cartao = acumulado([(25, 0, 0), (*ruins, 0)])
    assert cartao["produzido"] == 25
    assert cartao["refugo"] == 2
    assert cartao["aprovado"] == 23


def test_refugo_de_lote_novo_entra_em_produzido():
    cartao = acumulado([(*quantidades_refugo(2, destas=False), 0)])
    assert cartao["produzido"] == 2
    assert cartao["aprovado"] == 0


def test_parada_curta_vira_microparada():
    assert vira_microparada(120, 300, "PARADA_NAO_PLANEJADA")
    assert not vira_microparada(600, 300, "PARADA_NAO_PLANEJADA")
    assert not vira_microparada(60, 300, "SETUP")
    assert not vira_microparada(60, 300, "MANUTENCAO")
