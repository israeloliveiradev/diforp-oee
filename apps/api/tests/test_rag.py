import pytest

from oee.domain.rag import chunk_text, nome_arquivo_seguro, validar_pdf


def test_chunk_vazio():
    assert chunk_text("", 1) == []
    assert chunk_text("   ", 1) == []


def test_chunk_overlap_e_secao():
    texto = "Alarme ferramenta: verifique o insert. " + ("passo " * 80)
    chunks = chunk_text(texto, 3, tamanho=80, overlap=20)
    assert len(chunks) > 1
    assert all(c["pagina"] == 3 for c in chunks)
    assert chunks[0]["secao"]
    # overlap: o início do segundo pedaço deve repetir o fim do primeiro
    assert chunks[1]["texto"][:10] in chunks[0]["texto"]


def test_nome_arquivo_seguro():
    assert nome_arquivo_seguro("../../x y.pdf") == "x_y.pdf"
    assert nome_arquivo_seguro("manual").endswith(".pdf")


def test_validar_pdf_rejeita_lixo():
    with pytest.raises(ValueError):
        validar_pdf(b"nao e pdf", "a.pdf")
    with pytest.raises(ValueError):
        validar_pdf(b"%PDF-1.4", "a.txt")
    validar_pdf(b"%PDF-1.4 minimo", "manual.pdf")
