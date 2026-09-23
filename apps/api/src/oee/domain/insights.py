"""Insights determinísticos — portados de legacy/insights.js."""

from __future__ import annotations

from typing import Any

from oee.domain import fmt
from oee.domain.calculations import calcular_oee, classe_do_estado, ciclo_ideal_medio, oee_por_grupo, sobreposicao_ms
from oee.domain.catalog import ESTADOS
from oee.domain.ids import novo_id
from oee.domain.timeutil import turno_do_instante

HORA = 3600000
CRITICIDADE = {
    "INFORMATIVO": "informativo",
    "ATENCAO": "atencao",
    "CRITICO": "critico",
    "OPORTUNIDADE": "oportunidade",
}


def _eventos(dataset, colecao, ids):
    idset = set(ids)
    return [e for e in dataset.get(colecao) or [] if e.get("maquina_id") in idset]


def _calcular(dataset, ids, ini, fim):
    return calcular_oee(
        {
            "eventos_estado": _eventos(dataset, "eventos_estado", ids),
            "eventos_producao": _eventos(dataset, "eventos_producao", ids),
            "eventos_parada": _eventos(dataset, "eventos_parada", ids),
            "inicio": ini,
            "fim": fim,
            "ciclo_ideal_seg": ciclo_ideal_medio(dataset, ids, ini, fim),
            "config": dataset.get("config") or {},
        }
    )


def _nome(dataset, mid):
    m = next((x for x in dataset.get("maquinas") or [] if x["id"] == mid), None)
    return m["nome"] if m else mid


def _periodo(ini, fim):
    return f"{fmt.data_hora(ini)} até {fmt.data_hora(fim)}"


def _insight(**kwargs):
    return {
        "id": novo_id("INS"),
        "titulo": kwargs["titulo"],
        "descricao": kwargs["descricao"],
        "indicador": kwargs["indicador"],
        "criticidade": kwargs["criticidade"],
        "periodo": kwargs["periodo"],
        "acao_recomendada": kwargs.get("acao_recomendada"),
        "maquina_id": kwargs.get("maquina_id"),
        "valor": kwargs.get("valor"),
    }


def _janelas(dataset, agora):
    atual = turno_do_instante(dataset.get("turnos") or [], agora)
    duracao = max(1, (atual.get("fim") or agora) - (atual.get("inicio") or agora))
    ant = turno_do_instante(dataset.get("turnos") or [], (atual.get("inicio") or agora) - 60000)
    return {
        "atual": {**atual, "fim": min(atual.get("fim") or agora, agora)},
        "anterior": ant,
        "duracao_turno_ms": duracao,
    }


