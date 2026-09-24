from __future__ import annotations

import logging
import time

from sqlalchemy import select, text

from oee.config import settings
from oee.domain.demo import gerar_demo
from oee.infrastructure.auth import hash_senha
from oee.infrastructure.db import models as m
from oee.infrastructure.db.models import Base
from oee.infrastructure.db.repositories import persistir_dataset
from oee.infrastructure.db.session import SessionLocal, engine

log = logging.getLogger("oee.seed")


def criar_tabelas() -> None:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        log.warning("create_all concorrente — schema provavelmente já existe")
    with engine.connect() as conn:
        try:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw "
                    "ON chunks_manual USING hnsw (embedding vector_cosine_ops)"
                )
            )
            conn.commit()
        except Exception:
            log.warning("índice pgvector não criado nesta instância (extensão ou versão)")
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS sinal_sem_motivo BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS sinal_token VARCHAR(128)"))
        conn.execute(text("ALTER TABLE linhas ADD COLUMN IF NOT EXISTS parada_longa_min INTEGER"))
        conn.execute(text("ALTER TABLE linhas ADD COLUMN IF NOT EXISTS sem_peca_min INTEGER"))
        conn.execute(text("ALTER TABLE config_app ADD COLUMN IF NOT EXISTS parada_longa_min INTEGER DEFAULT 15"))
        conn.execute(text("ALTER TABLE config_app ADD COLUMN IF NOT EXISTS sem_peca_min INTEGER DEFAULT 20"))
        conn.execute(text("ALTER TABLE config_app ADD COLUMN IF NOT EXISTS retrabalho_na_qualidade BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE config_app ADD COLUMN IF NOT EXISTS alerta_webhook_url VARCHAR(512)"))
        conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS planta_id VARCHAR(64)"))
        conn.commit()


def _senha(definida: str, padrao: str) -> str:
    return definida.strip() or padrao


def garantir_usuarios(db) -> None:
    senha_gestao = _senha(settings.demo_senha_gestao, "gestao")
    senha_operador = _senha(settings.demo_senha_operador, "operador")
    gestao = db.scalars(select(m.Usuario).where(m.Usuario.login == "gestao")).first()
    operador = db.scalars(select(m.Usuario).where(m.Usuario.login == "operador")).first()
    if gestao:
        if settings.demo_senha_gestao.strip():
            gestao.senha_hash = hash_senha(senha_gestao)
    else:
        db.add(m.Usuario(id="USR-GESTAO", login="gestao", nome="Gestão", senha_hash=hash_senha(senha_gestao), papel="gestao"))
    if operador:
        if settings.demo_senha_operador.strip():
            operador.senha_hash = hash_senha(senha_operador)
    else:
        db.add(
            m.Usuario(
                id="USR-OPERADOR",
                login="operador",
                nome="Operador",
                senha_hash=hash_senha(senha_operador),
                papel="operador",
                operador_id="OP-1",
            )
        )


def seed(dias: int | None = None) -> None:
    criar_tabelas()
    db = SessionLocal()
    try:
        garantir_usuarios(db)
        tem_maquina = db.scalars(select(m.Maquina)).first()
        if not tem_maquina:
            ds = gerar_demo({"dias": dias or settings.demo_dias, "seed": settings.demo_seed})
            persistir_dataset(db, ds)
            log.info("demo carregada: %s máquinas", len(ds["maquinas"]))
        from oee.application.turno import virar_turnos

        virar_turnos(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level="INFO")
    p = argparse.ArgumentParser()
    p.add_argument("--demo-dias", type=int, default=None)
    args = p.parse_args()
    seed(args.demo_dias)
    print("seed ok")
