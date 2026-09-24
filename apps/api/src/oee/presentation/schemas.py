from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    login: str
    senha: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    papel: str
    nome: str
    sub: str


class SinalIn(BaseModel):
    maquina_id: str
    produzindo: bool


class ParadaIn(BaseModel):
    maquina_id: str
    motivo_id: str
    comentario: str = ""
    acao: str | None = None


class EstadoIn(BaseModel):
    maquina_id: str
    estado: str
    motivo_id: str | None = None
    comentario: str = ""
    acao: str | None = None


class ProducaoIn(BaseModel):
    maquina_id: str
    qtd_total: float = 0
    qtd_refugo: float = 0
    qtd_retrabalho: float = 0
    causa_refugo: str | None = None


class ReclassificarIn(BaseModel):
    parada_id: str
    motivo_id: str
    comentario: str = ""


class OrdemIn(BaseModel):
    maquina_id: str
    produto_id: str
    meta_qtd: float = 0
    operador_id: str | None = None
    ciclo_ideal_seg: float | None = None
    codigo: str | None = None


class ObservacaoIn(BaseModel):
    maquina_id: str
    texto: str


class Filtros(BaseModel):
    periodo: str = "24h"
    data_inicio: int | None = None
    data_fim: int | None = None
    planta_id: str | None = None
    area_id: str | None = None
    linha_id: str | None = None
    maquina_id: str | None = None


class ConfigIn(BaseModel):
    meta_oee: float | None = None
    meta_setup_min: float | None = None
    meta_refugo_pct: float | None = None
    simulacao_ativa: bool | None = None
    intervalo_simulacao_seg: int | None = None
    limite_microparada_seg: int | None = None
    auditar_simulacao: bool | None = None
    acmp_ativo: bool | None = None


class ChatIn(BaseModel):
    pergunta: str
    maquina_id: str | None = None


class CadastroIn(BaseModel):
    entidade: str
    dados: dict[str, Any]


class AcmpDesfechoIn(BaseModel):
    maquina_id: str
    motivo_escolhido: str
    motivo_sugerido: str | None = None
    posicao_aceita: int | None = None
    aceita: bool = False
