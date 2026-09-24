"""Ingestão de manuais, embeddings Gemini e recuperação pgvector."""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.orm import Session

from oee.application.posto import contexto_posto, tipo_pergunta
from oee.config import settings
from oee.domain.ids import novo_id
from oee.domain.rag import chunk_text, nome_arquivo_seguro, validar_pdf
from oee.infrastructure.db import models as m

log = logging.getLogger("oee.rag")
DIM_EMBED = 768
DISTANCIA_MAX = 0.72
LOTE_EMBED = 16


def _cliente_gemini():
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY não configurada")
    from google import genai

    return genai.Client(api_key=settings.gemini_api_key)


def _config_embed(tarefa: Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]):
    from google.genai import types

    return types.EmbedContentConfig(output_dimensionality=DIM_EMBED, task_type=tarefa)


def _valores_embedding(item: Any) -> list[float]:
    if item is None:
        raise RuntimeError("Resposta de embedding vazia")
    valores = getattr(item, "values", None)
    if valores is None and isinstance(item, dict):
        valores = item.get("values")
    if not valores:
        raise RuntimeError("Embedding sem valores")
    vec = [float(x) for x in valores]
    if len(vec) != DIM_EMBED:
        raise RuntimeError(f"Embedding com {len(vec)} dimensões; o banco espera {DIM_EMBED}")
    return vec


def _embed_lote(textos: list[str], tarefa: Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]) -> list[list[float]]:
    if not textos:
        return []
    client = _cliente_gemini()
    cfg = _config_embed(tarefa)
    out: list[list[float]] = []
    for i in range(0, len(textos), LOTE_EMBED):
        fatia = textos[i : i + LOTE_EMBED]
        ultimo: Exception | None = None
        for tentativa in range(4):
            try:
                resp = client.models.embed_content(model=settings.gemini_embed_model, contents=fatia, config=cfg)
                embs = getattr(resp, "embeddings", None) or []
                if len(embs) != len(fatia):
                    raise RuntimeError(f"Gemini devolveu {len(embs)} embeddings para {len(fatia)} trechos")
                out.extend(_valores_embedding(e) for e in embs)
                ultimo = None
                break
            except Exception as e:
                ultimo = e
                msg = str(e)
                if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "UNAVAILABLE" in msg:
                    time.sleep(1.5 * (tentativa + 1))
                    continue
                raise
        if ultimo:
            raise ultimo
    return out


def extrair_pdf(caminho: str) -> list[tuple[int, str]]:
    from pypdf import PdfReader

    reader = PdfReader(caminho)
    paginas = []
    for i, page in enumerate(reader.pages, start=1):
        paginas.append((i, page.extract_text() or ""))
    return paginas


def salvar_upload(conteudo: bytes, nome: str) -> str:
    validar_pdf(conteudo, nome)
    os.makedirs(settings.uploads_dir, exist_ok=True)
    path = os.path.join(settings.uploads_dir, f"{int(time.time())}-{nome_arquivo_seguro(nome)}")
    with open(path, "wb") as f:
        f.write(conteudo)
    return path


def _apagar_arquivo(caminho: str | None) -> None:
    if not caminho:
        return
    try:
        if os.path.isfile(caminho):
            os.remove(caminho)
    except OSError:
        log.warning("não foi possível apagar %s", caminho)


def _apagar_chunks(db: Session, manual_id: str) -> None:
    db.query(m.ChunkManual).filter(m.ChunkManual.manual_id == manual_id).delete(synchronize_session=False)


