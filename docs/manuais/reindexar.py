"""Apaga manuais antigos, envia os PDFs novos e espera a indexação."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "http://localhost/api"
PASTA = Path(__file__).resolve().parent

MANUAIS = [
    ("MQ-1", "Torno CNC 01 — operação, alarme de ferramenta e troca de eixo", "man-mq1-torno-cnc-01.pdf"),
    ("MQ-2", "Torno CNC 02 — falha elétrica, falha mecânica e religamento", "man-mq2-torno-cnc-02.pdf"),
    ("MQ-3", "Retífica 01 — dressing, sensor de peça e queima de rebolo", "man-mq3-retifica-01.pdf"),
    ("MQ-4", "Prensa 01 — ciclo, fim de curso, pressão e segurança", "man-mq4-prensa-01.pdf"),
    ("MQ-5", "Montagem A — kit do flange, falta de material e torque", "man-mq5-montagem-a.pdf"),
    ("MQ-6", "Montagem B — anel, etiqueta, retrabalho e falta de gente", "man-mq6-montagem-b.pdf"),
    ("MQ-7", "Injetora 01 — troca de molde, temperatura e primeira peça", "man-mq7-injetora-01.pdf"),
    ("MQ-8", "Injetora 02 — refugo, rebarba, contaminação e bloqueio", "man-mq8-injetora-02.pdf"),
    ("", "Segurança da planta — LOTO, emergência e o que ninguém pula", "man-seg-loto-emergencia.pdf"),
    ("", "Como apontar no OEE — estados, peça, refugo e quando chamar gente", "man-oee-apontamento.pdf"),
]


def req(method: str, path: str, token: str | None = None, data: bytes | None = None, content_type: str | None = None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if content_type:
        headers["Content-Type"] = content_type
    r = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            body = resp.read()
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def multipart(fields: dict[str, str], arquivo: Path) -> tuple[bytes, str]:
    boundary = "----OeeManualBound"
    parts: list[bytes] = []
    for k, v in fields.items():
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode("utf-8")
        )
    raw = arquivo.read_bytes()
    parts.append(
        (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"arquivo\"; filename=\"{arquivo.name}\"\r\n"
            "Content-Type: application/pdf\r\n\r\n"
        ).encode("utf-8")
        + raw
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode("ascii"))
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def main() -> int:
    st, body = req("POST", "/auth/login", data=json.dumps({"login": "gestao", "senha": "gestao"}).encode(), content_type="application/json")
    if st != 200:
        print("login falhou", st, body)
        return 1
    tok = body["access_token"]

    st, atuais = req("GET", "/manuais", token=tok)
    for man in atuais:
        st, _ = req("DELETE", f"/manuais/{man['id']}", token=tok)
        print("excluiu", man.get("titulo"), st)

    for maq, titulo, arquivo in MANUAIS:
        path = PASTA / arquivo
        fields = {"titulo": titulo}
        if maq:
            fields["maquina_id"] = maq
        payload, ctype = multipart(fields, path)
        st, body = req("POST", "/manuais", token=tok, data=payload, content_type=ctype)
        print("enviou", arquivo, st, str(body)[:160])
        if st not in (200, 201):
            return 1

    for _ in range(60):
        st, lista = req("GET", "/manuais", token=tok)
        resumo = [(m.get("titulo", "")[:36], m.get("status"), m.get("paginas"), m.get("chunks"), (m.get("erro") or "")[:80]) for m in lista]
        print("status", resumo)
        if lista and all(m.get("status") == "pronto" for m in lista):
            print("OK", len(lista), "manuais prontos")
            return 0
        if any(m.get("status") == "erro" for m in lista):
            print("ERRO na indexação")
            return 1
        time.sleep(5)
    print("TIMEOUT esperando indexação")
    return 2


if __name__ == "__main__":
    sys.exit(main())
