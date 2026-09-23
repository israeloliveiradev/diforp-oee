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


def garantir_usuarios(db) -> None:
    if db.scalars(select(m.Usuario).where(m.Usuario.login == "gestao")).first():
        return
    db.add(m.Usuario(id="USR-GESTAO", login="gestao", nome="Gestão", senha_hash=hash_senha("gestao"), papel="gestao"))
    db.add(
        m.Usuario(
            id="USR-OPERADOR",
            login="operador",
            nome="Operador",
            senha_hash=hash_senha("operador"),
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