def processar_manual(db: Session, manual_id: str) -> None:
    manual = db.get(m.Manual, manual_id)
    if not manual:
        return
    try:
        if not manual.arquivo or not os.path.isfile(manual.arquivo):
            raise FileNotFoundError("Arquivo do manual não encontrado no disco.")
        paginas = extrair_pdf(manual.arquivo)
        pedacos: list[dict[str, Any]] = []
        for num, txt in paginas:
            pedacos.extend(chunk_text(txt, num))
        if not pedacos:
            raise ValueError("PDF sem texto extraível. Se for digitalizado, use um PDF com texto selecionável.")
        embeddings = _embed_lote([p["texto"] for p in pedacos], "RETRIEVAL_DOCUMENT")
        _apagar_chunks(db, manual.id)
        for pedaco, vec in zip(pedacos, embeddings):
            db.add(
                m.ChunkManual(
                    id=novo_id("CHK"),
                    manual_id=manual.id,
                    maquina_id=manual.maquina_id,
                    pagina=pedaco["pagina"],
                    secao=pedaco["secao"],
                    texto=pedaco["texto"],
                    embedding=vec,
                )
            )
        manual.status = "pronto"
        manual.paginas = len(paginas)
        manual.chunks = len(pedacos)
        manual.erro = None
        db.commit()
        log.info("manual %s indexado: %s páginas, %s chunks", manual.id, manual.paginas, manual.chunks)
    except Exception as e:
        db.rollback()
        manual = db.get(m.Manual, manual_id)
        if manual:
            manual.status = "erro"
            manual.erro = str(e)[:800]
            db.commit()
        log.exception("falha ao processar manual %s", manual_id)


def recuperar(db: Session, pergunta: str, maquina_id: str | None, k: int = 8) -> list[dict[str, Any]]:
    vec = _embed_lote([pergunta], "RETRIEVAL_QUERY")[0]
    emb = "[" + ",".join(str(float(x)) for x in vec) + "]"
    sql = text(
        """
        SELECT c.id, c.manual_id, c.maquina_id, c.pagina, c.secao, c.texto,
               m.titulo AS titulo,
               c.embedding <=> CAST(:emb AS vector) AS dist
        FROM chunks_manual c
        LEFT JOIN manuais m ON m.id = c.manual_id
        WHERE c.embedding IS NOT NULL
          AND (CAST(:maq AS varchar) IS NULL OR c.maquina_id = CAST(:maq AS varchar) OR c.maquina_id IS NULL)
        ORDER BY c.embedding <=> CAST(:emb AS vector)
        LIMIT CAST(:k AS integer)
        """
    )
    rows = db.execute(sql, {"emb": emb, "maq": maquina_id, "k": int(k)}).mappings().all()
    return [
        {
            "id": r["id"],
            "manual_id": r["manual_id"],
            "titulo": r["titulo"] or r["manual_id"],
            "maquina_id": r["maquina_id"],
            "pagina": r["pagina"],
            "secao": r["secao"],
            "texto": r["texto"] or "",
            "trecho": (r["texto"] or "")[:180],
            "score": float(r["dist"]) if r["dist"] is not None else None,
        }
        for r in rows
    ]


SYSTEM = (
    "Você ajuda o operador no chão de fábrica a resolver um problema agora. "
    "Responda em português simples, como se falasse no rádio. "
    "Formato obrigatório, sem introdução e sem markdown:\n"
    "Linha 1: o problema em até 10 palavras.\n"
    "Depois: no máximo 5 passos numerados (1. 2. 3.), cada um uma ação concreta.\n"
    "Última linha: CHAME MANUTENÇÃO SE: ... ou NÃO PRECISA DE MANUTENÇÃO.\n"
    "Regras: só use os trechos do manual; se faltar o passo, escreva "
    "'Isso não está no manual. Chame o supervisor.'; nunca invente peça, alarme ou torque; "
    "não copie parágrafos; não diga 'com base no manual'."
)

SYSTEM_POSTO = (
    "Você responde o operador com os dados reais do posto, em português simples. "
    "Sem markdown. No máximo 6 linhas. "
    "Use somente o bloco DADOS. Não invente hora, peça, motivo, estado ou nome. "
    "Comece pelo que foi perguntado: status, última parada, produção, OEE, meta ou comparação com o turno anterior. "
    "Se o número não estiver nos DADOS, diga: Não tenho esse número agora."
)


def _gerar(prompt: str) -> str:
    client = _cliente_gemini()
    resp = client.models.generate_content(model=settings.gemini_chat_model, contents=prompt)
    return getattr(resp, "text", None) or "Não foi possível gerar a resposta."


