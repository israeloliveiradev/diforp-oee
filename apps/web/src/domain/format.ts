import { janelaTurno } from "./catalog";

export function pct(v: number | null | undefined, casas = 1) {
  if (v == null) return "—";
  return (v * 100).toFixed(casas).replace(".", ",") + "%";
}

export function num(v: number | null | undefined, casas = 0) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function dur(seg: number | null | undefined) {
  if (seg == null || !Number.isFinite(seg)) return "—";
  const s = Math.max(0, Math.round(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}min ${String(r).padStart(2, "0")}s`;
  return `${r}s`;
}

export function cron(seg: number) {
  const s = Math.max(0, Math.round(seg || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function dataHora(ts?: number | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function hora(ts?: number | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function qs(f: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  return p.toString();
}

export function paramsIndicadores(f: Record<string, any>, ds?: any, agora = Date.now()) {
  const base: Record<string, string | number | undefined> = {
    planta_id: f.planta_id,
    area_id: f.area_id,
    linha_id: f.linha_id,
    maquina_id: f.maquina_id,
    produto_id: f.produto_id,
    ordem_id: f.ordem_id,
    turno_id: f.turno_id,
    operador_id: f.operador_id,
  };
  if (f.periodo === "personalizado" && f.data_inicio && f.data_fim) {
    base.data_inicio = new Date(f.data_inicio).getTime();
    base.data_fim = new Date(f.data_fim).getTime();
    return qs(base);
  }
  if (f.periodo === "hoje") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    base.data_inicio = d.getTime();
    base.data_fim = agora;
    return qs(base);
  }
  if (f.periodo === "turno") {
    const t = janelaTurno(ds?.turnos, agora);
    base.data_inicio = t.inicio;
    base.data_fim = agora;
    return qs(base);
  }
  base.periodo = f.periodo || "24h";
  return qs(base);
}
