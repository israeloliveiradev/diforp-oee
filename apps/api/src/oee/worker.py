"""Worker: simulador, ingestão de manuais pendentes e retreino ACMP."""

from __future__ import annotations

import logging
import time

from sqlalchemy import select

from oee.config import settings
from oee.infrastructure.db import models as m
from oee.infrastructure.db.repositories import snapshot
from oee.infrastructure.db.session import SessionLocal
from oee.infrastructure.jobs import heartbeat, puxar_manual
from oee.infrastructure.ml.pipeline import treinar_lightgbm
from oee.infrastructure.rag.service import processar_manual
from oee.infrastructure.simulator import tick
from oee.seed import criar_tabelas, garantir_usuarios

log = logging.getLogger("oee.worker")


def loop() -> None:
    criar_tabelas()
    db = SessionLocal()
    try:
        garantir_usuarios(db)
        db.commit()
    finally:
        db.close()

    ultimo_treino = 0
    while True:
        db = SessionLocal()
        try:
            cfg = db.get(m.ConfigApp, "default")
            intervalo = (cfg.intervalo_simulacao_seg if cfg else 5) or 5
            if cfg and cfg.simulacao_ativa:
                tick(db)
            heartbeat()
            mid = puxar_manual(timeout=1)
            ids = [mid] if mid else []
            pendentes = db.scalars(select(m.Manual).where(m.Manual.status == "processando")).all()
            for man in pendentes:
                if man.id not in ids:
                    ids.append(man.id)
            for man_id in ids:
                if not man_id:
                    continue
                log.info("processando manual %s", man_id)
                processar_manual(db, man_id)
            agora = time.time()
            if agora - ultimo_treino > 1800:
                ds = snapshot(db)
                if len(ds.get("eventos_parada") or []) >= 60:
                    log.info("retreinando ACMP")
                    treinar_lightgbm(ds)
                    ultimo_treino = agora
        except Exception:
            log.exception("falha no worker")
        finally:
            db.close()
        time.sleep(max(2, intervalo))


if __name__ == "__main__":
    logging.basicConfig(level=settings.log_level, format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"worker","msg":"%(message)s"}')
    loop()
