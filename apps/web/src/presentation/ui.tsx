import type { ReactNode } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { COR_GRADE, COR_TEXTO, ESTADOS, FILTROS_PADRAO, ORDEM_ESTADOS, PALETA, faixaOee, nomeDe } from "../domain/catalog";
import { pct } from "../domain/format";

export function CardKPI({
  rotulo,
  valor,
  detalhe,
  destaque,
  alerta,
  faixa,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: boolean;
  alerta?: boolean;
  faixa?: string;
}) {
  const cls = ["kpi", destaque ? "kpi--destaque" : "", alerta ? "kpi--alerta" : "", faixa ? `faixa--${faixa}` : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={cls}>
      <span className="kpi__rotulo">{rotulo}</span>
      <strong className="kpi__valor">{valor}</strong>
      {detalhe != null && detalhe !== "" ? <span className="kpi__detalhe">{detalhe}</span> : null}
    </article>
  );
}

export function Selo({ estadoId }: { estadoId?: string }) {
  const id = estadoId && ESTADOS[estadoId] ? estadoId : "SEM_ORDEM";
  const def = ESTADOS[id];
  return (
    <span className={`selo estado--${id} padrao--${def.padrao}`}>
      <span aria-hidden="true">{def.icone}</span> {def.rotulo}
    </span>
  );
}

export function Painel({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="painel">
      {acoes ? (
        <div className="painel__cabecalho">
          <h3 className="painel__titulo">{titulo}</h3>
          {acoes}
        </div>
      ) : (
        <h3 className="painel__titulo">{titulo}</h3>
      )}
      {children}
    </section>
  );
}

