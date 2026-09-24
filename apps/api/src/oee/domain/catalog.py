"""Constantes de domínio portadas de legacy/data.js."""

from __future__ import annotations

ESTADOS = {
    "PRODUZINDO": {
        "id": "PRODUZINDO",
        "rotulo": "Produzindo",
        "classe": "PRODUTIVO",
        "icone": "▶",
        "padrao": "solido",
    },
    "SETUP": {
        "id": "SETUP",
        "rotulo": "Setup",
        "classe": "NAO_PLANEJADA",
        "icone": "⇄",
        "padrao": "diagonal",
    },
    "MANUTENCAO": {
        "id": "MANUTENCAO",
        "rotulo": "Manutenção",
        "classe": "NAO_PLANEJADA",
        "icone": "⚒",
        "padrao": "diagonal",
    },
    "PARADA_NAO_PLANEJADA": {
        "id": "PARADA_NAO_PLANEJADA",
        "rotulo": "Parada não planejada",
        "classe": "NAO_PLANEJADA",
        "icone": "■",
        "padrao": "diagonal",
    },
    "MICROPARADA": {
        "id": "MICROPARADA",
        "rotulo": "Microparada",
        "classe": "NAO_PLANEJADA",
        "icone": "⚡",
        "padrao": "pontilhado",
    },
    "AGUARDANDO_MATERIAL": {
        "id": "AGUARDANDO_MATERIAL",
        "rotulo": "Aguardando material",
        "classe": "NAO_PLANEJADA",
        "icone": "⏳",
        "padrao": "pontilhado",
    },
    "AGUARDANDO_OPERADOR": {
        "id": "AGUARDANDO_OPERADOR",
        "rotulo": "Aguardando operador",
        "classe": "NAO_PLANEJADA",
        "icone": "☺",
        "padrao": "pontilhado",
    },
    "LIMPEZA": {
        "id": "LIMPEZA",
        "rotulo": "Limpeza",
        "classe": "PLANEJADA",
        "icone": "✧",
        "padrao": "listrado",
    },
    "PARADA_PLANEJADA": {
        "id": "PARADA_PLANEJADA",
        "rotulo": "Parada planejada",
        "classe": "PLANEJADA",
        "icone": "⏸",
        "padrao": "listrado",
    },
    "SEM_ORDEM": {
        "id": "SEM_ORDEM",
        "rotulo": "Sem ordem de produção",
        "classe": "PLANEJADA",
        "icone": "∅",
        "padrao": "listrado",
    },
}

ORDEM_ESTADOS = [
    "PRODUZINDO",
    "SETUP",
    "MANUTENCAO",
    "PARADA_NAO_PLANEJADA",
    "MICROPARADA",
    "AGUARDANDO_MATERIAL",
    "AGUARDANDO_OPERADOR",
    "LIMPEZA",
    "PARADA_PLANEJADA",
    "SEM_ORDEM",
]

