from oee.domain.acmp import MINIMO_AMOSTRAS, evidencias, pontuar, treinar


def test_naive_bayes_ranking():
    amostras = []
    for i in range(40):
        amostras.append(
            {
                "id": str(i),
                "ts": i,
                "maquina_id": "MQ-1",
                "classe": "MOT-04" if i % 3 else "MOT-01",
                "atributos": {
                    "maquina": "MQ-1",
                    "turno": "T1",
                    "faixa_hora": "08h-12h",
                    "produto": "PR-1",
                    "motivo_anterior": "nenhuma",
                },
            }
        )
    modelo = treinar(amostras)
    assert modelo["total"] >= MINIMO_AMOSTRAS
    rank = pontuar(modelo, amostras[0]["atributos"])
    assert rank[0]["prob"] >= rank[-1]["prob"]
    assert abs(sum(p["prob"] for p in rank) - 1) < 1e-6
    ev = evidencias(modelo, amostras[0]["atributos"], rank[0]["classe"])
    assert all("frase" in e for e in ev)
