"""Aplicação FastAPI — camada de apresentação."""

from __future__ import annotations

import csv
import io
import json
import logging
import time
from typing import Any

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from oee.application import indicadores as ind
from oee.application.alertas import listar_alertas
from oee.application import operacao as op
from oee.application.turno import virar_turnos
from oee.application.operacao import _auditar
from oee.config import settings
from oee.domain import acmp as acmp_dom
from oee.domain import insights as insights_dom
from oee.domain.audit import diferencas, verificar_integridade
from oee.domain.catalog import AUDIT_ACOES, AUDIT_CATEGORIAS, AUDIT_ORIGENS, CAUSAS_REFUGO, ESTADOS, ORDEM_ESTADOS, PERFIS
from oee.domain.demo import gerar_demo
from oee.domain.ids import novo_id
from oee.infrastructure.auth import criar_token, ler_token, verificar_senha
from oee.infrastructure.db import models as m
from oee.infrastructure.db.repositories import limpar_operacional, persistir_dataset, snapshot
from oee.infrastructure.ml.pipeline import inferir, treinar_lightgbm
from oee.infrastructure.rag import service as rag
from oee.infrastructure.simulator import tick as sim_tick
from oee.presentation.deps import db_dep, exigir_gestao, usuario_atual
from oee.presentation.schemas import (
    AcmpDesfechoIn,
    ChatIn,
    ConfigIn,
    FechamentoIn,
    OperadorPostoIn,
    SinalIn,
    EstadoIn,
    LoginIn,
    ObservacaoIn,
    OrdemIn,
    ParadaIn,
    ProducaoIn,
    ReclassificarIn,
)

