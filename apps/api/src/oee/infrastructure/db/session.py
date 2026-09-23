from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from oee.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_session() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_pgvector(conn) -> None:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
