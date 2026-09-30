"""Top 3 de motivo já calculado, para o modal não esperar o modelo."""

from __future__ import annotations

import json
import logging

log = logging.getLogger("oee.acmp")


def guardar(maquina_id: str, sugestoes: list) -> None:
    if not sugestoes:
        return
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
        # Lista vazia não conta: força novo cálculo em vez de esconder o top-3.
        if not isinstance(dados, list) or not dados:
            return None
        return dados
    except Exception:
        return None
