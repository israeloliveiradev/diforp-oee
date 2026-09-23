from oee.domain.insights import gerar


def test_insights_dataset_vazio():
    out = gerar({"maquinas": [], "turnos": [], "eventos_estado": [], "eventos_producao": [], "eventos_parada": [], "config": {}}, {"agora": 1_700_000_000_000})
    assert isinstance(out, list)
