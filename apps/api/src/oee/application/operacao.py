"""Casos de uso de operação de chão de fábrica."""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy.orm import Session

from oee.domain.audit import montar_registro
from oee.domain.calculations import calcular_oee
from oee.domain.catalog import ESTADOS
from oee.domain.ids import novo_id
from oee.domain.timeutil import turno_do_instante
from oee.infrastructure.db import models as m
from oee.infrastructure.db.repositories import snapshot


def _agora() -> int:
    return int(time.time() * 1000)


def _auditar(db: Session, ev: dict[str, Any]) -> None:
    ultimo = db.query(m.Auditoria).order_by(m.Auditoria.ts.desc(), m.Auditoria.id.desc()).first()
    ev.setdefault("ts", _agora())
    reg = montar_registro(ev, ultimo.hash if ultimo else None)
    db.add(m.Auditoria(**reg))


def _fechar_abertos(db: Session, maquina_id: str, ts: int) -> None:
    abertos = db.query(m.EventoEstado).filter(m.EventoEstado.maquina_id == maquina_id, m.EventoEstado.fim.is_(None)).all()
    for ev in abertos:
        ev.fim = ts
    paradas = db.query(m.EventoParada).filter(m.EventoParada.maquina_id == maquina_id, m.EventoParada.fim.is_(None)).all()
    for p in paradas:
        p.fim = ts
        p.duracao_seg = max(0, round((ts - p.inicio) / 1000))


def mudar_estado(
    db: Session,
    maquina_id: str,
    novo_estado: str,
    usuario: str,
    origem: str = "OPERADOR",
    motivo_id: str | None = None,
    comentario: str = "",
    acao: str | None = None,
) -> dict[str, Any]:
    maq = db.get(m.Maquina, maquina_id)
    if not maq:
        raise ValueError("Máquina não encontrada")
    ts = _agora()
    ds = snapshot(db)
    turno = turno_do_instante(ds["turnos"], ts)
    anterior = maq.estado_atual
    _fechar_abertos(db, maquina_id, ts)
    db.add(
        m.EventoEstado(
            id=novo_id("EST"),
            maquina_id=maquina_id,
            ordem_id=maq.ordem_atual_id,
            turno_id=turno.get("turno_id"),
            estado=novo_estado,
            motivo_id=motivo_id,
            inicio=ts,
            fim=None,
        )
    )
    classe = ESTADOS.get(novo_estado, {}).get("classe")
    if classe and classe != "PRODUTIVO":
        motivo = db.get(m.Motivo, motivo_id) if motivo_id else None
        db.add(
            m.EventoParada(
                id=novo_id("PAR"),
                maquina_id=maquina_id,
                ordem_id=maq.ordem_atual_id,
                turno_id=turno.get("turno_id"),
                estado=novo_estado,
                motivo_id=motivo_id,
                categoria=motivo.categoria if motivo else "Outros",
                planejada=classe == "PLANEJADA",
                inicio=ts,
                fim=None,
                duracao_seg=0,
                comentario=comentario or "",
            )
        )
        acao_aud = acao or "PARADA_INICIADA"
    else:
        acao_aud = acao or ("PARADA_FINALIZADA" if ESTADOS.get(anterior, {}).get("classe") != "PRODUTIVO" else "ESTADO_ALTERADO")
    maq.estado_atual = novo_estado
    maq.estado_desde = ts
    _auditar(
        db,
        {
            "acao": acao_aud,
            "origem": origem,
            "usuario": usuario,
            "maquina_id": maquina_id,
            "ordem_id": maq.ordem_atual_id,
            "turno_id": turno.get("turno_id"),
            "operador_id": maq.operador_atual_id,
            "descricao": f"{maq.nome}: {anterior} → {novo_estado}",
            "entidade": "maquinas",
            "entidade_id": maquina_id,
            "antes": {"estado": anterior},
            "depois": {"estado": novo_estado, "motivo_id": motivo_id},
        },
    )
    db.commit()
    db.refresh(maq)
    return {"maquina_id": maquina_id, "estado": novo_estado, "desde": ts}


