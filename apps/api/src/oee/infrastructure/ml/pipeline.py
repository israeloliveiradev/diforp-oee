"""Treino e inferência LightGBM + SHAP para ACMP."""

from __future__ import annotations

import json
import os
import pickle
import time
from typing import Any

import numpy as np

from oee.config import settings
from oee.domain.acmp import (
    ATRIBUTOS_EM_CURSO,
    ATRIBUTOS_INICIO,
    MINIMO_AMOSTRAS,
    ROTULOS_ATRIBUTO,
    avaliar as avaliar_nb,
    baseline,
    extrair_amostras,
    sugerir as sugerir_nb,
    treinar as treinar_nb,
)

FEATURES = ATRIBUTOS_INICIO


def _ensure_dir() -> str:
    path = settings.models_dir
    os.makedirs(path, exist_ok=True)
    return path


def _matriz(amostras: list[dict], atributos: list[str]) -> tuple[list[list[str]], list[str]]:
    X = [[str(a["atributos"].get(f) or "") for f in atributos] for a in amostras]
    y = [a["classe"] for a in amostras]
    return X, y


def treinar_lightgbm(dataset: dict[str, Any], atributos: list[str] | None = None) -> dict[str, Any]:
    atributos = atributos or FEATURES
    amostras = extrair_amostras(dataset)
    if len(amostras) < MINIMO_AMOSTRAS * 2:
        modelo = treinar_nb(amostras, atributos)
        av = avaliar_nb(amostras, {"atributos": atributos})
        return {"tipo": "naive_bayes", "modelo": modelo, "metricas": av, "promovido": False}

    ordenadas = sorted(amostras, key=lambda a: a["ts"] or 0)
    corte = int(len(ordenadas) * 0.75)
    treino, teste = ordenadas[:corte], ordenadas[corte:]
    ref = baseline(treino)

    try:
        import lightgbm as lgb
        import pandas as pd
    except ImportError:
        modelo = treinar_nb(amostras, atributos)
        return {"tipo": "naive_bayes", "modelo": modelo, "metricas": avaliar_nb(amostras, {"atributos": atributos}), "promovido": False}

    def frame(lista):
        df = pd.DataFrame([{f: str(a["atributos"].get(f) or "") for f in atributos} for a in lista])
        for c in df.columns:
            df[c] = df[c].astype("category")
        return df

    Xtr, ytr = frame(treino), [a["classe"] for a in treino]
    Xte, yte = frame(teste), [a["classe"] for a in teste]
    classes = sorted(set(ytr) | set(yte))
    ymap = {c: i for i, c in enumerate(classes)}
    inv = {i: c for c, i in ymap.items()}
    clf = lgb.LGBMClassifier(
        n_estimators=80,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.8,
        min_child_samples=8,
        verbose=-1,
    )
    clf.fit(Xtr, [ymap[y] for y in ytr], categorical_feature=atributos)
    proba = clf.predict_proba(Xte)
    pred = [inv[int(i)] for i in np.argmax(proba, axis=1)]
    top3 = []
    for row in proba:
        idx = np.argsort(row)[::-1][:3]
        top3.append([inv[int(i)] for i in idx])
    n = len(teste) or 1
    ac_top1 = sum(p == y for p, y in zip(pred, yte)) / n
    ac_top3 = sum(y in t for y, t in zip(yte, top3)) / n
    ac_base = sum((ref["por_maquina"].get(a["maquina_id"]) or ref["geral"]) == a["classe"] for a in teste) / n
    promovido = ac_top1 > ac_base
    metricas = {
        "suficiente": True,
        "modelo": "lightgbm" if promovido else "naive_bayes",
        "atributos": atributos,
        "total_amostras": len(ordenadas),
        "treino": len(treino),
        "teste": len(teste),
        "acuracia_top1": ac_top1,
        "acuracia_top3": ac_top3,
        "acuracia_baseline": ac_base,
        "f1_macro": None,
        "promovido": promovido,
    }
    payload = {
        "tipo": "lightgbm" if promovido else "naive_bayes",
        "clf": clf if promovido else None,
        "ymap": ymap,
        "inv": inv,
        "atributos": atributos,
        "classes": classes,
        "nb": treinar_nb(amostras, atributos),
        "metricas": metricas,
        "categorias": {c: sorted(set(str(a["atributos"].get(c) or "") for a in treino)) for c in atributos},
    }
    versao = int(time.time())
    pasta = os.path.join(_ensure_dir(), f"v{versao}")
    os.makedirs(pasta, exist_ok=True)
    with open(os.path.join(pasta, "model.pkl"), "wb") as f:
        pickle.dump(payload, f)
    with open(os.path.join(pasta, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metricas, f, ensure_ascii=False, indent=2)
    with open(os.path.join(_ensure_dir(), "current.txt"), "w") as f:
        f.write(pasta)
    payload["caminho"] = pasta
    payload["versao"] = versao
    return payload


def carregar_modelo() -> dict[str, Any] | None:
    marker = os.path.join(_ensure_dir(), "current.txt")
    if not os.path.exists(marker):
        return None
    pasta = open(marker, encoding="utf-8").read().strip()
    path = os.path.join(pasta, "model.pkl")
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return pickle.load(f)


def _shap_frases(modelo: dict, ctx: dict, classe: str) -> list[dict[str, Any]]:
    """Converte contribuição de atributos em frases para o operador."""
    frases = []
    try:
        import shap
        import pandas as pd

        clf = modelo.get("clf")
        if clf is None:
            return frases
        df = pd.DataFrame([{f: str(ctx.get(f) or "") for f in modelo["atributos"]}])
        for c in df.columns:
            df[c] = df[c].astype("category")
            df[c] = df[c].cat.set_categories(modelo.get("categorias", {}).get(c) or list(df[c].cat.categories))
        explainer = shap.TreeExplainer(clf)
        valores = explainer.shap_values(df)
        idx = modelo["ymap"].get(classe)
        if idx is None:
            return frases
        row = valores[idx][0] if isinstance(valores, list) else valores[0]
        pares = list(zip(modelo["atributos"], row))
        pares.sort(key=lambda p: abs(float(p[1])), reverse=True)
        for atr, val in pares[:3]:
            direcao = "aumenta" if float(val) > 0 else "reduz"
            frases.append(
                {
                    "atributo": atr,
                    "rotulo": ROTULOS_ATRIBUTO.get(atr, atr),
                    "valor": ctx.get(atr),
                    "shap": float(val),
                    "frase": (
                        f"O valor de {ROTULOS_ATRIBUTO.get(atr, atr)} = {ctx.get(atr)} {direcao} a chance de "
                        f"este motivo (contribuição {abs(float(val)):.2f})."
                    ),
                }
            )
    except Exception:
        return frases
    return frases


def inferir(dataset: dict[str, Any], ctx: dict[str, Any], com_duracao: bool = False) -> list[dict[str, Any]]:
    atributos = ATRIBUTOS_EM_CURSO if com_duracao else ATRIBUTOS_INICIO
    amostras = extrair_amostras(dataset)
    salvo = carregar_modelo()
    if not salvo or salvo.get("tipo") != "lightgbm" or salvo.get("clf") is None or len(amostras) < MINIMO_AMOSTRAS:
        nb = treinar_nb(amostras, atributos) if amostras else None
        return sugerir_nb(nb, ctx, 3) if nb else []

    try:
        import pandas as pd

        df = pd.DataFrame([{f: str(ctx.get(f) or "") for f in salvo["atributos"]}])
        for c in df.columns:
            df[c] = df[c].astype("category")
            cats = salvo.get("categorias", {}).get(c)
            if cats:
                df[c] = df[c].cat.set_categories(cats)
        proba = salvo["clf"].predict_proba(df)[0]
        ordem = np.argsort(proba)[::-1][:3]
        out = []
        for i, idx in enumerate(ordem):
            classe = salvo["inv"][int(idx)]
            shap_list = _shap_frases(salvo, ctx, classe)
            out.append(
                {
                    "motivo_id": classe,
                    "probabilidade": float(proba[idx]),
                    "posicao": i + 1,
                    "evidencias": [
                        {"rotulo": s["rotulo"], "valor": s["valor"], "frase": s["frase"], "proporcao": None, "suporte": None}
                        for s in shap_list
                    ],
                    "shap": shap_list,
                    "modelo": "lightgbm",
                }
            )
        return out
    except Exception:
        nb = treinar_nb(amostras, atributos)
        return sugerir_nb(nb, ctx, 3)