export function Tabela({
  cabecalhos,
  linhas,
  vazio = "Nenhum registro no período.",
}: {
  cabecalhos: string[];
  linhas: ReactNode[][];
  vazio?: string;
}) {
  if (!linhas.length) return <p className="vazio">{vazio}</p>;
  return (
    <div className="tabela-rolagem">
      <table className="tabela">
        <thead>
          <tr>
            {cabecalhos.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              {l.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BlocoGrafico({ titulo, altura = 260, children }: { titulo: string; altura?: number; children: ReactNode }) {
  return (
    <section className="painel">
      <h3 className="painel__titulo">{titulo}</h3>
      <div className="grafico" style={{ height: altura }}>
        {children}
      </div>
    </section>
  );
}

export function BarraProgresso({ valor, meta, rotulo }: { valor: number; meta: number; rotulo: string }) {
  const ratio = meta > 0 ? Math.min(1.5, valor / meta) : 0;
  const classe = ratio >= 1 ? "bom" : ratio >= 0.85 ? "atencao" : "critico";
  return (
    <div className="progresso" role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo}>
      <div className="progresso__trilha">
        <div className={`progresso__preenchimento faixa--${classe}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <span className="progresso__texto">
        {valor.toLocaleString("pt-BR")} / {meta.toLocaleString("pt-BR")} ({pct(meta > 0 ? valor / meta : null, 0)})
      </span>
    </div>
  );
}

export function LegendaEstados() {
  return (
    <ul className="legenda">
      {ORDEM_ESTADOS.map((id) => {
        const d = ESTADOS[id];
        return (
          <li key={id}>
            <span className={`legenda__amostra estado-fundo estado--${id} padrao--${d.padrao}`} />
            <span aria-hidden="true">{d.icone}</span> {d.rotulo}
          </li>
        );
      })}
    </ul>
  );
}

export function Timeline({
  segmentos,
  inicio,
  fim,
}: {
  segmentos: { estado: string; inicio: number; fim?: number | null }[];
  inicio: number;
  fim: number;
}) {
  const total = fim - inicio;
  if (total <= 0) return <p className="grafico-vazio">Sem eventos registrados neste período.</p>;
  const blocos = segmentos
    .map((seg) => {
      const a = Math.max(seg.inicio, inicio);
      const b = Math.min(seg.fim || fim, fim);
      if (b <= a) return null;
      const def = ESTADOS[seg.estado] || ESTADOS.PARADA_NAO_PLANEJADA;
      return { ...seg, a, b, def };
    })
    .filter(Boolean) as any[];
  if (!blocos.length) return <p className="grafico-vazio">Sem eventos registrados neste período.</p>;
  return (
    <div className="timeline">
      <div className="timeline__faixa" role="img" aria-label="Linha do tempo de estados da máquina no período">
        {blocos.map((b, i) => (
          <div
            key={i}
            className={`timeline__bloco estado-fundo estado--${b.estado} padrao--${b.def.padrao}`}
            style={{ left: `${((b.a - inicio) / total) * 100}%`, width: `${Math.max(0.25, ((b.b - b.a) / total) * 100)}%` }}
            title={b.def.rotulo}
          />
        ))}
      </div>
    </div>
  );
}

export function BotaoOp({
  icone,
  rotulo,
  tom = "secundario",
  disabled,
  onClick,
}: {
  icone: string;
  rotulo: string;
  tom?: "primario" | "secundario" | "alerta" | "perigo";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`botao-op botao-op--${tom}`} disabled={disabled} onClick={onClick}>
      <span className="botao-op__icone" aria-hidden="true">
        {icone}
      </span>
      <span className="botao-op__rotulo">{rotulo}</span>
    </button>
  );
}

const eixos = {
  x: { ticks: { color: COR_TEXTO, maxRotation: 0 }, grid: { color: COR_GRADE } },
  y: { ticks: { color: COR_TEXTO }, grid: { color: COR_GRADE }, beginAtZero: true },
};

export function optsGrafico(extra: any = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: COR_TEXTO } } },
    scales: extra.scales || eixos,
    ...extra,
  };
}

export function GraficoLinha({ labels, series, percentual }: { labels: string[]; series: { nome: string; valores: (number | null)[]; cor?: string }[]; percentual?: boolean }) {
  if (!labels.length) return <p className="grafico-vazio">Sem dados no período selecionado. Ajuste os filtros ou aguarde novos apontamentos.</p>;
  return (
    <Line
      data={{
        labels,
        datasets: series.map((s, i) => ({
          label: s.nome,
          data: s.valores.map((v) => v ?? 0),
          borderColor: s.cor || PALETA[i % PALETA.length],
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: 0,
        })),
      }}
      options={optsGrafico({
        scales: {
          ...eixos,
          y: { ...eixos.y, max: percentual ? 1 : undefined, ticks: { color: COR_TEXTO, callback: percentual ? (v: any) => pct(Number(v), 0) : undefined } },
        },
      })}
    />
  );
}

export function GraficoBarra({
  labels,
  series,
  horizontal,
  percentual,
  stacked,
}: {
  labels: string[];
  series: { nome: string; valores: (number | null)[]; cor?: string; cores?: string[] }[];
  horizontal?: boolean;
  percentual?: boolean;
  stacked?: boolean;
}) {
  if (!labels.length) return <p className="grafico-vazio">Sem dados no período selecionado. Ajuste os filtros ou aguarde novos apontamentos.</p>;
  return (
    <Bar
      data={{
        labels,
        datasets: series.map((s, i) => ({
          label: s.nome,
          data: s.valores.map((v) => v ?? 0),
          backgroundColor: s.cores || s.cor || PALETA[i % PALETA.length],
        })),
      }}
      options={optsGrafico({
        indexAxis: horizontal ? "y" : "x",
        scales: {
          x: { ...eixos.x, stacked, ticks: { color: COR_TEXTO } },
          y: {
            ...eixos.y,
            stacked,
            max: percentual ? 1 : undefined,
            ticks: { color: COR_TEXTO, callback: percentual ? (v: any) => pct(Number(v), 0) : undefined },
          },
        },
      })}
    />
  );
}

export function GraficoRosca({ labels, valores }: { labels: string[]; valores: number[] }) {
  if (!labels.length) return <p className="grafico-vazio">Sem dados no período selecionado. Ajuste os filtros ou aguarde novos apontamentos.</p>;
  return (
    <Doughnut
      data={{
        labels,
        datasets: [{ data: valores, backgroundColor: labels.map((_, i) => PALETA[i % PALETA.length]) }],
      }}
      options={optsGrafico({ scales: undefined })}
    />
  );
}

export function CampoFiltro({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="filtros__campo">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export function SelectLista({
  id,
  value,
  onChange,
  lista,
  vazio,
  campo = "nome",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  lista: any[];
  vazio?: string;
  campo?: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {vazio ? <option value="">{vazio}</option> : null}
      {lista.map((i) => (
        <option key={i.id} value={i.id}>
          {i[campo]}
        </option>
      ))}
    </select>
  );
}

export function BarraFiltros({
  ds,
  f,
  setF,
  extras,
}: {
  ds: any;
  f: any;
  setF: (x: any) => void;
  extras?: ReactNode;
}) {
  const areas = (ds?.areas || []).filter((a: any) => !f.planta_id || a.planta_id === f.planta_id);
  const linhas = (ds?.linhas || []).filter((l: any) => {
    if (f.area_id) return l.area_id === f.area_id;
    if (f.planta_id) {
      const a = (ds?.areas || []).find((x: any) => x.id === l.area_id);
      return a && a.planta_id === f.planta_id;
    }
    return true;
  });
  const maquinas = (ds?.maquinas || []).filter((m: any) => {
    if (f.linha_id) return m.linha_id === f.linha_id;
    return linhas.some((l: any) => l.id === m.linha_id);
  });
  function ch(k: string, v: string) {
    const n = { ...f, [k]: v };
    if (k === "planta_id") {
      n.area_id = "";
      n.linha_id = "";
      n.maquina_id = "";
    }
    if (k === "area_id") {
      n.linha_id = "";
      n.maquina_id = "";
    }
    if (k === "linha_id") n.maquina_id = "";
    setF(n);
  }
  return (
    <form className="filtros" id="form-filtros" onSubmit={(e) => e.preventDefault()}>
      <CampoFiltro id="f-periodo" label="Período">
        <select id="f-periodo" value={f.periodo} onChange={(e) => ch("periodo", e.target.value)}>
          <option value="turno">Turno atual</option>
          <option value="hoje">Hoje</option>
          <option value="24h">Últimas 24 horas</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="personalizado">Personalizado</option>
        </select>
      </CampoFiltro>
      {f.periodo === "personalizado" ? (
        <>
          <CampoFiltro id="f-ini" label="De">
            <input id="f-ini" type="datetime-local" value={f.data_inicio || ""} onChange={(e) => ch("data_inicio", e.target.value)} />
          </CampoFiltro>
          <CampoFiltro id="f-fim" label="Até">
            <input id="f-fim" type="datetime-local" value={f.data_fim || ""} onChange={(e) => ch("data_fim", e.target.value)} />
          </CampoFiltro>
        </>
      ) : null}
      <CampoFiltro id="f-planta" label="Planta">
        <SelectLista id="f-planta" value={f.planta_id || ""} onChange={(v) => ch("planta_id", v)} lista={ds?.plantas || []} vazio="Todas" />
      </CampoFiltro>
      <CampoFiltro id="f-area" label="Área">
        <SelectLista id="f-area" value={f.area_id || ""} onChange={(v) => ch("area_id", v)} lista={areas} vazio="Todas" />
      </CampoFiltro>
      <CampoFiltro id="f-linha" label="Linha">
        <SelectLista id="f-linha" value={f.linha_id || ""} onChange={(v) => ch("linha_id", v)} lista={linhas} vazio="Todas" />
      </CampoFiltro>
      <CampoFiltro id="f-maquina" label="Máquina">
        <SelectLista id="f-maquina" value={f.maquina_id || ""} onChange={(v) => ch("maquina_id", v)} lista={maquinas} vazio="Todas" />
      </CampoFiltro>
      <CampoFiltro id="f-produto" label="Produto">
        <SelectLista id="f-produto" value={f.produto_id || ""} onChange={(v) => ch("produto_id", v)} lista={ds?.produtos || []} vazio="Todos" />
      </CampoFiltro>
      <CampoFiltro id="f-ordem" label="Ordem">
        <SelectLista
          id="f-ordem"
          value={f.ordem_id || ""}
          onChange={(v) => ch("ordem_id", v)}
          lista={[...(ds?.ordens || [])].slice(-60).reverse()}
          vazio="Todas"
          campo="codigo"
        />
      </CampoFiltro>
      <CampoFiltro id="f-turno" label="Turno">
        <SelectLista id="f-turno" value={f.turno_id || ""} onChange={(v) => ch("turno_id", v)} lista={ds?.turnos || []} vazio="Todos" />
      </CampoFiltro>
      <CampoFiltro id="f-operador" label="Operador">
        <SelectLista id="f-operador" value={f.operador_id || ""} onChange={(v) => ch("operador_id", v)} lista={ds?.operadores || []} vazio="Todos" />
      </CampoFiltro>
      {extras}
      <div className="filtros__acoes">
        <button type="button" className="botao botao--secundario" onClick={() => setF({ ...FILTROS_PADRAO })}>
          Limpar
        </button>
      </div>
    </form>
  );
}

export function ModalShell({ titulo, children, onClose, rodape }: { titulo: string; children: ReactNode; onClose: () => void; rodape?: ReactNode }) {
  return (
    <div className="modal-fundo" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
        <div className="modal__cabecalho">
          <h2 id="modal-titulo">{titulo}</h2>
          <button type="button" className="botao botao--secundario" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal__corpo">{children}</div>
        {rodape ? <div className="modal__rodape">{rodape}</div> : null}
      </div>
    </div>
  );
}

export { nomeDe, faixaOee };