MOTIVOS_PADRAO = [
    {"id": "MOT-01", "categoria": "Máquina", "nome": "Falha elétrica", "planejada": False, "estado_sugerido": "MANUTENCAO"},
    {"id": "MOT-02", "categoria": "Máquina", "nome": "Falha mecânica", "planejada": False, "estado_sugerido": "MANUTENCAO"},
    {"id": "MOT-03", "categoria": "Máquina", "nome": "Sensor", "planejada": False, "estado_sugerido": "PARADA_NAO_PLANEJADA"},
    {"id": "MOT-04", "categoria": "Máquina", "nome": "Ferramenta", "planejada": False, "estado_sugerido": "PARADA_NAO_PLANEJADA"},
    {"id": "MOT-05", "categoria": "Material", "nome": "Falta de material", "planejada": False, "estado_sugerido": "AGUARDANDO_MATERIAL"},
    {"id": "MOT-06", "categoria": "Material", "nome": "Material fora de especificação", "planejada": False, "estado_sugerido": "PARADA_NAO_PLANEJADA"},
    {"id": "MOT-07", "categoria": "Material", "nome": "Atraso no abastecimento", "planejada": False, "estado_sugerido": "AGUARDANDO_MATERIAL"},
    {"id": "MOT-08", "categoria": "Processo", "nome": "Ajuste", "planejada": False, "estado_sugerido": "PARADA_NAO_PLANEJADA"},
    {"id": "MOT-09", "categoria": "Processo", "nome": "Limpeza", "planejada": True, "estado_sugerido": "LIMPEZA"},
    {"id": "MOT-10", "categoria": "Processo", "nome": "Setup", "planejada": False, "estado_sugerido": "SETUP"},
    {"id": "MOT-11", "categoria": "Processo", "nome": "Troca de formato", "planejada": False, "estado_sugerido": "SETUP"},
    {"id": "MOT-12", "categoria": "Pessoas", "nome": "Falta de operador", "planejada": False, "estado_sugerido": "AGUARDANDO_OPERADOR"},
    {"id": "MOT-13", "categoria": "Pessoas", "nome": "Treinamento", "planejada": True, "estado_sugerido": "PARADA_PLANEJADA"},
    {"id": "MOT-14", "categoria": "Pessoas", "nome": "Aguardando aprovação", "planejada": False, "estado_sugerido": "AGUARDANDO_OPERADOR"},
    {"id": "MOT-15", "categoria": "Qualidade", "nome": "Inspeção", "planejada": False, "estado_sugerido": "PARADA_NAO_PLANEJADA"},
    {"id": "MOT-16", "categoria": "Qualidade", "nome": "Bloqueio", "planejada": False, "estado_sugerido": "PARADA_NAO_PLANEJADA"},
    {"id": "MOT-17", "categoria": "Qualidade", "nome": "Desvio", "planejada": False, "estado_sugerido": "PARADA_NAO_PLANEJADA"},
    {"id": "MOT-18", "categoria": "Outros", "nome": "Outros", "planejada": False, "estado_sugerido": "PARADA_NAO_PLANEJADA"},
    {"id": "MOT-19", "categoria": "Outros", "nome": "Refeição / intervalo", "planejada": True, "estado_sugerido": "PARADA_PLANEJADA"},
    {"id": "MOT-20", "categoria": "Outros", "nome": "Manutenção preventiva", "planejada": True, "estado_sugerido": "PARADA_PLANEJADA"},
]

CAUSAS_REFUGO = [
    "Dimensional fora de tolerância",
    "Aspecto superficial",
    "Contaminação",
    "Falha de solda",
    "Erro de montagem",
    "Peça incompleta",
]

TURNOS_PADRAO = [
    {"id": "T1", "nome": "Turno 1", "inicio": "06:00", "fim": "14:00"},
    {"id": "T2", "nome": "Turno 2", "inicio": "14:00", "fim": "22:00"},
    {"id": "T3", "nome": "Turno 3", "inicio": "22:00", "fim": "06:00"},
]

