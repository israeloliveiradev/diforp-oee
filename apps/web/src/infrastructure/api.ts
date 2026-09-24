const TOKEN_KEY = "oee.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

const FILA_KEY = "oee.fila";

type ItemFila = { id: string; path: string; body: string };

function lerFila(): ItemFila[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(FILA_KEY) || "[]");
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

async function drenarFila() {
  const fila = lerFila();
  if (!fila.length) return;
  const restam: ItemFila[] = [];
  for (const item of fila) {
    try {
      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.set("Idempotency-Key", item.id);
      const tok = getToken();
      if (tok) headers.set("Authorization", `Bearer ${tok}`);
      const res = await fetch(`/api${item.path}`, { method: "POST", headers, body: item.body });
      if (!res.ok && res.status !== 400) restam.push(item);
    } catch {
      restam.push(item);
      break;
    }
  }
  localStorage.setItem(FILA_KEY, JSON.stringify(restam));
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const tok = getToken();
  if (tok) headers.set("Authorization", `Bearer ${tok}`);
  const posto = (init.method || "GET") === "POST" && path.startsWith("/operacao/");
  if (posto && !headers.has("Idempotency-Key")) headers.set("Idempotency-Key", crypto.randomUUID());
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch (err) {
    if (posto && typeof init.body === "string") {
      const fila = lerFila();
      fila.push({ id: headers.get("Idempotency-Key") || crypto.randomUUID(), path, body: init.body });
      localStorage.setItem(FILA_KEY, JSON.stringify(fila));
      return { offline: true } as T;
    }
    throw err;
  }
  if (posto) void drenarFila();
  if (res.status === 401) {
    setToken(null);
    if (!path.startsWith("/auth/login")) window.location.hash = "#/login";
    throw new Error("Não autenticado");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.detail || JSON.stringify(j);
    } catch {
      /* ignore */
    }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/csv")) return (await res.text()) as T;
  return res.json();
}

async function downloadAuth(path: string, nome: string) {
  const tok = getToken();
  const res = await fetch(`/api${path}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
  if (!res.ok) throw new Error("Falha no download");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const api = {
  login: (login: string, senha: string) =>
    req<{ access_token: string; papel: string; nome: string; planta_id?: string | null }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, senha }),
    }),
  assumirPosto: (body: { maquina_id: string; matricula: string }) => req("/operacao/operador", { method: "POST", body: JSON.stringify(body) }),
  fecharTurno: (body: { planta_id: string; nota?: string }) => req("/turnos/fechar", { method: "POST", body: JSON.stringify(body) }),
  me: () => req("/auth/me"),
  catalogo: () => req<any>("/catalogo"),
  dataset: (filtro?: { maquina_id?: string; desde?: number }) => {
    const p = new URLSearchParams();
    if (filtro?.maquina_id) p.set("maquina_id", filtro.maquina_id);
    if (filtro?.desde) p.set("desde", String(filtro.desde));
    const q = p.toString();
    return req<any>(`/dataset${q ? `?${q}` : ""}`);
  },
  indicadores: (q: string) => req<any>(`/indicadores?${q}`),
  alertas: () => req<any[]>("/alertas"),
  insights: (q: string) => req<any>(`/insights?${q}`),
  paradas: (maq?: string) => req<any[]>(`/eventos/paradas${maq ? `?maquina_id=${maq}` : ""}`),
  producao: (maq?: string) => req<any[]>(`/eventos/producao${maq ? `?maquina_id=${maq}` : ""}`),
  cadastros: (ent: string) => req<any[]>(`/cadastros/${ent}`),
  criarCadastro: (ent: string, dados: any) => req(`/cadastros/${ent}`, { method: "POST", body: JSON.stringify(dados) }),
  alterarCadastro: (ent: string, id: string, dados: any) => req(`/cadastros/${ent}/${id}`, { method: "PUT", body: JSON.stringify(dados) }),
  excluirCadastro: (ent: string, id: string) => req(`/cadastros/${ent}/${id}`, { method: "DELETE" }),
  estado: (body: any) => req("/operacao/estado", { method: "POST", body: JSON.stringify(body) }),
  parada: (body: any) => req("/operacao/paradas", { method: "POST", body: JSON.stringify(body) }),
  apontar: (body: any) => req("/operacao/producao", { method: "POST", body: JSON.stringify(body) }),
  reclassificar: (body: any) => req("/operacao/reclassificar", { method: "POST", body: JSON.stringify(body) }),
  abrirOrdem: (body: any) => req("/operacao/ordens", { method: "POST", body: JSON.stringify(body) }),
  finalizarOrdem: (maq: string) => req(`/operacao/ordens/${maq}/finalizar`, { method: "POST" }),
  observacao: (body: any) => req("/operacao/observacoes", { method: "POST", body: JSON.stringify(body) }),
  config: () => req<any>("/config"),
  salvarConfig: (body: any) => req("/config", { method: "PUT", body: JSON.stringify(body) }),
  auditoria: (q: string) => req<any>(`/auditoria?${q}`),
  auditoriaDetalhe: (id: string) => req<any>(`/auditoria/${id}`),
  sugestoes: (maq: string, dur?: number) => req<any[]>(`/acmp/sugestoes?maquina_id=${maq}${dur != null ? `&duracao_seg=${dur}` : ""}`),
  acmpAvaliacao: () => req<any>("/acmp/avaliacao"),
  acmpDesfecho: (body: any) => req("/acmp/desfecho", { method: "POST", body: JSON.stringify(body) }),
  acmpTreinar: () => req("/acmp/treinar", { method: "POST" }),
  manuais: () => req<any[]>("/manuais"),
  uploadManual: (fd: FormData) => req("/manuais", { method: "POST", body: fd }),
  reprocessarManual: (id: string) => req(`/manuais/${id}/reprocessar`, { method: "POST" }),
  excluirManual: (id: string) => req(`/manuais/${id}`, { method: "DELETE" }),
  chat: (body: any) => req<any>("/chat/consultar", { method: "POST", body: JSON.stringify(body) }),
  demo: (dias = 7) => req(`/dataset/demo?dias=${dias}`, { method: "POST" }),
  tick: () => req("/simulacao/tick", { method: "POST" }),
  exportar: () => downloadAuth("/dataset/export", "oee-dataset.json"),
  csv: (tipo: string) => downloadAuth(`/dataset/csv/${tipo}`, `oee-${tipo}.csv`),
  importar: (file: File) => {
    const fd = new FormData();
    fd.append("arquivo", file);
    return req("/dataset/import", { method: "POST", body: fd });
  },
};
