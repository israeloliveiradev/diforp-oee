"""Naive Bayes multinomial para ACMP — portado de legacy/acmp.js.

Contrato: sem vazamento pelo estado da máquina; duração só no modo em curso;
avaliação com split temporal.
"""

from __future__ import annotations

import math
from typing import Any

MINIMO_AMOSTRAS = 30
ALFA = 1.0
ATRIBUTOS_INICIO = ["maquina", "turno", "faixa_hora", "produto", "motivo_anterior"]
ATRIBUTOS_EM_CURSO = ATRIBUTOS_INICIO + ["faixa_duracao"]
ROTULOS_ATRIBUTO = {
    "maquina": "máquina",
    "turno": "turno",
    "faixa_hora": "faixa horária",
    "produto": "produto",
    "motivo_anterior": "parada anterior",
    "faixa_duracao": "duração",
}


def faixa_horaria(ts_ms: int) -> str:
    h = __import__("datetime").datetime.fromtimestamp(ts_ms / 1000).hour
    if h < 4:
        return "00h-04h"
    if h < 8:
        return "04h-08h"
    if h < 12:
        return "08h-12h"
    if h < 16:
        return "12h-16h"
    if h < 20:
        return "16h-20h"
    return "20h-24h"


def faixa_duracao(seg: int | None) -> str:
    if seg is None:
        return "desconhecida"
    if seg <= 60:
        return "até 1 min"
    if seg <= 300:
        return "até 5 min"
    if seg <= 900:
        return "até 15 min"
    if seg <= 3600:
        return "até 1 h"
    return "acima de 1 h"


