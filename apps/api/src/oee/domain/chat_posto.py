"""Classifica a pergunta do operador sem banco e sem modelo."""

from __future__ import annotations

import unicodedata

_COMO = (
    "como fazer",
    "como trocar",
    "como consertar",
    "como apontar",
    "o que fazer",
    "o que eu faço",
    "o que eu faco",
    "procedimento",
    "passo a passo",
    "alarme",
    "trocar",
    "consertar",
    "posso ",
)
_POSTO = (
    "status",
    "estado",
    "como está",
    "como esta",
    "situação",
    "situacao",
    "última parada",
    "ultima parada",
    "parou",
    "desde quando",
    "há quanto",
    "ha quanto",
    "produção",
    "producao",
    "quanto produziu",
    "quantas pe",
    "peças",
    "pecas",
    "oee",
    "disponibilidade",
    "refugo",
    "retrabalho",
    "meta",
    "ordem",
    "operador",
    "turno",
    "apont",
    "ultima peca",
    "última peça",
    "turno anterior",
    "compar",
)


def sem_acento(texto: str) -> str:
    base = unicodedata.normalize("NFD", texto or "")
    return "".join(c for c in base if unicodedata.category(c) != "Mn").lower()


def classificar(pergunta: str) -> str | None:
    """Qual fato o operador pediu. None quando a frase é só procedimento."""
    q = sem_acento(pergunta)
    if any(x in q for x in ("ultimas ordens", "ultimas ordem", "quais foram as ordens", "historico de ordem", "ordens de producao", "ordens anteriores")):
        return "ordens"
    if "ordem" in q and not any(x in q for x in ("falha", "quebra", "parada")):
        return "ordem"
    if any(x in q for x in ("falha", "quebra", "quebrou", "quando parou", "ultima parada", "ultimo motivo")):
        return "falha"
    if any(x in q for x in ("oee", "disponibilidade", "performance", "qualidade", "meta")):
        return "oee"
    if any(x in q for x in ("produc", "peca", "refugo", "retrabalho", "aprovad", "quanto produziu", "quantas")):
        return "producao"
    if any(x in q for x in ("turno anterior", "compar")):
        return "anterior"
    if "operador" in q or "quem esta" in q:
        return "operador"
    if any(x in q for x in ("falta de material", "sem peca", "status", "estado", "como esta", "situacao", "desde quando", "ha quanto")):
        return "status"
    if any(sem_acento(p) in q for p in _POSTO):
        return "resumo"
    return None


def tipo_pergunta(pergunta: str) -> str:
    q = sem_acento(pergunta)
    tema = classificar(pergunta)
    como = any(sem_acento(p) in q for p in _COMO)
    if tema and como:
        return "ambos"
    if tema:
        return "posto"
    return "manual"
