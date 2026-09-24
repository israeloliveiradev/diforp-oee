"""Janelas de turno no fuso da planta (America/Sao_Paulo)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Sao_Paulo")


def hora_para_minutos(hhmm: str) -> int:
    parts = str(hhmm).split(":")
    return (int(parts[0] or 0) * 60) + int(parts[1] if len(parts) > 1 else 0)


def _inicio_do_dia(dia_base: datetime) -> datetime:
    local = dia_base.astimezone(TZ) if dia_base.tzinfo else dia_base.replace(tzinfo=TZ)
    return datetime(local.year, local.month, local.day, tzinfo=TZ)


def janelas_de_turno(turnos: list[dict[str, Any]], dia_base: datetime) -> list[dict[str, Any]]:
    inicio_dia = _inicio_do_dia(dia_base)
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
    d = datetime.fromtimestamp(ts_ms / 1000, TZ)
    candidatos = janelas_de_turno(turnos, d - timedelta(days=1)) + janelas_de_turno(turnos, d)
    for c in candidatos:
        if c["inicio"] <= ts_ms < c["fim"]:
            return c
    return candidatos[0] if candidatos else {"turno_id": None, "nome": "sem-turno", "inicio": ts_ms, "fim": ts_ms}


def limites_de_turno(turnos: list[dict[str, Any]], desde_ms: int, ate_ms: int) -> list[int]:
    """Inícios de turno estritamente depois de desde_ms e até ate_ms."""
    if not turnos or ate_ms <= desde_ms:
        return []
    inicio = datetime.fromtimestamp(desde_ms / 1000, TZ) - timedelta(days=1)
    fim = datetime.fromtimestamp(ate_ms / 1000, TZ) + timedelta(days=1)
    dia = _inicio_do_dia(inicio)
    ultimo = _inicio_do_dia(fim)
    cortes: list[int] = []
    while dia <= ultimo:
        for janela in janelas_de_turno(turnos, dia):
            if desde_ms < janela["inicio"] <= ate_ms:
                cortes.append(janela["inicio"])
        dia += timedelta(days=1)
    return sorted(set(cortes))


def fatiar_intervalo(inicio: int, agora: int, cortes: list[int]) -> list[tuple[int, int | None]]:
    """Parte um intervalo aberto nos cortes. O último pedaço continua aberto."""
    pontos = sorted({inicio, *[c for c in cortes if inicio < c <= agora]})
    if len(pontos) <= 1:
        return [(inicio, None)]
    fatias = [(pontos[i], pontos[i + 1]) for i in range(len(pontos) - 1)]
    fatias.append((pontos[-1], None))
    return fatias


def ms_now() -> int:
    return int(time_ms())


def time_ms() -> float:
    import time

    return time.time() * 1000
