"""Fatos ao vivo do posto, para o chat responder status, parada e produção."""

from __future__ import annotations

import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from oee.application.turno import virar_turnos
from oee.domain.calculations import calcular_oee
from oee.domain.timeutil import turno_do_instante
from oee.infrastructure.db import models as m

TZ = ZoneInfo("America/Sao_Paulo")

ROTULOS_ESTADO = {
    "PRODUZINDO": "Produzindo",
    "SETUP": "Setup",
    "MANUTENCAO": "Manutenção",
    "PARADA_NAO_PLANEJADA": "Parada não planejada",
    "MICROPARADA": "Microparada",
    "AGUARDANDO_MATERIAL": "Aguardando material",
    "AGUARDANDO_OPERADOR": "Aguardando operador",
    "LIMPEZA": "Limpeza",
    "PARADA_PLANEJADA": "Parada planejada",
    "SEM_ORDEM": "Sem ordem de produção",
}

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


def _sem_acento(texto: str) -> str:
    base = unicodedata.normalize("NFD", texto or "")
    return "".join(c for c in base if unicodedata.category(c) != "Mn").lower()


def tipo_pergunta(pergunta: str) -> str:
    q = _sem_acento(pergunta)
    posto = any(_sem_acento(p) in q for p in _POSTO)
    como = any(_sem_acento(p) in q for p in _COMO)
    if posto and not como:
        return "posto"
    if posto and como:
        return "ambos"
    return "manual"


def _hora(ts: int | None) -> str:
    if not ts:
        return "sem hora"
    return datetime.fromtimestamp(ts / 1000, TZ).strftime("%d/%m %H:%M")


def _duracao(seg: int) -> str:
    seg = max(0, int(seg))
    h, rem = divmod(seg, 3600)
    m, _s = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}min"
    if m:
        return f"{m}min"
    return f"{seg}s"


def _resolver(db: Session, pergunta: str, maquina_id: str | None) -> m.Maquina | None:
    maquinas = list(db.scalars(select(m.Maquina)))
    q = _sem_acento(pergunta)
    citadas = [maq for maq in maquinas if _sem_acento(maq.nome) in q or maq.id.lower() in q]
    if len(citadas) == 1:
        return citadas[0]
    if maquina_id:
        return db.get(m.Maquina, maquina_id)
    return None


def _pct(valor: float | None) -> str:
    if valor is None:
        return "não calculado"
    return f"{round(float(valor) * 100)}%"


def _oee_janela(db: Session, maq: m.Maquina, ini: int, fim: int, ordem: m.Ordem | None) -> dict:
    estados = db.scalars(
        select(m.EventoEstado).where(
            m.EventoEstado.maquina_id == maq.id,
            or_(m.EventoEstado.fim.is_(None), m.EventoEstado.fim >= ini, m.EventoEstado.inicio >= ini),
        )
    )
    producao = db.scalars(
        select(m.EventoProducao).where(
            m.EventoProducao.maquina_id == maq.id,
            m.EventoProducao.ts >= ini,
            m.EventoProducao.ts <= fim,
        )
    )
    cfg = db.get(m.ConfigApp, "default")
    ciclo = (ordem.ciclo_ideal_seg if ordem and ordem.ciclo_ideal_seg else None) or maq.ciclo_ideal_seg or 0
    return calcular_oee(
        {
            "inicio": ini,
            "fim": fim,
            "ciclo_ideal_seg": ciclo,
            "config": {"limite_microparada_seg": cfg.limite_microparada_seg if cfg else 300},
            "eventos_estado": [{"estado": e.estado, "inicio": e.inicio, "fim": e.fim} for e in estados],
            "eventos_producao": [
                {"ts": e.ts, "qtd_total": e.qtd_total, "qtd_refugo": e.qtd_refugo, "qtd_retrabalho": e.qtd_retrabalho}
                for e in producao
            ],
        }
    )


def _linha_oee(rotulo: str, ind: dict, meta: int) -> str:
    produzido = int(ind.get("producao_total") or 0)
    if ind.get("oee") is None:
        oee = "não calculado: sem peça neste turno" if produzido == 0 else "não calculado"
    else:
        oee = _pct(ind.get("oee"))
    if meta <= 0:
        meta_txt = "meta não definida"
    elif produzido >= meta:
        meta_txt = f"meta {meta} batida"
    else:
        meta_txt = f"meta {meta} não batida ({produzido} de {meta})"
    return (
        f"{rotulo}: OEE {oee}, disponibilidade {_pct(ind.get('disponibilidade'))}, "
        f"performance {_pct(ind.get('performance'))}, qualidade {_pct(ind.get('qualidade'))}, "
        f"{produzido} peças, {meta_txt}."
    )


