"""Regras de alerta do posto, sem banco."""

from __future__ import annotations

from oee.domain.catalog import ESTADOS

PARADA_LONGA_SEG = 15 * 60
PARADA_CRITICA_SEG = 30 * 60
SEM_PECA_SEG = 20 * 60
MIN_PECAS_REFUGO = 20


def avaliar_posto(
    nome: str,
    maquina_id: str,
    estado: str,
    segundos: float,
    produzido: float,
    refugo: float,
    meta_refugo: float,
    parada_longa_seg: float = PARADA_LONGA_SEG,
    parada_critica_seg: float = PARADA_CRITICA_SEG,
    sem_peca_seg: float = SEM_PECA_SEG,
    meta_setup_min: float = 20,
) -> list[dict]:
    classe = (ESTADOS.get(estado) or {}).get("classe")
    rotulo = (ESTADOS.get(estado) or {}).get("rotulo") or estado
    itens: list[dict] = []
    if estado == "SETUP" and segundos >= float(meta_setup_min) * 60:
        itens.append(
            {
                "tipo": "setup_longo",
                "maquina_id": maquina_id,
                "maquina": nome,
                "criticidade": "atencao",
                "titulo": f"{nome} em setup há {int(segundos // 60)} min (meta {int(meta_setup_min)} min)",
                "acao": "Veja o que trava a troca e se o próximo lote já está no posto.",
            }
        )
    elif classe == "NAO_PLANEJADA" and segundos >= parada_longa_seg:
        itens.append(
            {
                "tipo": "parada_longa",
                "maquina_id": maquina_id,
                "maquina": nome,
                "criticidade": "critico" if segundos >= parada_critica_seg else "atencao",
                "titulo": f"{nome} em {rotulo.lower()} há {int(segundos // 60)} min",
                "acao": "Confirme se o atendimento foi acionado e se o motivo ainda vale.",
            }
        )
    if estado == "PRODUZINDO" and segundos >= sem_peca_seg and produzido <= 0:
        itens.append(
            {
                "tipo": "sem_peca",
                "maquina_id": maquina_id,
                "maquina": nome,
                "criticidade": "critico",
                "titulo": f"{nome} produzindo há {int(segundos // 60)} min sem peça neste turno",
                "acao": "Verifique se a máquina está realmente rodando ou se o apontamento parou.",
            }
        )
    if produzido >= MIN_PECAS_REFUGO and meta_refugo > 0 and (refugo / produzido) > meta_refugo:
        pct = round(100 * refugo / produzido)
        itens.append(
            {
                "tipo": "refugo",
                "maquina_id": maquina_id,
                "maquina": nome,
                "criticidade": "atencao",
                "titulo": f"{nome} com refugo em {pct}% neste turno",
                "acao": "Separe o lote e confira a causa antes de seguir a meta.",
            }
        )
    return itens
