"""Top 3 de motivo já calculado, para o modal não esperar o modelo."""

from __future__ import annotations

import json
import logging

log = logging.getLogger("oee.acmp")


def guardar(maquina_id: str, sugestoes: list) -> None:
    try:
        from oee.infrastructure.jobs import _cliente

        _cliente().set(f"oee:acmp:{maquina_id}", json.dumps(sugestoes[:3]), ex=180)
    except Exception:
        log.debug("cache ACMP indisponível")


def ler(maquina_id: str) -> list | None:
    try:
        from oee.infrastructure.jobs import _cliente

        bruto = _cliente().get(f"oee:acmp:{maquina_id}")
        if not bruto:
            return None
        dados = json.loads(bruto)
        return dados if isinstance(dados, list) else None
    except Exception:
        return None
