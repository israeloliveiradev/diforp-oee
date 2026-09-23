/** Catálogo visual portado de legacy/data.js — a UI nunca informa estado só por cor. */
export const ESTADOS: Record<
  string,
  { id: string; rotulo: string; classe: string; icone: string; padrao: string }
> = {
  PRODUZINDO: { id: "PRODUZINDO", rotulo: "Produzindo", classe: "PRODUTIVO", icone: "▶", padrao: "solido" },
  SETUP: { id: "SETUP", rotulo: "Setup", classe: "NAO_PLANEJADA", icone: "⇄", padrao: "diagonal" },
  MANUTENCAO: { id: "MANUTENCAO", rotulo: "Manutenção", classe: "NAO_PLANEJADA", icone: "⚒", padrao: "diagonal" },
  PARADA_NAO_PLANEJADA: {
    id: "PARADA_NAO_PLANEJADA",
    rotulo: "Parada não planejada",
    classe: "NAO_PLANEJADA",
    icone: "■",
    padrao: "diagonal",
  },
  MICROPARADA: { id: "MICROPARADA", rotulo: "Microparada", classe: "NAO_PLANEJADA", icone: "⚡", padrao: "pontilhado" },
  AGUARDANDO_MATERIAL: {
    id: "AGUARDANDO_MATERIAL",
    rotulo: "Aguardando material",
    classe: "NAO_PLANEJADA",
    icone: "⏳",
    padrao: "pontilhado",
  },
  AGUARDANDO_OPERADOR: {
    id: "AGUARDANDO_OPERADOR",
    rotulo: "Aguardando operador",
    classe: "NAO_PLANEJADA",
    icone: "☺",
    padrao: "pontilhado",
  },
  LIMPEZA: { id: "LIMPEZA", rotulo: "Limpeza", classe: "PLANEJADA", icone: "✧", padrao: "listrado" },
  PARADA_PLANEJADA: {
    id: "PARADA_PLANEJADA",
    rotulo: "Parada planejada",
    classe: "PLANEJADA",
    icone: "⏸",
    padrao: "listrado",
  },
  SEM_ORDEM: { id: "SEM_ORDEM", rotulo: "Sem ordem de produção", classe: "PLANEJADA", icone: "∅", padrao: "listrado" },
};

export const ORDEM_ESTADOS = Object.keys(ESTADOS);

export const ROTAS = [
  { id: "visao-geral", rotulo: "Visão Geral", icone: "▦", modo: "gestao" },
  { id: "operacao", rotulo: "Operação", icone: "▶", modo: "ambos" },
  { id: "maquinas", rotulo: "Máquinas", icone: "⚙", modo: "gestao" },
  { id: "producao", rotulo: "Produção", icone: "▤", modo: "gestao" },
  { id: "paradas", rotulo: "Paradas", icone: "⏸", modo: "gestao" },
  { id: "qualidade", rotulo: "Qualidade", icone: "✓", modo: "gestao" },
  { id: "performance", rotulo: "Performance", icone: "↗", modo: "gestao" },
  { id: "insights", rotulo: "O que olhar", icone: "✦", modo: "gestao" },
  { id: "assistente", rotulo: "ACMP", icone: "⚙", modo: "gestao" },
  { id: "manuais", rotulo: "Manuais", icone: "☰", modo: "gestao" },
  { id: "chat", rotulo: "O que fazer", icone: "?", modo: "ambos" },
  { id: "auditoria", rotulo: "Auditoria", icone: "☑", modo: "gestao" },
  { id: "cadastros", rotulo: "Cadastros", icone: "☷", modo: "gestao" },
  { id: "configuracoes", rotulo: "Configurações", icone: "⚒", modo: "ambos" },
];

export const COR_TEXTO = "#9FB6BC";
export const COR_GRADE = "rgba(198, 210, 218, 0.12)";
export const PALETA = ["#D97B29", "#9FB6BC", "#6FA383", "#DC6C57", "#6E9FB5", "#E0A46A", "#155263", "#C67A3C"];

export function faixaOee(valor: number | null | undefined, meta = 0.75) {
  if (valor == null) return "indefinido";
  if (valor >= meta) return "bom";
  if (valor >= meta * 0.8) return "atencao";
  return "critico";
}