def gerar(dataset: dict[str, Any], opcoes: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    opcoes = opcoes or {}
    agora = opcoes.get("agora") or int(__import__("time").time() * 1000)
    ids = opcoes.get("maquina_ids") or [m["id"] for m in dataset.get("maquinas") or []]
    ctx = {
        "dataset": dataset,
        "ids": ids,
        "agora": agora,
        "inicio": opcoes.get("inicio") or (agora - 24 * HORA),
        "fim": opcoes.get("fim") or agora,
        "turnos": _janelas(dataset, agora),
    }
    resultado: list[dict[str, Any]] = []
    for regra in REGRAS:
        try:
            saida = regra(ctx)
            if not saida:
                continue
            resultado.extend(saida if isinstance(saida, list) else [saida])
        except Exception:
            continue
    ordem = {"critico": 0, "atencao": 1, "oportunidade": 2, "informativo": 3}
    resultado.sort(key=lambda i: ordem.get(i["criticidade"], 9))
    return resultado


def _r1(ctx):
    atual = _calcular(ctx["dataset"], ctx["ids"], ctx["turnos"]["atual"]["inicio"], ctx["turnos"]["atual"]["fim"])
    anterior = _calcular(ctx["dataset"], ctx["ids"], ctx["turnos"]["anterior"]["inicio"], ctx["turnos"]["anterior"]["fim"])
    if atual["disponibilidade"] is None or anterior["disponibilidade"] is None:
        return None
    delta = atual["disponibilidade"] - anterior["disponibilidade"]
    if abs(delta) < 0.05:
        return None
    caiu = delta < 0
    return _insight(
        titulo=(
            f"Disponibilidade caiu {fmt.percentual(abs(delta), 0)} em relação ao turno anterior"
            if caiu
            else f"Disponibilidade subiu {fmt.percentual(delta, 0)} em relação ao turno anterior"
        ),
        descricao=(
            f"No {ctx['turnos']['atual']['nome']} a Disponibilidade está em {fmt.percentual(atual['disponibilidade'])}, "
            f"contra {fmt.percentual(anterior['disponibilidade'])} no {ctx['turnos']['anterior']['nome']}. "
            f"Tempo parado não planejado no turno atual: {fmt.duracao(atual['parada_nao_planejada_seg'])}."
        ),
        indicador="Disponibilidade",
        criticidade=CRITICIDADE["CRITICO"] if caiu and abs(delta) >= 0.12 else (CRITICIDADE["ATENCAO"] if caiu else CRITICIDADE["INFORMATIVO"]),
        periodo=_periodo(ctx["turnos"]["atual"]["inicio"], ctx["turnos"]["atual"]["fim"]),
        acao_recomendada=(
            "Comparar os motivos de parada dos dois turnos na tela Paradas e verificar mudanças de setup, material ou equipe."
            if caiu
            else "Registrar a prática que melhorou o turno e replicar nas demais máquinas da linha."
        ),
        valor=delta,
    )


def _r2(ctx):
    from oee.domain.calculations import pareto

    paradas = [e for e in _eventos(ctx["dataset"], "eventos_parada", ctx["ids"]) if not e.get("planejada")]
    motivos = {m["id"]: m for m in ctx["dataset"].get("motivos") or []}

    def rotulo(k):
        m = motivos.get(k)
        return f"{m['categoria']} / {m['nome']}" if m else "Não classificado"

    p = pareto(paradas, ctx["inicio"], ctx["fim"], "motivo_id", rotulo)
    if not p["itens"] or p["total_seg"] < 600:
        return None
    topo = p["itens"][0]
    if topo["participacao"] < 0.25:
        return None
    return _insight(
        titulo=f"{topo['rotulo']} representa {fmt.percentual(topo['participacao'], 0)} do tempo total de parada",
        descricao=(
            f"Foram {topo['ocorrencias']} ocorrências somando {fmt.duracao(topo['tempo_seg'])} "
            f"de um total de {fmt.duracao(p['total_seg'])} de paradas não planejadas no período."
        ),
        indicador="Disponibilidade",
        criticidade=CRITICIDADE["CRITICO"] if topo["participacao"] >= 0.4 else CRITICIDADE["ATENCAO"],
        periodo=_periodo(ctx["inicio"], ctx["fim"]),
        acao_recomendada="Abrir análise de causa raiz para este motivo. Ele concentra o maior potencial de ganho de Disponibilidade.",
        valor=topo["participacao"],
    )


def _r3(ctx):
    r = _calcular(ctx["dataset"], ctx["ids"], ctx["inicio"], ctx["fim"])
    if not r["ciclo_real_seg"] or not r["ciclo_ideal_seg"] or r["producao_total"] < 20:
        return None
    desvio = (r["ciclo_real_seg"] - r["ciclo_ideal_seg"]) / r["ciclo_ideal_seg"]
    if desvio <= 0.05:
        return None
    return _insight(
        titulo=f"Operação {fmt.percentual(desvio, 0)} acima do ciclo ideal",
        descricao=(
            f"Ciclo ideal de {r['ciclo_ideal_seg']:.1f} s/peça contra ciclo real médio de "
            f"{r['ciclo_real_seg']:.1f} s/peça. Isso limita a Performance a {fmt.percentual(r['performance'])}."
        ),
        indicador="Performance",
        criticidade=CRITICIDADE["CRITICO"] if desvio >= 0.15 else CRITICIDADE["ATENCAO"],
        periodo=_periodo(ctx["inicio"], ctx["fim"]),
        acao_recomendada="Verificar parâmetros de processo, desgaste de ferramenta e se o ciclo ideal cadastrado ainda reflete o produto atual.",
        valor=desvio,
    )


def _r4(ctx):
    limite = (ctx["dataset"].get("config") or {}).get("limite_microparada_seg", 300)
    paradas = _eventos(ctx["dataset"], "eventos_parada", ctx["ids"])

    def contar(ini, fim):
        return sum(
            1
            for e in paradas
            if not e.get("planejada")
            and (e.get("duracao_seg") or 0) <= limite
            and sobreposicao_ms(e.get("inicio"), e.get("fim"), ini, fim) > 0
        )

    recentes = contar(ctx["agora"] - 2 * HORA, ctx["agora"])
    anteriores = contar(ctx["agora"] - 4 * HORA, ctx["agora"] - 2 * HORA)
    if recentes < 4 or recentes <= anteriores * 1.3:
        return None
    return _insight(
        titulo="Volume de microparadas aumentou nas últimas duas horas",
        descricao=f"{recentes} microparadas (até {fmt.duracao(limite)}) nas últimas 2 horas, contra {anteriores} nas 2 horas anteriores.",
        indicador="Disponibilidade",
        criticidade=CRITICIDADE["ATENCAO"],
        periodo=_periodo(ctx["agora"] - 2 * HORA, ctx["agora"]),
        acao_recomendada="Observar a máquina em operação: microparadas frequentes costumam indicar sensor sujo, alimentação irregular ou ajuste fino pendente.",
        valor=recentes,
    )


def _r5(ctx):
    if len(ctx["ids"]) != 1:
        return None
    maq = next((m for m in ctx["dataset"].get("maquinas") or [] if m["id"] == ctx["ids"][0]), None)
    if not maq or not maq.get("ordem_atual_id"):
        return None
    ordem = next((o for o in ctx["dataset"].get("ordens") or [] if o["id"] == maq["ordem_atual_id"]), None)
    if not ordem or not ordem.get("meta_qtd"):
        return None
    jan = ctx["turnos"]["atual"]
    r = _calcular(ctx["dataset"], ctx["ids"], jan["inicio"], ctx["agora"])
    decorrido_h = (ctx["agora"] - jan["inicio"]) / HORA
    if decorrido_h < 0.5:
        return None
    restante_h = (turno_do_instante(ctx["dataset"].get("turnos") or [], ctx["agora"])["fim"] - ctx["agora"]) / HORA
    ritmo = r["producao_total"] / decorrido_h if decorrido_h else 0
    projecao = r["producao_total"] + ritmo * restante_h
    atingimento = projecao / ordem["meta_qtd"] if ordem["meta_qtd"] else 0
    if atingimento >= 0.98:
        return _insight(
            titulo="Meta do turno deve ser atingida no ritmo atual",
            descricao=f"Ritmo de {fmt.numero(ritmo)} peças/h projeta {fmt.numero(projecao)} peças contra meta de {fmt.numero(ordem['meta_qtd'])}.",
            indicador="Produção",
            criticidade=CRITICIDADE["INFORMATIVO"],
            periodo=_periodo(jan["inicio"], ctx["agora"]),
            acao_recomendada="Manter o ritmo e registrar as condições atuais como referência.",
            maquina_id=maq["id"],
            valor=atingimento,
        )
    return _insight(
        titulo="Meta do turno não deve ser atingida no ritmo atual",
        descricao=(
            f"Produzidas {fmt.numero(r['producao_total'])} de {fmt.numero(ordem['meta_qtd'])} peças. "
            f"No ritmo de {fmt.numero(ritmo)} peças/h, a projeção para o fim do turno é {fmt.numero(projecao)} "
            f"peças ({fmt.percentual(atingimento, 0)} da meta)."
        ),
        indicador="Produção",
        criticidade=CRITICIDADE["CRITICO"] if atingimento < 0.85 else CRITICIDADE["ATENCAO"],
        periodo=_periodo(jan["inicio"], ctx["agora"]),
        acao_recomendada="Priorizar a redução da maior perda do turno e avaliar reprogramação com o planejamento.",
        maquina_id=maq["id"],
        valor=atingimento,
    )


def _r6(ctx):
    setups = [
        e
        for e in _eventos(ctx["dataset"], "eventos_parada", ctx["ids"])
        if e.get("estado") == "SETUP" and sobreposicao_ms(e.get("inicio"), e.get("fim"), ctx["inicio"], ctx["fim"]) > 0
    ]
    if len(setups) < 2:
        return None
    medio = sum(e.get("duracao_seg") or 0 for e in setups) / len(setups)
    meta = ((ctx["dataset"].get("config") or {}).get("meta_setup_min") or 20) * 60
    if medio <= meta:
        return None
    return _insight(
        titulo="Tempo médio de setup acima da meta",
        descricao=(
            f"{len(setups)} setups no período, com média de {fmt.duracao(medio)} contra meta de {fmt.duracao(meta)}. "
            f"Total consumido em setup: {fmt.duracao(sum(e.get('duracao_seg') or 0 for e in setups))}."
        ),
        indicador="Disponibilidade",
        criticidade=CRITICIDADE["CRITICO"] if medio > meta * 1.5 else CRITICIDADE["ATENCAO"],
        periodo=_periodo(ctx["inicio"], ctx["fim"]),
        acao_recomendada="Aplicar SMED: separar atividades internas e externas e preparar ferramental antes da parada.",
        valor=medio,
    )


def _r7(ctx):
    r = _calcular(ctx["dataset"], ctx["ids"], ctx["inicio"], ctx["fim"])
    if r["producao_total"] < 30:
        return None
    taxa = r["refugo"] / r["producao_total"]
    historico = _calcular(ctx["dataset"], ctx["ids"], ctx["agora"] - 7 * 24 * HORA, ctx["inicio"])
    taxa_hist = historico["refugo"] / historico["producao_total"] if historico["producao_total"] > 0 else None
    meta = (ctx["dataset"].get("config") or {}).get("meta_refugo_pct") or 0.02
    referencia = meta if taxa_hist is None else taxa_hist
    if taxa <= referencia * 1.2 and taxa <= meta:
        return None
    return _insight(
        titulo="Índice de refugo acima da referência",
        descricao=(
            f"Refugo de {fmt.percentual(taxa)} no período ({fmt.numero(r['refugo'])} de {fmt.numero(r['producao_total'])} peças), "
            f"contra referência histórica de {fmt.percentual(referencia)} e meta de {fmt.percentual(meta)}."
        ),
        indicador="Qualidade",
        criticidade=CRITICIDADE["CRITICO"] if taxa > referencia * 2 else CRITICIDADE["ATENCAO"],
        periodo=_periodo(ctx["inicio"], ctx["fim"]),
        acao_recomendada="Verificar as principais causas de refugo na tela Qualidade e conferir a última liberação de processo.",
        valor=taxa,
    )


def _r8(ctx):
    esperas = [
        e
        for e in _eventos(ctx["dataset"], "eventos_parada", ctx["ids"])
        if e.get("estado") in ("AGUARDANDO_MATERIAL", "AGUARDANDO_OPERADOR")
        and sobreposicao_ms(e.get("inicio"), e.get("fim"), ctx["inicio"], ctx["fim"]) > 0
    ]
    if not esperas:
        return None
    tempo = sum(sobreposicao_ms(e.get("inicio"), e.get("fim"), ctx["inicio"], ctx["fim"]) / 1000.0 for e in esperas)
    r = _calcular(ctx["dataset"], ctx["ids"], ctx["inicio"], ctx["fim"])
    if not r["tempo_producao_planejado_seg"] or tempo / r["tempo_producao_planejado_seg"] < 0.05:
        return None
    ganho = tempo / r["tempo_producao_planejado_seg"]
    return _insight(
        titulo="Reduzir o tempo de espera é a maior oportunidade do período",
        descricao=(
            f"Esperas por material ou operador somam {fmt.duracao(tempo)} em {len(esperas)} ocorrências, "
            f"equivalentes a {fmt.percentual(ganho, 0)} do tempo de produção planejado."
        ),
        indicador="Disponibilidade",
        criticidade=CRITICIDADE["OPORTUNIDADE"],
        periodo=_periodo(ctx["inicio"], ctx["fim"]),
        acao_recomendada="Revisar o abastecimento da linha (kanban, ponto de pedido) e a cobertura de operadores nas trocas de turno.",
        valor=ganho,
    )


def _r9(ctx):
    itens = []
    for m in ctx["dataset"].get("maquinas") or []:
        if m["id"] not in ctx["ids"]:
            continue
        if classe_do_estado(m.get("estado_atual"), ctx["dataset"].get("config")) != "NAO_PLANEJADA":
            continue
        duracao_seg = (ctx["agora"] - (m.get("estado_desde") or ctx["agora"])) / 1000
        if duracao_seg < 1800:
            continue
        defn = ESTADOS.get(m.get("estado_atual") or "", {})
        itens.append(
            _insight(
                titulo=f"{_nome(ctx['dataset'], m['id'])} parada há {fmt.duracao(duracao_seg)}",
                descricao=f"Estado atual: {defn.get('rotulo', m.get('estado_atual'))}, desde {fmt.hora(m.get('estado_desde'))}.",
                indicador="Disponibilidade",
                criticidade=CRITICIDADE["CRITICO"] if duracao_seg > 3600 else CRITICIDADE["ATENCAO"],
                periodo=_periodo(m.get("estado_desde"), ctx["agora"]),
                acao_recomendada="Confirmar se o atendimento foi acionado e se o motivo registrado continua válido.",
                maquina_id=m["id"],
                valor=duracao_seg,
            )
        )
    return itens


def _r10(ctx):
    if len(ctx["ids"]) < 2:
        return None
    meta = (ctx["dataset"].get("config") or {}).get("meta_oee") or 0.75
    grupos = oee_por_grupo(
        ctx["dataset"],
        [m for m in ctx["dataset"].get("maquinas") or [] if m["id"] in ctx["ids"]],
        ctx["inicio"],
        ctx["fim"],
        lambda m: m["id"],
        lambda k, m: _nome(ctx["dataset"], k),
    )
    validos = [g for g in grupos if g["indicadores"]["oee"] is not None]
    validos.sort(key=lambda g: g["indicadores"]["oee"], reverse=True)
    if not validos or validos[0]["indicadores"]["oee"] < meta:
        return None
    melhor, pior = validos[0], validos[-1]
    return _insight(
        titulo=f"{melhor['rotulo']} é a referência do período com OEE de {fmt.percentual(melhor['indicadores']['oee'])}",
        descricao=(
            f"A diferença para a máquina de menor desempenho ({pior['rotulo']}, "
            f"{fmt.percentual(pior['indicadores']['oee'])}) é de "
            f"{fmt.percentual(melhor['indicadores']['oee'] - pior['indicadores']['oee'], 0)} pontos de OEE."
        ),
        indicador="OEE",
        criticidade=CRITICIDADE["OPORTUNIDADE"],
        periodo=_periodo(ctx["inicio"], ctx["fim"]),
        acao_recomendada="Comparar setup, parâmetros e rotina de operação entre as duas máquinas para padronizar a prática melhor.",
        maquina_id=melhor["maquinas"][0]["id"],
        valor=melhor["indicadores"]["oee"],
    )


REGRAS = [_r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8, _r9, _r10]