def contexto_posto(db: Session, maquina_id: str | None, pergunta: str) -> str:
    maq = _resolver(db, pergunta, maquina_id)
    if not maq:
        nomes = [x.nome for x in db.scalars(select(m.Maquina).order_by(m.Maquina.nome))]
        if not nomes:
            return ""
        return "Nenhuma máquina foi escolhida. Máquinas: " + ", ".join(nomes) + "."

    virar_turnos(db)
    db.refresh(maq)
    agora = int(datetime.now(TZ).timestamp() * 1000)
    estado = ROTULOS_ESTADO.get(maq.estado_atual or "", maq.estado_atual or "desconhecido")

    ordem = db.get(m.Ordem, maq.ordem_atual_id) if maq.ordem_atual_id else None
    produto = db.get(m.Produto, ordem.produto_id) if ordem else None
    operador = db.get(m.Operador, maq.operador_atual_id or (ordem.operador_id if ordem else None))
    turnos = [{"id": t.id, "nome": t.nome, "inicio": t.inicio, "fim": t.fim} for t in db.scalars(select(m.Turno))]
    turno = turno_do_instante(turnos, agora)

    ini_turno = int(turno.get("inicio") or agora)
    marco = max(int(maq.estado_desde or ini_turno), ini_turno)
    ha = _duracao((agora - marco) / 1000)
    linhas = [
        f"Máquina: {maq.nome} ({maq.id}).",
        f"Estado agora: {estado}, neste turno desde {_hora(marco)} (há {ha}).",
        f"Turno atual: {turno.get('nome')} ({_hora(turno.get('inicio'))} até {_hora(turno.get('fim'))}).",
    ]
    if operador:
        linhas.append(f"Operador no posto: {operador.nome}.")
    else:
        linhas.append("Operador no posto: não informado.")
    if ordem:
        linhas.append(
            f"Ordem aberta: {ordem.codigo}, produto {produto.nome if produto else ordem.produto_id}, "
            f"meta {int(ordem.meta_qtd or 0)} peças, status {ordem.status}."
        )
    else:
        linhas.append("Ordem aberta: nenhuma.")

    ini = int(turno.get("inicio") or agora)
    soma = db.execute(
        select(
            func.coalesce(func.sum(m.EventoProducao.qtd_total), 0),
            func.coalesce(func.sum(m.EventoProducao.qtd_refugo), 0),
            func.coalesce(func.sum(m.EventoProducao.qtd_retrabalho), 0),
        ).where(
            m.EventoProducao.maquina_id == maq.id,
            m.EventoProducao.ts >= ini,
            m.EventoProducao.ts <= agora,
        )
    ).one()
    produzido, refugo, retrabalho = soma
    aprovado = max(0, float(produzido) - float(refugo))
    meta = int((ordem.meta_qtd if ordem else maq.meta_turno) or 0)
    linhas.append(
        f"Produção neste turno: {int(produzido)} peças, {int(aprovado)} aprovadas, "
        f"{int(refugo)} refugo, {int(retrabalho)} retrabalho. Meta do turno: {meta}."
    )
    linhas.append(_linha_oee("Indicadores deste turno", _oee_janela(db, maq, ini, agora, ordem), meta))

    anterior = turno_do_instante(turnos, ini - 60_000)
    if anterior.get("inicio") and anterior.get("inicio") != ini:
        ind_ant = _oee_janela(db, maq, int(anterior["inicio"]), int(anterior["fim"]), ordem)
        linhas.append(
            _linha_oee(
                f"Turno anterior ({anterior.get('nome')}, {_hora(anterior.get('inicio'))} até {_hora(anterior.get('fim'))})",
                ind_ant,
                meta,
            )
        )

    ultima = db.scalars(
        select(m.EventoProducao)
        .where(m.EventoProducao.maquina_id == maq.id)
        .order_by(m.EventoProducao.ts.desc())
        .limit(1)
    ).first()
    if ultima:
        linhas.append(
            f"Última peça apontada: {int(ultima.qtd_total or 0)} peças em {_hora(ultima.ts)}, "
            f"refugo {int(ultima.qtd_refugo or 0)}, retrabalho {int(ultima.qtd_retrabalho or 0)}."
        )
    else:
        linhas.append("Última peça apontada: nenhum apontamento nesta máquina.")

    paradas = list(
        db.scalars(
            select(m.EventoParada)
            .where(m.EventoParada.maquina_id == maq.id)
            .order_by(m.EventoParada.inicio.desc())
            .limit(3)
        )
    )
    if not paradas:
        linhas.append("Paradas: nenhuma registrada nesta máquina.")
    else:
        linhas.append("Últimas paradas, da mais recente para a mais antiga:")
        for p in paradas:
            motivo = db.get(m.Motivo, p.motivo_id) if p.motivo_id else None
            nome_motivo = motivo.nome if motivo else "sem motivo"
            if p.fim:
                trecho = f"encerrou {_hora(p.fim)}, durou {_duracao(p.duracao_seg or 0)}"
            else:
                trecho = f"ainda aberta, há {_duracao((agora - int(p.inicio or agora)) / 1000)}"
            extra = f" Observação: {p.comentario}." if p.comentario else ""
            linhas.append(f"- {_hora(p.inicio)} {ROTULOS_ESTADO.get(p.estado or '', p.estado or 'parada')}, motivo {nome_motivo}, {trecho}.{extra}")

    return "\n".join(linhas)