export function nomeDe(lista: any[] | undefined, id: string | null | undefined, campo = "nome") {
  if (!id || !lista) return "—";
  const item = lista.find((x) => x.id === id);
  return item ? item[campo] : id;
}

export function caminhoMaquina(ds: any, maq: any) {
  const linha = (ds?.linhas || []).find((l: any) => l.id === maq?.linha_id);
  const area = linha ? (ds?.areas || []).find((a: any) => a.id === linha.area_id) : null;
  const planta = area ? (ds?.plantas || []).find((p: any) => p.id === area.planta_id) : null;
  return [planta?.nome, area?.nome, linha?.nome].filter(Boolean).join(" · ") || "—";
}

export const CRITICIDADE: Record<string, string> = {
  informativo: "Informativo",
  atencao: "Atenção",
  critico: "Crítico",
  oportunidade: "Oportunidade",
};

export const CAUSAS_REFUGO = [
  "Dimensional fora de tolerância",
  "Aspecto superficial",
  "Contaminação",
  "Falha de solda",
  "Erro de montagem",
  "Peça incompleta",
];

export const AUDIT_CATEGORIAS: Record<string, { rotulo: string; icone: string }> = {
  OPERACAO: { rotulo: "Operação", icone: "▶" },
  PRODUCAO: { rotulo: "Produção", icone: "▦" },
  PARADA: { rotulo: "Paradas", icone: "⏸" },
  ORDEM: { rotulo: "Ordens", icone: "☷" },
  CADASTRO: { rotulo: "Cadastros", icone: "✎" },
  CONFIGURACAO: { rotulo: "Configurações", icone: "⚒" },
  DADOS: { rotulo: "Dados", icone: "↧" },
  SESSAO: { rotulo: "Sessão", icone: "◎" },
  MANUAL: { rotulo: "Manuais", icone: "☰" },
};

export const AUDIT_ORIGENS: Record<string, { rotulo: string }> = {
  OPERADOR: { rotulo: "Operador" },
  GESTAO: { rotulo: "Gestão" },
  SIMULACAO: { rotulo: "Simulação" },
  SISTEMA: { rotulo: "Sistema" },
};

export const AUDIT_ACOES: Record<string, { rotulo: string }> = {
  ESTADO_ALTERADO: { rotulo: "Estado alterado" },
  PARADA_INICIADA: { rotulo: "Parada iniciada" },
  PARADA_FINALIZADA: { rotulo: "Parada finalizada" },
  MOTIVO_RECLASSIFICADO: { rotulo: "Motivo reclassificado" },
  SETUP_INICIADO: { rotulo: "Setup iniciado" },
  SETUP_FINALIZADO: { rotulo: "Setup finalizado" },
  MANUTENCAO_SOLICITADA: { rotulo: "Manutenção solicitada" },
  OBSERVACAO_REGISTRADA: { rotulo: "Observação registrada" },
  SUGESTAO_ACEITA: { rotulo: "Sugestão do ACMP aceita" },
  SUGESTAO_IGNORADA: { rotulo: "Sugestão do ACMP ignorada" },
  PRODUCAO_APONTADA: { rotulo: "Produção apontada" },
  REFUGO_APONTADO: { rotulo: "Refugo apontado" },
  RETRABALHO_APONTADO: { rotulo: "Retrabalho apontado" },
  ORDEM_ABERTA: { rotulo: "Ordem aberta" },
  ORDEM_FINALIZADA: { rotulo: "Ordem finalizada" },
  REGISTRO_CRIADO: { rotulo: "Registro criado" },
  REGISTRO_ALTERADO: { rotulo: "Registro alterado" },
  REGISTRO_EXCLUIDO: { rotulo: "Registro excluído" },
  EXCLUSAO_BLOQUEADA: { rotulo: "Exclusão bloqueada" },
  METAS_ALTERADAS: { rotulo: "Metas alteradas" },
  SIMULACAO_ALTERADA: { rotulo: "Simulação alterada" },
  ACMP_ALTERADO: { rotulo: "Assistente ACMP alterado" },
  DADOS_EXPORTADOS: { rotulo: "Dados exportados" },
  DADOS_IMPORTADOS: { rotulo: "Dados importados" },
  DEMO_RESTAURADA: { rotulo: "Demonstração restaurada" },
  MANUAL_ENVIADO: { rotulo: "Manual enviado" },
  MANUAL_REPROCESSADO: { rotulo: "Manual reprocessado" },
  MANUAL_EXCLUIDO: { rotulo: "Manual excluído" },
  CHAT_CONSULTADO: { rotulo: "Manual consultado" },
};