def apontar_producao(
    db: Session,
    maquina_id: str,
    qtd_total: float,
    qtd_refugo: float,
    qtd_retrabalho: float,
    causa_refugo: str | None,
    usuario: str,
    origem: str = "OPERADOR",
) -> dict[str, Any]:
    maq = db.get(m.Maquina, maquina_id)
    if not maq:
        raise ValueError("Máquina não encontrada")
    if not maq.ordem_atual_id:
        raise ValueError("Abra uma ordem de produção antes de apontar.")
    if qtd_total < 0 or qtd_refugo < 0 or qtd_retrabalho < 0:
        raise ValueError("Quantidades não podem ser negativas")
    if qtd_total == 0 and qtd_refugo == 0 and qtd_retrabalho == 0:
        raise ValueError("Informe uma quantidade maior que zero.")
    if qtd_refugo > qtd_total and qtd_total > 0:
        raise ValueError("Refugo não pode exceder a quantidade total")
    ts = _agora()
    ds = snapshot(db)
    turno = turno_do_instante(ds["turnos"], ts)
    ev = m.EventoProducao(
        id=novo_id("PRD"),
        maquina_id=maquina_id,
        ordem_id=maq.ordem_atual_id,
        turno_id=turno.get("turno_id"),
        produto_id=maq.produto_atual_id,
        operador_id=maq.operador_atual_id,
        ts=ts,
        qtd_total=qtd_total,
        qtd_refugo=qtd_refugo,
        qtd_retrabalho=qtd_retrabalho,
        causa_refugo=causa_refugo,
        origem=origem,
    )
    db.add(ev)
    acao = "REFUGO_APONTADO" if qtd_refugo and qtd_refugo >= qtd_total else ("RETRABALHO_APONTADO" if qtd_retrabalho and not qtd_total else "PRODUCAO_APONTADA")
    _auditar(
        db,
        {
            "acao": acao,
            "origem": origem,
            "usuario": usuario,
            "maquina_id": maquina_id,
            "ordem_id": maq.ordem_atual_id,
            "turno_id": turno.get("turno_id"),
            "descricao": f"{maq.nome}: apontamento {qtd_total} total / {qtd_refugo} refugo / {qtd_retrabalho} retrabalho",
            "entidade": "eventos_producao",
            "entidade_id": ev.id,
            "depois": {"qtd_total": qtd_total, "qtd_refugo": qtd_refugo, "qtd_retrabalho": qtd_retrabalho},
        },
    )
    db.commit()
    return {"id": ev.id}


def reclassificar_parada(db: Session, parada_id: str, motivo_id: str, comentario: str, usuario: str, origem: str = "OPERADOR") -> dict:
    parada = db.get(m.EventoParada, parada_id)
    if not parada:
        raise ValueError("Parada não encontrada")
    motivo = db.get(m.Motivo, motivo_id)
    if not motivo:
        raise ValueError("Motivo não encontrado")
    antes = {"motivo_id": parada.motivo_id, "categoria": parada.categoria, "comentario": parada.comentario}
    parada.motivo_id = motivo_id
    parada.categoria = motivo.categoria
    if comentario:
        parada.comentario = comentario
    ev = (
        db.query(m.EventoEstado)
        .filter(m.EventoEstado.maquina_id == parada.maquina_id, m.EventoEstado.fim.is_(None))
        .first()
    )
    if ev:
        ev.motivo_id = motivo_id
        ev.estado = motivo.estado_sugerido
        maq = db.get(m.Maquina, parada.maquina_id)
        if maq:
            maq.estado_atual = motivo.estado_sugerido
    _auditar(
        db,
        {
            "acao": "MOTIVO_RECLASSIFICADO",
            "origem": origem,
            "usuario": usuario,
            "maquina_id": parada.maquina_id,
            "ordem_id": parada.ordem_id,
            "descricao": f"Motivo reclassificado para {motivo.nome}",
            "entidade": "eventos_parada",
            "entidade_id": parada.id,
            "antes": antes,
            "depois": {"motivo_id": motivo_id, "categoria": motivo.categoria, "comentario": parada.comentario},
        },
    )
    db.commit()
    return {"id": parada.id, "motivo_id": motivo_id}


