"""Formatadores pt-BR — portados de legacy/calculations.js."""

from __future__ import annotations

from datetime import datetime


def percentual(valor: float | None, casas: int = 1) -> str:
    if valor is None:
        return "—"
    txt = f"{valor * 100:.{casas}f}".replace(".", ",")
    return txt + "%"


def numero(valor: float | None, casas: int = 0) -> str:
    if valor is None:
        return "—"
    formatted = f"{valor:,.{casas}f}"
    return formatted.replace(",", "X").replace(".", ",").replace("X", ".")


def duracao(segundos: float | None) -> str:
    if segundos is None:
        return "—"
    s = max(0, round(segundos))
    h, rem = divmod(s, 3600)
    m, r = divmod(rem, 60)
    if h > 0:
        return f"{h}h {m:02d}min"
    if m > 0:
        return f"{m}min {r:02d}s"
    return f"{r}s"


def cronometro(segundos: float | None) -> str:
    s = max(0, round(segundos or 0))
    h, rem = divmod(s, 3600)
    m, r = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{r:02d}"


def hora(ts: int | None) -> str:
    if not ts:
        return "—"
    d = datetime.fromtimestamp(ts / 1000)
    return d.strftime("%H:%M")


def data_hora(ts: int | None) -> str:
    if not ts:
        return "—"
    d = datetime.fromtimestamp(ts / 1000)
    return d.strftime("%d/%m/%Y") + " " + hora(ts)
