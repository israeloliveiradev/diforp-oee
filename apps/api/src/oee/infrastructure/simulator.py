"""Simulador de chão de fábrica — um tick por máquina (perfis da PoC)."""

from __future__ import annotations

import random
import time

from sqlalchemy.orm import Session

from oee.application.operacao import apontar_producao, mudar_estado, registrar_sinal
from oee.domain.catalog import PERFIS
from oee.infrastructure.db import models as m
from oee.infrastructure.db.repositories import snapshot


def tick(db: Session) -> dict:
    cfg = db.get(m.ConfigApp, "default")
    if not cfg or not cfg.simulacao_ativa:
        return {"ok": False, "motivo": "simulacao_inativa"}
    ds = snapshot(db)
    origem = "SIMULACAO"
    usuario = "simulador"
    agora = int(time.time() * 1000)
    for maq in ds["maquinas"]:
        if not maq.get("ativa"):
            continue
        perfil = PERFIS.get(maq.get("perfil") or "BOM") or PERFIS["BOM"]
        estado = maq.get("estado_atual")
        decorrido = (agora - (maq.get("estado_desde") or agora)) / 1000
        if estado == "SEM_ORDEM" or not maq.get("ordem_atual_id"):
            produtos = maq.get("produtos_habilitados") or [p["id"] for p in ds["produtos"]]
            if produtos:
                from oee.application.operacao import abrir_ordem

                prod = random.choice(produtos)
                abrir_ordem(db, maq["id"], prod, 200, usuario, origem)
                mudar_estado(db, maq["id"], "PRODUZINDO", usuario, origem)
            continue
        if estado == "PRODUZINDO":
            ciclo = maq.get("ciclo_ideal_seg") or 30
            qtd = max(1, int((cfg.intervalo_simulacao_seg or 5) / max(ciclo * random.uniform(*perfil["fator_ritmo"]), 1)))
            refugo = 1 if random.random() < random.uniform(*perfil["refugo_pct"]) else 0
            apontar_producao(db, maq["id"], qtd, refugo, 0, None, usuario, origem)
            if decorrido > random.uniform(*perfil["duracao_producao_min"]) * 60:
                registrar_sinal(db, maq["id"], False, "sinal", "SINAL")
        else:
            if decorrido > random.uniform(*perfil["duracao_parada_min"]) * 60:
                registrar_sinal(db, maq["id"], True, "sinal", "SINAL")
    return {"ok": True, "ts": agora}
