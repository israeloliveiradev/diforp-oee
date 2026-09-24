"""Alertas que a gestão precisa ver sem abrir máquina por máquina."""

from __future__ import annotations

import json
import logging
import threading
import time
import urllib.request

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from oee.application.turno import virar_turnos
from oee.domain.alertas import PARADA_CRITICA_SEG, avaliar_posto
from oee.domain.timeutil import turno_do_instante
from oee.infrastructure.db import models as m

log = logging.getLogger("oee.alertas")


def _avisar_fora(url: str, criticos: list[dict]) -> None:
    if not url or not criticos:
        return

    def _enviar() -> None:
        try:
            from oee.infrastructure.jobs import _cliente

            redis = _cliente()
        except Exception:
            redis = None
        for alerta in criticos:
            chave = f"oee:alerta:{alerta['tipo']}:{alerta['maquina_id']}"
            try:
                if redis is not None and not redis.set(chave, "1", nx=True, ex=3600):
                    continue
            except Exception:
                log.warning("redis indisponível para silenciar alerta repetido")
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(alerta).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                urllib.request.urlopen(req, timeout=3).close()
            except Exception:
                log.warning("webhook de alerta não respondeu")

    threading.Thread(target=_enviar, daemon=True).start()


def listar_alertas(db: Session, agora: int | None = None) -> list[dict]:
    virar_turnos(db)
    agora = agora if agora is not None else int(time.time() * 1000)
    turnos = [{"id": t.id, "nome": t.nome, "inicio": t.inicio, "fim": t.fim} for t in db.scalars(select(m.Turno))]
    turno = turno_do_instante(turnos, agora)
    ini = int(turno.get("inicio") or agora)
    cfg = db.get(m.ConfigApp, "default")
    meta_refugo = float(cfg.meta_refugo_pct if cfg and cfg.meta_refugo_pct is not None else 0.02)
    longa_padrao = int(getattr(cfg, "parada_longa_min", None) or 15) * 60
    sem_padrao = int(getattr(cfg, "sem_peca_min", None) or 20) * 60
    setup_min = float(cfg.meta_setup_min if cfg and cfg.meta_setup_min else 20)
    linhas = {ln.id: ln for ln in db.scalars(select(m.Linha))}
    alertas: list[dict] = []
    for maq in db.scalars(select(m.Maquina).where(m.Maquina.ativa.is_(True))):
        linha = linhas.get(maq.linha_id)
        longa = int(linha.parada_longa_min) * 60 if linha and linha.parada_longa_min else longa_padrao
        sem = int(linha.sem_peca_min) * 60 if linha and linha.sem_peca_min else sem_padrao
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
            avaliar_posto(
                maq.nome,
                maq.id,
                maq.estado_atual or "",
                segundos,
                float(soma[0]),
                float(soma[1]),
                meta_refugo,
                parada_longa_seg=longa,
                parada_critica_seg=max(PARADA_CRITICA_SEG, longa),
                sem_peca_seg=sem,
                meta_setup_min=setup_min,
            )
        )
    ordem = {"critico": 0, "atencao": 1}
    alertas.sort(key=lambda a: ordem.get(a["criticidade"], 9))
    url = (getattr(cfg, "alerta_webhook_url", None) or "").strip() if cfg else ""
    _avisar_fora(url, [a for a in alertas if a["criticidade"] == "critico"])
    return alertas
