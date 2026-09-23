"""Trilha de auditoria append-only com SHA-256 (evolução do FNV-1a da PoC)."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from oee.domain.catalog import AUDIT_ACOES
from oee.domain.ids import novo_id


def _estavel(valor: Any) -> str:
    if valor is None:
        return ""
    if not isinstance(valor, (dict, list)):
        return str(valor)
    if isinstance(valor, list):
        return json.dumps(valor, ensure_ascii=False, sort_keys=True, default=str)
    return ",".join(f"{k}={_estavel(valor[k])}" for k in sorted(valor.keys()))


def calcular_hash(reg: dict[str, Any]) -> str:
    payload = "|".join(
        [
            str(reg.get("hash_anterior") or "inicio"),
            str(reg.get("ts")),
            str(reg.get("origem")),
            str(reg.get("categoria")),
            str(reg.get("acao")),
            str(reg.get("usuario")),
            str(reg.get("maquina_id") or ""),
            str(reg.get("ordem_id") or ""),
            str(reg.get("entidade") or ""),
            str(reg.get("entidade_id") or ""),
            str(reg.get("descricao") or ""),
            _estavel(reg.get("antes")),
            _estavel(reg.get("depois")),
            _estavel(reg.get("detalhes")),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def montar_registro(ev: dict[str, Any], hash_anterior: str | None) -> dict[str, Any]:
    defn = AUDIT_ACOES.get(ev.get("acao") or "", {})
    reg = {
        "id": ev.get("id") or novo_id("AUD"),
        "ts": ev.get("ts"),
        "origem": ev.get("origem") or "GESTAO",
        "categoria": ev.get("categoria") or defn.get("categoria") or "SESSAO",
        "acao": ev["acao"],
        "sensivel": bool(defn.get("sensivel")),
        "usuario": ev.get("usuario") or "não identificado",
        "descricao": ev.get("descricao") or defn.get("rotulo") or ev["acao"],
        "maquina_id": ev.get("maquina_id"),
        "ordem_id": ev.get("ordem_id"),
        "turno_id": ev.get("turno_id"),
        "operador_id": ev.get("operador_id"),
        "entidade": ev.get("entidade"),
        "entidade_id": ev.get("entidade_id"),
        "antes": ev.get("antes"),
        "depois": ev.get("depois"),
        "detalhes": ev.get("detalhes"),
        "hash_anterior": hash_anterior,
    }
    reg["hash"] = calcular_hash(reg)
    return reg


def verificar_integridade(trilha: list[dict[str, Any]]) -> dict[str, Any]:
    alterados = []
    quebras = []
    for i, reg in enumerate(trilha):
        if calcular_hash(reg) != reg.get("hash"):
            alterados.append(reg["id"])
        if i > 0:
            esperado = trilha[i - 1].get("hash")
            truncado = trilha[i - 1].get("acao") == "TRILHA_PODADA" and reg.get("hash_anterior") != esperado
            if reg.get("hash_anterior") != esperado and not truncado:
                quebras.append(reg["id"])
    return {
        "total": len(trilha),
        "alterados": alterados,
        "quebras": quebras,
        "integra": not alterados and not quebras,
    }


def diferencas(antes: dict | None, depois: dict | None) -> list[dict[str, Any]]:
    chaves = set((antes or {}).keys()) | set((depois or {}).keys())
    out = []
    for k in sorted(chaves):
        de = None if antes is None else antes.get(k)
        para = None if depois is None else depois.get(k)
        if _estavel(de) != _estavel(para):
            out.append({"campo": k, "de": de, "para": para})
    return out
