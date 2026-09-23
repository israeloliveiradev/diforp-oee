"""Ponto de entrada `python -m oee` — sobe a API."""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("oee.presentation.main:app", host="0.0.0.0", port=8000, reload=False)
