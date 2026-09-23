"""Fila Redis para ingestão de manuais (fallback: o worker também varre o banco)."""

from __future__ import annotations

import logging
import time

from oee.config import settings

log = logging.getLogger("oee.jobs")
FILA_MANUAIS = "oee:manuais"


def _cliente():
    import redis

    return redis.from_url(settings.redis_url, socket_connect_timeout=2, decode_responses=True)


def enfileirar_manual(manual_id: str) -> None:
    try:
        _cliente().lpush(FILA_MANUAIS, manual_id)
    except Exception:
        log.warning("Redis indisponível — o worker processará o manual pela tabela")


def heartbeat() -> bool:
    try:
        r = _cliente()
        r.set("oee:worker:heartbeat", str(time.time()))
        return bool(r.ping())
    except Exception:
        return False


def puxar_manual(timeout: int = 1) -> str | None:
    try:
        item = _cliente().brpop(FILA_MANUAIS, timeout=timeout)
        if not item:
            return None
        return item[1]
    except Exception:
        return None