def extrair_amostras(dataset: dict[str, Any], opcoes: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    opcoes = opcoes or {}
    ordens = {o["id"]: o for o in dataset.get("ordens") or []}
    maquina_ids = opcoes.get("maquina_ids")
    paradas = [
        p
        for p in dataset.get("eventos_parada") or []
        if p.get("motivo_id")
        and (not maquina_ids or p.get("maquina_id") in maquina_ids)
        and (not opcoes.get("inicio") or p.get("inicio", 0) >= opcoes["inicio"])
        and (not opcoes.get("fim") or p.get("inicio", 0) <= opcoes["fim"])
    ]
    paradas.sort(key=lambda p: p.get("inicio") or 0)
    anterior_por_maquina: dict[str, str] = {}
    amostras = []
    for p in paradas:
        ordem = ordens.get(p.get("ordem_id"))
        amostras.append(
            {
                "id": p["id"],
                "ts": p.get("inicio"),
                "maquina_id": p.get("maquina_id"),
                "classe": p.get("motivo_id"),
                "atributos": {
                    "maquina": p.get("maquina_id"),
                    "turno": p.get("turno_id") or "sem-turno",
                    "faixa_hora": faixa_horaria(p.get("inicio") or 0),
                    "produto": ordem.get("produto_id") if ordem else "sem-ordem",
                    "motivo_anterior": anterior_por_maquina.get(p.get("maquina_id"), "nenhuma"),
                    "faixa_duracao": faixa_duracao(p.get("duracao_seg")),
                },
            }
        )
        anterior_por_maquina[p.get("maquina_id")] = p.get("motivo_id")
    return amostras


def contexto_atual(dataset: dict[str, Any], maquina: dict[str, Any], opcoes: dict[str, Any] | None = None) -> dict[str, Any]:
    opcoes = opcoes or {}
    agora = opcoes.get("agora") or int(__import__("time").time() * 1000)
    ordem = None
    if maquina.get("ordem_atual_id"):
        ordem = next((o for o in dataset.get("ordens") or [] if o["id"] == maquina["ordem_atual_id"]), None)
    anteriores = [
        p
        for p in dataset.get("eventos_parada") or []
        if p.get("maquina_id") == maquina["id"] and p.get("motivo_id") and (p.get("inicio") or 0) < agora
    ]
    anteriores.sort(key=lambda p: p.get("inicio") or 0)
    anterior = anteriores[-1] if anteriores else None
    from oee.domain.timeutil import turno_do_instante

    turno = turno_do_instante(dataset.get("turnos") or [], agora)
    return {
        "maquina": maquina["id"],
        "turno": turno.get("turno_id"),
        "faixa_hora": faixa_horaria(agora),
        "produto": ordem.get("produto_id") if ordem else "sem-ordem",
        "motivo_anterior": anterior.get("motivo_id") if anterior else "nenhuma",
        "faixa_duracao": faixa_duracao(opcoes.get("duracao_seg")),
    }


def treinar(amostras: list[dict[str, Any]], atributos: list[str] | None = None) -> dict[str, Any]:
    atributos = atributos or ATRIBUTOS_INICIO
    contagem_classe: dict[str, int] = {}
    contagem: dict[str, dict[str, dict[str, int]]] = {a: {} for a in atributos}
    valores: dict[str, dict[str, bool]] = {a: {} for a in atributos}
    total = 0
    for am in amostras:
        c = am["classe"]
        contagem_classe[c] = contagem_classe.get(c, 0) + 1
        total += 1
        for a in atributos:
            v = am["atributos"].get(a)
            contagem[a].setdefault(c, {})
            contagem[a][c][v] = contagem[a][c].get(v, 0) + 1
            valores[a][v] = True
    return {
        "tipo": "naive_bayes",
        "atributos": atributos,
        "classes": list(contagem_classe.keys()),
        "contagem_classe": contagem_classe,
        "contagem": contagem,
        "cardinalidade": {a: len(valores[a]) for a in atributos},
        "total": total,
    }


def pontuar(modelo: dict[str, Any], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    if not modelo or not modelo.get("total"):
        return []
    pontos = []
    for c in modelo["classes"]:
        logp = math.log(modelo["contagem_classe"][c] / modelo["total"])
        for a in modelo["atributos"]:
            por_classe = modelo["contagem"][a].get(c) or {}
            n = por_classe.get(ctx.get(a), 0)
            total_classe = modelo["contagem_classe"][c]
            k = modelo["cardinalidade"].get(a) or 1
            logp += math.log((n + ALFA) / (total_classe + ALFA * k))
        pontos.append({"classe": c, "log": logp})
    maior = max(p["log"] for p in pontos)
    soma = 0.0
    for p in pontos:
        p["exp"] = math.exp(p["log"] - maior)
        soma += p["exp"]
    for p in pontos:
        p["prob"] = p["exp"] / soma if soma else 0.0
    return sorted(pontos, key=lambda p: p["prob"], reverse=True)


def evidencias(modelo: dict[str, Any], ctx: dict[str, Any], classe: str, limite: int = 2) -> list[dict[str, Any]]:
    lista = []
    for a in modelo["atributos"]:
        valor = ctx.get(a)
        dessa = (modelo["contagem"][a].get(classe) or {}).get(valor, 0)
        com_valor = sum((modelo["contagem"][a].get(c) or {}).get(valor, 0) for c in modelo["classes"])
        proporcao = (dessa / com_valor) if com_valor else 0.0
        rotulo = ROTULOS_ATRIBUTO.get(a, a)
        lista.append(
            {
                "atributo": a,
                "rotulo": rotulo,
                "valor": valor,
                "proporcao": proporcao,
                "suporte": com_valor,
                "ocorrencias": dessa,
                "frase": (
                    f"entre paradas com {rotulo} = {valor}, {dessa} de {com_valor} "
                    f"({proporcao:.0%}) foram deste motivo"
                    if com_valor
                    else f"{rotulo} = {valor}"
                ),
            }
        )
    lista = [e for e in lista if e["suporte"] >= 3 and e["proporcao"] > 0]
    lista.sort(key=lambda e: e["proporcao"], reverse=True)
    return lista[:limite]


def sugerir(modelo: dict[str, Any], ctx: dict[str, Any], quantidade: int = 3) -> list[dict[str, Any]]:
    if not modelo or modelo.get("total", 0) < MINIMO_AMOSTRAS:
        return []
    return [
        {
            "motivo_id": p["classe"],
            "probabilidade": p["prob"],
            "posicao": i + 1,
            "evidencias": evidencias(modelo, ctx, p["classe"], 2),
            "modelo": "naive_bayes",
        }
        for i, p in enumerate(pontuar(modelo, ctx)[:quantidade])
    ]


def baseline(amostras_treino: list[dict[str, Any]]) -> dict[str, Any]:
    por_maquina: dict[str, dict[str, int]] = {}
    geral: dict[str, int] = {}
    for a in amostras_treino:
        por_maquina.setdefault(a["maquina_id"], {})
        por_maquina[a["maquina_id"]][a["classe"]] = por_maquina[a["maquina_id"]].get(a["classe"], 0) + 1
        geral[a["classe"]] = geral.get(a["classe"], 0) + 1

    def ordenar(mapa: dict[str, int]) -> list[str]:
        return sorted(mapa.keys(), key=lambda k: mapa[k], reverse=True)

    geral_ord = ordenar(geral)
    return {
        "por_maquina": {m: ordenar(cnt)[0] if cnt else None for m, cnt in por_maquina.items()},
        "por_maquina_top3": {m: ordenar(cnt)[:3] for m, cnt in por_maquina.items()},
        "geral": geral_ord[0] if geral_ord else None,
        "geral_top3": geral_ord[:3],
    }


def avaliar(amostras: list[dict[str, Any]], opcoes: dict[str, Any] | None = None) -> dict[str, Any]:
    opcoes = opcoes or {}
    atributos = opcoes.get("atributos") or ATRIBUTOS_INICIO
    fracao = opcoes.get("fracao_treino", 0.75)
    if len(amostras) < MINIMO_AMOSTRAS * 2:
        return {"suficiente": False, "total_amostras": len(amostras), "minimo": MINIMO_AMOSTRAS * 2}
    ordenadas = sorted(amostras, key=lambda a: a["ts"] or 0)
    corte = int(len(ordenadas) * fracao)
    treino, teste = ordenadas[:corte], ordenadas[corte:]
    modelo = treinar(treino, atributos)
    ref = baseline(treino)
    acertos_top1 = acertos_top3 = acertos_base = acertos_base_top3 = 0
    matriz: dict[str, dict[str, int]] = {}
    classes_vistas: dict[str, bool] = {}
    for am in teste:
        ranking = pontuar(modelo, am["atributos"])
        previsto = ranking[0]["classe"] if ranking else None
        top3 = [p["classe"] for p in ranking[:3]]
        if previsto == am["classe"]:
            acertos_top1 += 1
        if am["classe"] in top3:
            acertos_top3 += 1
        if (ref["por_maquina"].get(am["maquina_id"]) or ref["geral"]) == am["classe"]:
            acertos_base += 1
        ref_top3 = ref["por_maquina_top3"].get(am["maquina_id"]) or ref["geral_top3"]
        if am["classe"] in ref_top3:
            acertos_base_top3 += 1
        matriz.setdefault(am["classe"], {})
        matriz[am["classe"]][previsto] = matriz[am["classe"]].get(previsto, 0) + 1
        classes_vistas[am["classe"]] = True
        if previsto:
            classes_vistas[previsto] = True
    classes = list(classes_vistas.keys())
    por_classe = []
    for c in classes:
        vp = (matriz.get(c) or {}).get(c, 0)
        fn = sum(v for k, v in (matriz.get(c) or {}).items() if k != c)
        fp = sum((matriz.get(real) or {}).get(c, 0) for real in classes if real != c)
        precisao = vp / (vp + fp) if (vp + fp) else None
        revocacao = vp / (vp + fn) if (vp + fn) else None
        f1 = (2 * precisao * revocacao / (precisao + revocacao)) if precisao and revocacao else 0.0
        por_classe.append({"classe": c, "suporte": vp + fn, "precisao": precisao, "revocacao": revocacao, "f1": f1})
    por_classe.sort(key=lambda p: p["suporte"], reverse=True)
    com = [p for p in por_classe if p["suporte"] > 0]
    f1_macro = sum(p["f1"] for p in com) / len(com) if com else 0.0
    n = len(teste) or 1
    return {
        "suficiente": True,
        "modelo": "naive_bayes",
        "atributos": atributos,
        "total_amostras": len(ordenadas),
        "treino": len(treino),
        "teste": len(teste),
        "acuracia_top1": acertos_top1 / n,
        "acuracia_top3": acertos_top3 / n,
        "acuracia_baseline": acertos_base / n,
        "acuracia_baseline_top3": acertos_base_top3 / n,
        "f1_macro": f1_macro,
        "matriz": matriz,
        "classes": classes,
        "por_classe": por_classe,
    }
