"""Geração de IDs no formato da PoC (PREFIX-timestamp-seq)."""

from __future__ import annotations

import time

_seq = 0


def novo_id(prefixo: str) -> str:
    global _seq
    _seq += 1
    ts = int(time.time() * 1000)
    return f"{prefixo}-{_to36(ts)}-{_to36(_seq)}"


def _to36(n: int) -> str:
    if n <= 0:
        return "0"
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = []
    while n:
        n, r = divmod(n, 36)
        out.append(alphabet[r])
    return "".join(reversed(out))
