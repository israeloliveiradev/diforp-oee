"""Janelas de turno — portado de legacy/data.js."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def hora_para_minutos(hhmm: str) -> int:
    parts = str(hhmm).split(":")
    return (int(parts[0] or 0) * 60) + int(parts[1] if len(parts) > 1 else 0)


def janelas_de_turno(turnos: list[dict[str, Any]], dia_base: datetime) -> list[dict[str, Any]]:
    inicio_dia = datetime(dia_base.year, dia_base.month, dia_base.day)
    janelas: list[dict[str, Any]] = []
    for t in turnos:
        ini = hora_para_minutos(t["inicio"])
        fim = hora_para_minutos(t["fim"])
        duracao = fim - ini if fim > ini else (24 * 60 - ini) + fim
        start = inicio_dia + timedelta(minutes=ini)
        end = inicio_dia + timedelta(minutes=ini + duracao)
        janelas.append(
            {
                "turno_id": t["id"],
                "nome": t["nome"],
                "inicio": int(start.timestamp() * 1000),
                "fim": int(end.timestamp() * 1000),
            }
        )
    return sorted(janelas, key=lambda j: j["inicio"])


def turno_do_instante(turnos: list[dict[str, Any]], ts_ms: int) -> dict[str, Any]:
    if not turnos:
        return {"turno_id": None, "nome": "sem-turno", "inicio": ts_ms, "fim": ts_ms + 8 * 3600000}
    d = datetime.fromtimestamp(ts_ms / 1000)
    candidatos = janelas_de_turno(turnos, d - timedelta(days=1)) + janelas_de_turno(turnos, d)
    for c in candidatos:
        if c["inicio"] <= ts_ms < c["fim"]:
            return c
    return candidatos[0] if candidatos else {"turno_id": None, "nome": "sem-turno", "inicio": ts_ms, "fim": ts_ms}


def ms_now() -> int:
    return int(time_ms())


def time_ms() -> float:
    import time

    return time.time() * 1000
