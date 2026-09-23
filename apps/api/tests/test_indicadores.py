from oee.application.indicadores import _filtra_eventos, enriquecer_filtros, janela


def test_janela_respeita_periodo_e_intervalo_explicito():
    agora = 10_000_000
    ini, fim = janela({"periodo": "1h"}, agora)
    assert fim == agora
    assert fim - ini == 3_600_000
    ini2, fim2 = janela({"data_inicio": 100, "data_fim": 200}, agora)
    assert (ini2, fim2) == (100, 200)


def test_filtra_operador_pelo_id_ou_pela_ordem():
    ds = {
        "ordens": [
            {"id": "ORD-1", "operador_id": "OP-1", "produto_id": "P1"},
            {"id": "ORD-2", "operador_id": "OP-2", "produto_id": "P1"},
        ]
    }
    f = enriquecer_filtros(ds, {"operador_id": "OP-1"})
    evs = [
        {"id": "E1", "ordem_id": "ORD-1", "estado": "PRODUZINDO"},
        {"id": "E2", "ordem_id": "ORD-2", "estado": "PRODUZINDO"},
        {"id": "P1", "operador_id": "OP-1", "qtd_total": 10},
        {"id": "P2", "operador_id": "OP-2", "qtd_total": 5},
    ]
    ids = {e["id"] for e in _filtra_eventos(evs, f)}
    assert ids == {"E1", "P1"}
