"""Fórmulas TPM de OEE — portadas de legacy/calculations.js (funções puras)."""

from __future__ import annotations

from typing import Any

from oee.domain.catalog import classe_do_estado


def seguro(n: Any) -> float:
    try:
        v = float(n)
        return v if v == v and v not in (float("inf"), float("-inf")) else 0.0
    except (TypeError, ValueError):
        return 0.0


def dividir(a: float | None, b: float | None) -> float | None:
    if not b or b <= 0:
        return None
    return (a or 0) / b


def sobreposicao_ms(ini: int | None, fim: int | None, jan_ini: int, jan_fim: int) -> int:
    f = jan_fim if fim is None else fim
    a = max(ini or 0, jan_ini)
    b = min(f, jan_fim)
    return b - a if b > a else 0


def agregar_tempos(
    eventos_estado: list[dict[str, Any]],
    jan_ini: int,
    jan_fim: int,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    por_estado: dict[str, float] = {}
    por_classe = {"PRODUTIVO": 0.0, "PLANEJADA": 0.0, "NAO_PLANEJADA": 0.0}
    total = 0.0
    for ev in eventos_estado:
        ms = sobreposicao_ms(ev.get("inicio"), ev.get("fim"), jan_ini, jan_fim)
        if ms <= 0:
            continue
        seg = ms / 1000.0
        estado = ev.get("estado")
        por_estado[estado] = por_estado.get(estado, 0.0) + seg
        por_classe[classe_do_estado(estado, config)] += seg
        total += seg
    return {"por_estado": por_estado, "por_classe": por_classe, "total_coberto_seg": total}


def calcular_oee(p: dict[str, Any]) -> dict[str, Any]:
    config = p.get("config") or {}
    jan_ini = p["inicio"]
    jan_fim = p["fim"]
    anomalias: list[dict[str, Any]] = []

    tempos = agregar_tempos(p.get("eventos_estado") or [], jan_ini, jan_fim, config)
    tempo_total = tempos["total_coberto_seg"]
    parada_planejada = tempos["por_classe"]["PLANEJADA"]
    parada_nao_planejada = tempos["por_classe"]["NAO_PLANEJADA"]
    tpp = max(0.0, tempo_total - parada_planejada)
    operacional = max(0.0, tpp - parada_nao_planejada)

    producao_total = 0.0
    refugo = 0.0
    retrabalho = 0.0
    for ev in p.get("eventos_producao") or []:
        ts = ev.get("ts")
        if ts is None or ts < jan_ini or ts > jan_fim:
            continue
        producao_total += seguro(ev.get("qtd_total", ev.get("qtdTotal")))
        refugo += seguro(ev.get("qtd_refugo", ev.get("qtdRefugo")))
        retrabalho += seguro(ev.get("qtd_retrabalho", ev.get("qtdRetrabalho")))
    aprovada = max(0.0, producao_total - refugo)

    ciclo_ideal = p.get("ciclo_ideal_seg") or 0.0
    disponibilidade = dividir(operacional, tpp)
    performance = dividir(producao_total * ciclo_ideal, operacional)
    qualidade = dividir(aprovada, producao_total)
    ciclo_real = dividir(operacional, producao_total)

    performance_bruta = performance
    if performance is not None and performance > 1:
        anomalias.append(
            {
                "indicador": "Performance",
                "valor_bruto": performance,
                "mensagem": "Performance acima de 100%: revise o ciclo ideal, o apontamento de produção ou paradas não registradas.",
            }
        )
        performance = 1.0
    disponibilidade_bruta = disponibilidade
    if disponibilidade is not None and disponibilidade > 1:
        anomalias.append(
            {
                "indicador": "Disponibilidade",
                "valor_bruto": disponibilidade,
                "mensagem": "Disponibilidade acima de 100%: há sobreposição de eventos de estado no período.",
            }
        )
        disponibilidade = 1.0
    if qualidade is not None and qualidade > 1:
        qualidade = 1.0

    oee = None
    if disponibilidade is not None and performance is not None and qualidade is not None:
        oee = disponibilidade * performance * qualidade

    falhas = [
        ev
        for ev in (p.get("eventos_parada") or [])
        if not ev.get("planejada") and sobreposicao_ms(ev.get("inicio"), ev.get("fim"), jan_ini, jan_fim) > 0
    ]
    tempo_falhas = sum(sobreposicao_ms(ev.get("inicio"), ev.get("fim"), jan_ini, jan_fim) / 1000.0 for ev in falhas)
    mtbf = dividir(operacional, float(len(falhas))) if falhas else None
    mttr = dividir(tempo_falhas, float(len(falhas))) if falhas else None

    return {
        "janela": {"inicio": jan_ini, "fim": jan_fim},
        "tempo_total_seg": tempo_total,
        "parada_planejada_seg": parada_planejada,
        "parada_nao_planejada_seg": parada_nao_planejada,
        "tempo_producao_planejado_seg": tpp,
        "tempo_operacional_seg": operacional,
        "tempos_por_estado": tempos["por_estado"],
        "producao_total": producao_total,
        "producao_aprovada": aprovada,
        "refugo": refugo,
        "retrabalho": retrabalho,
        "ciclo_ideal_seg": ciclo_ideal,
        "ciclo_real_seg": ciclo_real,
        "disponibilidade": disponibilidade,
        "performance": performance,
        "qualidade": qualidade,
        "oee": oee,
        "disponibilidade_bruta": disponibilidade_bruta,
        "performance_bruta": performance_bruta,
        "qtd_paradas": len(falhas),
        "tempo_falhas_seg": tempo_falhas,
        "mtbf_seg": mtbf,
        "mttr_seg": mttr,
        "anomalias": anomalias,
    }


def ciclo_ideal_medio(
    dataset: dict[str, Any],
    maquina_ids: list[str],
    jan_ini: int,
    jan_fim: int,
) -> float:
    ids = set(maquina_ids)
    soma_peso = 0.0
    soma_ciclo = 0.0
    ordens = {o["id"]: o for o in dataset.get("ordens") or []}
    produtos = {p["id"]: p for p in dataset.get("produtos") or []}
    for ev in dataset.get("eventos_producao") or []:
        if ev.get("maquina_id") not in ids:
            continue
        ts = ev.get("ts")
        if ts is None or ts < jan_ini or ts > jan_fim:
            continue
        ordem = ordens.get(ev.get("ordem_id"))
        ciclo = ordem.get("ciclo_ideal_seg") if ordem else None
        if not ciclo:
            prod = produtos.get(ev.get("produto_id"))
            ciclo = prod.get("ciclo_ideal_seg") if prod else 0
        qtd = seguro(ev.get("qtd_total", ev.get("qtdTotal")))
        soma_ciclo += (ciclo or 0) * qtd
        soma_peso += qtd
    if soma_peso > 0:
        return soma_ciclo / soma_peso
    maquinas = [m for m in dataset.get("maquinas") or [] if m["id"] in ids]
    if not maquinas:
        return 0.0
    return sum(m.get("ciclo_ideal_seg") or 0 for m in maquinas) / len(maquinas)


def oee_por_grupo(
    dataset: dict[str, Any],
    maquinas: list[dict[str, Any]],
    jan_ini: int,
    jan_fim: int,
    chave_fn,
    rotulo_fn=None,
) -> list[dict[str, Any]]:
    grupos: dict[str, dict[str, Any]] = {}
    for maq in maquinas:
        chave = chave_fn(maq)
        if chave is None:
            continue
        if chave not in grupos:
            grupos[chave] = {
                "chave": chave,
                "rotulo": rotulo_fn(chave, maq) if rotulo_fn else str(chave),
                "maquinas": [],
            }
        grupos[chave]["maquinas"].append(maq)

    out = []
    for g in grupos.values():
        ids = [m["id"] for m in g["maquinas"]]
        idset = set(ids)
        res = calcular_oee(
            {
                "eventos_estado": [e for e in dataset.get("eventos_estado") or [] if e.get("maquina_id") in idset],
                "eventos_producao": [e for e in dataset.get("eventos_producao") or [] if e.get("maquina_id") in idset],
                "eventos_parada": [e for e in dataset.get("eventos_parada") or [] if e.get("maquina_id") in idset],
                "inicio": jan_ini,
                "fim": jan_fim,
                "ciclo_ideal_seg": ciclo_ideal_medio(dataset, ids, jan_ini, jan_fim),
                "config": dataset.get("config") or {},
            }
        )
        out.append({**g, "indicadores": res})
    return out


def pareto(
    eventos_parada: list[dict[str, Any]],
    jan_ini: int,
    jan_fim: int,
    campo: str,
    rotulo_fn=None,
) -> dict[str, Any]:
    mapa: dict[str, dict[str, Any]] = {}
    for ev in eventos_parada:
        ms = sobreposicao_ms(ev.get("inicio"), ev.get("fim"), jan_ini, jan_fim)
        if ms <= 0:
            continue
        chave = ev.get(campo) or "Outros"
        if chave not in mapa:
            mapa[chave] = {
                "chave": chave,
                "rotulo": rotulo_fn(chave) if rotulo_fn else str(chave),
                "tempo_seg": 0.0,
                "ocorrencias": 0,
            }
        mapa[chave]["tempo_seg"] += ms / 1000.0
        mapa[chave]["ocorrencias"] += 1
    lista = sorted(mapa.values(), key=lambda i: i["tempo_seg"], reverse=True)
    total = sum(i["tempo_seg"] for i in lista)
    acumulado = 0.0
    for i in lista:
        i["participacao"] = (i["tempo_seg"] / total) if total else 0.0
        acumulado += i["participacao"]
        i["acumulado"] = acumulado
    return {"itens": lista, "total_seg": total}


def serie_oee(
    dataset: dict[str, Any],
    maquina_ids: list[str],
    jan_ini: int,
    jan_fim: int,
    bucket_ms: int,
) -> list[dict[str, Any]]:
    idset = set(maquina_ids)
    estados = [e for e in dataset.get("eventos_estado") or [] if e.get("maquina_id") in idset]
    producao = [e for e in dataset.get("eventos_producao") or [] if e.get("maquina_id") in idset]
    paradas = [e for e in dataset.get("eventos_parada") or [] if e.get("maquina_id") in idset]
    pontos = []
    t = jan_ini
    while t < jan_fim:
        fim_b = min(t + bucket_ms, jan_fim)
        res = calcular_oee(
            {
                "eventos_estado": estados,
                "eventos_producao": producao,
                "eventos_parada": paradas,
                "inicio": t,
                "fim": fim_b,
                "ciclo_ideal_seg": ciclo_ideal_medio(dataset, maquina_ids, t, fim_b),
                "config": dataset.get("config") or {},
            }
        )
        pontos.append({"inicio": t, "fim": fim_b, "indicadores": res})
        t += bucket_ms
    return pontos


def producao_por_bucket(
    eventos_producao: list[dict[str, Any]],
    jan_ini: int,
    jan_fim: int,
    bucket_ms: int,
) -> list[dict[str, Any]]:
    buckets = []
    t = jan_ini
    while t < jan_fim:
        buckets.append(
            {
                "inicio": t,
                "fim": min(t + bucket_ms, jan_fim),
                "total": 0.0,
                "aprovada": 0.0,
                "refugo": 0.0,
            }
        )
        t += bucket_ms
    for ev in eventos_producao:
        ts = ev.get("ts")
        if ts is None or ts < jan_ini or ts > jan_fim:
            continue
        idx = int((ts - jan_ini) // bucket_ms)
        if idx < 0 or idx >= len(buckets):
            continue
        qtd = seguro(ev.get("qtd_total", ev.get("qtdTotal")))
        ref = seguro(ev.get("qtd_refugo", ev.get("qtdRefugo")))
        buckets[idx]["total"] += qtd
        buckets[idx]["refugo"] += ref
        buckets[idx]["aprovada"] += qtd - ref
    return buckets


def faixa_oee(valor: float | None, meta: float = 0.75) -> str:
    if valor is None:
        return "indefinido"
    if valor >= meta:
        return "bom"
    if valor >= meta * 0.8:
        return "atencao"
    return "critico"
