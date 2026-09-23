from oee.domain.demo import gerar_demo
from oee.domain.calculations import calcular_oee, ciclo_ideal_medio


def test_demo_gera_hierarquia_e_eventos():
    ds = gerar_demo({"dias": 1, "seed": 20240517, "agora": 1_715_000_000_000})
    assert len(ds["maquinas"]) == 8
    assert len(ds["motivos"]) == 20
    assert ds["eventos_parada"]
    assert ds["eventos_producao"]
    ids = [m["id"] for m in ds["maquinas"]]
    r = calcular_oee(
        {
            "eventos_estado": ds["eventos_estado"],
            "eventos_producao": ds["eventos_producao"],
            "eventos_parada": ds["eventos_parada"],
            "inicio": min(e["inicio"] for e in ds["eventos_estado"]),
            "fim": 1_715_000_000_000,
            "ciclo_ideal_seg": ciclo_ideal_medio(ds, ids, 0, 1_715_000_000_000),
            "config": ds["config"],
        }
    )
    assert r["tempo_total_seg"] > 0
    assert r["producao_total"] > 0
