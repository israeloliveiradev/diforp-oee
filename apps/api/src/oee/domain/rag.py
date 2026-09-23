"""Chunking de manuais — regras puras, sem Gemini nem pgvector."""

from __future__ import annotations

import os
import re
from typing import Any

TAMANHO_MAX_PDF = 35 * 1024 * 1024


def nome_arquivo_seguro(nome: str) -> str:
    base = os.path.basename(nome or "manual.pdf")
    limpo = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._") or "manual"
    if not limpo.lower().endswith(".pdf"):
        limpo += ".pdf"
    return limpo[:160]


def validar_pdf(conteudo: bytes, nome: str) -> None:
    if not conteudo:
        raise ValueError("Arquivo vazio.")
    if len(conteudo) > TAMANHO_MAX_PDF:
        raise ValueError("PDF acima de 35 MB.")
    if not nome.lower().endswith(".pdf"):
        raise ValueError("Envie um arquivo PDF.")
    if not conteudo.lstrip().startswith(b"%PDF"):
        raise ValueError("O arquivo não é um PDF válido.")


def chunk_text(texto: str, pagina: int, tamanho: int = 1000, overlap: int = 150) -> list[dict[str, Any]]:
    texto = re.sub(r"\s+", " ", texto or "").strip()
    if not texto:
        return []
    chunks: list[dict[str, Any]] = []
    i = 0
    while i < len(texto):
        pedaco = texto[i : i + tamanho]
        secao = None
        mhead = re.match(r"^(.{3,80}?)(?:\.|:)", pedaco)
        if mhead:
            secao = mhead.group(1)[:80]
        chunks.append({"texto": pedaco, "pagina": pagina, "secao": secao})
        i += max(1, tamanho - overlap)
    return chunks
