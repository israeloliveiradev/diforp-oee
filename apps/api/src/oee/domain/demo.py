"""Gerador do dataset de demonstração — portado de legacy/data.js."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from oee.domain.catalog import (
    CAUSAS_REFUGO,
    CONFIG_PADRAO,
    ESTADOS,
    MOTIVOS_PADRAO,
    PERFIS,
    TURNOS_PADRAO,
)
from oee.domain.ids import novo_id
from oee.domain.timeutil import janelas_de_turno


def criar_random(seed: int) -> Callable[[], float]:
    t = seed & 0xFFFFFFFF

    def rnd() -> float:
        nonlocal t
        t = (t + 0x6D2B79F5) & 0xFFFFFFFF
        r = t
        r = (r ^ (r >> 15)) * (r | 1) & 0xFFFFFFFF
        r ^= (r + ((r ^ (r >> 7)) * (r | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((r ^ (r >> 14)) & 0xFFFFFFFF) / 4294967296

    return rnd


def _escolher(rnd, lista):
    return lista[int(rnd() * len(lista))] if lista else None


def _entre(rnd, a, b):
    return a + rnd() * (b - a)


def _inteiro(rnd, a, b):
    return int(_entre(rnd, a, b + 1))


def cadastros_base() -> dict[str, Any]:
    empresa = {"id": "EMP-1", "nome": "Indústria Modelo S.A."}
    plantas = [
        {"id": "PL-1", "empresa_id": "EMP-1", "nome": "Planta Sul", "cidade": "Joinville"},
        {"id": "PL-2", "empresa_id": "EMP-1", "nome": "Planta Norte", "cidade": "Camaçari"},
    ]
    areas = [
        {"id": "AR-1", "planta_id": "PL-1", "nome": "Usinagem"},
        {"id": "AR-2", "planta_id": "PL-1", "nome": "Montagem"},
        {"id": "AR-3", "planta_id": "PL-2", "nome": "Injeção"},
    ]
    linhas = [
        {"id": "LN-1", "area_id": "AR-1", "nome": "Linha 01 - Eixos"},
        {"id": "LN-2", "area_id": "AR-2", "nome": "Linha 02 - Conjuntos"},
        {"id": "LN-3", "area_id": "AR-3", "nome": "Linha 03 - Carcaças"},
    ]
    produtos = [
        {"id": "PR-1", "sku": "EX-1020", "nome": "Eixo motriz 1020", "ciclo_ideal_seg": 42},
        {"id": "PR-2", "sku": "EX-2040", "nome": "Eixo secundário 2040", "ciclo_ideal_seg": 55},
        {"id": "PR-3", "sku": "CJ-3100", "nome": "Conjunto flange 3100", "ciclo_ideal_seg": 30},
        {"id": "PR-4", "sku": "CR-4500", "nome": "Carcaça bomba 4500", "ciclo_ideal_seg": 24},
        {"id": "PR-5", "sku": "CR-4800", "nome": "Carcaça reforçada 4800", "ciclo_ideal_seg": 36},
    ]
    maquinas = [
        {"id": "MQ-1", "nome": "Torno CNC 01", "linha_id": "LN-1", "perfil": "BOM", "produtos": ["PR-1", "PR-2"]},
        {"id": "MQ-2", "nome": "Torno CNC 02", "linha_id": "LN-1", "perfil": "BAIXA_DISPONIBILIDADE", "produtos": ["PR-1", "PR-2"]},
        {"id": "MQ-3", "nome": "Retífica 01", "linha_id": "LN-1", "perfil": "MICROPARADAS", "produtos": ["PR-1"]},
        {"id": "MQ-4", "nome": "Prensa 01", "linha_id": "LN-2", "perfil": "BAIXA_PERFORMANCE", "produtos": ["PR-3"]},
        {"id": "MQ-5", "nome": "Montagem A", "linha_id": "LN-2", "perfil": "AGUARDA_MATERIAL", "produtos": ["PR-3"]},
        {"id": "MQ-6", "nome": "Montagem B", "linha_id": "LN-2", "perfil": "BOM", "produtos": ["PR-3"]},
        {"id": "MQ-7", "nome": "Injetora 01", "linha_id": "LN-3", "perfil": "EXCESSO_SETUP", "produtos": ["PR-4", "PR-5"]},
        {"id": "MQ-8", "nome": "Injetora 02", "linha_id": "LN-3", "perfil": "QUALIDADE", "produtos": ["PR-4", "PR-5"]},
    ]
    operadores = [
        {"id": "OP-1", "matricula": "10234", "nome": "Ana Ribeiro", "turno_id": "T1"},
        {"id": "OP-2", "matricula": "10877", "nome": "Bruno Camargo", "turno_id": "T1"},
        {"id": "OP-3", "matricula": "11045", "nome": "Carla Menezes", "turno_id": "T2"},
        {"id": "OP-4", "matricula": "11298", "nome": "Diego Fontes", "turno_id": "T2"},
        {"id": "OP-5", "matricula": "11533", "nome": "Eduarda Prado", "turno_id": "T3"},
        {"id": "OP-6", "matricula": "11760", "nome": "Felipe Andrade", "turno_id": "T3"},
    ]
    return {
        "empresa": empresa,
        "plantas": plantas,
        "areas": areas,
        "linhas": linhas,
        "produtos": produtos,
        "maquinas": maquinas,
        "operadores": operadores,
        "turnos": [dict(t) for t in TURNOS_PADRAO],
        "motivos": [
            {
                "id": m["id"],
                "categoria": m["categoria"],
                "nome": m["nome"],
                "planejada": m["planejada"],
                "estado_sugerido": m["estado_sugerido"],
            }
            for m in MOTIVOS_PADRAO
        ],
    }


def gerar_demo(opcoes: dict[str, Any] | None = None) -> dict[str, Any]:
    opcoes = opcoes or {}
    dias = opcoes.get("dias", 7)
    agora = int(opcoes.get("agora") or __import__("time").time() * 1000)
    rnd = criar_random(int(opcoes.get("seed") or 20240517))
    base = cadastros_base()
    ds: dict[str, Any] = {
        "meta": {"versao": 2, "gerado_em": datetime.fromtimestamp(agora / 1000, timezone.utc).isoformat().replace("+00:00", "Z"), "origem": "demo"},
        "empresa": base["empresa"],
        "plantas": base["plantas"],
        "areas": base["areas"],
        "linhas": base["linhas"],
        "maquinas": [],
        "produtos": base["produtos"],
        "turnos": base["turnos"],
        "operadores": base["operadores"],
        "motivos": base["motivos"],
        "ordens": [],
        "eventos_estado": [],
        "eventos_producao": [],
        "eventos_parada": [],
        "observacoes": [],
        "auditoria": [],
        "config": dict(CONFIG_PADRAO),
    }
    for m in base["maquinas"]:
        produto = next(p for p in ds["produtos"] if p["id"] in m["produtos"])
        ds["maquinas"].append(
            {
                "id": m["id"],
                "nome": m["nome"],
                "linha_id": m["linha_id"],
                "perfil": m["perfil"],
                "produtos_habilitados": list(m["produtos"]),
                "ciclo_ideal_seg": produto["ciclo_ideal_seg"],
                "estado_atual": "SEM_ORDEM",
                "estado_desde": agora,
                "produto_atual_id": produto["id"],
                "ordem_atual_id": None,
                "operador_atual_id": None,
                "meta_turno": 0,
                "ativa": True,
            }
        )

    contador = {"n": 1000}

    def proximo():
        contador["n"] += 1
        return contador["n"]

    for d in range(dias - 1, -1, -1):
        dia = datetime.fromtimestamp(agora / 1000) - timedelta(days=d)
        for jan in janelas_de_turno(ds["turnos"], dia):
            if jan["inicio"] > agora:
                continue
            fim_janela = min(jan["fim"], agora)
            if fim_janela - jan["inicio"] < 60000:
                continue
            for maq in ds["maquinas"]:
                _gerar_turno(ds, maq, jan, fim_janela, rnd, agora, proximo)

    for maq in ds["maquinas"]:
        abertos = [e for e in ds["eventos_estado"] if e["maquina_id"] == maq["id"] and e["fim"] is None]
        if abertos:
            ultimo = abertos[-1]
            maq["estado_atual"] = ultimo["estado"]
            maq["estado_desde"] = ultimo["inicio"]
            maq["ordem_atual_id"] = ultimo.get("ordem_id")
            ordem = next((o for o in ds["ordens"] if o["id"] == ultimo.get("ordem_id")), None)
            if ordem:
                maq["produto_atual_id"] = ordem["produto_id"]
                maq["meta_turno"] = ordem["meta_qtd"]
                maq["ciclo_ideal_seg"] = ordem["ciclo_ideal_seg"]
                maq["operador_atual_id"] = ordem["operador_id"]
    return ds


def _gerar_turno(ds, maq, janela, fim_janela, rnd, agora, proximo):
    perfil = PERFIS.get(maq["perfil"]) or PERFIS["BOM"]
    duracao_turno_seg = (janela["fim"] - janela["inicio"]) / 1000
    produto_id = _escolher(rnd, maq["produtos_habilitados"])
    produto = next(p for p in ds["produtos"] if p["id"] == produto_id)
    ciclo = produto["ciclo_ideal_seg"]
    ops = [o for o in ds["operadores"] if o["turno_id"] == janela["turno_id"]]
    operador = _escolher(rnd, ops) or ds["operadores"][0]
    meta_qtd = round((duracao_turno_seg * 0.85) / ciclo)
    n = proximo()
    ordem = {
        "id": f"ORD-{n}",
        "codigo": f"OP-{100000 + n}",
        "maquina_id": maq["id"],
        "produto_id": produto_id,
        "turno_id": janela["turno_id"],
        "operador_id": operador["id"],
        "ciclo_ideal_seg": ciclo,
        "meta_qtd": meta_qtd,
        "inicio": janela["inicio"],
        "fim": janela["fim"] if janela["fim"] <= agora else None,
        "status": "FINALIZADA" if janela["fim"] <= agora else "EM_ANDAMENTO",
    }
    ds["ordens"].append(ordem)

    por_cat: dict[str, list] = {}
    for m in ds["motivos"]:
        por_cat.setdefault(m["categoria"], []).append(m)

    vieses = {
        "T1": {"MOT-05": 3, "MOT-07": 2},
        "T2": {"MOT-08": 3, "MOT-15": 2},
        "T3": {"MOT-12": 4, "MOT-14": 3},
    }

    def sortear_motivo(instante, motivo_anterior):
        pool = []
        for cat, peso in perfil["peso_motivos"].items():
            lista = por_cat.get(cat) or []
            for _ in range(peso):
                pool.extend(lista)
        candidatos = [m for m in pool if not m["planejada"]] or list(ds["motivos"])
        base = len(candidatos)

        def reforco(mid, peso):
            nonlocal candidatos
            m = next((x for x in candidatos if x["id"] == mid), None)
            if not m:
                return
            candidatos = candidatos + [m] * int(__import__("math").ceil(base * peso / 10))

        for mid, peso in (vieses.get(janela["turno_id"]) or {}).items():
            reforco(mid, peso)
        decorrido = instante - janela["inicio"]
        dur = janela["fim"] - janela["inicio"]
        if decorrido < dur * 0.2:
            reforco("MOT-05", 4)
            reforco("MOT-07", 3)
        elif decorrido > dur * 0.8:
            reforco("MOT-12", 3)
            reforco("MOT-14", 3)
        else:
            reforco("MOT-02", 2)
            reforco("MOT-03", 2)
        if ciclo <= 30:
            reforco("MOT-04", 4)
        elif ciclo >= 90:
            reforco("MOT-08", 2)
        por_prod = {"PR-1": "MOT-04", "PR-2": "MOT-06", "PR-3": "MOT-08", "PR-4": "MOT-17", "PR-5": "MOT-03"}
        if por_prod.get(ordem["produto_id"]):
            reforco(por_prod[ordem["produto_id"]], 4)
        if motivo_anterior in ("MOT-01", "MOT-02"):
            reforco(motivo_anterior, 5)
        if motivo_anterior == "MOT-17":
            reforco("MOT-15", 4)
            reforco("MOT-16", 3)
        if motivo_anterior == "MOT-05":
            reforco("MOT-07", 3)
        return _escolher(rnd, candidatos)

    t = janela["inicio"]
    ultimo = None
    setups = _inteiro(rnd, perfil["setups_por_turno"][0], perfil["setups_por_turno"][1])
    primeiro = True
    inicio_refeicao = janela["inicio"] + (janela["fim"] - janela["inicio"]) / 2
    refeicao = False

    def min_ms(m):
        return m * 60000

    while t < fim_janela:
        if (primeiro and setups > 0) or (not primeiro and setups > 0 and rnd() < 0.25):
            dur = min_ms(_entre(rnd, perfil["duracao_setup_min"][0], perfil["duracao_setup_min"][1]))
            t = _segmento(ds, maq, ordem, janela, t, dur, "SETUP", "MOT-10", fim_janela, agora, rnd, None)
            setups -= 1
            primeiro = False
            if t >= fim_janela:
                break
        primeiro = False
        dur_prod = min_ms(_entre(rnd, perfil["duracao_producao_min"][0], perfil["duracao_producao_min"][1]))
        t = _segmento(
            ds,
            maq,
            ordem,
            janela,
            t,
            dur_prod,
            "PRODUZINDO",
            None,
            fim_janela,
            agora,
            rnd,
            {
                "ciclo_real_seg": ciclo * _entre(rnd, perfil["fator_ritmo"][0], perfil["fator_ritmo"][1]),
                "refugo_pct": _entre(rnd, perfil["refugo_pct"][0], perfil["refugo_pct"][1]),
                "operador_id": operador["id"],
            },
        )
        if t >= fim_janela:
            break
        if not refeicao and t >= inicio_refeicao:
            refeicao = True
            t = _segmento(
                ds, maq, ordem, janela, t, min_ms(_entre(rnd, 15, 25)), "PARADA_PLANEJADA", "MOT-19", fim_janela, agora, rnd, None
            )
            if t >= fim_janela:
                break
            continue
        motivo = sortear_motivo(t, ultimo)
        ultimo = motivo["id"]
        dur_p = min_ms(_entre(rnd, perfil["duracao_parada_min"][0], perfil["duracao_parada_min"][1]))
        estado = motivo["estado_sugerido"]
        if perfil.get("microparada") and dur_p <= ds["config"]["limite_microparada_seg"] * 1000:
            estado = "MICROPARADA"
        t = _segmento(ds, maq, ordem, janela, t, dur_p, estado, motivo["id"], fim_janela, agora, rnd, None)


def _segmento(ds, maq, ordem, janela, inicio, duracao, estado, motivo_id, fim_janela, agora, rnd, producao):
    fim = min(inicio + duracao, fim_janela)
    em_andamento = (fim_janela >= agora) and (inicio + duracao > agora)
    ds["eventos_estado"].append(
        {
            "id": novo_id("EST"),
            "maquina_id": maq["id"],
            "ordem_id": ordem["id"],
            "turno_id": janela["turno_id"],
            "estado": estado,
            "motivo_id": motivo_id,
            "inicio": int(inicio),
            "fim": None if em_andamento else int(fim),
        }
    )
    duracao_real = (agora if em_andamento else fim) - inicio
    if duracao_real <= 0:
        return fim
    defn = ESTADOS.get(estado)
    if defn and defn["classe"] != "PRODUTIVO":
        motivo = next((m for m in ds["motivos"] if m["id"] == motivo_id), None)
        ds["eventos_parada"].append(
            {
                "id": novo_id("PAR"),
                "maquina_id": maq["id"],
                "ordem_id": ordem["id"],
                "turno_id": janela["turno_id"],
                "estado": estado,
                "motivo_id": motivo_id,
                "categoria": motivo["categoria"] if motivo else "Outros",
                "planejada": defn["classe"] == "PLANEJADA",
                "inicio": int(inicio),
                "fim": None if em_andamento else int(fim),
                "duracao_seg": round(duracao_real / 1000),
                "comentario": "",
            }
        )
    if producao:
        restante = duracao_real
        cursor = inicio
        while restante > 0:
            fatia = min(restante, 30 * 60000)
            qtd = int((fatia / 1000) / producao["ciclo_real_seg"])
            if qtd > 0:
                refugo = round(qtd * producao["refugo_pct"] * _entre(rnd, 0.6, 1.4))
                if refugo >= qtd:
                    refugo = max(0, qtd - 1)
                retrabalho = round(refugo * _entre(rnd, 0.2, 0.6)) if rnd() < 0.25 else 0
                ds["eventos_producao"].append(
                    {
                        "id": novo_id("PRD"),
                        "maquina_id": maq["id"],
                        "ordem_id": ordem["id"],
                        "turno_id": janela["turno_id"],
                        "produto_id": ordem["produto_id"],
                        "operador_id": producao["operador_id"],
                        "ts": int(cursor + fatia),
                        "qtd_total": qtd,
                        "qtd_refugo": refugo,
                        "qtd_retrabalho": retrabalho,
                        "causa_refugo": _escolher(rnd, CAUSAS_REFUGO) if refugo > 0 else None,
                        "origem": "SIMULADO",
                    }
                )
            cursor += fatia
            restante -= fatia
    return fim