PERFIS = {
    "BOM": {
        "rotulo": "Referência",
        "duracao_producao_min": (35, 70),
        "duracao_parada_min": (3, 12),
        "fator_ritmo": (0.97, 1.03),
        "refugo_pct": (0.004, 0.012),
        "setups_por_turno": (0, 1),
        "duracao_setup_min": (8, 15),
        "peso_motivos": {"Máquina": 1, "Material": 1, "Processo": 1, "Pessoas": 1, "Qualidade": 1, "Outros": 1},
    },
    "BAIXA_DISPONIBILIDADE": {
        "rotulo": "Baixa disponibilidade",
        "duracao_producao_min": (10, 25),
        "duracao_parada_min": (12, 45),
        "fator_ritmo": (1.0, 1.06),
        "refugo_pct": (0.006, 0.015),
        "setups_por_turno": (0, 1),
        "duracao_setup_min": (10, 20),
        "peso_motivos": {"Máquina": 6, "Material": 1, "Processo": 1, "Pessoas": 1, "Qualidade": 1, "Outros": 1},
    },
    "BAIXA_PERFORMANCE": {
        "rotulo": "Baixa performance",
        "duracao_producao_min": (40, 80),
        "duracao_parada_min": (4, 10),
        "fator_ritmo": (1.18, 1.35),
        "refugo_pct": (0.005, 0.012),
        "setups_por_turno": (0, 1),
        "duracao_setup_min": (8, 14),
        "peso_motivos": {"Máquina": 1, "Material": 1, "Processo": 3, "Pessoas": 1, "Qualidade": 1, "Outros": 1},
    },
    "QUALIDADE": {
        "rotulo": "Problemas de qualidade",
        "duracao_producao_min": (30, 60),
        "duracao_parada_min": (5, 18),
        "fator_ritmo": (1.0, 1.08),
        "refugo_pct": (0.05, 0.11),
        "setups_por_turno": (0, 1),
        "duracao_setup_min": (8, 16),
        "peso_motivos": {"Máquina": 1, "Material": 1, "Processo": 1, "Pessoas": 1, "Qualidade": 6, "Outros": 1},
    },
    "EXCESSO_SETUP": {
        "rotulo": "Excesso de setup",
        "duracao_producao_min": (18, 35),
        "duracao_parada_min": (4, 10),
        "fator_ritmo": (1.02, 1.1),
        "setups_por_turno": (3, 5),
        "duracao_setup_min": (22, 45),
        "refugo_pct": (0.01, 0.03),
        "peso_motivos": {"Máquina": 1, "Material": 2, "Processo": 4, "Pessoas": 1, "Qualidade": 1, "Outros": 1},
    },
    "MICROPARADAS": {
        "rotulo": "Muitas microparadas",
        "duracao_producao_min": (4, 12),
        "duracao_parada_min": (1, 4),
        "fator_ritmo": (1.05, 1.15),
        "refugo_pct": (0.01, 0.025),
        "setups_por_turno": (0, 1),
        "duracao_setup_min": (8, 14),
        "microparada": True,
        "peso_motivos": {"Máquina": 3, "Material": 2, "Processo": 2, "Pessoas": 1, "Qualidade": 1, "Outros": 1},
    },
    "AGUARDA_MATERIAL": {
        "rotulo": "Espera por material",
        "duracao_producao_min": (20, 45),
        "duracao_parada_min": (15, 50),
        "fator_ritmo": (1.0, 1.07),
        "refugo_pct": (0.006, 0.014),
        "setups_por_turno": (0, 1),
        "duracao_setup_min": (8, 16),
        "peso_motivos": {"Máquina": 1, "Material": 8, "Processo": 1, "Pessoas": 2, "Qualidade": 1, "Outros": 1},
    },
}

AUDIT_CATEGORIAS = {
    "OPERACAO": {"rotulo": "Operação", "icone": "▶"},
    "PRODUCAO": {"rotulo": "Produção", "icone": "▦"},
    "PARADA": {"rotulo": "Paradas", "icone": "⏸"},
    "ORDEM": {"rotulo": "Ordens", "icone": "☷"},
    "CADASTRO": {"rotulo": "Cadastros", "icone": "✎"},
    "CONFIGURACAO": {"rotulo": "Configurações", "icone": "⚒"},
    "DADOS": {"rotulo": "Dados", "icone": "↧"},
    "SESSAO": {"rotulo": "Sessão", "icone": "◎"},
    "MANUAL": {"rotulo": "Manuais", "icone": "☰"},
}

AUDIT_ORIGENS = {
    "OPERADOR": {"rotulo": "Operador", "descricao": "Ação disparada na tela de chão de fábrica"},
    "GESTAO": {"rotulo": "Gestão", "descricao": "Ação disparada nas telas gerenciais"},
    "SIMULACAO": {"rotulo": "Simulação", "descricao": "Evento gerado pelo simulador de dados"},
    "SISTEMA": {"rotulo": "Sistema", "descricao": "Rotina automática da própria aplicação"},
}

