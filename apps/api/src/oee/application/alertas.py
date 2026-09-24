"""Alertas que a gestão precisa ver sem abrir máquina por máquina."""

from __future__ import annotations

import time

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from oee.application.turno import virar_turnos
from oee.domain.alertas import avaliar_posto
from oee.domain.timeutil import turno_do_instante
from oee.infrastructure.db import models as m


def listar_alertas(db: Session, agora: int | None = None) -> list[dict]:
    virar_turnos(db)
    agora = agora if agora is not None else int(time.time() * 1000)
    turnos = [{"id": t.id, "nome": t.nome, "inicio": t.inicio, "fim": t.fim} for t in db.scalars(select(m.Turno))]
    turno = turno_do_instante(turnos, agora)
    ini = int(turno.get("inicio") or agora)
    cfg = db.get(m.ConfigApp, "default")
    meta_refugo = float(cfg.meta_refugo_pct if cfg and cfg.meta_refugo_pct is not None else 0.02)
    alertas: list[dict] = []
    for maq in db.scalars(select(m.Maquina).where(m.Maquina.ativa.is_(True))):
        marco = max(int(maq.estado_desde or ini), ini)
        segundos = max(0, (agora - marco) / 1000)
        soma = db.execute(
            select(
                func.coalesce(func.sum(m.EventoProducao.qtd_total), 0),
                func.coalesce(func.sum(m.EventoProducao.qtd_refugo), 0),
            ).where(
                m.EventoProducao.maquina_id == maq.id,
                m.EventoProducao.ts >= ini,
                m.EventoProducao.ts <= agora,
            )
        ).one()
        alertas.extend(
            avaliar_posto(maq.nome, maq.id, maq.estado_atual or "", segundos, float(soma[0]), float(soma[1]), meta_refugo)
        )
    ordem = {"critico": 0, "atencao": 1}
    alertas.sort(key=lambda a: ordem.get(a["criticidade"], 9))
    return alertas
