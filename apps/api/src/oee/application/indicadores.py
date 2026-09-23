"""Indicadores, filtros e agregações para dashboards."""

from __future__ import annotations

from typing import Any

from oee.domain.calculations import (
    calcular_oee,
    ciclo_ideal_medio,
    faixa_oee,
    oee_por_grupo,
    pareto,
    producao_por_bucket,
    serie_oee,
)


def filtrar_maquinas(ds: dict[str, Any], filtros: dict[str, Any]) -> list[dict[str, Any]]:
    plantas = {p["id"]: p for p in ds["plantas"]}
    areas = {a["id"]: a for a in ds["areas"]}
    linhas = {l["id"]: l for l in ds["linhas"]}
    out = []
    for m in ds["maquinas"]:
        if filtros.get("maquina_id") and m["id"] != filtros["maquina_id"]:
            continue
        linha = linhas.get(m["linha_id"])
        area = areas.get(linha["area_id"]) if linha else None
        planta = plantas.get(area["planta_id"]) if area else None
        if filtros.get("linha_id") and m["linha_id"] != filtros["linha_id"]:
            continue
        if filtros.get("area_id") and (not area or area["id"] != filtros["area_id"]):
            continue
        if filtros.get("planta_id") and (not planta or planta["id"] != filtros["planta_id"]):
            continue
        out.append({**m, "linha": linha, "area": area, "planta": planta})
    return out


def janela(filtros: dict[str, Any], agora: int) -> tuple[int, int]:
    periodo = filtros.get("periodo") or "24h"
    if filtros.get("data_inicio") and filtros.get("data_fim"):
        return int(filtros["data_inicio"]), int(filtros["data_fim"])
    mapa = {"1h": 3600000, "8h": 8 * 3600000, "24h": 24 * 3600000, "7d": 7 * 24 * 3600000, "30d": 30 * 24 * 3600000}
    return agora - mapa.get(periodo, 24 * 3600000), agora


def enriquecer_filtros(ds: dict[str, Any], filtros: dict[str, Any] | None) -> dict[str, Any]:
    f = dict(filtros or {})
    if f.get("produto_id"):
        f["_ordens_produto"] = {o["id"] for o in ds.get("ordens") or [] if o.get("produto_id") == f["produto_id"]}
    if f.get("operador_id"):
        f["_ordens_operador"] = {o["id"] for o in ds.get("ordens") or [] if o.get("operador_id") == f["operador_id"]}
    return f


def _filtra_eventos(evs: list[dict], filtros: dict[str, Any]) -> list[dict]:
    out = evs
    if filtros.get("ordem_id"):
        out = [e for e in out if e.get("ordem_id") == filtros["ordem_id"]]
    if filtros.get("turno_id"):
        out = [e for e in out if e.get("turno_id") == filtros["turno_id"]]
    if filtros.get("operador_id"):
        ordens = filtros.get("_ordens_operador") or set()
        out = [e for e in out if e.get("operador_id") == filtros["operador_id"] or e.get("ordem_id") in ordens]
    if filtros.get("produto_id"):
        ordens = filtros.get("_ordens_produto") or set()
        out = [e for e in out if e.get("produto_id") == filtros["produto_id"] or e.get("ordem_id") in ordens]
    return out


def _eventos_maquinas(ds: dict[str, Any], ids: list[str], filtros: dict[str, Any]) -> dict[str, list[dict]]:
    idset = set(ids)
    return {
        "eventos_estado": _filtra_eventos([e for e in ds.get("eventos_estado") or [] if e.get("maquina_id") in idset], filtros),
        "eventos_producao": _filtra_eventos([e for e in ds.get("eventos_producao") or [] if e.get("maquina_id") in idset], filtros),
        "eventos_parada": _filtra_eventos([e for e in ds.get("eventos_parada") or [] if e.get("maquina_id") in idset], filtros),
    }


def indicadores_contexto(ds: dict[str, Any], maquinas: list[dict], ini: int, fim: int, filtros: dict[str, Any] | None = None) -> dict[str, Any]:
    ids = [m["id"] for m in maquinas]
    f = enriquecer_filtros(ds, filtros)
    evs = _eventos_maquinas(ds, ids, f)
    res = calcular_oee(
        {
            **evs,
            "inicio": ini,
            "fim": fim,
            "ciclo_ideal_seg": ciclo_ideal_medio({**ds, **evs}, ids, ini, fim),
            "config": ds.get("config") or {},
        }
    )
    res["faixa"] = faixa_oee(res["oee"], (ds.get("config") or {}).get("meta_oee") or 0.75)
    return res


def dashboard(ds: dict[str, Any], filtros: dict[str, Any], agora: int) -> dict[str, Any]:
    filtros = enriquecer_filtros(ds, filtros)
    ini, fim = janela(filtros, agora)
    maqs = filtrar_maquinas(ds, filtros)
    ids = [m["id"] for m in maqs]
    evs = _eventos_maquinas(ds, ids, filtros)
    ds_f = {**ds, **evs}
    idset = set(ids)
    ind = indicadores_contexto(ds, maqs, ini, fim, filtros)
    grupos = oee_por_grupo(ds_f, maqs, ini, fim, lambda m: m["id"], lambda k, m: m["nome"])
    paradas = evs["eventos_parada"]
    motivos = {m["id"]: m for m in ds["motivos"]}
    p = pareto(
        [e for e in paradas if not e.get("planejada")],
        ini,
        fim,
        "motivo_id",
        lambda k: f"{motivos[k]['categoria']} / {motivos[k]['nome']}" if k in motivos else "Não classificado",
    )
    span = fim - ini
    bucket = 3600000 if span <= 48 * 3600000 else 24 * 3600000
    serie = serie_oee(ds_f, ids, ini, fim, bucket)
    prod = producao_por_bucket(evs["eventos_producao"], ini, fim, bucket)
    linhas = {l["id"]: l for l in ds.get("linhas") or []}
    por_linha = oee_por_grupo(ds_f, maqs, ini, fim, lambda m: m.get("linha_id"), lambda k, _m: (linhas.get(k) or {}).get("nome") or k)
    turnos = ds.get("turnos") or []
    por_turno = []
    for t in turnos:
        tf = {**filtros, "turno_id": t["id"]}
        r = indicadores_contexto(ds, maqs, ini, fim, tf)
        por_turno.append({"chave": t["id"], "rotulo": t["nome"], "horario": f"{t.get('inicio', '')} – {t.get('fim', '')}", "indicadores": r})
    return {
        "inicio": ini,
        "fim": fim,
        "rotulo_periodo": filtros.get("periodo") or "24h",
        "indicadores": ind,
        "por_maquina": grupos,
        "por_linha": por_linha,
        "por_turno": por_turno,
        "pareto": p,
        "serie": serie,
        "producao": prod,
        "maquinas": maqs,
        "ordens": [
            o
            for o in ds.get("ordens") or []
            if o.get("maquina_id") in idset and (o.get("inicio") or 0) < fim and (o.get("fim") is None or o.get("fim") > ini)
        ],
    }