def _guardar(db: Session, pergunta: str, resposta: str, relevantes: list[dict], maquina_id: str | None, usuario_id: str) -> dict[str, Any]:
    citacoes = [{k: v for k, v in h.items() if k != "texto"} for h in relevantes]
    agora = int(time.time() * 1000)
    sessao = m.ChatSessao(id=novo_id("CHS"), usuario_id=usuario_id, maquina_id=maquina_id, criado_em=agora)
    db.add(sessao)
    db.flush()
    db.add(m.ChatMensagem(id=novo_id("CHM"), sessao_id=sessao.id, papel="user", texto=pergunta, ts=agora))
    db.add(
        m.ChatMensagem(
            id=novo_id("CHM"),
            sessao_id=sessao.id,
            papel="assistant",
            texto=resposta,
            citacoes=citacoes,
            ts=agora,
        )
    )
    db.commit()
    return {"resposta": resposta, "citacoes": citacoes, "sessao_id": sessao.id}


def consultar(db: Session, pergunta: str, maquina_id: str | None, usuario_id: str) -> dict[str, Any]:
    texto = (pergunta or "").strip()
    if not texto:
        return {"resposta": "Escreva a pergunta.", "citacoes": [], "sessao_id": None}
    tipo = tipo_pergunta(texto)
    fatos = contexto_posto(db, maquina_id, texto) if tipo in ("posto", "ambos") else ""
    if tipo == "posto":
        if not fatos:
            return {"resposta": "Escolha a máquina ou diga o nome dela.", "citacoes": [], "sessao_id": None}
        if not settings.gemini_api_key:
            return {"resposta": fatos, "citacoes": [], "sessao_id": None}
        try:
            resposta = _gerar(f"{SYSTEM_POSTO}\n\nDADOS:\n{fatos}\n\nPERGUNTA:\n{texto}")
        except Exception:
            log.exception("falha ao responder com dados do posto")
            resposta = fatos
        return _guardar(db, texto, resposta, [], maquina_id, usuario_id)

    if not settings.gemini_api_key:
        return {
            "resposta": "O chat de manuais está indisponível: GEMINI_API_KEY não foi configurada neste ambiente.",
            "citacoes": [],
            "sessao_id": None,
        }
    if not db.query(m.Manual).filter(m.Manual.status == "pronto").first():
        if fatos:
            return {"resposta": fatos, "citacoes": [], "sessao_id": None}
        return {
            "resposta": "Ainda não há manuais indexados. Envie um PDF na tela Manuais e aguarde o status Pronto.",
            "citacoes": [],
            "sessao_id": None,
        }
    hits = recuperar(db, texto, maquina_id)
    relevantes = [h for h in hits if h.get("score") is None or h["score"] <= DISTANCIA_MAX]
    if not relevantes:
        if fatos:
            try:
                resposta = _gerar(f"{SYSTEM_POSTO}\n\nDADOS:\n{fatos}\n\nPERGUNTA:\n{texto}")
            except Exception:
                log.exception("falha ao responder com dados do posto")
                resposta = fatos
            return _guardar(db, texto, resposta, [], maquina_id, usuario_id)
        return {
            "resposta": "Não encontrei trechos nos manuais indexados para esta pergunta. Não é seguro inventar o procedimento.",
            "citacoes": [],
            "sessao_id": None,
        }

    contexto = "\n\n".join(f"[{h['titulo']} p.{h['pagina']}] {h.get('texto') or h['trecho']}" for h in relevantes)
    bloco_posto = f"\n\nDADOS DO POSTO AGORA:\n{fatos}" if fatos else ""
    try:
        resposta = _gerar(f"{SYSTEM}\n\nMANUAIS:\n{contexto}{bloco_posto}\n\nPERGUNTA DO OPERADOR:\n{texto}")
    except Exception:
        log.exception("falha ao gerar resposta do chat")
        return {
            "resposta": "Os manuais foram encontrados, mas o modelo de linguagem não respondeu agora. Tente de novo em instantes.",
            "citacoes": [{k: v for k, v in h.items() if k != "texto"} for h in relevantes],
            "sessao_id": None,
        }
    return _guardar(db, texto, resposta, relevantes, maquina_id, usuario_id)


def excluir_manual(db: Session, manual_id: str) -> None:
    manual = db.get(m.Manual, manual_id)
    if not manual:
        raise ValueError("Manual não encontrado")
    _apagar_chunks(db, manual_id)
    caminho = manual.arquivo
    db.delete(manual)
    db.flush()
    _apagar_arquivo(caminho)