AUDIT_ACOES = {
    "ESTADO_ALTERADO": {"rotulo": "Estado alterado", "categoria": "OPERACAO"},
    "PARADA_INICIADA": {"rotulo": "Parada iniciada", "categoria": "PARADA"},
    "PARADA_FINALIZADA": {"rotulo": "Parada finalizada", "categoria": "PARADA"},
    "MOTIVO_RECLASSIFICADO": {"rotulo": "Motivo reclassificado", "categoria": "PARADA", "sensivel": True},
    "SETUP_INICIADO": {"rotulo": "Setup iniciado", "categoria": "OPERACAO"},
    "SETUP_FINALIZADO": {"rotulo": "Setup finalizado", "categoria": "OPERACAO"},
    "MANUTENCAO_SOLICITADA": {"rotulo": "Manutenção solicitada", "categoria": "OPERACAO"},
    "OBSERVACAO_REGISTRADA": {"rotulo": "Observação registrada", "categoria": "OPERACAO"},
    "SUGESTAO_ACEITA": {"rotulo": "Sugestão do ACMP aceita", "categoria": "OPERACAO"},
    "SUGESTAO_IGNORADA": {"rotulo": "Sugestão do ACMP ignorada", "categoria": "OPERACAO"},
    "PRODUCAO_APONTADA": {"rotulo": "Produção apontada", "categoria": "PRODUCAO"},
    "REFUGO_APONTADO": {"rotulo": "Refugo apontado", "categoria": "PRODUCAO", "sensivel": True},
    "RETRABALHO_APONTADO": {"rotulo": "Retrabalho apontado", "categoria": "PRODUCAO"},
    "APONTAMENTO_RECUSADO": {"rotulo": "Apontamento recusado", "categoria": "PRODUCAO"},
    "ORDEM_ABERTA": {"rotulo": "Ordem aberta", "categoria": "ORDEM"},
    "ORDEM_FINALIZADA": {"rotulo": "Ordem finalizada", "categoria": "ORDEM"},
    "REGISTRO_CRIADO": {"rotulo": "Registro criado", "categoria": "CADASTRO"},
    "REGISTRO_ALTERADO": {"rotulo": "Registro alterado", "categoria": "CADASTRO", "sensivel": True},
    "REGISTRO_EXCLUIDO": {"rotulo": "Registro excluído", "categoria": "CADASTRO", "sensivel": True},
    "EXCLUSAO_BLOQUEADA": {"rotulo": "Exclusão bloqueada", "categoria": "CADASTRO"},
    "METAS_ALTERADAS": {"rotulo": "Metas alteradas", "categoria": "CONFIGURACAO", "sensivel": True},
    "SIMULACAO_ALTERADA": {"rotulo": "Simulação alterada", "categoria": "CONFIGURACAO"},
    "ACMP_ALTERADO": {"rotulo": "Assistente ACMP alterado", "categoria": "CONFIGURACAO"},
    "DADOS_EXPORTADOS": {"rotulo": "Dados exportados", "categoria": "DADOS"},
    "DADOS_IMPORTADOS": {"rotulo": "Dados importados", "categoria": "DADOS", "sensivel": True},
    "DEMO_RESTAURADA": {"rotulo": "Demonstração restaurada", "categoria": "DADOS", "sensivel": True},
    "HISTORICO_PODADO": {"rotulo": "Histórico podado", "categoria": "DADOS"},
    "TRILHA_PODADA": {"rotulo": "Trilha podada", "categoria": "DADOS"},
    "APLICACAO_INICIADA": {"rotulo": "Aplicação iniciada", "categoria": "SESSAO"},
    "MODO_ALTERADO": {"rotulo": "Modo alterado", "categoria": "SESSAO"},
    "MANUAL_ENVIADO": {"rotulo": "Manual enviado", "categoria": "MANUAL"},
    "MANUAL_REPROCESSADO": {"rotulo": "Manual reprocessado", "categoria": "MANUAL"},
    "MANUAL_EXCLUIDO": {"rotulo": "Manual excluído", "categoria": "MANUAL"},
    "CHAT_CONSULTADO": {"rotulo": "Manual consultado", "categoria": "MANUAL"},
    "OPERADOR_NO_POSTO": {"rotulo": "Operador assumiu o posto", "categoria": "OPERACAO"},
    "TURNO_FECHADO": {"rotulo": "Turno fechado", "categoria": "OPERACAO", "sensivel": True},
    "TURNO_REABERTO": {"rotulo": "Turno reaberto", "categoria": "OPERACAO", "sensivel": True},
}

CONFIG_PADRAO = {
    "meta_oee": 0.75,
    "meta_setup_min": 20,
    "meta_refugo_pct": 0.02,
    "simulacao_ativa": False,
    "intervalo_simulacao_seg": 5,
    "limite_microparada_seg": 300,
    "auditar_simulacao": True,
    "acmp_ativo": True,
}


def classe_do_estado(estado_id: str, config: dict | None = None) -> str:
    override = (config or {}).get("classificacao_estados") or {}
    if estado_id in override:
        return override[estado_id]
    defn = ESTADOS.get(estado_id)
    return defn["classe"] if defn else "NAO_PLANEJADA"