logging.basicConfig(level=settings.log_level, format='{"ts":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
log = logging.getLogger("oee")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        from oee.seed import seed

        seed()
        log.info("schema e seed conferidos")
    except Exception:
        log.exception("falha no seed inicial — a API sobe mesmo assim")
    yield


app = FastAPI(
    title="OEE API",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValueError)
async def value_error_handler(_request: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/health")
def health():
    return {"status": "ok", "env": settings.app_env}


# ----- Auth -----
@app.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(db_dep)):
    user = db.scalars(select(m.Usuario).where(m.Usuario.login == body.login)).first()
    if not user or not verificar_senha(body.senha, user.senha_hash):
        raise HTTPException(401, "Credenciais inválidas")
    token = criar_token(user.id, user.papel, user.nome)
    return {
        "access_token": token,
        "token_type": "bearer",
        "papel": user.papel,
        "nome": user.nome,
        "sub": user.id,
        "planta_id": user.planta_id,
    }


@app.get("/auth/me")
def me(user: dict = Depends(usuario_atual)):
    return user


# ----- Catálogo estático -----
@app.get("/catalogo")
def catalogo():
    return {
        "estados": ESTADOS,
        "ordem_estados": ORDEM_ESTADOS,
        "perfis": {k: {"rotulo": v["rotulo"]} for k, v in PERFIS.items()},
        "causas_refugo": CAUSAS_REFUGO,
        "audit_acoes": AUDIT_ACOES,
        "audit_categorias": AUDIT_CATEGORIAS,
        "audit_origens": AUDIT_ORIGENS,
    }


# ----- Cadastros -----
@app.get("/cadastros/{entidade}")
def listar_cadastro(entidade: str, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    ds = snapshot(db)
    mapa = {
        "plantas": "plantas",
        "areas": "areas",
        "linhas": "linhas",
        "maquinas": "maquinas",
        "produtos": "produtos",
        "turnos": "turnos",
        "operadores": "operadores",
        "motivos": "motivos",
        "ordens": "ordens",
    }
    if entidade not in mapa:
        raise HTTPException(404, "Entidade desconhecida")
    return ds[mapa[entidade]]


@app.get("/dataset")
def get_dataset(
    maquina_id: str | None = None,
    desde: int | None = None,
    db: Session = Depends(db_dep),
    user: dict = Depends(usuario_atual),
):
    virar_turnos(db)
    return snapshot(db, maquina_id=maquina_id, desde_ms=desde, sem_auditoria=bool(maquina_id or desde))


MAPA_MODELO = {
    "plantas": m.Planta,
    "areas": m.Area,
    "linhas": m.Linha,
    "maquinas": m.Maquina,
    "produtos": m.Produto,
    "turnos": m.Turno,
    "operadores": m.Operador,
    "motivos": m.Motivo,
    "ordens": m.Ordem,
}


@app.post("/cadastros/{entidade}")
def criar_cadastro(entidade: str, body: dict, db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    model = MAPA_MODELO.get(entidade)
    if not model:
        raise HTTPException(404, "Entidade desconhecida")
    prefixo = {"plantas": "PL", "areas": "AR", "linhas": "LN", "maquinas": "MQ", "produtos": "PR", "turnos": "T", "operadores": "OP", "motivos": "MOT", "ordens": "ORD"}[entidade]
    dados = dict(body)
    dados.setdefault("id", novo_id(prefixo))
    obj = model(**{k: v for k, v in dados.items() if hasattr(model, k)})
    db.add(obj)
    _auditar(
        db,
        {
            "acao": "REGISTRO_CRIADO",
            "usuario": user.get("nome"),
            "origem": "GESTAO",
            "entidade": entidade,
            "entidade_id": dados["id"],
            "descricao": f"{entidade} criado",
            "depois": dados,
        },
    )
    db.commit()
    return {"id": dados["id"]}


@app.put("/cadastros/{entidade}/{item_id}")
def alterar_cadastro(entidade: str, item_id: str, body: dict, db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    model = MAPA_MODELO.get(entidade)
    if not model:
        raise HTTPException(404)
    obj = db.get(model, item_id)
    if not obj:
        raise HTTPException(404, "Registro não encontrado")
    antes = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    for k, v in body.items():
        if hasattr(obj, k) and k != "id":
            setattr(obj, k, v)
    _auditar(
        db,
        {
            "acao": "REGISTRO_ALTERADO",
            "usuario": user.get("nome"),
            "origem": "GESTAO",
            "entidade": entidade,
            "entidade_id": item_id,
            "antes": antes,
            "depois": body,
        },
    )
    db.commit()
    return {"id": item_id}


@app.delete("/cadastros/{entidade}/{item_id}")
def excluir_cadastro(entidade: str, item_id: str, db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    model = MAPA_MODELO.get(entidade)
    obj = db.get(model, item_id) if model else None
    if not obj:
        raise HTTPException(404)
    if entidade == "maquinas" and db.query(m.EventoEstado).filter(m.EventoEstado.maquina_id == item_id).first():
        _auditar(db, {"acao": "EXCLUSAO_BLOQUEADA", "usuario": user.get("nome"), "entidade": entidade, "entidade_id": item_id, "descricao": "Exclusão bloqueada: há eventos"})
        db.commit()
        raise HTTPException(409, "Há eventos vinculados")
    db.delete(obj)
    _auditar(db, {"acao": "REGISTRO_EXCLUIDO", "usuario": user.get("nome"), "entidade": entidade, "entidade_id": item_id})
    db.commit()
    return {"ok": True}


# ----- Operação -----
@app.post("/operacao/estado")
def api_estado(body: EstadoIn, request: Request, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    origem = "OPERADOR" if user.get("papel") == "operador" else "GESTAO"
    chave = request.headers.get("idempotency-key")
    return op.mudar_estado(db, body.maquina_id, body.estado, user.get("nome"), origem, body.motivo_id, body.comentario, body.acao, chave=chave)


@app.post("/operacao/paradas")
def api_parada(body: ParadaIn, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    motivo = db.get(m.Motivo, body.motivo_id)
    if not motivo:
        raise HTTPException(400, "Motivo inválido")
    origem = "OPERADOR" if user.get("papel") == "operador" else "GESTAO"
    return op.mudar_estado(db, body.maquina_id, motivo.estado_sugerido, user.get("nome"), origem, body.motivo_id, body.comentario, body.acao or "PARADA_INICIADA")


@app.post("/operacao/sinal")
def api_sinal(body: SinalIn, request: Request, db: Session = Depends(db_dep)):
    maq = db.get(m.Maquina, body.maquina_id)
    if not maq:
        raise HTTPException(404, "Máquina não encontrada")
    token_maq = request.headers.get("x-maquina-token")
    if maq.sinal_token:
        if not token_maq or token_maq != maq.sinal_token:
            raise HTTPException(401, "Token da máquina inválido")
        usuario = "clp"
    else:
        auth = request.headers.get("authorization") or ""
        if not auth.lower().startswith("bearer "):
            raise HTTPException(401, "Não autenticado")
        try:
            usuario = ler_token(auth.split(" ", 1)[1]).get("nome") or "sinal"
        except ValueError:
            raise HTTPException(401, "Token inválido")
    try:
        return op.registrar_sinal(db, body.maquina_id, body.produzindo, usuario, "SINAL")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/operacao/producao")
def api_producao(body: ProducaoIn, request: Request, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    origem = "OPERADOR" if user.get("papel") == "operador" else "GESTAO"
    try:
        return op.apontar_producao(
            db,
            body.maquina_id,
            body.qtd_total,
            body.qtd_refugo,
            body.qtd_retrabalho,
            body.causa_refugo,
            user.get("nome"),
            origem,
            chave=request.headers.get("idempotency-key"),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/operacao/reclassificar")
def api_reclass(body: ReclassificarIn, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    origem = "OPERADOR" if user.get("papel") == "operador" else "GESTAO"
    return op.reclassificar_parada(db, body.parada_id, body.motivo_id, body.comentario, user.get("nome"), origem)


@app.post("/operacao/ordens")
def api_abrir_ordem(body: OrdemIn, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    origem = "OPERADOR" if user.get("papel") == "operador" else "GESTAO"
    return op.abrir_ordem(
        db,
        body.maquina_id,
        body.produto_id,
        body.meta_qtd,
        user.get("nome"),
        origem,
        body.operador_id,
        body.ciclo_ideal_seg,
        body.codigo,
    )


@app.post("/operacao/ordens/{maquina_id}/finalizar")
def api_fim_ordem(maquina_id: str, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    origem = "OPERADOR" if user.get("papel") == "operador" else "GESTAO"
    return op.finalizar_ordem(db, maquina_id, user.get("nome"), origem)


@app.post("/operacao/observacoes")
def api_obs(body: ObservacaoIn, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    return op.registrar_observacao(db, body.maquina_id, body.texto, user.get("nome"))


@app.post("/operacao/operador")
def api_operador(body: OperadorPostoIn, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    try:
        return op.assumir_posto(db, body.maquina_id, body.matricula, user.get("nome") or "")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/turnos/fechar")
def api_fechar_turno(body: FechamentoIn, db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    try:
        return op.fechar_turno(db, body.planta_id, user.get("nome") or "", body.nota)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/turnos/reabrir/{fechamento_id}")
def api_reabrir_turno(fechamento_id: str, db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    try:
        return op.reabrir_turno(db, fechamento_id, user.get("nome") or "")
    except ValueError as e:
        raise HTTPException(400, str(e))


# ----- Indicadores -----
def _filtros(
    periodo: str = "24h",
    data_inicio: int | None = None,
    data_fim: int | None = None,
    planta_id: str | None = None,
    area_id: str | None = None,
    linha_id: str | None = None,
    maquina_id: str | None = None,
    produto_id: str | None = None,
    ordem_id: str | None = None,
    turno_id: str | None = None,
    operador_id: str | None = None,
) -> dict:
    return {
        "periodo": periodo,
        "data_inicio": data_inicio,
        "data_fim": data_fim,
        "planta_id": planta_id,
        "area_id": area_id,
        "linha_id": linha_id,
        "maquina_id": maquina_id,
        "produto_id": produto_id,
        "ordem_id": ordem_id,
        "turno_id": turno_id,
        "operador_id": operador_id,
    }


@app.get("/alertas")
def api_alertas(db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    return listar_alertas(db)


@app.get("/indicadores")
def api_indicadores(
    periodo: str = "24h",
    data_inicio: int | None = None,
    data_fim: int | None = None,
    planta_id: str | None = None,
    area_id: str | None = None,
    linha_id: str | None = None,
    maquina_id: str | None = None,
    produto_id: str | None = None,
    ordem_id: str | None = None,
    turno_id: str | None = None,
    operador_id: str | None = None,
    db: Session = Depends(db_dep),
    user: dict = Depends(usuario_atual),
):
    virar_turnos(db)
    agora = int(time.time() * 1000)
    filtros = _filtros(
        periodo, data_inicio, data_fim, planta_id, area_id, linha_id, maquina_id, produto_id, ordem_id, turno_id, operador_id
    )
    ini, _fim = ind.janela(filtros, agora)
    ds = snapshot(db, maquina_id=maquina_id, desde_ms=ini, sem_auditoria=True)
    return ind.dashboard(ds, filtros, agora)


@app.get("/eventos/paradas")
def api_paradas(
    maquina_id: str | None = None,
    db: Session = Depends(db_dep),
    user: dict = Depends(usuario_atual),
):
    q = select(m.EventoParada).order_by(m.EventoParada.inicio.desc()).limit(500)
    if maquina_id:
        q = q.where(m.EventoParada.maquina_id == maquina_id)
    rows = db.scalars(q).all()
    return [
        {
            "id": r.id,
            "maquina_id": r.maquina_id,
            "ordem_id": r.ordem_id,
            "turno_id": r.turno_id,
            "estado": r.estado,
            "motivo_id": r.motivo_id,
            "categoria": r.categoria,
            "planejada": r.planejada,
            "inicio": r.inicio,
            "fim": r.fim,
            "duracao_seg": r.duracao_seg,
            "comentario": r.comentario,
        }
        for r in rows
    ]


@app.get("/eventos/producao")
def api_ev_prod(maquina_id: str | None = None, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    q = select(m.EventoProducao).order_by(m.EventoProducao.ts.desc()).limit(500)
    if maquina_id:
        q = q.where(m.EventoProducao.maquina_id == maquina_id)
    rows = db.scalars(q).all()
    return [
        {
            "id": r.id,
            "maquina_id": r.maquina_id,
            "ts": r.ts,
            "qtd_total": r.qtd_total,
            "qtd_refugo": r.qtd_refugo,
            "qtd_retrabalho": r.qtd_retrabalho,
            "causa_refugo": r.causa_refugo,
            "produto_id": r.produto_id,
            "turno_id": r.turno_id,
        }
        for r in rows
    ]


# ----- Insights -----
@app.get("/insights")
def api_insights(
    periodo: str = "24h",
    data_inicio: int | None = None,
    data_fim: int | None = None,
    planta_id: str | None = None,
    area_id: str | None = None,
    linha_id: str | None = None,
    maquina_id: str | None = None,
    produto_id: str | None = None,
    ordem_id: str | None = None,
    turno_id: str | None = None,
    operador_id: str | None = None,
    db: Session = Depends(db_dep),
    user: dict = Depends(usuario_atual),
):
    agora = int(time.time() * 1000)
    filtros = _filtros(
        periodo, data_inicio, data_fim, planta_id, area_id, linha_id, maquina_id, produto_id, ordem_id, turno_id, operador_id
    )
    ini, fim = ind.janela(filtros, agora)
    ds = snapshot(db, maquina_id=maquina_id, desde_ms=ini, sem_auditoria=True)
    maqs = ind.filtrar_maquinas(ds, filtros)
    evs = ind._eventos_maquinas(ds, [m["id"] for m in maqs], ind.enriquecer_filtros(ds, filtros))
    return insights_dom.gerar(
        {**ds, **evs, "maquinas": maqs},
        {"maquina_ids": [m["id"] for m in maqs], "inicio": ini, "fim": fim, "agora": agora},
    )


# ----- Auditoria -----
@app.get("/auditoria")
def api_auditoria(
    categoria: str | None = None,
    origem: str | None = None,
    acao: str | None = None,
    busca: str | None = None,
    maquina_id: str | None = None,
    data_inicio: int | None = None,
    data_fim: int | None = None,
    db: Session = Depends(db_dep),
    user: dict = Depends(exigir_gestao),
):
    ds = snapshot(db)
    regs = ds["auditoria"]
    if categoria:
        regs = [r for r in regs if r["categoria"] == categoria]
    if origem:
        regs = [r for r in regs if r["origem"] == origem]
    if acao:
        regs = [r for r in regs if r["acao"] == acao]
    if maquina_id:
        regs = [r for r in regs if r.get("maquina_id") == maquina_id]
    if data_inicio:
        regs = [r for r in regs if (r.get("ts") or 0) >= int(data_inicio)]
    if data_fim:
        regs = [r for r in regs if (r.get("ts") or 0) <= int(data_fim)]
    if busca:
        b = busca.lower()
        regs = [r for r in regs if b in json.dumps(r, ensure_ascii=False).lower()]
    integ = verificar_integridade(ds["auditoria"])
    return {"registros": list(reversed(regs))[:400], "integridade": integ, "total": len(regs)}


@app.get("/auditoria/{reg_id}")
def api_aud_detalhe(reg_id: str, db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    r = db.get(m.Auditoria, reg_id)
    if not r:
        raise HTTPException(404)
    d = {
        "id": r.id,
        "ts": r.ts,
        "origem": r.origem,
        "categoria": r.categoria,
        "acao": r.acao,
        "sensivel": r.sensivel,
        "usuario": r.usuario,
        "descricao": r.descricao,
        "maquina_id": r.maquina_id,
        "antes": r.antes,
        "depois": r.depois,
        "detalhes": r.detalhes,
        "hash": r.hash,
        "hash_anterior": r.hash_anterior,
        "diferencas": diferencas(r.antes, r.depois),
    }
    return d


# ----- Config / simulação -----
@app.get("/config")
def api_get_config(db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    cfg = db.get(m.ConfigApp, "default")
    if not cfg:
        return {}
    return {
        "meta_oee": cfg.meta_oee,
        "meta_setup_min": cfg.meta_setup_min,
        "meta_refugo_pct": cfg.meta_refugo_pct,
        "simulacao_ativa": cfg.simulacao_ativa,
        "intervalo_simulacao_seg": cfg.intervalo_simulacao_seg,
        "limite_microparada_seg": cfg.limite_microparada_seg,
        "parada_longa_min": cfg.parada_longa_min or 15,
        "sem_peca_min": cfg.sem_peca_min or 20,
        "retrabalho_na_qualidade": bool(cfg.retrabalho_na_qualidade),
        "alerta_webhook_url": cfg.alerta_webhook_url or "",
        "auditar_simulacao": cfg.auditar_simulacao,
        "acmp_ativo": cfg.acmp_ativo,
    }


@app.put("/config")
def api_put_config(body: ConfigIn, db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    cfg = db.get(m.ConfigApp, "default")
    if not cfg:
        cfg = m.ConfigApp(id="default")
        db.add(cfg)
    antes = {
        "meta_oee": cfg.meta_oee,
        "meta_setup_min": cfg.meta_setup_min,
        "meta_refugo_pct": cfg.meta_refugo_pct,
        "simulacao_ativa": cfg.simulacao_ativa,
        "acmp_ativo": cfg.acmp_ativo,
    }
    data = body.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(cfg, k, v)
    acao = "SIMULACAO_ALTERADA" if "simulacao_ativa" in data else ("ACMP_ALTERADO" if "acmp_ativo" in data else "METAS_ALTERADAS")
    _auditar(db, {"acao": acao, "usuario": user.get("nome"), "antes": antes, "depois": data})
    db.commit()
    return {"ok": True}


@app.post("/simulacao/tick")
def api_tick(db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    return sim_tick(db)


# ----- Dataset import/export/seed -----
@app.post("/dataset/demo")
def api_demo(dias: int = 7, db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    ds = gerar_demo({"dias": dias, "seed": settings.demo_seed})
    limpar_operacional(db)
    persistir_dataset(db, ds)
    _auditar(db, {"acao": "DEMO_RESTAURADA", "usuario": user.get("nome"), "descricao": f"Demonstração de {dias} dias restaurada"})
    db.commit()
    return {"ok": True, "maquinas": len(ds["maquinas"]), "paradas": len(ds["eventos_parada"])}


@app.post("/dataset/import")
async def api_import(arquivo: UploadFile = File(...), db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    bruto = json.loads((await arquivo.read()).decode("utf-8"))
    ds = _normalizar_legacy(bruto)
    limpar_operacional(db)
    persistir_dataset(db, ds)
    _auditar(db, {"acao": "DADOS_IMPORTADOS", "usuario": user.get("nome")})
    db.commit()
    return {"ok": True}


@app.get("/dataset/export")
def api_export(db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    ds = snapshot(db)
    _auditar(db, {"acao": "DADOS_EXPORTADOS", "usuario": user.get("nome")})
    db.commit()
    return JSONResponse(ds)


@app.get("/dataset/csv/{tipo}")
def api_csv(tipo: str, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    ds = snapshot(db)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    if tipo == "paradas":
        w.writerow(["id", "maquina", "estado", "motivo", "inicio", "fim", "duracao_seg"])
        maqs = {m["id"]: m["nome"] for m in ds["maquinas"]}
        mots = {m["id"]: m["nome"] for m in ds["motivos"]}
        for e in ds["eventos_parada"]:
            w.writerow([e["id"], maqs.get(e["maquina_id"]), e["estado"], mots.get(e["motivo_id"]), e["inicio"], e["fim"], e["duracao_seg"]])
    elif tipo == "producao":
        w.writerow(["id", "ts", "maquina", "qtd_total", "qtd_refugo"])
        maqs = {m["id"]: m["nome"] for m in ds["maquinas"]}
        for e in ds["eventos_producao"]:
            w.writerow([e["id"], e["ts"], maqs.get(e["maquina_id"]), e["qtd_total"], e["qtd_refugo"]])
    elif tipo == "estados":
        w.writerow(["id", "maquina", "estado", "inicio", "fim"])
        maqs = {m["id"]: m["nome"] for m in ds["maquinas"]}
        for e in ds["eventos_estado"]:
            w.writerow([e["id"], maqs.get(e["maquina_id"]), e["estado"], e["inicio"], e["fim"]])
    elif tipo == "ordens":
        w.writerow(["id", "codigo", "maquina", "produto", "meta_qtd", "status", "inicio", "fim"])
        maqs = {m["id"]: m["nome"] for m in ds["maquinas"]}
        prods = {p["id"]: p["nome"] for p in ds["produtos"]}
        for o in ds["ordens"]:
            w.writerow([o["id"], o.get("codigo"), maqs.get(o.get("maquina_id")), prods.get(o.get("produto_id")), o.get("meta_qtd"), o.get("status"), o.get("inicio"), o.get("fim")])
    elif tipo == "auditoria":
        w.writerow(["id", "ts", "acao", "usuario", "descricao", "maquina"])
        maqs = {m["id"]: m["nome"] for m in ds["maquinas"]}
        for r in ds["auditoria"]:
            w.writerow([r["id"], r.get("ts"), r.get("acao"), r.get("usuario"), r.get("descricao"), maqs.get(r.get("maquina_id"))])
    elif tipo == "oee-maquina":
        w.writerow(["maquina", "oee", "disponibilidade", "performance", "qualidade"])
        agora = int(time.time() * 1000)
        dash = ind.dashboard(ds, {"periodo": "24h"}, agora)
        for g in dash.get("por_maquina") or []:
            i = g.get("indicadores") or {}
            w.writerow([g.get("rotulo"), i.get("oee"), i.get("disponibilidade"), i.get("performance"), i.get("qualidade")])
    else:
        raise HTTPException(400, "tipo inválido")
    data = "\ufeff" + buf.getvalue()
    return StreamingResponse(iter([data]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=oee-{tipo}.csv"})


def _normalizar_legacy(ds: dict) -> dict:
    """Aceita JSON da PoC (camelCase) e devolve snake_case."""

    def conv_list(items, mapa):
        out = []
        for it in items or []:
            row = {}
            for k, v in it.items():
                row[mapa.get(k, k)] = v
            out.append(row)
        return out

    if "eventosEstado" in ds or "maquinas" in ds and ds.get("maquinas") and "linhaId" in ds["maquinas"][0]:
        return {
            "empresa": {"id": ds.get("empresa", {}).get("id", "EMP-1"), "nome": ds.get("empresa", {}).get("nome", "OEE")},
            "plantas": conv_list(ds.get("plantas"), {"empresaId": "empresa_id"}),
            "areas": conv_list(ds.get("areas"), {"plantaId": "planta_id"}),
            "linhas": conv_list(ds.get("linhas"), {"areaId": "area_id"}),
            "produtos": conv_list(ds.get("produtos"), {"cicloIdealSeg": "ciclo_ideal_seg"}),
            "maquinas": conv_list(
                ds.get("maquinas"),
                {
                    "linhaId": "linha_id",
                    "cicloIdealSeg": "ciclo_ideal_seg",
                    "estadoAtual": "estado_atual",
                    "estadoDesde": "estado_desde",
                    "produtoAtualId": "produto_atual_id",
                    "ordemAtualId": "ordem_atual_id",
                    "operadorAtualId": "operador_atual_id",
                    "metaTurno": "meta_turno",
                    "produtosHabilitados": "produtos_habilitados",
                },
            ),
            "turnos": ds.get("turnos") or [],
            "operadores": conv_list(ds.get("operadores"), {"turnoId": "turno_id"}),
            "motivos": conv_list(ds.get("motivos"), {"estadoSugerido": "estado_sugerido"}),
            "ordens": conv_list(
                ds.get("ordens"),
                {
                    "maquinaId": "maquina_id",
                    "produtoId": "produto_id",
                    "turnoId": "turno_id",
                    "operadorId": "operador_id",
                    "cicloIdealSeg": "ciclo_ideal_seg",
                    "metaQtd": "meta_qtd",
                },
            ),
            "eventos_estado": conv_list(
                ds.get("eventosEstado"),
                {"maquinaId": "maquina_id", "ordemId": "ordem_id", "turnoId": "turno_id", "motivoId": "motivo_id"},
            ),
            "eventos_producao": conv_list(
                ds.get("eventosProducao"),
                {
                    "maquinaId": "maquina_id",
                    "ordemId": "ordem_id",
                    "turnoId": "turno_id",
                    "produtoId": "produto_id",
                    "operadorId": "operador_id",
                    "qtdTotal": "qtd_total",
                    "qtdRefugo": "qtd_refugo",
                    "qtdRetrabalho": "qtd_retrabalho",
                    "causaRefugo": "causa_refugo",
                },
            ),
            "eventos_parada": conv_list(
                ds.get("eventosParada"),
                {"maquinaId": "maquina_id", "ordemId": "ordem_id", "turnoId": "turno_id", "motivoId": "motivo_id", "duracaoSeg": "duracao_seg"},
            ),
            "observacoes": conv_list(ds.get("observacoes"), {"maquinaId": "maquina_id", "ordemId": "ordem_id", "autorId": "autor_id"}),
            "auditoria": conv_list(
                ds.get("auditoria"),
                {
                    "maquinaId": "maquina_id",
                    "ordemId": "ordem_id",
                    "turnoId": "turno_id",
                    "operadorId": "operador_id",
                    "entidadeId": "entidade_id",
                    "hashAnterior": "hash_anterior",
                },
            ),
            "config": {
                "meta_oee": (ds.get("config") or {}).get("metaOEE", 0.75),
                "meta_setup_min": (ds.get("config") or {}).get("metaSetupMin", 20),
                "meta_refugo_pct": (ds.get("config") or {}).get("metaRefugoPct", 0.02),
                "simulacao_ativa": (ds.get("config") or {}).get("simulacaoAtiva", False),
                "intervalo_simulacao_seg": (ds.get("config") or {}).get("intervaloSimulacaoSeg", 5),
                "limite_microparada_seg": (ds.get("config") or {}).get("limiteMicroparadaSeg", 300),
                "auditar_simulacao": (ds.get("config") or {}).get("auditarSimulacao", True),
                "acmp_ativo": (ds.get("config") or {}).get("acmpAtivo", True),
            },
        }
    return ds


# ----- ACMP -----
@app.get("/acmp/sugestoes")
def api_acmp_sug(
    maquina_id: str,
    duracao_seg: int | None = None,
    db: Session = Depends(db_dep),
    user: dict = Depends(usuario_atual),
):
    cfg = db.get(m.ConfigApp, "default")
    if cfg and cfg.acmp_ativo is False:
        return []
    agora = int(time.time() * 1000)
    ds = snapshot(db, maquina_id=maquina_id, desde_ms=agora - 7 * 24 * 3600 * 1000, sem_auditoria=True)
    maq = next((m_ for m_ in ds["maquinas"] if m_["id"] == maquina_id), None)
    if not maq:
        raise HTTPException(404, "Máquina não encontrada")
    if duracao_seg is None:
        from oee.infrastructure.acmp_cache import ler

        guardado = ler(maquina_id)
        if guardado is not None:
            return guardado
    ctx = acmp_dom.contexto_atual(ds, maq, {"duracao_seg": duracao_seg})
    sugestoes = inferir(ds, ctx, com_duracao=duracao_seg is not None)
    if duracao_seg is None:
        from oee.infrastructure.acmp_cache import guardar

        guardar(maquina_id, sugestoes)
    return sugestoes


@app.get("/acmp/avaliacao")
def api_acmp_av(db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    ds = snapshot(db)
    amostras = acmp_dom.extrair_amostras(ds)
    inicio = acmp_dom.avaliar(amostras, {"atributos": acmp_dom.ATRIBUTOS_INICIO})
    curso = acmp_dom.avaliar(amostras, {"atributos": acmp_dom.ATRIBUTOS_EM_CURSO})
    desfechos = db.scalars(select(m.AcmpDesfecho)).all()
    aceitas = sum(1 for d in desfechos if d.aceita)
    return {
        "inicio": inicio,
        "curso": curso,
        "aceitacao": {"total": len(desfechos), "aceitas": aceitas, "taxa": (aceitas / len(desfechos) if desfechos else None)},
    }


@app.post("/acmp/desfecho")
def api_acmp_des(body: AcmpDesfechoIn, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    db.add(
        m.AcmpDesfecho(
            id=novo_id("ACM"),
            maquina_id=body.maquina_id,
            motivo_escolhido=body.motivo_escolhido,
            motivo_sugerido=body.motivo_sugerido,
            posicao_aceita=body.posicao_aceita,
            aceita=body.aceita,
            ts=int(time.time() * 1000),
        )
    )
    _auditar(
        db,
        {
            "acao": "SUGESTAO_ACEITA" if body.aceita else "SUGESTAO_IGNORADA",
            "usuario": user.get("nome"),
            "maquina_id": body.maquina_id,
            "depois": body.model_dump(),
        },
    )
    db.commit()
    return {"ok": True}


@app.post("/acmp/treinar")
def api_acmp_train(db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    ds = snapshot(db)
    res = treinar_lightgbm(ds)
    db.add(
        m.ModeloAcmp(
            id=novo_id("MDL"),
            versao=res.get("versao") or 0,
            tipo=res.get("tipo"),
            caminho=res.get("caminho"),
            metricas=res.get("metricas"),
            treinado_em=int(time.time() * 1000),
            ativo=True,
        )
    )
    db.commit()
    return {"tipo": res.get("tipo"), "metricas": res.get("metricas")}


# ----- RAG -----
@app.get("/manuais")
def api_manuais(db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    rows = db.scalars(select(m.Manual).order_by(m.Manual.criado_em.desc())).all()
    return [
        {
            "id": r.id,
            "titulo": r.titulo,
            "maquina_id": r.maquina_id,
            "status": r.status,
            "erro": r.erro,
            "paginas": r.paginas,
            "chunks": r.chunks,
            "criado_em": r.criado_em,
        }
        for r in rows
    ]


@app.post("/manuais")
async def api_upload_manual(
    maquina_id: str | None = Form(None),
    titulo: str = Form("Manual"),
    arquivo: UploadFile = File(...),
    db: Session = Depends(db_dep),
    user: dict = Depends(exigir_gestao),
):
    conteudo = await arquivo.read()
    try:
        path = rag.salvar_upload(conteudo, arquivo.filename or "manual.pdf")
    except ValueError as e:
        raise HTTPException(400, str(e))
    mid = novo_id("MAN")
    maquina_id = (maquina_id or "").strip() or None
    titulo = (titulo or "").strip() or (arquivo.filename or "Manual")
    db.add(
        m.Manual(
            id=mid,
            maquina_id=maquina_id,
            titulo=titulo,
            arquivo=path,
            status="processando",
            criado_em=int(time.time() * 1000),
        )
    )
    _auditar(db, {"acao": "MANUAL_ENVIADO", "usuario": user.get("nome"), "maquina_id": maquina_id, "entidade": "manuais", "entidade_id": mid, "descricao": titulo})
    db.commit()
    from oee.infrastructure.jobs import enfileirar_manual

    enfileirar_manual(mid)
    return {"id": mid, "status": "processando"}


@app.post("/manuais/{manual_id}/reprocessar")
def api_reprocessar_manual(manual_id: str, db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    man = db.get(m.Manual, manual_id)
    if not man:
        raise HTTPException(404, "Manual não encontrado")
    man.status = "processando"
    man.erro = None
    _auditar(db, {"acao": "MANUAL_REPROCESSADO", "usuario": user.get("nome"), "maquina_id": man.maquina_id, "entidade": "manuais", "entidade_id": man.id, "descricao": man.titulo})
    db.commit()
    from oee.infrastructure.jobs import enfileirar_manual

    enfileirar_manual(man.id)
    return {"id": man.id, "status": "processando"}


@app.delete("/manuais/{manual_id}")
def api_excluir_manual(manual_id: str, db: Session = Depends(db_dep), user: dict = Depends(exigir_gestao)):
    man = db.get(m.Manual, manual_id)
    if not man:
        raise HTTPException(404, "Manual não encontrado")
    titulo = man.titulo
    maquina_id = man.maquina_id
    rag.excluir_manual(db, manual_id)
    _auditar(db, {"acao": "MANUAL_EXCLUIDO", "usuario": user.get("nome"), "maquina_id": maquina_id, "entidade": "manuais", "entidade_id": manual_id, "descricao": titulo})
    db.commit()
    return {"ok": True}


@app.post("/chat/consultar")
def api_chat(body: ChatIn, db: Session = Depends(db_dep), user: dict = Depends(usuario_atual)):
    try:
        res = rag.consultar(db, body.pergunta, body.maquina_id, user.get("sub") or user.get("nome"))
    except Exception as e:
        log.exception("falha no chat RAG")
        raise HTTPException(503, "Não foi possível consultar os manuais agora.") from e
    _auditar(db, {"acao": "CHAT_CONSULTADO", "usuario": user.get("nome"), "maquina_id": body.maquina_id, "descricao": (body.pergunta or "")[:200]})
    db.commit()
    return res
