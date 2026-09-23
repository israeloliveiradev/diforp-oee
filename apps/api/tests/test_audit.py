from oee.domain.audit import calcular_hash, montar_registro, verificar_integridade


def test_cadeia_sha256_integra():
    a = montar_registro({"acao": "ORDEM_ABERTA", "ts": 1, "usuario": "gestao", "descricao": "a"}, None)
    b = montar_registro({"acao": "PARADA_INICIADA", "ts": 2, "usuario": "operador", "descricao": "b"}, a["hash"])
    assert len(a["hash"]) == 64
    assert a["hash"] == calcular_hash(a)
    integ = verificar_integridade([a, b])
    assert integ["integra"] is True
    assert integ["total"] == 2


def test_detecta_tampering():
    a = montar_registro({"acao": "ORDEM_ABERTA", "ts": 1, "usuario": "gestao", "descricao": "a"}, None)
    a["descricao"] = "alterado"
    integ = verificar_integridade([a])
    assert integ["integra"] is False
    assert a["id"] in integ["alterados"]
