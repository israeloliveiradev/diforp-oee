"""Modelos SQLAlchemy (infrastructure)."""

from __future__ import annotations

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    BigInteger,
    Table,
)
from sqlalchemy.orm import DeclarativeBase, relationship
from pgvector.sqlalchemy import Vector


class Base(DeclarativeBase):
    pass


maquina_produto = Table(
    "maquina_produto",
    Base.metadata,
    Column("maquina_id", String(64), ForeignKey("maquinas.id"), primary_key=True),
    Column("produto_id", String(64), ForeignKey("produtos.id"), primary_key=True),
)


class Empresa(Base):
    __tablename__ = "empresas"
    id = Column(String(64), primary_key=True)
    nome = Column(String(255), nullable=False)


class Planta(Base):
    __tablename__ = "plantas"
    id = Column(String(64), primary_key=True)
    empresa_id = Column(String(64), ForeignKey("empresas.id"))
    nome = Column(String(255), nullable=False)
    cidade = Column(String(255))


class Area(Base):
    __tablename__ = "areas"
    id = Column(String(64), primary_key=True)
    planta_id = Column(String(64), ForeignKey("plantas.id"))
    nome = Column(String(255), nullable=False)


class Linha(Base):
    __tablename__ = "linhas"
    id = Column(String(64), primary_key=True)
    area_id = Column(String(64), ForeignKey("areas.id"))
    nome = Column(String(255), nullable=False)


class Produto(Base):
    __tablename__ = "produtos"
    id = Column(String(64), primary_key=True)
    sku = Column(String(64), nullable=False)
    nome = Column(String(255), nullable=False)
    ciclo_ideal_seg = Column(Float, nullable=False)


class Maquina(Base):
    __tablename__ = "maquinas"
    id = Column(String(64), primary_key=True)
    nome = Column(String(255), nullable=False)
    linha_id = Column(String(64), ForeignKey("linhas.id"))
    perfil = Column(String(64), default="BOM")
    ciclo_ideal_seg = Column(Float, default=0)
    estado_atual = Column(String(64), default="SEM_ORDEM")
    estado_desde = Column(BigInteger)
    produto_atual_id = Column(String(64), ForeignKey("produtos.id"), nullable=True)
    ordem_atual_id = Column(String(64), nullable=True)
    operador_atual_id = Column(String(64), nullable=True)
    meta_turno = Column(Float, default=0)
    ativa = Column(Boolean, default=True)
    sinal_sem_motivo = Column(Boolean, default=False, server_default="false")
    produtos_habilitados = Column(JSON, default=list)


class Turno(Base):
    __tablename__ = "turnos"
    id = Column(String(64), primary_key=True)
    nome = Column(String(64), nullable=False)
    inicio = Column(String(8), nullable=False)
    fim = Column(String(8), nullable=False)


class Operador(Base):
    __tablename__ = "operadores"
    id = Column(String(64), primary_key=True)
    matricula = Column(String(32), nullable=False)
    nome = Column(String(255), nullable=False)
    turno_id = Column(String(64), ForeignKey("turnos.id"))


class Motivo(Base):
    __tablename__ = "motivos"
    id = Column(String(64), primary_key=True)
    categoria = Column(String(64), nullable=False)
    nome = Column(String(255), nullable=False)
    planejada = Column(Boolean, default=False)
    estado_sugerido = Column(String(64), nullable=False)


class Ordem(Base):
    __tablename__ = "ordens"
    id = Column(String(64), primary_key=True)
    codigo = Column(String(64), nullable=False)
    maquina_id = Column(String(64), ForeignKey("maquinas.id"))
    produto_id = Column(String(64), ForeignKey("produtos.id"))
    turno_id = Column(String(64))
    operador_id = Column(String(64))
    ciclo_ideal_seg = Column(Float)
    meta_qtd = Column(Float)
    inicio = Column(BigInteger)
    fim = Column(BigInteger, nullable=True)
    status = Column(String(32), default="EM_ANDAMENTO")


class EventoEstado(Base):
    __tablename__ = "eventos_estado"
    id = Column(String(64), primary_key=True)
    maquina_id = Column(String(64), index=True)
    ordem_id = Column(String(64), index=True)
    turno_id = Column(String(64))
    estado = Column(String(64), nullable=False)
    motivo_id = Column(String(64), nullable=True)
    inicio = Column(BigInteger, index=True)
    fim = Column(BigInteger, nullable=True)


class EventoProducao(Base):
    __tablename__ = "eventos_producao"
    id = Column(String(64), primary_key=True)
    maquina_id = Column(String(64), index=True)
    ordem_id = Column(String(64), index=True)
    turno_id = Column(String(64))
    produto_id = Column(String(64))
    operador_id = Column(String(64))
    ts = Column(BigInteger, index=True)
    qtd_total = Column(Float, default=0)
    qtd_refugo = Column(Float, default=0)
    qtd_retrabalho = Column(Float, default=0)
    causa_refugo = Column(String(255), nullable=True)
    origem = Column(String(32), default="OPERADOR")


