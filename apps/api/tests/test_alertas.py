from oee.domain.alertas import avaliar_posto


def test_parada_longa_e_turno_sem_peca():
    itens = avaliar_posto("Retífica 01", "MQ-3", "PARADA_NAO_PLANEJADA", 20 * 60, 0, 0, 0.02)
    assert itens[0]["tipo"] == "parada_longa"
    assert itens[0]["criticidade"] == "atencao"
    critica = avaliar_posto("Retífica 01", "MQ-3", "PARADA_NAO_PLANEJADA", 40 * 60, 0, 0, 0.02)
    assert critica[0]["criticidade"] == "critico"
    sem = avaliar_posto("Retífica 01", "MQ-3", "PRODUZINDO", 25 * 60, 0, 0, 0.02)
    assert sem[0]["tipo"] == "sem_peca"


def test_refugo_acima_da_meta_e_silencio_quando_esta_no_ritmo():
    alto = avaliar_posto("Torno CNC 02", "MQ-2", "PRODUZINDO", 60, 100, 5, 0.02)
    assert alto[0]["tipo"] == "refugo"
    assert avaliar_posto("Torno CNC 02", "MQ-2", "PRODUZINDO", 60, 100, 1, 0.02) == []
    assert avaliar_posto("Torno CNC 02", "MQ-2", "PARADA_PLANEJADA", 50 * 60, 0, 0, 0.02) == []
