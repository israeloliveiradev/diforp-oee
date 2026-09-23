from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from oee.config import settings

ALG = "HS256"


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()


def verificar_senha(senha: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(senha.encode(), hashed.encode())
    except ValueError:
        return False


def criar_token(sub: str, papel: str, nome: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": sub, "papel": papel, "nome": nome, "exp": exp}, settings.jwt_secret, algorithm=ALG)


def ler_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALG])
    except JWTError as e:
        raise ValueError("Token inválido") from e
