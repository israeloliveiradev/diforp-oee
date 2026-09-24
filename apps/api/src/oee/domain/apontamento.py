"""Regras de apontamento que mudam o número do cartão, sem banco."""

from __future__ import annotations

ESTADOS_QUE_VIRAM_MICRO = {
    "PARADA_NAO_PLANEJADA",
    "AGUARDANDO_MATERIAL",
    "AGUARDANDO_OPERADOR",
    "MICROPARADA",
}


def vira_microparada(duracao_seg: float, limite_seg: int, estado: str) -> bool:
    """Parada curta, com a máquina de volta, deixa de ser parada cheia."""
    return estado in ESTADOS_QUE_VIRAM_MICRO and duracao_seg >= 0 and duracao_seg <= limite_seg


def quantidades_refugo(qtd: float, destas: bool) -> tuple[float, float]:
    """Lote novo entra em produzido e rejeitado. Peça já contada só muda de aprovado para rejeitado."""
    if qtd <= 0:
        raise ValueError("Informe uma quantidade maior que zero.")
    if destas:
        return 0.0, qtd
    return qtd, qtd


def acumulado(eventos: list[tuple[float, float, float]]) -> dict[str, float]:
    """Cada item é (qtd_total, qtd_refugo, qtd_retrabalho)."""
    total = sum(e[0] for e in eventos)
    refugo = sum(e[1] for e in eventos)
    retrabalho = sum(e[2] for e in eventos)
    return {
        "produzido": total,
        "refugo": refugo,
        "retrabalho": retrabalho,
        "aprovado": max(0.0, total - refugo),
    }