class EventoParada(Base):
    __tablename__ = "eventos_parada"
    id = Column(String(64), primary_key=True)
    maquina_id = Column(String(64), index=True)
    ordem_id = Column(String(64), index=True)
    turno_id = Column(String(64))
    estado = Column(String(64))
    motivo_id = Column(String(64), nullable=True)
    categoria = Column(String(64))
    planejada = Column(Boolean, default=False)
    inicio = Column(BigInteger, index=True)
    fim = Column(BigInteger, nullable=True)
    duracao_seg = Column(Integer, default=0)
    comentario = Column(Text, default="")


class Observacao(Base):
    __tablename__ = "observacoes"
    id = Column(String(64), primary_key=True)
    maquina_id = Column(String(64), index=True)
    ordem_id = Column(String(64), nullable=True)
    ts = Column(BigInteger)
    texto = Column(Text, nullable=False)
    autor_id = Column(String(64), nullable=True)


class Auditoria(Base):
    __tablename__ = "auditoria"
    id = Column(String(64), primary_key=True)
    ts = Column(BigInteger, index=True)
    origem = Column(String(32))
    categoria = Column(String(32), index=True)
    acao = Column(String(64), index=True)
    sensivel = Column(Boolean, default=False)
    usuario = Column(String(255))
    descricao = Column(Text)
    maquina_id = Column(String(64), nullable=True, index=True)
    ordem_id = Column(String(64), nullable=True)
    turno_id = Column(String(64), nullable=True)
    operador_id = Column(String(64), nullable=True)
    entidade = Column(String(64), nullable=True)
    entidade_id = Column(String(64), nullable=True)
    antes = Column(JSON, nullable=True)
    depois = Column(JSON, nullable=True)
    detalhes = Column(JSON, nullable=True)
    hash_anterior = Column(String(64), nullable=True)
    hash = Column(String(64), nullable=False)


class ConfigApp(Base):
    __tablename__ = "config_app"
    id = Column(String(32), primary_key=True, default="default")
    meta_oee = Column(Float, default=0.75)
    meta_setup_min = Column(Float, default=20)
    meta_refugo_pct = Column(Float, default=0.02)
    simulacao_ativa = Column(Boolean, default=False)
    intervalo_simulacao_seg = Column(Integer, default=5)
    limite_microparada_seg = Column(Integer, default=300)
    auditar_simulacao = Column(Boolean, default=True)
    acmp_ativo = Column(Boolean, default=True)
    classificacao_estados = Column(JSON, nullable=True)


class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(String(64), primary_key=True)
    login = Column(String(64), unique=True, nullable=False)
    nome = Column(String(255), nullable=False)
    senha_hash = Column(String(255), nullable=False)
    papel = Column(String(32), nullable=False)  # operador | gestao
    operador_id = Column(String(64), nullable=True)


class Manual(Base):
    __tablename__ = "manuais"
    id = Column(String(64), primary_key=True)
    maquina_id = Column(String(64), index=True, nullable=True)
    titulo = Column(String(255), nullable=False)
    arquivo = Column(String(512), nullable=False)
    status = Column(String(32), default="processando")  # processando|pronto|erro
    erro = Column(Text, nullable=True)
    paginas = Column(Integer, default=0)
    chunks = Column(Integer, default=0)
    criado_em = Column(BigInteger)


class ChunkManual(Base):
    __tablename__ = "chunks_manual"
    id = Column(String(64), primary_key=True)
    manual_id = Column(String(64), ForeignKey("manuais.id"), index=True)
    maquina_id = Column(String(64), index=True, nullable=True)
    pagina = Column(Integer)
    secao = Column(String(255), nullable=True)
    texto = Column(Text, nullable=False)
    embedding = Column(Vector(768), nullable=True)


class ChatSessao(Base):
    __tablename__ = "chat_sessoes"
    id = Column(String(64), primary_key=True)
    usuario_id = Column(String(64))
    maquina_id = Column(String(64), nullable=True)
    criado_em = Column(BigInteger)


class ChatMensagem(Base):
    __tablename__ = "chat_mensagens"
    id = Column(String(64), primary_key=True)
    sessao_id = Column(String(64), ForeignKey("chat_sessoes.id"), index=True)
    papel = Column(String(16))  # user|assistant
    texto = Column(Text, nullable=False)
    citacoes = Column(JSON, nullable=True)
    ts = Column(BigInteger)


class AcmpDesfecho(Base):
    __tablename__ = "acmp_desfechos"
    id = Column(String(64), primary_key=True)
    maquina_id = Column(String(64))
    motivo_escolhido = Column(String(64))
    motivo_sugerido = Column(String(64), nullable=True)
    posicao_aceita = Column(Integer, nullable=True)
    aceita = Column(Boolean, default=False)
    ts = Column(BigInteger)


class ModeloAcmp(Base):
    __tablename__ = "modelos_acmp"
    id = Column(String(64), primary_key=True)
    versao = Column(Integer)
    tipo = Column(String(32))  # lightgbm | naive_bayes
    caminho = Column(String(512), nullable=True)
    metricas = Column(JSON, nullable=True)
    treinado_em = Column(BigInteger)
    ativo = Column(Boolean, default=False)
