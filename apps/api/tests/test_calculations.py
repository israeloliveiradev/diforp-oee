"""Golden tests das fórmulas TPM (paridade com legacy/calculations.js)."""

from oee.domain.calculations import calcular_oee, faixa_oee, sobreposicao_ms


def test_sobreposicao():
    assert sobreposicao_ms(0, 100, 50, 150) == 50
    assert sobreposicao_ms(0, None, 0, 40) == 40
    assert sobreposicao_ms(10, 20, 30, 40) == 0


def test_oee_basico():
    # 1h produzindo + 15min parada não planejada, 100 peças, ciclo 30s
    eventos_estado = [
        {"estado": "PRODUZINDO", "inicio": 0, "fim": 3600_000},
        {"estado": "PARADA_NAO_PLANEJADA", "inicio": 3600_000, "fim": 3600_000 + 900_000},
    ]
    eventos_producao = [{"ts": 1000, "qtd_total": 100, "qtd_refugo": 2, "qtd_retrabalho": 0}]
    r = calcular_oee(
        {
            "eventos_estado": eventos_estado,
            "eventos_producao": eventos_producao,
            "eventos_parada": [
                {"planejada": False, "inicio": 3600_000, "fim": 3600_000 + 900_000},
            ],
            "inicio": 0,
            "fim": 4500_000,
            "ciclo_ideal_seg": 30,
            "config": {},
        }
    )
    assert r["tempo_total_seg"] == 4500
    assert r["parada_nao_planejada_seg"] == 900
    assert r["tempo_producao_planejado_seg"] == 4500
    assert r["tempo_operacional_seg"] == 3600
    assert abs(r["disponibilidade"] - (3600 / 4500)) < 1e-9
    assert r["qualidade"] == 0.98
    assert faixa_oee(0.8, 0.75) == "bom"
    assert faixa_oee(0.5, 0.75) == "critico"


def test_divisao_protegida():
    r = calcular_oee(
        {
            "eventos_estado": [],
            "eventos_producao": [],
            "inicio": 0,
            "fim": 1000,
            "ciclo_ideal_seg": 30,
        }
    )
    assert r["oee"] is None
    assert r["disponibilidade"] is None
