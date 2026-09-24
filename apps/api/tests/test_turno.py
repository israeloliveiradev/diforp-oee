from datetime import datetime
from zoneinfo import ZoneInfo

from oee.domain.timeutil import fatiar_intervalo, limites_de_turno, turno_do_instante

TZ = ZoneInfo("America/Sao_Paulo")
TURNOS = [
    {"id": "T1", "nome": "Turno 1", "inicio": "06:00", "fim": "14:00"},
    {"id": "T2", "nome": "Turno 2", "inicio": "14:00", "fim": "22:00"},
    {"id": "T3", "nome": "Turno 3", "inicio": "22:00", "fim": "06:00"},
]


def _ms(ano, mes, dia, hora, minuto=0) -> int:
    return int(datetime(ano, mes, dia, hora, minuto, tzinfo=TZ).timestamp() * 1000)


def test_turno_atual_usa_o_relogio_de_sao_paulo():
    assert turno_do_instante(TURNOS, _ms(2026, 9, 24, 16, 30))["turno_id"] == "T2"
    assert turno_do_instante(TURNOS, _ms(2026, 9, 24, 2, 0))["turno_id"] == "T3"


def test_limites_cortam_cada_virada_atravessada():
    cortes = limites_de_turno(TURNOS, _ms(2026, 9, 23, 21, 3), _ms(2026, 9, 24, 16, 30))
    assert cortes == [_ms(2026, 9, 23, 22, 0), _ms(2026, 9, 24, 6, 0), _ms(2026, 9, 24, 14, 0)]


def test_fatiar_deixa_o_ultimo_pedaco_aberto_no_turno_corrente():
    inicio = _ms(2026, 9, 23, 21, 3)
    agora = _ms(2026, 9, 24, 16, 30)
    fatias = fatiar_intervalo(inicio, agora, limites_de_turno(TURNOS, inicio, agora))
    assert fatias[0] == (inicio, _ms(2026, 9, 23, 22, 0))
    assert fatias[-1] == (_ms(2026, 9, 24, 14, 0), None)
    assert len(fatias) == 4


def test_sem_corte_quando_o_estado_ja_nasceu_neste_turno():
    inicio = _ms(2026, 9, 24, 15, 0)
    agora = _ms(2026, 9, 24, 16, 30)
    assert limites_de_turno(TURNOS, inicio, agora) == []
    assert fatiar_intervalo(inicio, agora, []) == [(inicio, None)]