def abrir_ordem(
    db: Session,
    maquina_id: str,
    produto_id: str,
    meta_qtd: float,
    usuario: str,
    origem: str = "OPERADOR",
    operador_id: str | None = None,
    ciclo_ideal_seg: float | None = None,
    codigo: str | None = None,
) -> dict:
    maq = db.get(m.Maquina, maquina_id)
    prod = db.get(m.Produto, produto_id)
    if not maq or not prod:
        raise ValueError("Máquina ou produto não encontrado")
    if maq.ordem_atual_id:
        raise ValueError("Já existe uma ordem em andamento nesta máquina.")
    ts = _agora()
    ds = snapshot(db)
    turno = turno_do_instante(ds["turnos"], ts)
    ordem = m.Ordem(
        id=novo_id("ORD"),
        codigo=codigo or f"OP-{int(ts) % 1000000}",
        maquina_id=maquina_id,
        produto_id=produto_id,
        turno_id=turno.get("turno_id"),
        operador_id=operador_id or maq.operador_atual_id,
        ciclo_ideal_seg=ciclo_ideal_seg or prod.ciclo_ideal_seg,
        meta_qtd=meta_qtd,
        inicio=ts,
        fim=None,
        status="EM_ANDAMENTO",
    )
    db.add(ordem)
    maq.ordem_atual_id = ordem.id
    maq.produto_atual_id = produto_id
    maq.ciclo_ideal_seg = ordem.ciclo_ideal_seg
    maq.meta_turno = meta_qtd
    if operador_id:
        maq.operador_atual_id = operador_id
    _auditar(
        db,
        {
            "acao": "ORDEM_ABERTA",
            "origem": origem,
            "usuario": usuario,
            "maquina_id": maquina_id,
            "ordem_id": ordem.id,
            "descricao": f"Ordem {ordem.codigo} aberta em {maq.nome}",
            "entidade": "ordens",
            "entidade_id": ordem.id,
            "depois": {"codigo": ordem.codigo, "produto_id": produto_id, "meta_qtd": meta_qtd},
        },
    )
    db.commit()
    mudar_estado(db, maquina_id, "SETUP", usuario, origem, "MOT-10", "", "SETUP_INICIADO")
    return {"id": ordem.id, "codigo": ordem.codigo}


def finalizar_ordem(db: Session, maquina_id: str, usuario: str, origem: str = "OPERADOR") -> dict:
    maq = db.get(m.Maquina, maquina_id)
    if not maq or not maq.ordem_atual_id:
        raise ValueError("Não há ordem em andamento")
    ordem = db.get(m.Ordem, maq.ordem_atual_id)
    ds = snapshot(db)
    ts = _agora()
    apurado = calcular_oee(
        {
            "eventos_estado": [e for e in ds["eventos_estado"] if e.get("ordem_id") == ordem.id],
            "eventos_producao": [e for e in ds["eventos_producao"] if e.get("ordem_id") == ordem.id],
            "inicio": ordem.inicio,
            "fim": ts,
            "ciclo_ideal_seg": ordem.ciclo_ideal_seg,
            "config": ds["config"],
        }
    )
    ordem.status = "FINALIZADA"
    ordem.fim = ts
    _auditar(
        db,
        {
            "acao": "ORDEM_FINALIZADA",
            "origem": origem,
            "usuario": usuario,
            "maquina_id": maquina_id,
            "ordem_id": ordem.id,
            "descricao": f"Ordem {ordem.codigo} finalizada em {maq.nome}",
            "entidade": "ordens",
            "entidade_id": ordem.id,
            "antes": {"status": "EM_ANDAMENTO"},
            "depois": {"status": "FINALIZADA"},
            "detalhes": {
                "produzido": apurado["producao_total"],
                "aprovado": apurado["producao_aprovada"],
                "refugo": apurado["refugo"],
                "meta_qtd": ordem.meta_qtd,
                "oee_no_encerramento": apurado["oee"],
            },
        },
    )
    maq.ordem_atual_id = None
    mudar_estado(db, maquina_id, "SEM_ORDEM", usuario, origem)
    return {"id": ordem.id, "indicadores": apurado}


def registrar_observacao(db: Session, maquina_id: str, texto: str, usuario: str) -> dict:
    maq = db.get(m.Maquina, maquina_id)
    if not maq:
        raise ValueError("Máquina não encontrada")
    obs = m.Observacao(
        id=novo_id("OBS"),
        maquina_id=maquina_id,
        ordem_id=maq.ordem_atual_id,
        ts=_agora(),
        texto=texto,
        autor_id=maq.operador_atual_id,
    )
    db.add(obs)
    _auditar(
        db,
        {
            "acao": "OBSERVACAO_REGISTRADA",
            "usuario": usuario,
            "maquina_id": maquina_id,
            "descricao": f"{maq.nome}: observação registrada",
            "entidade": "observacoes",
            "entidade_id": obs.id,
            "depois": {"texto": texto},
        },
    )
    db.commit()
    return {"id": obs.id}
