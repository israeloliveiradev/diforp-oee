"""Repositório que serializa o estado operacional para o domínio (dicts)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from oee.infrastructure.db import models as m


def _row(obj, campos: list[str]) -> dict[str, Any]:
    return {c: getattr(obj, c) for c in campos}


def snapshot(db: Session) -> dict[str, Any]:
    cfg = db.get(m.ConfigApp, "default")
    config = {
        "meta_oee": cfg.meta_oee if cfg else 0.75,
        "meta_setup_min": cfg.meta_setup_min if cfg else 20,
        "meta_refugo_pct": cfg.meta_refugo_pct if cfg else 0.02,
        "simulacao_ativa": cfg.simulacao_ativa if cfg else False,
        "intervalo_simulacao_seg": cfg.intervalo_simulacao_seg if cfg else 5,
        "limite_microparada_seg": cfg.limite_microparada_seg if cfg else 300,
        "auditar_simulacao": cfg.auditar_simulacao if cfg else True,
        "acmp_ativo": cfg.acmp_ativo if cfg else True,
        "classificacao_estados": cfg.classificacao_estados if cfg else None,
    }
    empresa = db.scalars(select(m.Empresa)).first()
    return {
        "empresa": {"id": empresa.id, "nome": empresa.nome} if empresa else {"id": "EMP-1", "nome": "OEE"},
        "plantas": [_row(x, ["id", "empresa_id", "nome", "cidade"]) for x in db.scalars(select(m.Planta))],
        "areas": [_row(x, ["id", "planta_id", "nome"]) for x in db.scalars(select(m.Area))],
        "linhas": [_row(x, ["id", "area_id", "nome"]) for x in db.scalars(select(m.Linha))],
        "maquinas": [
            {
                "id": x.id,
                "nome": x.nome,
                "linha_id": x.linha_id,
                "perfil": x.perfil,
                "ciclo_ideal_seg": x.ciclo_ideal_seg,
                "estado_atual": x.estado_atual,
                "estado_desde": x.estado_desde,
                "produto_atual_id": x.produto_atual_id,
                "ordem_atual_id": x.ordem_atual_id,
                "operador_atual_id": x.operador_atual_id,
                "meta_turno": x.meta_turno,
                "ativa": x.ativa,
                "produtos_habilitados": x.produtos_habilitados or [],
            }
            for x in db.scalars(select(m.Maquina))
        ],
        "produtos": [_row(x, ["id", "sku", "nome", "ciclo_ideal_seg"]) for x in db.scalars(select(m.Produto))],
        "turnos": [_row(x, ["id", "nome", "inicio", "fim"]) for x in db.scalars(select(m.Turno))],
        "operadores": [_row(x, ["id", "matricula", "nome", "turno_id"]) for x in db.scalars(select(m.Operador))],
        "motivos": [_row(x, ["id", "categoria", "nome", "planejada", "estado_sugerido"]) for x in db.scalars(select(m.Motivo))],
        "ordens": [
            _row(
                x,
                ["id", "codigo", "maquina_id", "produto_id", "turno_id", "operador_id", "ciclo_ideal_seg", "meta_qtd", "inicio", "fim", "status"],
            )
            for x in db.scalars(select(m.Ordem))
        ],
        "eventos_estado": [
            _row(x, ["id", "maquina_id", "ordem_id", "turno_id", "estado", "motivo_id", "inicio", "fim"])
            for x in db.scalars(select(m.EventoEstado))
        ],
        "eventos_producao": [
            _row(
                x,
                ["id", "maquina_id", "ordem_id", "turno_id", "produto_id", "operador_id", "ts", "qtd_total", "qtd_refugo", "qtd_retrabalho", "causa_refugo", "origem"],
            )
            for x in db.scalars(select(m.EventoProducao))
        ],
        "eventos_parada": [
            _row(
                x,
                ["id", "maquina_id", "ordem_id", "turno_id", "estado", "motivo_id", "categoria", "planejada", "inicio", "fim", "duracao_seg", "comentario"],
            )
            for x in db.scalars(select(m.EventoParada))
        ],
        "observacoes": [_row(x, ["id", "maquina_id", "ordem_id", "ts", "texto", "autor_id"]) for x in db.scalars(select(m.Observacao))],
        "auditoria": [
            {
                "id": x.id,
                "ts": x.ts,
                "origem": x.origem,
                "categoria": x.categoria,
                "acao": x.acao,
                "sensivel": x.sensivel,
                "usuario": x.usuario,
                "descricao": x.descricao,
                "maquina_id": x.maquina_id,
                "ordem_id": x.ordem_id,
                "turno_id": x.turno_id,
                "operador_id": x.operador_id,
                "entidade": x.entidade,
                "entidade_id": x.entidade_id,
                "antes": x.antes,
                "depois": x.depois,
                "detalhes": x.detalhes,
                "hash_anterior": x.hash_anterior,
                "hash": x.hash,
            }
            for x in db.scalars(select(m.Auditoria).order_by(m.Auditoria.ts, m.Auditoria.id))
        ],
        "config": config,
    }


def limpar_operacional(db: Session) -> None:
    for model in [
        m.ChatMensagem,
        m.ChatSessao,
        m.ChunkManual,
        m.Manual,
        m.AcmpDesfecho,
        m.Auditoria,
        m.Observacao,
        m.EventoProducao,
        m.EventoParada,
        m.EventoEstado,
        m.Ordem,
        m.Maquina,
        m.Produto,
        m.Operador,
        m.Motivo,
        m.Turno,
        m.Linha,
        m.Area,
        m.Planta,
        m.Empresa,
        m.ConfigApp,
    ]:
        db.query(model).delete()


def persistir_dataset(db: Session, ds: dict[str, Any]) -> None:
    emp = ds["empresa"]
    db.add(m.Empresa(id=emp["id"], nome=emp["nome"]))
    db.flush()
    for p in ds["plantas"]:
        db.add(m.Planta(id=p["id"], empresa_id=p.get("empresa_id") or emp["id"], nome=p["nome"], cidade=p.get("cidade")))
    db.flush()
    for a in ds["areas"]:
        db.add(m.Area(id=a["id"], planta_id=a["planta_id"], nome=a["nome"]))
    db.flush()
    for l in ds["linhas"]:
        db.add(m.Linha(id=l["id"], area_id=l["area_id"], nome=l["nome"]))
    for p in ds["produtos"]:
        db.add(m.Produto(id=p["id"], sku=p["sku"], nome=p["nome"], ciclo_ideal_seg=p["ciclo_ideal_seg"]))
    for t in ds["turnos"]:
        db.add(m.Turno(id=t["id"], nome=t["nome"], inicio=t["inicio"], fim=t["fim"]))
    db.flush()
    for o in ds["operadores"]:
        db.add(m.Operador(id=o["id"], matricula=o["matricula"], nome=o["nome"], turno_id=o["turno_id"]))
    for mo in ds["motivos"]:
        db.add(
            m.Motivo(
                id=mo["id"],
                categoria=mo["categoria"],
                nome=mo["nome"],
                planejada=mo["planejada"],
                estado_sugerido=mo["estado_sugerido"],
            )
        )
    db.flush()
    for mq in ds["maquinas"]:
        db.add(
            m.Maquina(
                id=mq["id"],
                nome=mq["nome"],
                linha_id=mq["linha_id"],
                perfil=mq.get("perfil", "BOM"),
                ciclo_ideal_seg=mq.get("ciclo_ideal_seg") or 0,
                estado_atual=mq.get("estado_atual") or "SEM_ORDEM",
                estado_desde=mq.get("estado_desde"),
                produto_atual_id=mq.get("produto_atual_id"),
                ordem_atual_id=mq.get("ordem_atual_id"),
                operador_atual_id=mq.get("operador_atual_id"),
                meta_turno=mq.get("meta_turno") or 0,
                ativa=mq.get("ativa", True),
                produtos_habilitados=mq.get("produtos_habilitados") or [],
            )
        )
    db.flush()
    for o in ds["ordens"]:
        db.add(m.Ordem(**{k: o.get(k) for k in ["id", "codigo", "maquina_id", "produto_id", "turno_id", "operador_id", "ciclo_ideal_seg", "meta_qtd", "inicio", "fim", "status"]}))
    db.flush()
    for e in ds["eventos_estado"]:
        db.add(m.EventoEstado(**{k: e.get(k) for k in ["id", "maquina_id", "ordem_id", "turno_id", "estado", "motivo_id", "inicio", "fim"]}))
    for e in ds["eventos_producao"]:
        db.add(
            m.EventoProducao(
                **{
                    k: e.get(k)
                    for k in [
                        "id",
                        "maquina_id",
                        "ordem_id",
                        "turno_id",
                        "produto_id",
                        "operador_id",
                        "ts",
                        "qtd_total",
                        "qtd_refugo",
                        "qtd_retrabalho",
                        "causa_refugo",
                        "origem",
                    ]
                }
            )
        )
    for e in ds["eventos_parada"]:
        db.add(
            m.EventoParada(
                **{
                    k: e.get(k)
                    for k in [
                        "id",
                        "maquina_id",
                        "ordem_id",
                        "turno_id",
                        "estado",
                        "motivo_id",
                        "categoria",
                        "planejada",
                        "inicio",
                        "fim",
                        "duracao_seg",
                        "comentario",
                    ]
                }
            )
        )
    for o in ds.get("observacoes") or []:
        db.add(m.Observacao(**{k: o.get(k) for k in ["id", "maquina_id", "ordem_id", "ts", "texto", "autor_id"]}))
    for a in ds.get("auditoria") or []:
        db.add(
            m.Auditoria(
                **{
                    k: a.get(k)
                    for k in [
                        "id",
                        "ts",
                        "origem",
                        "categoria",
                        "acao",
                        "sensivel",
                        "usuario",
                        "descricao",
                        "maquina_id",
                        "ordem_id",
                        "turno_id",
                        "operador_id",
                        "entidade",
                        "entidade_id",
                        "antes",
                        "depois",
                        "detalhes",
                        "hash_anterior",
                        "hash",
                    ]
                }
            )
        )
    cfg = ds.get("config") or {}
    db.add(
        m.ConfigApp(
            id="default",
            meta_oee=cfg.get("meta_oee", 0.75),
            meta_setup_min=cfg.get("meta_setup_min", 20),
            meta_refugo_pct=cfg.get("meta_refugo_pct", 0.02),
            simulacao_ativa=cfg.get("simulacao_ativa", False),
            intervalo_simulacao_seg=cfg.get("intervalo_simulacao_seg", 5),
            limite_microparada_seg=cfg.get("limite_microparada_seg", 300),
            auditar_simulacao=cfg.get("auditar_simulacao", True),
            acmp_ativo=cfg.get("acmp_ativo", True),
        )
    )
    db.flush()
