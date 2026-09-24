"""Corta estado e parada abertos em cada virada de turno."""

from __future__ import annotations

import logging
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from oee.domain.ids import novo_id
from oee.domain.timeutil import fatiar_intervalo, limites_de_turno, turno_do_instante
from oee.infrastructure.db import models as m

log = logging.getLogger("oee.turno")


def _turnos(db: Session) -> list[dict]:
    return [{"id": t.id, "nome": t.nome, "inicio": t.inicio, "fim": t.fim} for t in db.scalars(select(m.Turno))]


def _turno_id(turnos: list[dict], ts: int) -> str | None:
    return turno_do_instante(turnos, ts).get("turno_id")


def _fatiar_estado(db: Session, ev: m.EventoEstado, turnos: list[dict], agora: int, cortes: list[int]) -> None:
    fatias = fatiar_intervalo(int(ev.inicio), agora, cortes)
    if len(fatias) <= 1:
        return
    ev.fim = fatias[0][1]
    ev.turno_id = _turno_id(turnos, int(ev.inicio))
    for ini, fim in fatias[1:]:
        db.add(
            m.EventoEstado(
                id=novo_id("EST"),
                maquina_id=ev.maquina_id,
                ordem_id=ev.ordem_id,
                turno_id=_turno_id(turnos, ini),
                estado=ev.estado,
                motivo_id=ev.motivo_id,
                inicio=ini,
                fim=fim,
            )
        )


def _fatiar_parada(db: Session, ev: m.EventoParada, turnos: list[dict], agora: int, cortes: list[int]) -> None:
    fatias = fatiar_intervalo(int(ev.inicio), agora, cortes)
    if len(fatias) <= 1:
        return
    ev.fim = fatias[0][1]
    ev.duracao_seg = max(0, round((int(ev.fim) - int(ev.inicio)) / 1000))
    ev.turno_id = _turno_id(turnos, int(ev.inicio))
    for ini, fim in fatias[1:]:
        db.add(
            m.EventoParada(
                id=novo_id("PAR"),
                maquina_id=ev.maquina_id,
                ordem_id=ev.ordem_id,
                turno_id=_turno_id(turnos, ini),
                estado=ev.estado,
                motivo_id=ev.motivo_id,
                categoria=ev.categoria,
                planejada=ev.planejada,
                inicio=ini,
                fim=fim,
                duracao_seg=0 if fim is None else max(0, round((fim - ini) / 1000)),
                comentario=ev.comentario or "",
            )
        )


def virar_turnos(db: Session, agora: int | None = None) -> int:
    """Fecha o que atravessou a virada e reabre no turno corrente. Idempotente."""
    agora = agora if agora is not None else int(time.time() * 1000)
    turnos = _turnos(db)
    if not turnos:
        return 0
    ini = int(turno_do_instante(turnos, agora).get("inicio") or agora)
    maquinas = list(
        db.scalars(select(m.Maquina).where(m.Maquina.estado_desde.is_not(None), m.Maquina.estado_desde < ini))
    )
    if not maquinas:
        return 0
    for maq in maquinas:
        cortes = limites_de_turno(turnos, int(maq.estado_desde), agora)
        if not cortes:
            continue
        for ev in db.scalars(
            select(m.EventoEstado).where(m.EventoEstado.maquina_id == maq.id, m.EventoEstado.fim.is_(None))
        ):
            _fatiar_estado(db, ev, turnos, agora, cortes)
        for ev in db.scalars(
            select(m.EventoParada).where(m.EventoParada.maquina_id == maq.id, m.EventoParada.fim.is_(None))
        ):
            _fatiar_parada(db, ev, turnos, agora, cortes)
        maq.estado_desde = cortes[-1]
    db.commit()
    log.info("virada de turno em %s máquinas", len(maquinas))
    return len(maquinas)
