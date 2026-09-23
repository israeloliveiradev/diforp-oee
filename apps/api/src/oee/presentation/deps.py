from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from oee.infrastructure.auth import ler_token
from oee.infrastructure.db.session import get_session

bearer = HTTPBearer(auto_error=False)


def db_dep(db: Session = Depends(get_session)) -> Session:
    return db


def usuario_atual(cred: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if cred is None:
        raise HTTPException(401, "Não autenticado")
    try:
        return ler_token(cred.credentials)
    except ValueError:
        raise HTTPException(401, "Token inválido")


def exigir_gestao(user: dict = Depends(usuario_atual)) -> dict:
    if user.get("papel") != "gestao":
        raise HTTPException(403, "Requer papel de gestão")
    return user