/** Perguntas prontas do posto — sem jargão, uma ação por toque. */
export const PERGUNTAS_PRONTAS: Record<string, string[]> = {
  geral: [
    "Como travar a máquina (LOTO) antes de abrir o painel?",
    "Quando eu chamo a manutenção?",
    "Posso apontar produção sem ordem aberta?",
    "Qual a diferença entre parada e microparada?",
  ],
  "MQ-1": [
    "Alarme F-41 de ferramenta: o que eu faço agora?",
    "Qual insert e torque usar depois da quebra?",
    "Como trocar do eixo 1020 para o 2040?",
    "Posso zerar o alarme e continuar produzindo?",
  ],
  "MQ-2": [
    "Alarme E-07 do inversor: o que fazer?",
    "Caiu a energia. Como religar o torno?",
    "Tem ruído no carro X. Paro ou continuo?",
    "Posso religar o E-07 duas vezes no turno?",
  ],
  "MQ-3": [
    "O dressing travou. O que eu faço?",
    "O sensor não vê a peça. Qual o passo?",
    "A peça saiu queimada. Como proceder?",
    "Posso cancelar o dressing para ganhar peça?",
  ],
  "MQ-4": [
    "O ciclo está lento. O que checar?",
    "Alarme FC-2 de fim de curso: o que fazer?",
    "Posso tampar a cortina de luz?",
    "A peça prendeu. Posso puxar com a mão?",
  ],
  "MQ-5": [
    "Acabou o kit do flange. Como apontar?",
    "Qual o torque dos parafusos do flange?",
    "O abastecimento atrasou. Qual motivo usar?",
    "Esqueci o carimbo do turno. E agora?",
  ],
  "MQ-6": [
    "A peça veio sem carimbo. O que faço?",
    "Não tem operador no posto. Qual motivo?",
    "Como apontar retrabalho certo?",
    "Posso usar a etiqueta da ordem de ontem?",
  ],
  "MQ-7": [
    "Como trocar o molde da 4500 para a 4800?",
    "Alarme TZ-1 de temperatura: o que fazer?",
    "Quando a primeira peça vale como produção?",
    "Posso trocar o molde sozinho?",
  ],
  "MQ-8": [
    "Como apontar refugo nesta injetora?",
    "Saiu rebarba. Isolo o lote?",
    "Quando o refugo passa de 2%?",
    "Posso retrabalhar carcaça com flash?",
  ],
};

export function perguntasDoPosto(maquinaId?: string) {
  const gerais = PERGUNTAS_PRONTAS.geral;
  if (maquinaId && PERGUNTAS_PRONTAS[maquinaId]) {
    return [...PERGUNTAS_PRONTAS[maquinaId], gerais[0], gerais[1]];
  }
  return gerais;
}

export const FILTROS_PADRAO = {
  periodo: "24h",
  data_inicio: "",
  data_fim: "",
  planta_id: "",
  area_id: "",
  linha_id: "",
  maquina_id: "",
  produto_id: "",
  ordem_id: "",
  turno_id: "",
  operador_id: "",
};

export const ROTULO_PERIODO: Record<string, string> = {
  turno: "Turno atual",
  hoje: "Hoje",
  "24h": "Últimas 24 horas",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  personalizado: "Personalizado",
};

export function janelaTurno(turnos: any[] | undefined, agora: number) {
  const d = new Date(agora);
  function parse(dia: Date, hhmm: string) {
    const [h, m] = String(hhmm || "06:00")
      .split(":")
      .map(Number);
    const x = new Date(dia);
    x.setHours(h || 0, m || 0, 0, 0);
    return x.getTime();
  }
  for (const t of turnos || []) {
    let ini = parse(d, t.inicio);
    let fim = parse(d, t.fim);
    if (fim <= ini) {
      if (agora >= ini) fim += 86400000;
      else ini -= 86400000;
    }
    if (agora >= ini && agora < fim) return { ...t, inicio: ini, fim };
  }
  const t = turnos?.[0];
  if (!t) return { nome: "—", inicio: agora - 8 * 3600000, fim: agora };
  return { ...t, inicio: parse(d, t.inicio), fim: parse(d, t.fim) };
}
