import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../infrastructure/api";
import {
  AUDIT_ACOES,
  AUDIT_CATEGORIAS,
  AUDIT_ORIGENS,
  CAUSAS_REFUGO,
  CRITICIDADE,
  ESTADOS,
  FILTROS_PADRAO,
  ROTULO_PERIODO,
  caminhoMaquina,
  faixaOee,
  janelaTurno,
  nomeDe,
  perguntasDoPosto,
} from "../domain/catalog";
import { cron, dataHora, dur, hora, num, pct, paramsIndicadores, qs } from "../domain/format";
import {
  BarraFiltros,
  BarraProgresso,
  BlocoGrafico,
  BotaoOp,
  CampoFiltro,
  CardKPI,
  GraficoBarra,
  GraficoLinha,
  GraficoRosca,
  LegendaEstados,
  ModalShell,
  Painel,
  SelectLista,
  Selo,
  Tabela,
  Timeline,
} from "./ui";

type Notify = (msg: string, tipo?: string) => void;

const PERFIS = ["BOM", "BAIXA_DISPONIBILIDADE", "BAIXA_PERFORMANCE", "QUALIDADE", "EXCESSO_SETUP", "MICROPARADAS", "AGUARDA_MATERIAL"];

function useGestao() {
  const [f, setF] = useState({ ...FILTROS_PADRAO, planta_id: localStorage.getItem("oee.planta") || "" });
  const [plantaPronta, setPlantaPronta] = useState(false);
  const ds = useQuery({ queryKey: ["ds"], queryFn: api.dataset });
  useEffect(() => {
    if (f.planta_id) localStorage.setItem("oee.planta", f.planta_id);
  }, [f.planta_id]);
  useEffect(() => {
    const plantas = ds.data?.plantas || [];
    if (plantaPronta || !plantas.length) return;
    const salva = localStorage.getItem("oee.planta") || "";
    const id = plantas.some((p: any) => p.id === salva) ? salva : plantas[0].id;
    setF((atual) => ({ ...atual, planta_id: id }));
    setPlantaPronta(true);
  }, [ds.data, plantaPronta]);
  const q = paramsIndicadores(f, ds.data);
  const dash = useQuery({ queryKey: ["ind", q], queryFn: () => api.indicadores(q), enabled: !!ds.data });
  return { f, setF, ds, q, dash };
}

function cicloTxt(v?: number | null) {
  if (v == null || !Number.isFinite(Number(v)) || Number(v) === 0) return "—";
  return Number(v).toFixed(1).replace(".", ",") + " s";
}

function corFaixa(faixa?: string) {
  if (faixa === "bom") return "#6FA383";
  if (faixa === "atencao") return "#D97B29";
  return "#DC6C57";
}

function rotuloPonto(ts: number, periodo?: string) {
  if (periodo === "7d" || periodo === "30d") return new Date(ts).toLocaleDateString("pt-BR");
  return hora(ts);
}

function fmtAud(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function abrirOperacao(id: string, nav: (to: string) => void) {
  localStorage.setItem("oee.maq", id);
  nav("/operacao");
}

/* ------------------------------------------------------------------ */
/* Modais do operador                                                 */
/* ------------------------------------------------------------------ */

function ModalMotivo({
  titulo,
  motivos,
  sugestoes,
  filtroCategoria,
  motivoInicial,
  onOk,
  onClose,
}: {
  titulo: string;
  motivos: any[];
  sugestoes: any[];
  filtroCategoria?: string;
  motivoInicial?: string;
  onOk: (motivoId: string, comentario: string, sugestaoPosicao: number | null) => void;
  onClose: () => void;
}) {
  const filtrados = motivos.filter((m) => !filtroCategoria || m.categoria === filtroCategoria);
  const categorias = Array.from(new Set(filtrados.map((m) => m.categoria)));
  const inicial = motivos.find((m) => m.id === motivoInicial);
  const [cat, setCat] = useState(inicial?.categoria || categorias[0] || "");
  const [motivoId, setMotivoId] = useState(motivoInicial || "");
  const [comentario, setComentario] = useState("");
  const [posicao, setPosicao] = useState<number | null>(null);
  const [erro, setErro] = useState(false);

  function escolherSugestao(s: any) {
    setMotivoId(s.motivo_id);
    setPosicao(s.posicao ?? null);
    setErro(false);
  }
  function escolherMotivo(id: string) {
    setMotivoId(id);
    setPosicao(null);
    setErro(false);
  }

  return (
    <ModalShell
      titulo={titulo}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="botao botao--secundario" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="botao botao--primario"
            onClick={() => {
              if (!motivoId) {
                setErro(true);
                return;
              }
              onOk(motivoId, comentario.trim(), posicao);
            }}
          >
            Confirmar
          </button>
        </>
      }
    >
      <div className="motivos">
        {sugestoes.length > 0 && (
          <div className="acmp" role="group" aria-label="Sugestões de motivo">
            <p className="acmp__titulo">
              Sugestões do ACMP <span className="acmp__nota">apoio à classificação — a decisão é sua</span>
            </p>
            {sugestoes.map((s) => {
              const m = motivos.find((x) => x.id === s.motivo_id);
              if (!m) return null;
              const evid = (s.evidencias || s.shap || [])
                .map((e: any) => e.frase || `${e.rotulo}: ${e.valor ?? pct(e.proporcao, 0)}${e.suporte != null ? ` de ${e.suporte} paradas` : ""}`)
                .join(" · ");
              return (
                <button
                  key={s.motivo_id}
                  type="button"
                  className={`acmp__opcao${motivoId === s.motivo_id && posicao != null ? " acmp__opcao--ativa" : ""}`}
                  onClick={() => escolherSugestao(s)}
                >
                  <span className="acmp__prob">{pct(s.probabilidade, 0)}</span>
                  <span className="acmp__nome">
                    {m.nome}
                    <small className="acmp__categoria">{m.categoria}</small>
                  </span>
                  {evid ? <span className="acmp__evidencia">{evid}</span> : null}
                </button>
              );
            })}
          </div>
        )}
        <div className="motivos__categorias" role="group" aria-label="Categorias de motivo">
          {categorias.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip${c === cat ? " chip--ativo" : ""}`}
              onClick={() => {
                setCat(c);
                setMotivoId("");
                setPosicao(null);
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="motivos__lista" role="group" aria-label="Motivos">
          {filtrados
            .filter((m) => m.categoria === cat)
            .map((m) => (
              <button
                key={m.id}
                type="button"
                className={`motivo${motivoId === m.id && posicao == null ? " motivo--ativo" : ""}`}
                onClick={() => escolherMotivo(m.id)}
              >
                {m.nome}
                {m.planejada ? <span className="etiqueta">planejada</span> : null}
              </button>
            ))}
        </div>
        <label className="rotulo-campo" htmlFor="motivo-comentario">
          Comentário (opcional)
        </label>
        <textarea
          id="motivo-comentario"
          rows={2}
          placeholder="Ex.: aguardando eletricista"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
        {erro ? (
          <p className="erro-campo" id="motivo-erro">
            Selecione um motivo para continuar.
          </p>
        ) : null}
      </div>
    </ModalShell>
  );
}

function ModalQtd({
  titulo,
  pedirCausa,
  onOk,
  onClose,
}: {
  titulo: string;
  pedirCausa?: boolean;
  onOk: (qtd: number, causa?: string | null, destas?: boolean) => void;
  onClose: () => void;
}) {
  const [valor, setValor] = useState(0);
  const [causa, setCausa] = useState(CAUSAS_REFUGO[0]);
  const [destas, setDestas] = useState(false);
  const [erro, setErro] = useState("");

  function aplicar(n: number) {
    setValor(Math.max(0, n));
    setErro("");
  }

  return (
    <ModalShell
      titulo={titulo}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="botao botao--secundario" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="botao botao--primario"
            onClick={() => {
              if (valor <= 0) {
                setErro("Informe uma quantidade maior que zero.");
                return;
              }
              onOk(valor, pedirCausa ? causa : null, pedirCausa ? destas : false);
            }}
          >
            Registrar
          </button>
        </>
      }
    >
      <div className="quantidade">
        <output className="quantidade__valor" id="qtd-valor">
          {valor}
        </output>
        <div className="quantidade__atalhos">
          {[1, 5, 10, 25, 50, 100].map((n) => (
            <button key={n} type="button" className="botao botao--secundario" onClick={() => aplicar(valor + n)}>
              +{n}
            </button>
          ))}
          <button type="button" className="botao botao--secundario" onClick={() => aplicar(valor - 1)}>
            −1
          </button>
          <button type="button" className="botao botao--secundario" onClick={() => aplicar(0)}>
            Zerar
          </button>
        </div>
        <label className="rotulo-campo" htmlFor="qtd-manual">
          Ou digite a quantidade
        </label>
        <input
          type="number"
          id="qtd-manual"
          min={0}
          step={1}
          inputMode="numeric"
          value={valor}
          onChange={(e) => aplicar(Math.max(0, parseInt(e.target.value, 10) || 0))}
        />
        {pedirCausa ? (
          <>
            <label className="rotulo-campo" htmlFor="qtd-causa">
              Causa
            </label>
            <select id="qtd-causa" value={causa} onChange={(e) => setCausa(e.target.value)}>
              {CAUSAS_REFUGO.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label className="rotulo-campo" htmlFor="qtd-destas">
              <input id="qtd-destas" type="checkbox" checked={destas} onChange={(e) => setDestas(e.target.checked)} /> Destas peças já estavam no produzido
            </label>
            {destas ? <p className="nota">Não soma de novo em Produzido. Só move de aprovado para rejeitado.</p> : null}
          </>
        ) : null}
        {erro ? <p className="erro-campo">{erro}</p> : null}
      </div>
    </ModalShell>
  );
}

function ModalOrdem({
  produtos,
  operadores,
  turnos,
  onOk,
  onClose,
}: {
  produtos: any[];
  operadores: any[];
  turnos: any[];
  onOk: (dados: { produto_id: string; operador_id?: string; ciclo_ideal_seg: number; meta_qtd: number }) => void;
  onClose: () => void;
}) {
  const turno = janelaTurno(turnos, Date.now());
  const duracaoTurnoSeg = Math.max(1, ((turno.fim || Date.now()) - (turno.inicio || Date.now())) / 1000);
  const ops = operadores.filter((o) => !turno.id || o.turno_id === turno.id);
  const listaOps = ops.length ? ops : operadores;
  const [produtoId, setProdutoId] = useState(produtos[0]?.id || "");
  const produto = produtos.find((p) => p.id === produtoId) || produtos[0];
  const [ciclo, setCiclo] = useState(Number(produto?.ciclo_ideal_seg || 60));
  const [meta, setMeta] = useState(Math.round((duracaoTurnoSeg * 0.85) / (produto?.ciclo_ideal_seg || 60)));
  const [operadorId, setOperadorId] = useState(listaOps[0]?.id || "");
  const [erro, setErro] = useState("");

  function trocarProduto(id: string) {
    setProdutoId(id);
    const p = produtos.find((x) => x.id === id);
    const c = Number(p?.ciclo_ideal_seg || 60);
    setCiclo(c);
    setMeta(Math.round((duracaoTurnoSeg * 0.85) / c));
  }

  return (
    <ModalShell
      titulo="Iniciar ordem de produção"
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="botao botao--secundario" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="botao botao--primario"
            onClick={() => {
              if (!produtoId) {
                setErro("Selecione um produto.");
                return;
              }
              if (!meta || meta <= 0) {
                setErro("A meta deve ser maior que zero.");
                return;
              }
              if (!ciclo || ciclo <= 0) {
                setErro("O ciclo ideal deve ser maior que zero.");
                return;
              }
              onOk({ produto_id: produtoId, operador_id: operadorId || undefined, ciclo_ideal_seg: ciclo, meta_qtd: meta });
            }}
          >
            Iniciar ordem
          </button>
        </>
      }
    >
      <div className="formulario">
        <label htmlFor="o-produto">Produto</label>
        <select id="o-produto" value={produtoId} onChange={(e) => trocarProduto(e.target.value)}>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <label htmlFor="o-operador">Operador</label>
        <select id="o-operador" value={operadorId} onChange={(e) => setOperadorId(e.target.value)}>
          {listaOps.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <label htmlFor="o-ciclo">Ciclo ideal (s/peça)</label>
        <input id="o-ciclo" type="number" min={0.1} step={0.1} value={ciclo} onChange={(e) => setCiclo(Number(e.target.value))} />
        <label htmlFor="o-meta">Meta do turno (peças)</label>
        <input id="o-meta" type="number" min={1} step={1} value={meta} onChange={(e) => setMeta(Number(e.target.value))} />
        {erro ? <p className="erro-campo">{erro}</p> : null}
      </div>
    </ModalShell>
  );
}

function ModalTexto({
  titulo,
  onOk,
  onClose,
}: {
  titulo: string;
  onOk: (texto: string) => void;
  onClose: () => void;
}) {
  const [t, setT] = useState("");
  const [erro, setErro] = useState(false);
  return (
    <ModalShell
      titulo={titulo}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="botao botao--secundario" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="botao botao--primario"
            onClick={() => {
              if (!t.trim()) {
                setErro(true);
                return;
              }
              onOk(t.trim());
            }}
          >
            Salvar
          </button>
        </>
      }
    >
      <div className="formulario">
        <label htmlFor="obs-texto">Observação</label>
        <textarea id="obs-texto" rows={4} placeholder="Registro livre para o supervisor" value={t} onChange={(e) => setT(e.target.value)} />
        {erro ? <p className="erro-campo">Escreva a observação antes de salvar.</p> : null}
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/* Visão Geral                                                        */
/* ------------------------------------------------------------------ */

function cienciaAtiva() {
  const bruto = JSON.parse(localStorage.getItem("oee.ciencia") || "{}");
  const agora = Date.now();
  return Object.fromEntries(Object.entries(bruto).filter(([, ate]) => Number(ate) > agora));
}

export function VisaoGeral() {
  const nav = useNavigate();
  const { f, setF, ds, dash } = useGestao();
  const [ciencia, setCiencia] = useState<Record<string, number>>(() => cienciaAtiva());
  const alertas = useQuery({ queryKey: ["alertas"], queryFn: api.alertas, refetchInterval: 20000 });
  const qTurno = paramsIndicadores({ ...f, periodo: "turno" }, ds.data);
  const dashTurno = useQuery({
    queryKey: ["ind", "andon", qTurno],
    queryFn: () => api.indicadores(qTurno),
    enabled: !!ds.data,
    refetchInterval: 20000,
  });
  const data = dash.data;
  const ind = data?.indicadores;
  const meta = ds.data?.config?.meta_oee;
  const serie = data?.serie || [];
  const porMaq = [...(data?.por_maquina || [])].sort((a: any, b: any) => (b.indicadores?.oee || 0) - (a.indicadores?.oee || 0));
  const porTurno = Object.fromEntries((dashTurno.data?.por_maquina || []).map((g: any) => [g.chave, g]));
  const visiveis = (alertas.data || []).filter((a: any) => !ciencia[`${a.tipo}:${a.maquina_id}`]);

  return (
    <>
      <BarraFiltros ds={ds.data || {}} f={f} setF={setF} />
      {visiveis.length ? (
        <section className="painel painel-alertas" aria-label="Para agir agora">
          <h2 className="painel__titulo">Para agir agora</h2>
          <div className="alertas-grade">
            {visiveis.map((a: any) => (
              <article key={`${a.tipo}-${a.maquina_id}`} className={`alerta-card alerta-card--${a.criticidade === "critico" ? "critico" : "atencao"}`}>
                <button type="button" className="alerta-card__abrir" onClick={() => abrirOperacao(a.maquina_id, nav)}>
                  <span className="alerta-card__selo">{a.criticidade === "critico" ? "Crítico" : "Atenção"}</span>
                  <span className="alerta-card__titulo">{a.titulo}</span>
                  <span className="alerta-card__acao">{a.acao}</span>
                </button>
                <button
                  type="button"
                  className="botao botao--pequeno"
                  onClick={() => {
                    const prox = { ...cienciaAtiva(), [`${a.tipo}:${a.maquina_id}`]: Date.now() + 3600000 };
                    localStorage.setItem("oee.ciencia", JSON.stringify(prox));
                    setCiencia(prox);
                  }}
                >
                  Vi, ocultar 1 h
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {f.planta_id ? (
        <p className="nota">
          <button
            type="button"
            className="botao botao--secundario"
            onClick={async () => {
              try {
                await api.fecharTurno({ planta_id: f.planta_id });
                window.alert("Turno fechado. Apontamento novo neste intervalo pede a gestão.");
              } catch (e: any) {
                window.alert(e.message || "Não foi possível fechar o turno.");
              }
            }}
          >
            Fechar o turno desta planta
          </button>
        </p>
      ) : null}
      {dash.isError ? <p className="erro-campo">Erro ao carregar indicadores.</p> : null}
      {dash.isLoading || !ind ? (
        <p className="vazio">Carregando indicadores...</p>
      ) : (
        <section className="kpis">
          <CardKPI rotulo="OEE" valor={pct(ind.oee)} destaque faixa={ind.faixa || faixaOee(ind.oee, meta)} detalhe={`Meta ${pct(meta, 0)}`} />
          <CardKPI rotulo="Disponibilidade" valor={pct(ind.disponibilidade)} />
          <CardKPI rotulo="Performance" valor={pct(ind.performance)} />
          <CardKPI rotulo="Qualidade" valor={pct(ind.qualidade)} />
          <CardKPI rotulo="Produção total" valor={num(ind.producao_total)} />
          <CardKPI rotulo="Produção aprovada" valor={num(ind.producao_aprovada)} />
          <CardKPI rotulo="Rejeitos" valor={num(ind.refugo)} />
          <CardKPI rotulo="Tempo produtivo" valor={dur(ind.tempo_operacional_seg)} />
          <CardKPI
            rotulo="Tempo parado"
            valor={dur((ind.parada_nao_planejada_seg || 0) + (ind.parada_planejada_seg || 0))}
            detalhe={`Não planejado: ${dur(ind.parada_nao_planejada_seg)}`}
          />
          <CardKPI rotulo="Quantidade de paradas" valor={num(ind.qtd_paradas)} />
          <CardKPI rotulo="MTBF" valor={dur(ind.mtbf_seg)} />
          <CardKPI rotulo="MTTR" valor={dur(ind.mttr_seg)} />
        </section>
      )}
      {ind?.anomalias?.length ? (
        <div className="alerta-inconsistencia" role="alert">
          <strong>Verificar apontamentos.</strong> {ind.anomalias.map((a: any) => a.mensagem).join(" ")}
        </div>
      ) : null}
      {ind ? (
        <Painel titulo="Seis grandes perdas">
          <div className="op-producao">
            {seisPerdas(ind).map(([rotulo, valor]) => (
              <CardKPI key={rotulo} rotulo={rotulo} valor={valor} />
            ))}
          </div>
          <p className="nota">Parada, setup, microparada e ciclo lento saem do tempo. Refugo e retrabalho saem das peças. É o recorte do período filtrado.</p>
        </Painel>
      ) : null}
      <div className="grade-2">
        <BlocoGrafico titulo={`Tendência do OEE — ${ROTULO_PERIODO[f.periodo] || f.periodo}`}>
          <GraficoLinha
            percentual
            labels={serie.map((p: any) => rotuloPonto(p.inicio, f.periodo))}
            series={[
              { nome: "OEE", valores: serie.map((p: any) => p.indicadores?.oee), cor: "#D97B29" },
              { nome: "Disponibilidade", valores: serie.map((p: any) => p.indicadores?.disponibilidade), cor: "#9FB6BC" },
              { nome: "Performance", valores: serie.map((p: any) => p.indicadores?.performance), cor: "#6FA383" },
              { nome: "Qualidade", valores: serie.map((p: any) => p.indicadores?.qualidade), cor: "#6E9FB5" },
            ]}
          />
        </BlocoGrafico>
        <BlocoGrafico titulo="OEE por máquina">
          <GraficoBarra
            percentual
            labels={porMaq.map((g: any) => g.rotulo)}
            series={[
              {
                nome: "OEE",
                valores: porMaq.map((g: any) => g.indicadores?.oee),
                cores: porMaq.map((g: any) => corFaixa(faixaOee(g.indicadores?.oee, meta))),
              },
            ]}
          />
        </BlocoGrafico>
      </div>
      <Painel titulo="Estado das máquinas agora">
        <div className="andon">
          {(ds.data?.maquinas || []).filter((m: any) => !f.planta_id || !dashTurno.data || porTurno[m.id]).map((m: any) => {
            const def = ESTADOS[m.estado_atual] || ESTADOS.SEM_ORDEM;
            const g = porTurno[m.id];
            const oee = g?.indicadores?.oee;
            const turnoAgora = janelaTurno(ds.data?.turnos, Date.now());
            const desde = Math.max(Number(m.estado_desde) || turnoAgora.inicio, turnoAgora.inicio || 0);
            return (
              <button
                key={m.id}
                type="button"
                className={`andon__card estado-borda estado--${m.estado_atual}`}
                onClick={() => abrirOperacao(m.id, nav)}
              >
                <span className="andon__nome">{m.nome}</span>
                <span className={`andon__estado padrao--${def.padrao} estado-fundo estado--${m.estado_atual}`}>
                  {def.icone} {def.rotulo}
                </span>
                <span className="andon__tempo">{dur((Date.now() - desde) / 1000)}</span>
                <span className={`andon__oee faixa--${faixaOee(oee, meta)}`}>OEE do turno {pct(oee, 0)}</span>
              </button>
            );
          })}
        </div>
      </Painel>
    </>
  );
}

function somaProducaoOrdem(eventos: any[] | undefined, ordemId?: string) {
  let total = 0;
  let refugo = 0;
  let retrabalho = 0;
  if (!ordemId) return { total, refugo, retrabalho, aprovado: 0 };
  for (const e of eventos || []) {
    if (e.ordem_id !== ordemId) continue;
    total += Number(e.qtd_total) || 0;
    refugo += Number(e.qtd_refugo) || 0;
    retrabalho += Number(e.qtd_retrabalho) || 0;
  }
  return { total, refugo, retrabalho, aprovado: Math.max(0, total - refugo) };
}

function fraseMeta(pecas: number, meta: number, ritmoH: number, fimTurno: number) {
  if (!meta) return "Meta não definida.";
  if (pecas >= meta) return "Meta batida.";
  if (ritmoH <= 0) return "Neste ritmo não fecha.";
  const quando = Date.now() + ((meta - pecas) / ritmoH) * 3600000;
  if (quando <= fimTurno) {
    const d = new Date(quando);
    return `Neste ritmo fecha às ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}.`;
  }
  return "Neste ritmo não fecha.";
}

function seisPerdas(ind: any) {
  const tempos = ind?.tempos_por_estado || {};
  const micro = Number(tempos.MICROPARADA) || 0;
  const setup = Number(tempos.SETUP) || 0;
  const parada = Math.max(0, (Number(ind?.parada_nao_planejada_seg) || 0) - micro);
  const cicloLento = Math.max(0, (Number(ind?.tempo_operacional_seg) || 0) - (Number(ind?.producao_total) || 0) * (Number(ind?.ciclo_ideal_seg) || 0));
  return [
    ["Parada", dur(parada)],
    ["Setup", dur(setup)],
    ["Microparada", dur(micro)],
    ["Ciclo lento", dur(cicloLento)],
    ["Refugo", num(ind?.refugo)],
    ["Retrabalho", num(ind?.retrabalho)],
  ];
}

/* ------------------------------------------------------------------ */
/* Operação                                                           */
/* ------------------------------------------------------------------ */

export function Operacao({ notify }: { notify: Notify }) {
  const qc = useQueryClient();
  const [maqId, setMaqId] = useState(localStorage.getItem("oee.maq") || "");
  const [tick, setTick] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [modal, setModal] = useState<null | "parada" | "pausa" | "reclass" | "manut" | "prod" | "refugo" | "retr" | "obs" | "ordem" | "passagem">(null);
  const [motivoFixo, setMotivoFixo] = useState<string | undefined>();
  const [matricula, setMatricula] = useState("");
  const [notaPassagem, setNotaPassagem] = useState("");
  const [sug, setSug] = useState<any[]>([]);
  const dsQ = useQuery({
    queryKey: ["ds", "op", maqId],
    queryFn: () => api.dataset(maqId ? { maquina_id: maqId, desde: Date.now() - 36 * 3600 * 1000 } : undefined),
    refetchInterval: 15000,
  });
  const ds = dsQ.data;
  const maq = (ds?.maquinas || []).find((m: any) => m.id === maqId) || ds?.maquinas?.[0];
  const ordemAberta = (ds?.ordens || []).find((o: any) => o.id === maq?.ordem_atual_id);

  useEffect(() => {
    if (maq && maq.id !== maqId) setMaqId(maq.id);
    if (maq) localStorage.setItem("oee.maq", maq.id);
  }, [maq, maqId]);
  useEffect(() => {
    const relogio = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(relogio);
  }, []);

  const dash = useQuery({
    queryKey: ["op", maq?.id, ordemAberta?.id || "sem-ordem"],
    enabled: !!maq?.id && !!ordemAberta?.id,
    queryFn: () => {
      if (!maq?.id || !ordemAberta?.id) return Promise.resolve(undefined);
      return api.indicadores(
        paramsIndicadores(
          {
            ...FILTROS_PADRAO,
            periodo: "personalizado",
            data_inicio: ordemAberta.inicio,
            data_fim: Date.now(),
            maquina_id: maq.id,
            ordem_id: ordemAberta.id,
          },
          ds,
          Date.now(),
        ),
      );
    },
    refetchInterval: 15000,
  });

  const paradaAberta = (ds?.eventos_parada || []).find((p: any) => p.maquina_id === maq?.id && !p.fim);

  async function abrirMotivo(tipo: "parada" | "pausa" | "reclass" | "manut") {
    if (!maq) return;
    setMotivoFixo(undefined);
    setSug([]);
    setModal(tipo);
    if (tipo === "manut") return;
    try {
      const duracao = paradaAberta ? Math.round((Date.now() - paradaAberta.inicio) / 1000) : undefined;
      setSug(await api.sugestoes(maq.id, tipo === "reclass" ? duracao : undefined));
    } catch {
      setSug([]);
    }
  }

  async function comFeedback(fn: () => Promise<unknown>, ok: string, tipo = "ok") {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await fn();
      await qc.invalidateQueries();
      if (r && (r as { offline?: boolean }).offline) notify("Sem rede. O apontamento ficou neste tablet e sobe quando a conexão voltar, sem duplicar.", "alerta");
      else notify(ok, tipo);
    } catch (e: any) {
      notify(e.message || "Falha na ação", "erro");
    } finally {
      setOcupado(false);
    }
  }

  async function desfecho(motivoId: string, posicao: number | null) {
    const top = sug[0];
    if (!top || !maq) return;
    try {
      await api.acmpDesfecho({
        maquina_id: maq.id,
        motivo_escolhido: motivoId,
        motivo_sugerido: top.motivo_id,
        posicao_aceita: posicao,
        aceita: posicao != null,
      });
    } catch {
      /* desfecho não bloqueia o apontamento */
    }
  }

  if (dsQ.isError) {
    return (
      <div className="alerta-inconsistencia" role="alert">
        Não foi possível carregar o posto. Verifique a API e tente de novo.
      </div>
    );
  }
  if (!ds) return <p className="vazio">Carregando dados...</p>;
  if (!ds.maquinas?.length) return <p className="vazio">Cadastre uma máquina para iniciar a operação.</p>;
  if (!maq) return <p className="vazio">Selecione uma máquina.</p>;

  const estadoId = maq.estado_atual && ESTADOS[maq.estado_atual] ? maq.estado_atual : "SEM_ORDEM";
  const def = ESTADOS[estadoId];
  const ordem = ordemAberta;
  const turno = janelaTurno(ds.turnos, Date.now());
  const pecas = somaProducaoOrdem(ds.eventos_producao, ordem?.id);
  const ind = ordem ? dash.data?.indicadores : undefined;
  const meta = Number(ordem?.meta_qtd || 0);
  const produzindo = estadoId === "PRODUZINDO";
  const emSetup = estadoId === "SETUP";
  const parado = def.classe !== "PRODUTIVO" && !emSetup;
  const motivoTxt = paradaAberta?.motivo_id
    ? `${nomeDe(ds.motivos, paradaAberta.motivo_id)}${paradaAberta.comentario ? ` · ${paradaAberta.comentario}` : ""}`
    : "";
  const segsOrdem = ordem ? (ds.eventos_estado || []).filter((e: any) => e.ordem_id === ordem.id) : [];
  const ultimos = [...segsOrdem].slice(-8).reverse();
  const busy = ocupado;
  const decorridoH = Math.max(0.001, (Date.now() - (ordem?.inicio || Date.now())) / 3600000);
  const ritmo = ordem ? pecas.total / decorridoH : 0;
  void tick;

  return (
    <div aria-busy={busy || dash.isLoading}>
      <section className="op-cabecalho">
        <div className="op-cabecalho__maquina">
          <label className="rotulo-campo" htmlFor="sel-maquina">
            Máquina
          </label>
          <select id="sel-maquina" className="seletor-grande" value={maq.id} disabled={busy} onChange={(e) => setMaqId(e.target.value)}>
            {(ds.maquinas || []).map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <p className="op-cabecalho__caminho">{caminhoMaquina(ds, maq)}</p>
        </div>
        <dl className="op-contexto">
          <div>
            <dt>Ordem</dt>
            <dd>{ordem ? ordem.codigo : "Sem ordem aberta"}</dd>
          </div>
          <div>
            <dt>Produto</dt>
            <dd>{ordem ? nomeDe(ds.produtos, ordem.produto_id) : "—"}</dd>
          </div>
          <div>
            <dt>Turno</dt>
            <dd>{turno.nome}</dd>
          </div>
          <div>
            <dt>Operador</dt>
            <dd>
              {nomeDe(ds.operadores, maq.operador_atual_id || ordem?.operador_id)}
              <form
                className="op-cracha"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!matricula.trim()) return;
                  comFeedback(async () => {
                    const r = await api.assumirPosto({ maquina_id: maq.id, matricula: matricula.trim() });
                    setMatricula("");
                    return r;
                  }, "Crachá reconhecido. Os próximos apontamentos ficam neste nome.");
                }}
              >
                <label className="rotulo-campo" htmlFor="cracha">
                  Crachá
                </label>
                <input id="cracha" value={matricula} onChange={(e) => setMatricula(e.target.value)} inputMode="numeric" placeholder="Matrícula" />
                <button type="submit" className="botao botao--secundario" disabled={busy}>
                  Assumir
                </button>
              </form>
            </dd>
          </div>
        </dl>
      </section>

      <section className={`faixa-estado estado-fundo estado--${estadoId} padrao--${def.padrao}`} aria-live="polite">
        <div className="faixa-estado__conteudo">
          <span className="faixa-estado__icone" aria-hidden="true">
            {def.icone}
          </span>
          <div>
            <p className="faixa-estado__rotulo">Estado atual</p>
            <h2 className="faixa-estado__nome">{def.rotulo}</h2>
            {motivoTxt ? <p className="faixa-estado__motivo">{motivoTxt}</p> : null}
          </div>
        </div>
        <div className="faixa-estado__tempo">
          <span className="rotulo-campo">Há</span>
          <strong id="cronometro-estado" className="cronometro">
            {cron((Date.now() - Math.max(Number(maq.estado_desde) || turno.inicio, turno.inicio || 0)) / 1000)}
          </strong>
          <span className="faixa-estado__desde">desde {hora(Math.max(Number(maq.estado_desde) || turno.inicio, turno.inicio || 0))}</span>
        </div>
      </section>

      {maq.sinal_sem_motivo ? (
        <div className="alerta-inconsistencia" role="alert">
          <strong>A máquina sinalizou parada.</strong> Confirme o motivo para o tempo não ficar sem causa.
          <button type="button" className="botao botao--primario" onClick={() => abrirMotivo(paradaAberta ? "reclass" : "parada")}>
            Confirmar motivo
          </button>
        </div>
      ) : null}

      {produzindo && ordem && pecas.total <= 0 && (Date.now() - Math.max(Number(maq.estado_desde) || turno.inicio, turno.inicio || 0)) / 1000 >= (ds.config?.sem_peca_min || 20) * 60 ? (
        <div className="alerta-inconsistencia" role="alert">
          <strong>Produzindo há {Math.floor((Date.now() - Math.max(Number(maq.estado_desde) || turno.inicio, turno.inicio || 0)) / 60000)} minutos sem peça.</strong> Lance a produção ou registre falta de material.
          <button type="button" className="botao botao--primario" onClick={() => setModal("prod")}>
            Registrar produção
          </button>
          <button
            type="button"
            className="botao botao--secundario"
            onClick={() => {
              setMotivoFixo("MOT-05");
              setSug([]);
              setModal("parada");
            }}
          >
            Falta de material
          </button>
        </div>
      ) : null}

      <section className="op-indicadores">
        <CardKPI rotulo="OEE" valor={pct(ind?.oee)} destaque faixa={faixaOee(ind?.oee, ds.config?.meta_oee)} detalhe={`Meta ${pct(ds.config?.meta_oee, 0)}`} />
        <CardKPI rotulo="Disponibilidade" valor={pct(ind?.disponibilidade)} />
        <CardKPI rotulo="Performance" valor={pct(ind?.performance)} />
        <CardKPI rotulo="Qualidade" valor={pct(ind?.qualidade)} />
      </section>

      <Painel titulo={ordem ? `Produção da ordem ${ordem.codigo}` : "Produção da ordem"}>
        {ordem ? null : <p className="nota">Nenhuma ordem aberta. A produção da ordem anterior fica no histórico, não neste posto.</p>}
        <div className="op-producao">
          <CardKPI rotulo="Produzido" valor={num(ordem ? pecas.total : 0)} />
          <CardKPI rotulo="Aprovado" valor={num(ordem ? pecas.aprovado : 0)} />
          <CardKPI rotulo="Rejeitado" valor={num(ordem ? pecas.refugo : 0)} detalhe={ordem && pecas.total ? pct(pecas.refugo / pecas.total) : "—"} />
          <CardKPI rotulo="Retrabalho" valor={num(ordem ? pecas.retrabalho : 0)} />
          {ordem && ind ? (
            <>
              <CardKPI rotulo="Ritmo atual" valor={<>{num(ritmo)} <small>pç/h</small></>} />
              <CardKPI rotulo="Ciclo ideal" valor={<>{cicloTxt(ind.ciclo_ideal_seg).replace(" s", "")} <small>s</small></>} />
              <CardKPI rotulo="Ciclo real médio" valor={<>{cicloTxt(ind.ciclo_real_seg).replace(" s", "")} <small>s</small></>} />
            </>
          ) : null}
        </div>
        <div className="op-meta">
          <span className="rotulo-campo">{ordem ? "Meta da ordem" : "Meta"}</span>
          <BarraProgresso valor={ordem ? pecas.total : 0} meta={meta} rotulo="Meta da ordem" />
          {ordem ? <p className="nota">{fraseMeta(pecas.total, meta, ritmo, turno.fim || Date.now())}</p> : null}
        </div>
      </Painel>

      <Painel titulo="Apontamentos">
        <div className="acoes-operador">
          {!ordem ? (
            <BotaoOp icone="⊕" rotulo="Iniciar ordem" tom="primario" disabled={busy} onClick={() => setModal("ordem")} />
          ) : (
            <>
              <BotaoOp icone="▶" rotulo="Iniciar produção" tom="primario" disabled={busy || produzindo} onClick={() => comFeedback(() => api.estado({ maquina_id: maq.id, estado: "PRODUZINDO" }).then(() => undefined), "Produção iniciada.")} />
              <BotaoOp icone="⏸" rotulo="Pausar produção" disabled={busy || !produzindo} onClick={() => abrirMotivo("pausa")} />
              <BotaoOp icone="■" rotulo="Registrar parada" tom="alerta" disabled={busy || parado} onClick={() => abrirMotivo("parada")} />
              <BotaoOp icone="✓" rotulo="Finalizar parada" tom="primario" disabled={busy || !parado} onClick={() => comFeedback(() => api.estado({ maquina_id: maq.id, estado: "PRODUZINDO", acao: "PARADA_FINALIZADA" }).then(() => undefined), "Parada finalizada. Produção retomada.")} />
              <BotaoOp icone="↻" rotulo="Alterar motivo" disabled={busy || !parado || !paradaAberta} onClick={() => abrirMotivo("reclass")} />
              <BotaoOp icone="＋" rotulo="Registrar produção" tom="primario" disabled={busy} onClick={() => setModal("prod")} />
              <BotaoOp icone="✖" rotulo="Registrar refugo" tom="alerta" disabled={busy} onClick={() => setModal("refugo")} />
              <BotaoOp icone="♻" rotulo="Registrar retrabalho" disabled={busy} onClick={() => setModal("retr")} />
              <BotaoOp
                icone="⇄"
                rotulo={emSetup ? "Finalizar setup" : "Iniciar setup"}
                disabled={busy}
                onClick={() =>
                  comFeedback(
                    () =>
                      api
                        .estado(
                          emSetup
                            ? { maquina_id: maq.id, estado: "PRODUZINDO", acao: "SETUP_FINALIZADO" }
                            : { maquina_id: maq.id, estado: "SETUP", motivo_id: "MOT-10", acao: "SETUP_INICIADO" },
                        )
                        .then(() => undefined),
                    emSetup ? "Setup finalizado." : "Setup iniciado.",
                  )
                }
              />
              <BotaoOp icone="⚒" rotulo="Solicitar manutenção" tom="alerta" disabled={busy} onClick={() => abrirMotivo("manut")} />
              <BotaoOp icone="✎" rotulo="Adicionar observação" disabled={busy} onClick={() => setModal("obs")} />
              <BotaoOp icone="⇄" rotulo="Passagem de turno" disabled={busy} onClick={() => setModal("passagem")} />
              <BotaoOp
                icone="⏏"
                rotulo="Finalizar ordem"
                tom="perigo"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`A ordem ${ordem.codigo} será encerrada e a máquina ficará sem ordem de produção. Deseja continuar?`)) return;
                  comFeedback(() => api.finalizarOrdem(maq.id).then(() => undefined), `Ordem ${ordem.codigo} finalizada.`);
                }}
              />
            </>
          )}
        </div>
      </Painel>

      <Painel titulo="Linha do tempo da ordem">
        {ordem ? (
          <Timeline segmentos={segsOrdem} inicio={ordem.inicio || turno.inicio} fim={Date.now()} />
        ) : (
          <p className="vazio">Sem ordem aberta.</p>
        )}
        <LegendaEstados />
      </Painel>

      <Painel titulo="Últimos eventos">
        <Tabela
          cabecalhos={["Início", "Estado", "Motivo", "Duração"]}
          linhas={ultimos.map((e: any) => [
            hora(e.inicio),
            <Selo estadoId={e.estado} />,
            e.motivo_id ? nomeDe(ds.motivos, e.motivo_id) : "—",
            dur(((e.fim || Date.now()) - e.inicio) / 1000),
          ])}
        />
      </Painel>

      {(modal === "parada" || modal === "pausa" || modal === "reclass" || modal === "manut") && (
        <ModalMotivo
          titulo={modal === "pausa" ? "Motivo da pausa" : modal === "reclass" ? "Alterar motivo da parada" : modal === "manut" ? "Solicitar manutenção" : "Registrar parada"}
          motivos={ds.motivos || []}
          sugestoes={sug}
          motivoInicial={motivoFixo}
          filtroCategoria={modal === "manut" ? "Máquina" : undefined}
          onClose={() => setModal(null)}
          onOk={async (motivoId, comentario, sugestaoPosicao) => {
            await comFeedback(async () => {
              if (modal === "reclass") {
                if (!paradaAberta) throw new Error("Não há parada em andamento para alterar.");
                await api.reclassificar({ parada_id: paradaAberta.id, motivo_id: motivoId, comentario });
              } else {
                await api.parada({
                  maquina_id: maq.id,
                  motivo_id: motivoId,
                  comentario,
                  acao: modal === "manut" ? "MANUTENCAO_SOLICITADA" : undefined,
                });
                await desfecho(motivoId, sugestaoPosicao);
              }
              setModal(null);
            }, modal === "pausa" ? "Produção pausada." : modal === "reclass" ? "Motivo atualizado." : modal === "manut" ? "Manutenção solicitada. A máquina ficou em estado de manutenção." : `Parada registrada: ${nomeDe(ds.motivos, motivoId)}`, modal === "manut" ? "alerta" : "ok");
          }}
        />
      )}
      {modal === "prod" && (
        <ModalQtd
          titulo="Registrar produção"
          onClose={() => setModal(null)}
          onOk={async (n) => {
            await comFeedback(async () => {
              const r = await api.apontar({ maquina_id: maq.id, qtd_total: n });
              setModal(null);
              return r;
            }, `${n} peças registradas.`);
          }}
        />
      )}
      {modal === "refugo" && (
        <ModalQtd
          titulo="Registrar refugo"
          pedirCausa
          onClose={() => setModal(null)}
          onOk={async (n, causa, destas) => {
            await comFeedback(async () => {
              const r = await api.apontar({ maquina_id: maq.id, qtd_total: destas ? 0 : n, qtd_refugo: n, causa_refugo: causa });
              setModal(null);
              return r;
            }, destas ? `${n} peças saíram de aprovado para rejeitado.` : `${n} peças de refugo registradas.`, "alerta");
          }}
        />
      )}
      {modal === "retr" && (
        <ModalQtd
          titulo="Registrar retrabalho"
          onClose={() => setModal(null)}
          onOk={async (n) => {
            await comFeedback(async () => {
              await api.apontar({ maquina_id: maq.id, qtd_total: 0, qtd_retrabalho: n });
              setModal(null);
            }, `${n} peças enviadas para retrabalho.`);
          }}
        />
      )}
      {modal === "obs" && (
        <ModalTexto
          titulo="Adicionar observação"
          onClose={() => setModal(null)}
          onOk={async (t) => {
            await comFeedback(async () => {
              await api.observacao({ maquina_id: maq.id, texto: t });
              setModal(null);
            }, "Observação registrada.");
          }}
        />
      )}
      {modal === "passagem" && ordem ? (
        <ModalShell
          titulo={`Passagem — ${turno.nome}`}
          onClose={() => setModal(null)}
          rodape={
            <>
              <button type="button" className="botao botao--secundario" onClick={() => setModal(null)}>
                Fechar
              </button>
              <button
                type="button"
                className="botao botao--primario"
                onClick={() =>
                  comFeedback(async () => {
                    const texto = [
                      `Passagem ${turno.nome}. Ordem ${ordem.codigo}.`,
                      `Produzido ${pecas.total}, rejeitado ${pecas.refugo}, aprovado ${pecas.aprovado}.`,
                      fraseMeta(pecas.total, meta, ritmo, turno.fim || Date.now()),
                      paradaAberta ? `Parada ainda aberta desde ${hora(paradaAberta.inicio)}.` : "Nenhuma parada aberta.",
                      notaPassagem.trim() ? `Para o próximo: ${notaPassagem.trim()}` : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    await api.observacao({ maquina_id: maq.id, texto });
                    setNotaPassagem("");
                    setModal(null);
                  }, "Passagem registrada para o próximo operador.")
                }
              >
                Deixar para o próximo
              </button>
            </>
          }
        >
          <div className="formulario">
            <p>Ordem {ordem.codigo}. Produzido {num(pecas.total)}, rejeitado {num(pecas.refugo)}, aprovado {num(pecas.aprovado)}.</p>
            <p>{fraseMeta(pecas.total, meta, ritmo, turno.fim || Date.now())}</p>
            <p>{paradaAberta ? `Parada ainda aberta desde ${hora(paradaAberta.inicio)}.` : "Nenhuma parada aberta."}</p>
            <label htmlFor="passagem-nota">O que o próximo operador precisa saber</label>
            <textarea id="passagem-nota" rows={3} value={notaPassagem} onChange={(e) => setNotaPassagem(e.target.value)} />
          </div>
        </ModalShell>
      ) : null}
      {modal === "ordem" && (
        <ModalOrdem
          produtos={ds.produtos || []}
          operadores={ds.operadores || []}
          turnos={ds.turnos || []}
          onClose={() => setModal(null)}
          onOk={async (dados) => {
            await comFeedback(async () => {
              await api.abrirOrdem({ maquina_id: maq.id, ...dados });
              setModal(null);
            }, "Ordem aberta. Setup iniciado automaticamente.");
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Máquinas                                                           */
/* ------------------------------------------------------------------ */

export function Maquinas() {
  const nav = useNavigate();
  const { f, setF, ds, dash } = useGestao();
  const meta = ds.data?.config?.meta_oee;
  const por = Object.fromEntries((dash.data?.por_maquina || []).map((g: any) => [g.chave, g]));
  const grupos = dash.data?.por_maquina || [];
  const maqs = dash.data?.maquinas || ds.data?.maquinas || [];

  return (
    <>
      <BarraFiltros ds={ds.data || {}} f={f} setF={setF} />
      <Painel titulo={`Máquinas — ${ROTULO_PERIODO[f.periodo] || f.periodo}`}>
        <Tabela
          cabecalhos={["Máquina", "Hierarquia", "Estado", "OEE", "Disp.", "Perf.", "Qual.", "Produção", "Refugo", "Parada não planejada", "Paradas"]}
          linhas={maqs.map((m: any) => {
            const r = por[m.id]?.indicadores || {};
            const faixa = faixaOee(r.oee, meta);
            return [
              <button type="button" className="link" onClick={() => abrirOperacao(m.id, nav)}>
                {m.nome}
              </button>,
              caminhoMaquina(ds.data, m),
              <Selo estadoId={m.estado_atual} />,
              <span className={`faixa--${faixa}`}>{pct(r.oee)}</span>,
              pct(r.disponibilidade),
              pct(r.performance),
              pct(r.qualidade),
              num(r.producao_total),
              num(r.refugo),
              dur(r.parada_nao_planejada_seg),
              num(r.qtd_paradas),
            ];
          })}
        />
      </Painel>
      <BlocoGrafico titulo="Disponibilidade, Performance e Qualidade por máquina" altura={320}>
        <GraficoBarra
          percentual
          labels={grupos.map((g: any) => g.rotulo)}
          series={[
            { nome: "Disponibilidade", valores: grupos.map((g: any) => g.indicadores?.disponibilidade), cor: "#9FB6BC" },
            { nome: "Performance", valores: grupos.map((g: any) => g.indicadores?.performance), cor: "#6FA383" },
            { nome: "Qualidade", valores: grupos.map((g: any) => g.indicadores?.qualidade), cor: "#6E9FB5" },
          ]}
        />
      </BlocoGrafico>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Produção                                                           */
/* ------------------------------------------------------------------ */

export function Producao() {
  const { f, setF, ds, dash } = useGestao();
  const ind = dash.data?.indicadores;
  const buckets = dash.data?.producao || [];
  const eventos = ds.data?.eventos_producao || [];
  const totalOrdem = (id: string) => eventos.filter((e: any) => e.ordem_id === id).reduce((a: number, e: any) => a + (e.qtd_total || 0), 0);
  const ordens = [...(dash.data?.ordens || [])].sort((a: any, b: any) => (b.inicio || 0) - (a.inicio || 0)).slice(0, 40);
  const ordensGraf = [...ordens].slice(0, 12).reverse();

  return (
    <>
      <BarraFiltros ds={ds.data || {}} f={f} setF={setF} />
      <section className="kpis">
        <CardKPI rotulo="Produção total" valor={num(ind?.producao_total)} />
        <CardKPI rotulo="Aprovada" valor={num(ind?.producao_aprovada)} />
        <CardKPI rotulo="Refugo" valor={num(ind?.refugo)} />
        <CardKPI rotulo="Retrabalho" valor={num(ind?.retrabalho)} />
        <CardKPI rotulo="Ciclo ideal médio" valor={<>{cicloTxt(ind?.ciclo_ideal_seg).replace(" s", "")} <small>s</small></>} />
        <CardKPI rotulo="Ciclo real médio" valor={<>{cicloTxt(ind?.ciclo_real_seg).replace(" s", "")} <small>s</small></>} />
      </section>
      <div className="grade-2">
        <BlocoGrafico titulo="Produção por período">
          <GraficoBarra
            stacked
            labels={buckets.map((b: any) => rotuloPonto(b.inicio, f.periodo))}
            series={[
              { nome: "Aprovada", valores: buckets.map((b: any) => b.aprovada), cor: "#6FA383" },
              { nome: "Refugo", valores: buckets.map((b: any) => b.refugo), cor: "#DC6C57" },
            ]}
          />
        </BlocoGrafico>
        <BlocoGrafico titulo="Produção realizada versus meta por ordem">
          <GraficoBarra
            labels={ordensGraf.map((o: any) => o.codigo)}
            series={[
              { nome: "Realizado", valores: ordensGraf.map((o: any) => totalOrdem(o.id)), cor: "#9FB6BC" },
              { nome: "Meta", valores: ordensGraf.map((o: any) => o.meta_qtd), cor: "#D97B29" },
            ]}
          />
        </BlocoGrafico>
      </div>
      <Painel titulo="Ordens no período">
        <Tabela
          cabecalhos={["Ordem", "Máquina", "Produto", "Turno", "Início", "Status", "Meta", "Produzido", "Atingimento"]}
          linhas={ordens.map((o: any) => {
            const total = totalOrdem(o.id);
            return [
              o.codigo,
              nomeDe(ds.data?.maquinas, o.maquina_id),
              nomeDe(ds.data?.produtos, o.produto_id),
              nomeDe(ds.data?.turnos, o.turno_id),
              dataHora(o.inicio),
              <span className="etiqueta">{o.status === "EM_ANDAMENTO" ? "Em andamento" : o.status === "FINALIZADA" ? "Finalizada" : o.status}</span>,
              num(o.meta_qtd),
              num(total),
              pct(o.meta_qtd ? total / o.meta_qtd : null, 0),
            ];
          })}
        />
      </Painel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Paradas                                                            */
/* ------------------------------------------------------------------ */

export function Paradas({ notify }: { notify: Notify }) {
  const qc = useQueryClient();
  const { f, setF, ds, dash } = useGestao();
  const parQ = useQuery({ queryKey: ["par"], queryFn: () => api.paradas() });
  const ind = dash.data?.indicadores;
  const pareto = (dash.data?.pareto?.itens || []).slice(0, 10);
  const paradas = parQ.data || [];
  const cats: Record<string, number> = {};
  for (const e of paradas) {
    const c = e.categoria || "Outros";
    cats[c] = (cats[c] || 0) + (e.duracao_seg || (e.fim ? 0 : (Date.now() - e.inicio) / 1000));
  }
  const catItens = Object.entries(cats).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <BarraFiltros ds={ds.data || {}} f={f} setF={setF} />
      <section className="kpis">
        <CardKPI rotulo="Tempo parado total" valor={dur((ind?.parada_nao_planejada_seg || 0) + (ind?.parada_planejada_seg || 0))} />
        <CardKPI rotulo="Não planejado" valor={dur(ind?.parada_nao_planejada_seg)} />
        <CardKPI rotulo="Planejado" valor={dur(ind?.parada_planejada_seg)} />
        <CardKPI rotulo="Ocorrências" valor={num(ind?.qtd_paradas)} />
        <CardKPI rotulo="MTBF" valor={dur(ind?.mtbf_seg)} />
        <CardKPI rotulo="MTTR" valor={dur(ind?.mttr_seg)} />
      </section>
      <div className="grade-2">
        <BlocoGrafico titulo="Pareto de motivos de parada" altura={320}>
          <GraficoBarra
            labels={pareto.map((i: any) => i.rotulo)}
            series={[{ nome: "Tempo perdido", valores: pareto.map((i: any) => i.tempo_seg), cor: "#DC6C57" }]}
          />
        </BlocoGrafico>
        <BlocoGrafico titulo="Distribuição das perdas por categoria" altura={320}>
          <GraficoRosca labels={catItens.map((c) => c[0])} valores={catItens.map((c) => c[1])} />
        </BlocoGrafico>
      </div>
      <Painel titulo="Registros de parada">
        <Tabela
          cabecalhos={["Início", "Máquina", "Estado", "Categoria", "Motivo", "Duração", "Tipo", "Comentário", "Reclassificar"]}
          linhas={paradas.slice(0, 60).map((e: any) => [
            dataHora(e.inicio),
            nomeDe(ds.data?.maquinas, e.maquina_id),
            <Selo estadoId={e.estado} />,
            e.categoria || "—",
            e.motivo_id ? nomeDe(ds.data?.motivos, e.motivo_id) : "—",
            dur(e.fim ? e.duracao_seg : (Date.now() - e.inicio) / 1000),
            e.planejada ? "Planejada" : "Não planejada",
            e.comentario || "",
            <select
              aria-label="Reclassificar"
              defaultValue=""
              onChange={async (ev) => {
                if (!ev.target.value) return;
                try {
                  await api.reclassificar({ parada_id: e.id, motivo_id: ev.target.value });
                  await qc.invalidateQueries();
                  notify("Motivo reclassificado");
                } catch (err: any) {
                  notify(err.message || "Falha ao reclassificar", "erro");
                }
                ev.target.value = "";
              }}
            >
              <option value="">Reclassificar…</option>
              {(ds.data?.motivos || []).map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>,
          ])}
        />
      </Painel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Qualidade                                                          */
/* ------------------------------------------------------------------ */

export function Qualidade() {
  const { f, setF, ds, dash } = useGestao();
  const prod = useQuery({ queryKey: ["prod"], queryFn: () => api.producao() });
  const ind = dash.data?.indicadores;
  const meta = ds.data?.config?.meta_refugo_pct;
  const taxa = ind?.producao_total ? ind.refugo / ind.producao_total : null;
  const buckets = dash.data?.producao || [];
  const causas: Record<string, number> = {};
  for (const e of prod.data || []) {
    if (e.causa_refugo && e.qtd_refugo) causas[e.causa_refugo] = (causas[e.causa_refugo] || 0) + e.qtd_refugo;
  }
  const listaCausas = Object.entries(causas).sort((a, b) => b[1] - a[1]);
  const grupos = dash.data?.por_maquina || [];

  return (
    <>
      <BarraFiltros ds={ds.data || {}} f={f} setF={setF} />
      <section className="kpis">
        <CardKPI rotulo="Qualidade" valor={pct(ind?.qualidade)} destaque />
        <CardKPI rotulo="Produção total" valor={num(ind?.producao_total)} />
        <CardKPI rotulo="Aprovada" valor={num(ind?.producao_aprovada)} />
        <CardKPI rotulo="Refugo" valor={num(ind?.refugo)} detalhe={`Taxa ${pct(taxa)}`} />
        <CardKPI rotulo="Retrabalho" valor={num(ind?.retrabalho)} />
        <CardKPI rotulo="Meta de refugo" valor={pct(meta, 1)} />
      </section>
      <div className="grade-2">
        <BlocoGrafico titulo="Rejeitos por período">
          <GraficoBarra
            labels={buckets.map((b: any) => rotuloPonto(b.inicio, f.periodo))}
            series={[{ nome: "Refugo", valores: buckets.map((b: any) => b.refugo), cor: "#DC6C57" }]}
          />
        </BlocoGrafico>
        <BlocoGrafico titulo="Principais causas de perda de qualidade" altura={300}>
          <GraficoBarra
            horizontal
            labels={listaCausas.map((i) => i[0])}
            series={[{ nome: "Peças refugadas", valores: listaCausas.map((i) => i[1]), cor: "#6E9FB5" }]}
          />
        </BlocoGrafico>
      </div>
      <BlocoGrafico titulo="Taxa de refugo por máquina" altura={280}>
        <GraficoBarra
          percentual
          labels={grupos.map((g: any) => g.rotulo)}
          series={[
            {
              nome: "Taxa de refugo",
              valores: grupos.map((g: any) => {
                const i = g.indicadores || {};
                return i.producao_total ? i.refugo / i.producao_total : null;
              }),
              cor: "#DC6C57",
            },
          ]}
        />
      </BlocoGrafico>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Performance                                                        */
/* ------------------------------------------------------------------ */

export function Performance() {
  const { f, setF, ds, dash } = useGestao();
  const ind = dash.data?.indicadores;
  const porTurno = dash.data?.por_turno || [];
  const porLinha = dash.data?.por_linha || [];
  const grupos = dash.data?.por_maquina || [];

  return (
    <>
      <BarraFiltros ds={ds.data || {}} f={f} setF={setF} />
      <div className="grade-2">
        <BlocoGrafico titulo="OEE por turno">
          <GraficoBarra
            percentual
            labels={porTurno.map((t: any) => t.rotulo)}
            series={[{ nome: "OEE", valores: porTurno.map((t: any) => t.indicadores?.oee), cor: "#D97B29" }]}
          />
        </BlocoGrafico>
        <BlocoGrafico titulo="OEE por linha">
          <GraficoBarra
            percentual
            labels={porLinha.map((g: any) => g.rotulo)}
            series={[{ nome: "OEE", valores: porLinha.map((g: any) => g.indicadores?.oee), cor: "#9FB6BC" }]}
          />
        </BlocoGrafico>
      </div>
      <div className="grade-2">
        <BlocoGrafico titulo="Disponibilidade, Performance e Qualidade no período">
          <GraficoBarra
            percentual
            labels={["Disponibilidade", "Performance", "Qualidade", "OEE"]}
            series={[
              {
                nome: "Período",
                valores: [ind?.disponibilidade, ind?.performance, ind?.qualidade, ind?.oee],
                cores: ["#9FB6BC", "#6FA383", "#6E9FB5", "#D97B29"],
              },
            ]}
          />
        </BlocoGrafico>
        <BlocoGrafico titulo="Ciclo ideal versus ciclo real por máquina">
          <GraficoBarra
            labels={grupos.map((g: any) => g.rotulo)}
            series={[
              { nome: "Ciclo ideal (s)", valores: grupos.map((g: any) => g.indicadores?.ciclo_ideal_seg), cor: "#6FA383" },
              { nome: "Ciclo real (s)", valores: grupos.map((g: any) => g.indicadores?.ciclo_real_seg), cor: "#DC6C57" },
            ]}
          />
        </BlocoGrafico>
      </div>
      <Painel titulo="Comparação entre turnos">
        <Tabela
          cabecalhos={["Turno", "Horário", "OEE", "Disp.", "Perf.", "Qual.", "Produção", "Parada não planejada", "Paradas"]}
          linhas={porTurno.map((t: any) => {
            const r = t.indicadores || {};
            return [t.rotulo, t.horario || "—", pct(r.oee), pct(r.disponibilidade), pct(r.performance), pct(r.qualidade), num(r.producao_total), dur(r.parada_nao_planejada_seg), num(r.qtd_paradas)];
          })}
        />
      </Painel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Insights                                                           */
/* ------------------------------------------------------------------ */

export function Insights() {
  const { f, setF, ds, q } = useGestao();
  const ins = useQuery({ queryKey: ["ins", q], queryFn: () => api.insights(q), enabled: !!ds.data });
  const lista = ins.data || [];

  return (
    <>
      <BarraFiltros ds={ds.data || {}} f={f} setF={setF} />
      <p className="nota">O sistema olhou os apontamentos do período e destacou o que pede ação. Nada é feito sozinho — a decisão é sua.</p>
      {ins.isError ? <p className="erro-campo">Não deu para carregar os avisos. Tente de novo ou ajuste o período.</p> : null}
      {ins.isLoading ? (
        <p className="vazio">Olhando os dados do período…</p>
      ) : !lista.length ? (
        <p className="vazio">Nada urgente neste recorte. Se a linha estiver estranha, amplie o período ou tire o filtro de máquina.</p>
      ) : (
        <div className="insights">
          {lista.map((i: any) => (
            <article key={i.id} className={`insight insight--${i.criticidade}`}>
              <header className="insight__cabecalho">
                <span className="insight__criticidade">{CRITICIDADE[i.criticidade] || i.criticidade}</span>
                {i.maquina_id ? <span className="insight__indicador">{nomeDe(ds.data?.maquinas, i.maquina_id)}</span> : <span className="insight__indicador">{i.indicador}</span>}
              </header>
              <h3 className="insight__titulo">{i.titulo}</h3>
              <p className="insight__acao">
                <strong>Faça agora:</strong> {i.acao_recomendada || "Conferir no posto e registrar o motivo certo."}
              </p>
              <p className="insight__descricao">{i.descricao}</p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Assistente ACMP                                                    */
/* ------------------------------------------------------------------ */

export function Assistente({ notify }: { notify: Notify }) {
  const { data, refetch, isLoading } = useQuery({ queryKey: ["acmp"], queryFn: api.acmpAvaliacao });
  const [treinando, setTreinando] = useState(false);
  const inicio = data?.inicio;
  const curso = data?.curso;
  const aceit = data?.aceitacao;
  const classes = (inicio?.por_classe || []).filter((p: any) => p.suporte > 0).slice(0, 8).map((p: any) => p.classe);
  const matriz = inicio?.matriz || {};
  const ds = useQuery({ queryKey: ["ds"], queryFn: api.dataset });

  if (isLoading) return <p className="vazio">Carregando avaliação do ACMP...</p>;

  return (
    <>
      <p className="nota">
        <strong>ACMP — Apoio à Classificação de Motivos de Parada.</strong> Classificador treinado com o histórico de paradas já classificadas por operadores. Sugere os três motivos mais prováveis no momento do apontamento; a decisão permanece com o operador. Nada é preenchido automaticamente.
      </p>
      <div className="linha-controles">
        <button
          type="button"
          className="botao botao--primario"
          disabled={treinando}
          onClick={async () => {
            setTreinando(true);
            try {
              await api.acmpTreinar();
              await refetch();
              notify("Modelo retreinado");
            } catch (e: any) {
              notify(e.message || "Falha ao treinar", "erro");
            } finally {
              setTreinando(false);
            }
          }}
        >
          {treinando ? "Treinando…" : "Treinar LightGBM + SHAP"}
        </button>
      </div>
      {!inicio?.suficiente ? (
        <p className="vazio">
          Amostras insuficientes para avaliar: {inicio?.total_amostras ?? 0} paradas classificadas, mínimo de {inicio?.minimo ?? "—"}. Amplie o período ou remova filtros de máquina.
        </p>
      ) : (
        <>
          <section className="kpis">
            <CardKPI
              rotulo="Acurácia top-1"
              valor={pct(inicio.acuracia_top1, 1)}
              destaque
              detalhe={`Referência: ${pct(inicio.acuracia_baseline, 1)} (${(inicio.acuracia_top1 - inicio.acuracia_baseline) >= 0 ? "+" : ""}${pct(inicio.acuracia_top1 - inicio.acuracia_baseline, 1)})`}
            />
            <CardKPI
              rotulo="Acurácia top-3"
              valor={pct(inicio.acuracia_top3, 1)}
              destaque
              detalhe={`Referência: ${pct(inicio.acuracia_baseline_top3, 1)}`}
            />
            <CardKPI rotulo="F1 macro" valor={Number(inicio.f1_macro || 0).toFixed(3)} detalhe="Média não ponderada entre classes" />
            <CardKPI rotulo="Amostras" valor={num(inicio.total_amostras)} detalhe={`${inicio.treino} treino / ${inicio.teste} teste`} />
          </section>
          <Painel titulo="Momento da sugestão importa">
            <Tabela
              cabecalhos={["Cenário", "Atributos", "Top-1", "Top-3", "F1 macro"]}
              linhas={[
                ["Registro da parada", String(inicio.atributos?.length ?? "—"), pct(inicio.acuracia_top1, 1), pct(inicio.acuracia_top3, 1), Number(inicio.f1_macro || 0).toFixed(3)],
                ["Parada em curso", String(curso?.atributos?.length ?? "—"), pct(curso?.acuracia_top1, 1), pct(curso?.acuracia_top3, 1), Number(curso?.f1_macro || 0).toFixed(3)],
                ["Referência (mais frequente da máquina)", "—", pct(inicio.acuracia_baseline, 1), pct(inicio.acuracia_baseline_top3, 1), "—"],
              ]}
            />
          </Painel>
          {classes.length > 0 ? (
            <Painel titulo="Matriz de confusão">
              <p className="nota">Linhas: motivo real. Colunas: motivo previsto. A diagonal são os acertos.</p>
              <div className="tabela-rolagem">
                <table className="tabela mc">
                  <thead>
                    <tr>
                      <th className="mc__canto">Real \ Previsto</th>
                      {classes.map((c: string) => (
                        <th key={c} className="mc__col">
                          <span>{nomeDe(ds.data?.motivos, c)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((real: string) => (
                      <tr key={real}>
                        <th scope="row" className="mc__linha">
                          {nomeDe(ds.data?.motivos, real)}
                        </th>
                        {classes.map((pred: string) => (
                          <td key={pred} className={`mc__celula${real === pred ? " mc__celula--diagonal" : ""}`}>
                            {matriz[real]?.[pred] || ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Painel>
          ) : null}
          <Painel titulo="Desempenho por classe">
            <Tabela
              cabecalhos={["Motivo", "Suporte", "Precisão", "Revocação", "F1"]}
              linhas={(inicio.por_classe || [])
                .filter((p: any) => p.suporte > 0)
                .map((p: any) => [
                  nomeDe(ds.data?.motivos, p.classe) || p.classe,
                  num(p.suporte),
                  p.precisao == null ? "—" : pct(p.precisao, 1),
                  p.revocacao == null ? "—" : pct(p.revocacao, 1),
                  Number(p.f1 || 0).toFixed(3),
                ])}
            />
          </Painel>
        </>
      )}
      <Painel titulo="Aceitação em uso">
        {!aceit?.total ? (
          <p className="vazio">Nenhuma sugestão apresentada no período. Registre uma parada na tela de Operação para que a taxa de aceitação comece a ser medida.</p>
        ) : (
          <section className="kpis">
            <CardKPI rotulo="Sugestões apresentadas" valor={num(aceit.total)} />
            <CardKPI rotulo="Taxa de aceitação" valor={pct(aceit.taxa, 1)} detalhe={`${aceit.aceitas} de ${aceit.total}`} />
            <CardKPI rotulo="Aceitas" valor={num(aceit.aceitas)} />
          </section>
        )}
      </Painel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Auditoria                                                          */
/* ------------------------------------------------------------------ */

export function Auditoria() {
  const { f, setF, ds, q } = useGestao();
  const [extras, setExtras] = useState({ categoria: "", origem: "", acao: "", busca: "" });
  const qAud = [q, qs(extras)].filter(Boolean).join("&");
  const aud = useQuery({ queryKey: ["aud", qAud], queryFn: () => api.auditoria(qAud), enabled: !!ds.data });
  const [detalhe, setDetalhe] = useState<any>(null);
  const integ = aud.data?.integridade;
  const regs = aud.data?.registros || [];
  const sensiveis = regs.filter((r: any) => r.sensivel).length;

  function chExtra(k: string, v: string) {
    setExtras((e) => ({ ...e, [k]: v }));
  }

  return (
    <>
      <BarraFiltros
        ds={ds.data || {}}
        f={f}
        setF={setF}
        extras={
          <>
            <CampoFiltro id="f-aud-categoria" label="Categoria">
              <select id="f-aud-categoria" value={extras.categoria} onChange={(e) => chExtra("categoria", e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(AUDIT_CATEGORIAS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.rotulo}
                  </option>
                ))}
              </select>
            </CampoFiltro>
            <CampoFiltro id="f-aud-origem" label="Origem">
              <select id="f-aud-origem" value={extras.origem} onChange={(e) => chExtra("origem", e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(AUDIT_ORIGENS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.rotulo}
                  </option>
                ))}
              </select>
            </CampoFiltro>
            <CampoFiltro id="f-aud-acao" label="Ação">
              <select id="f-aud-acao" value={extras.acao} onChange={(e) => chExtra("acao", e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(AUDIT_ACOES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.rotulo}
                  </option>
                ))}
              </select>
            </CampoFiltro>
            <CampoFiltro id="f-aud-busca" label="Buscar">
              <input id="f-aud-busca" type="text" value={extras.busca} placeholder="usuário, registro, valor..." onChange={(e) => chExtra("busca", e.target.value)} />
            </CampoFiltro>
          </>
        }
      />
      <p className="nota">
        Trilha somente de inclusão: nenhuma ação da interface altera ou remove um registro já gravado. Editar um dado operacional gera um novo registro com o valor anterior e o novo.
      </p>
      {integ?.integra ? (
        <div className="aviso-integridade aviso-integridade--ok" role="status">
          <strong>✓ Corrente íntegra.</strong> {num(integ.total)} registros verificados, nenhuma alteração ou remoção detectada.
        </div>
      ) : (
        <div className="alerta-inconsistencia" role="alert">
          <strong>Corrente inconsistente.</strong> {(integ?.alterados?.length || 0)} registro(s) com conteúdo alterado após a gravação e {(integ?.quebras?.length || 0)} elo(s) rompido(s).
        </div>
      )}
      <section className="kpis">
        <CardKPI rotulo="Registros no período" valor={num(aud.data?.total ?? regs.length)} />
        <CardKPI rotulo="Ações sensíveis" valor={num(sensiveis)} alerta={sensiveis > 0} detalhe="Alteram indicadores já apurados" />
      </section>
      <Painel
        titulo="Registros"
        acoes={
          <button type="button" className="botao botao--pequeno" onClick={() => api.csv("auditoria")}>
            Exportar CSV
          </button>
        }
      >
        <Tabela
          cabecalhos={["Data e hora", "Origem", "Categoria", "Ação", "Usuário", "Máquina", "Descrição", ""]}
          linhas={regs.slice(0, 300).map((r: any) => {
            const cat = AUDIT_CATEGORIAS[r.categoria] || { rotulo: r.categoria, icone: "" };
            const acao = AUDIT_ACOES[r.acao] || { rotulo: r.acao };
            const origem = AUDIT_ORIGENS[r.origem]?.rotulo || r.origem;
            return [
              <span className="mono">{dataHora(r.ts)}</span>,
              <span className={`etiqueta etiqueta--origem-${r.origem}`}>{origem}</span>,
              `${cat.icone} ${cat.rotulo}`,
              <>
                {r.sensivel ? <span className="marca-sensivel" title="Altera indicadores já apurados">◆ </span> : null}
                {acao.rotulo}
              </>,
              r.usuario,
              r.maquina_id ? nomeDe(ds.data?.maquinas, r.maquina_id) : "—",
              r.descricao,
              <button
                type="button"
                className="botao botao--pequeno"
                onClick={async () => {
                  const d = await api.auditoriaDetalhe(r.id);
                  setDetalhe(d);
                }}
              >
                Detalhes
              </button>,
            ];
          })}
          vazio="Nenhuma ação registrada com os filtros atuais."
        />
      </Painel>
      {detalhe ? (
        <ModalShell titulo="Registro de auditoria" onClose={() => setDetalhe(null)} rodape={<button type="button" className="botao botao--primario" onClick={() => setDetalhe(null)}>Fechar</button>}>
          <p>{detalhe.descricao}</p>
          <h4 className="subtitulo">Ficha</h4>
          <div className="tabela-rolagem">
            <table className="tabela">
              <tbody>
                {[
                  ["Data e hora", dataHora(detalhe.ts)],
                  ["Ação", (AUDIT_ACOES[detalhe.acao]?.rotulo || detalhe.acao) + (detalhe.sensivel ? " (sensível)" : "")],
                  ["Categoria", AUDIT_CATEGORIAS[detalhe.categoria]?.rotulo || detalhe.categoria],
                  ["Origem", AUDIT_ORIGENS[detalhe.origem]?.rotulo || detalhe.origem],
                  ["Usuário", detalhe.usuario],
                  ["Máquina", detalhe.maquina_id ? nomeDe(ds.data?.maquinas, detalhe.maquina_id) : "—"],
                  ["Hash", detalhe.hash],
                ].map(([k, v]) => (
                  <tr key={String(k)}>
                    <th scope="row">{k}</th>
                    <td className="mono">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(detalhe.diferencas || []).length ? (
            <>
              <h4 className="subtitulo">Alterações</h4>
              <Tabela
                cabecalhos={["Campo", "Antes", "Depois"]}
                linhas={(detalhe.diferencas || []).map((m: any) => [m.campo, fmtAud(m.de), fmtAud(m.para)])}
              />
            </>
          ) : detalhe.depois ? (
            <>
              <h4 className="subtitulo">Valores registrados</h4>
              <Tabela cabecalhos={["Campo", "Valor"]} linhas={Object.entries(detalhe.depois).map(([k, v]) => [k, fmtAud(v)])} />
            </>
          ) : null}
          {detalhe.detalhes ? (
            <>
              <h4 className="subtitulo">Contexto</h4>
              <Tabela cabecalhos={["Campo", "Valor"]} linhas={Object.entries(detalhe.detalhes).map(([k, v]) => [k, fmtAud(v)])} />
            </>
          ) : null}
        </ModalShell>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Cadastros                                                          */
/* ------------------------------------------------------------------ */

type CampoCad = {
  k: string;
  r: string;
  tipo: "texto" | "numero" | "ref" | "lista" | "booleano" | "hora";
  obrigatorio?: boolean;
  colecao?: string;
  opcoes?: string[];
  min?: number;
};

const ENTIDADES: Record<string, { rotulo: string; singular: string; campos: CampoCad[]; colunas: string[] }> = {
  plantas: { rotulo: "Plantas", singular: "planta", campos: [{ k: "nome", r: "Nome", tipo: "texto", obrigatorio: true }, { k: "cidade", r: "Cidade", tipo: "texto" }], colunas: ["nome", "cidade"] },
  areas: { rotulo: "Áreas", singular: "área", campos: [{ k: "nome", r: "Nome", tipo: "texto", obrigatorio: true }, { k: "planta_id", r: "Planta", tipo: "ref", colecao: "plantas", obrigatorio: true }], colunas: ["nome", "planta_id"] },
  linhas: {
    rotulo: "Linhas",
    singular: "linha",
    campos: [
      { k: "nome", r: "Nome", tipo: "texto", obrigatorio: true },
      { k: "area_id", r: "Área", tipo: "ref", colecao: "areas", obrigatorio: true },
      { k: "parada_longa_min", r: "Parada longa (min, vazio = geral)", tipo: "numero", min: 1 },
      { k: "sem_peca_min", r: "Sem peça (min, vazio = geral)", tipo: "numero", min: 1 },
    ],
    colunas: ["nome", "area_id", "parada_longa_min", "sem_peca_min"],
  },
  maquinas: {
    rotulo: "Máquinas",
    singular: "máquina",
    campos: [
      { k: "nome", r: "Nome", tipo: "texto", obrigatorio: true },
      { k: "linha_id", r: "Linha", tipo: "ref", colecao: "linhas", obrigatorio: true },
      { k: "ciclo_ideal_seg", r: "Ciclo ideal (s/peça)", tipo: "numero", obrigatorio: true, min: 0.1 },
      { k: "meta_turno", r: "Meta por turno (peças)", tipo: "numero", min: 0 },
      { k: "perfil", r: "Perfil de simulação", tipo: "lista", opcoes: PERFIS },
    ],
    colunas: ["nome", "linha_id", "ciclo_ideal_seg", "meta_turno"],
  },
  produtos: {
    rotulo: "Produtos",
    singular: "produto",
    campos: [
      { k: "sku", r: "Código (SKU)", tipo: "texto", obrigatorio: true },
      { k: "nome", r: "Nome", tipo: "texto", obrigatorio: true },
      { k: "ciclo_ideal_seg", r: "Ciclo ideal (s/peça)", tipo: "numero", obrigatorio: true, min: 0.1 },
    ],
    colunas: ["sku", "nome", "ciclo_ideal_seg"],
  },
  ordens: {
    rotulo: "Ordens de produção",
    singular: "ordem",
    campos: [
      { k: "codigo", r: "Código", tipo: "texto", obrigatorio: true },
      { k: "maquina_id", r: "Máquina", tipo: "ref", colecao: "maquinas", obrigatorio: true },
      { k: "produto_id", r: "Produto", tipo: "ref", colecao: "produtos", obrigatorio: true },
      { k: "turno_id", r: "Turno", tipo: "ref", colecao: "turnos" },
      { k: "operador_id", r: "Operador", tipo: "ref", colecao: "operadores" },
      { k: "meta_qtd", r: "Meta (peças)", tipo: "numero", obrigatorio: true, min: 1 },
      { k: "ciclo_ideal_seg", r: "Ciclo ideal (s/peça)", tipo: "numero", obrigatorio: true, min: 0.1 },
      { k: "status", r: "Status", tipo: "lista", opcoes: ["PLANEJADA", "EM_ANDAMENTO", "FINALIZADA"] },
    ],
    colunas: ["codigo", "maquina_id", "produto_id", "meta_qtd", "status"],
  },
  turnos: {
    rotulo: "Turnos",
    singular: "turno",
    campos: [
      { k: "nome", r: "Nome", tipo: "texto", obrigatorio: true },
      { k: "inicio", r: "Início (HH:MM)", tipo: "hora", obrigatorio: true },
      { k: "fim", r: "Fim (HH:MM)", tipo: "hora", obrigatorio: true },
    ],
    colunas: ["nome", "inicio", "fim"],
  },
  operadores: {
    rotulo: "Operadores",
    singular: "operador",
    campos: [
      { k: "matricula", r: "Matrícula", tipo: "texto", obrigatorio: true },
      { k: "nome", r: "Nome", tipo: "texto", obrigatorio: true },
      { k: "turno_id", r: "Turno", tipo: "ref", colecao: "turnos" },
    ],
    colunas: ["matricula", "nome", "turno_id"],
  },
  motivos: {
    rotulo: "Motivos de parada",
    singular: "motivo",
    campos: [
      { k: "categoria", r: "Categoria", tipo: "texto", obrigatorio: true },
      { k: "nome", r: "Motivo", tipo: "texto", obrigatorio: true },
      { k: "planejada", r: "Parada planejada", tipo: "booleano" },
      { k: "estado_sugerido", r: "Estado sugerido", tipo: "lista", opcoes: Object.keys(ESTADOS), obrigatorio: true },
    ],
    colunas: ["categoria", "nome", "planejada", "estado_sugerido"],
  },
};

const ABAS_CAD = [...Object.keys(ENTIDADES), "metas"];

export function Cadastros({ notify }: { notify: Notify }) {
  const qc = useQueryClient();
  const [ent, setEnt] = useState("maquinas");
  const ds = useQuery({ queryKey: ["ds"], queryFn: api.dataset });
  const lista = useQuery({ queryKey: ["cad", ent], queryFn: () => (ent === "metas" ? Promise.resolve([]) : api.cadastros(ent)), enabled: ent !== "metas" });
  const cfg = useQuery({ queryKey: ["cfg"], queryFn: api.config });
  const [modal, setModal] = useState<{ id?: string } | null>(null);
  const [vals, setVals] = useState<Record<string, any>>({});
  const [erro, setErro] = useState("");
  const def = ENTIDADES[ent];

  function abrirNovo() {
    const v: Record<string, any> = {};
    def.campos.forEach((c) => {
      v[c.k] = c.tipo === "booleano" ? false : c.tipo === "lista" ? c.opcoes?.[0] || "" : "";
    });
    setVals(v);
    setErro("");
    setModal({});
  }

  function abrirEditar(item: any) {
    const v: Record<string, any> = {};
    def.campos.forEach((c) => {
      v[c.k] = item[c.k] ?? (c.tipo === "booleano" ? false : "");
    });
    setVals(v);
    setErro("");
    setModal({ id: item.id });
  }

  function celula(item: any, k: string) {
    const campo = def.campos.find((c) => c.k === k);
    const valor = item[k];
    if (campo?.tipo === "ref") return nomeDe(ds.data?.[campo.colecao || ""], valor, campo.colecao === "ordens" ? "codigo" : "nome");
    if (campo?.tipo === "booleano") return valor ? "Sim" : "Não";
    return valor == null ? "—" : String(valor);
  }

  async function salvar() {
    for (const c of def.campos) {
      let valor = vals[c.k];
      if (c.tipo === "numero") {
        valor = valor === "" || valor == null ? null : Number(valor);
        if (c.obrigatorio && (valor == null || Number.isNaN(valor))) {
          setErro(`O campo ${c.r} é obrigatório.`);
          return;
        }
        if (c.min != null && valor != null && valor < c.min) {
          setErro(`O campo ${c.r} deve ser maior ou igual a ${c.min}.`);
          return;
        }
      } else if (c.obrigatorio && (valor === "" || valor == null)) {
        setErro(`O campo ${c.r} é obrigatório.`);
        return;
      }
    }
    const dados: Record<string, any> = {};
    def.campos.forEach((c) => {
      let valor = vals[c.k];
      if (c.tipo === "numero") valor = valor === "" || valor == null ? null : Number(valor);
      if (c.tipo === "booleano") valor = !!valor;
      dados[c.k] = valor;
    });
    if (ent === "maquinas" && !modal?.id) {
      dados.estado_atual = "SEM_ORDEM";
      dados.ativa = true;
    }
    if (ent === "ordens" && !modal?.id) {
      dados.status = dados.status || "PLANEJADA";
      dados.inicio = Date.now();
    }
    try {
      if (modal?.id) await api.alterarCadastro(ent, modal.id, dados);
      else await api.criarCadastro(ent, dados);
      await qc.invalidateQueries();
      notify("Registro salvo.");
      setModal(null);
    } catch (e: any) {
      setErro(e.message || "Falha ao salvar");
    }
  }

  async function excluir(id: string) {
    if (!window.confirm("Excluir este registro?")) return;
    try {
      await api.excluirCadastro(ent, id);
      await qc.invalidateQueries();
      notify("Registro excluído.");
    } catch (e: any) {
      notify(e.message || "Exclusão bloqueada", "erro");
    }
  }

  return (
    <>
      <nav className="abas" aria-label="Cadastros">
        {ABAS_CAD.map((k) => (
          <button key={k} type="button" className={`aba${k === ent ? " aba--ativa" : ""}`} onClick={() => setEnt(k)}>
            {k === "metas" ? "Metas e ciclos" : ENTIDADES[k].rotulo}
          </button>
        ))}
      </nav>
      {ent === "metas" ? (
        <Painel titulo="Metas e ciclos ideais">
          {cfg.data ? (
            <form
              className="formulario formulario--grade"
              id="form-metas"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target as HTMLFormElement);
                try {
                  await api.salvarConfig({
                    meta_oee: Number(fd.get("meta_oee")) / 100,
                    meta_setup_min: Number(fd.get("meta_setup_min")),
                    meta_refugo_pct: Number(fd.get("meta_refugo_pct")) / 100,
                    limite_microparada_seg: Number(fd.get("limite_microparada_seg")),
                    parada_longa_min: Number(fd.get("parada_longa_min")),
                    sem_peca_min: Number(fd.get("sem_peca_min")),
                    retrabalho_na_qualidade: fd.get("retrabalho_na_qualidade") === "on",
                    alerta_webhook_url: String(fd.get("alerta_webhook_url") || ""),
                  });
                  await qc.invalidateQueries({ queryKey: ["cfg"] });
                  notify("Metas salvas.");
                } catch (err: any) {
                  notify(err.message || "Falha ao salvar metas", "erro");
                }
              }}
            >
              <label htmlFor="m-oee">Meta de OEE (%)</label>
              <input id="m-oee" name="meta_oee" type="number" min={1} max={100} step={1} defaultValue={Math.round((cfg.data.meta_oee || 0.75) * 100)} />
              <label htmlFor="m-setup">Meta de tempo de setup (min)</label>
              <input id="m-setup" name="meta_setup_min" type="number" min={1} step={1} defaultValue={cfg.data.meta_setup_min || 20} />
              <label htmlFor="m-refugo">Meta de refugo (%)</label>
              <input id="m-refugo" name="meta_refugo_pct" type="number" min={0} max={100} step={0.1} defaultValue={((cfg.data.meta_refugo_pct || 0.02) * 100).toFixed(1)} />
              <label htmlFor="m-micro">Limite de microparada (s)</label>
              <input id="m-micro" name="limite_microparada_seg" type="number" min={10} step={10} defaultValue={cfg.data.limite_microparada_seg || 300} />
              <label htmlFor="m-longa">Parada longa (min)</label>
              <input id="m-longa" name="parada_longa_min" type="number" min={1} step={1} defaultValue={cfg.data.parada_longa_min || 15} />
              <label htmlFor="m-sempeca">Produzindo sem peça (min)</label>
              <input id="m-sempeca" name="sem_peca_min" type="number" min={1} step={1} defaultValue={cfg.data.sem_peca_min || 20} />
              <label htmlFor="m-retrab">
                <input id="m-retrab" name="retrabalho_na_qualidade" type="checkbox" defaultChecked={!!cfg.data.retrabalho_na_qualidade} /> Retrabalho conta como perda de qualidade
              </label>
              <label htmlFor="m-hook">Endereço para aviso de alerta crítico</label>
              <input id="m-hook" name="alerta_webhook_url" type="url" placeholder="https://..." defaultValue={cfg.data.alerta_webhook_url || ""} />
              <div />
              <button type="submit" className="botao botao--primario">
                Salvar metas
              </button>
            </form>
          ) : (
            <p className="vazio">Carregando metas...</p>
          )}
          <h4 className="subtitulo">Ciclos ideais cadastrados</h4>
          <Tabela
            cabecalhos={["Produto", "SKU", "Ciclo ideal (s)"]}
            linhas={(ds.data?.produtos || []).map((p: any) => [p.nome, p.sku, num(p.ciclo_ideal_seg, 1)])}
          />
          <p className="nota">O ciclo ideal por produto é editado na aba Produtos; o ciclo padrão de cada equipamento, na aba Máquinas.</p>
        </Painel>
      ) : (
        <Painel
          titulo={def.rotulo}
          acoes={
            <button type="button" className="botao botao--primario" onClick={abrirNovo}>
              Adicionar {def.singular}
            </button>
          }
        >
          <Tabela
            cabecalhos={[...def.colunas.map((c) => def.campos.find((x) => x.k === c)?.r || c), "Ações"]}
            linhas={(lista.data || []).map((item: any) => [
              ...def.colunas.map((c) => celula(item, c)),
              <>
                <button type="button" className="botao botao--pequeno" onClick={() => abrirEditar(item)}>
                  Editar
                </button>{" "}
                <button type="button" className="botao botao--pequeno botao--perigo" onClick={() => excluir(item.id)}>
                  Excluir
                </button>
              </>,
            ])}
            vazio="Nenhum registro cadastrado."
          />
        </Painel>
      )}
      {modal && def ? (
        <ModalShell
          titulo={`${modal.id ? "Editar" : "Adicionar"} ${def.singular}`}
          onClose={() => setModal(null)}
          rodape={
            <>
              <button type="button" className="botao botao--secundario" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button type="button" className="botao botao--primario" onClick={salvar}>
                Salvar
              </button>
            </>
          }
        >
          <div className="formulario">
            {def.campos.map((c) => {
              const id = `c-${c.k}`;
              return (
                <div key={c.k}>
                  <label htmlFor={id}>
                    {c.r}
                    {c.obrigatorio ? " *" : ""}
                  </label>
                  {c.tipo === "ref" ? (
                    <SelectLista id={id} value={vals[c.k] || ""} onChange={(v) => setVals({ ...vals, [c.k]: v })} lista={ds.data?.[c.colecao || ""] || []} vazio={c.obrigatorio ? undefined : "—"} campo={c.colecao === "ordens" ? "codigo" : "nome"} />
                  ) : c.tipo === "lista" ? (
                    <select id={id} value={vals[c.k] || ""} onChange={(e) => setVals({ ...vals, [c.k]: e.target.value })}>
                      {(c.opcoes || []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : c.tipo === "booleano" ? (
                    <input type="checkbox" id={id} checked={!!vals[c.k]} onChange={(e) => setVals({ ...vals, [c.k]: e.target.checked })} />
                  ) : c.tipo === "numero" ? (
                    <input type="number" id={id} step="any" value={vals[c.k] ?? ""} onChange={(e) => setVals({ ...vals, [c.k]: e.target.value })} />
                  ) : c.tipo === "hora" ? (
                    <input type="time" id={id} value={vals[c.k] || ""} onChange={(e) => setVals({ ...vals, [c.k]: e.target.value })} />
                  ) : (
                    <input type="text" id={id} value={vals[c.k] || ""} onChange={(e) => setVals({ ...vals, [c.k]: e.target.value })} />
                  )}
                </div>
              );
            })}
            {erro ? <p className="erro-campo">{erro}</p> : null}
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

export function Configuracoes({ notify }: { notify: Notify }) {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({ queryKey: ["cfg"], queryFn: api.config });
  const ds = useQuery({ queryKey: ["ds"], queryFn: api.dataset });
  const [sim, setSim] = useState(false);
  const [intervalo, setIntervalo] = useState(5);
  const [auditar, setAuditar] = useState(true);
  const [acmp, setAcmp] = useState(true);
  let papel = "";
  try {
    papel = JSON.parse(localStorage.getItem("oee.session") || "{}")?.papel || "";
  } catch {
    papel = "";
  }
  const gestao = papel === "gestao";

  useEffect(() => {
    if (!data) return;
    setSim(!!data.simulacao_ativa);
    setIntervalo(data.intervalo_simulacao_seg || 5);
    setAuditar(data.auditar_simulacao !== false);
    setAcmp(data.acmp_ativo !== false);
  }, [data]);

  if (!data) return <p className="vazio">Carregando...</p>;

  return (
    <>
      {!gestao ? (
        <p className="nota">Consulta das configurações do posto. Alterar simulação, ACMP e dados de demonstração exige perfil de gestão.</p>
      ) : null}
      <Painel titulo="Simulação de dados">
        <p className="nota">A simulação avança produção e eventos das máquinas para demonstrar a tela em tempo próximo ao real. Ela substitui, no MVP, a leitura de CLP, OPC UA ou MQTT.</p>
        <div className="linha-controles">
          <label className="interruptor">
            <input type="checkbox" id="chk-simulacao" checked={sim} disabled={!gestao} onChange={(e) => setSim(e.target.checked)} />
            <span>Simulação ativa</span>
          </label>
          <label htmlFor="int-simulacao">Intervalo (s)</label>
          <input id="int-simulacao" type="number" min={1} max={60} value={intervalo} disabled={!gestao} onChange={(e) => setIntervalo(Number(e.target.value))} style={{ width: 90 }} />
          <label className="interruptor">
            <input type="checkbox" id="chk-auditar-simulacao" checked={auditar} disabled={!gestao} onChange={(e) => setAuditar(e.target.checked)} />
            <span>Auditar eventos simulados</span>
          </label>
          <button
            type="button"
            className="botao botao--secundario"
            disabled={!gestao}
            onClick={async () => {
              try {
                await api.salvarConfig({ simulacao_ativa: sim, intervalo_simulacao_seg: intervalo, auditar_simulacao: auditar });
                await refetch();
                notify("Simulação atualizada.");
              } catch (e: any) {
                notify(e.message || "Falha ao salvar", "erro");
              }
            }}
          >
            Aplicar
          </button>
          <button
            type="button"
            className="botao botao--secundario"
            disabled={!gestao}
            onClick={async () => {
              try {
                await api.tick();
                await qc.invalidateQueries();
                notify("Tick da simulação executado.");
              } catch (e: any) {
                notify(e.message || "Falha no tick", "erro");
              }
            }}
          >
            Tick
          </button>
        </div>
        <p className="nota">
          Os eventos do simulador entram na trilha marcados como origem <em>Simulação</em>, nunca como ação humana.
        </p>
      </Painel>

      <Painel titulo="Assistente ACMP">
        <p className="nota">Sugere ao operador os três motivos mais prováveis ao registrar uma parada, com a evidência de cada sugestão. Desligado, a árvore de motivos funciona exatamente como antes.</p>
        <div className="linha-controles">
          <label className="interruptor">
            <input type="checkbox" id="chk-acmp" checked={acmp} disabled={!gestao} onChange={(e) => setAcmp(e.target.checked)} />
            <span>Sugestões ativas na tela do operador</span>
          </label>
          <button
            type="button"
            className="botao botao--secundario"
            disabled={!gestao}
            onClick={async () => {
              try {
                await api.salvarConfig({ acmp_ativo: acmp });
                await refetch();
                notify("ACMP atualizado.");
              } catch (e: any) {
                notify(e.message || "Falha ao salvar", "erro");
              }
            }}
          >
            Aplicar
          </button>
          {gestao ? (
            <Link className="botao botao--secundario" to="/assistente">
              Ver avaliação do modelo
            </Link>
          ) : null}
        </div>
      </Painel>

      <Painel titulo="Dados">
        <p className="nota">
          Registros armazenados: {num(ds.data?.eventos_estado?.length)} eventos de estado, {num(ds.data?.eventos_producao?.length)} apontamentos de produção, {num(ds.data?.eventos_parada?.length)} paradas, {num(ds.data?.auditoria?.length)} registros de auditoria.
        </p>
        <div className="linha-controles">
          <button type="button" className="botao botao--primario" disabled={!gestao} onClick={() => api.exportar()}>
            Exportar JSON
          </button>
          <label className={`botao botao--secundario${!gestao ? " botao--desabilitado" : ""}`}>
            Importar JSON
            <input
              type="file"
              accept="application/json,.json"
              hidden
              disabled={!gestao}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await api.importar(file);
                  await qc.invalidateQueries();
                  notify("Dataset importado");
                } catch (err: any) {
                  notify(err.message || "Falha ao importar", "erro");
                }
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="botao botao--perigo"
            disabled={!gestao}
            onClick={async () => {
              if (!window.confirm("Restaurar os dados de demonstração? Os dados atuais serão substituídos.")) return;
              try {
                await api.demo(7);
                await qc.invalidateQueries();
                notify("Demonstração restaurada.");
              } catch (err: any) {
                notify(err.message || "Falha ao restaurar", "erro");
              }
            }}
          >
            Restaurar dados de demonstração
          </button>
        </div>
        <h4 className="subtitulo">Exportar CSV</h4>
        <div className="linha-controles">
          {[
            ["paradas", "Paradas"],
            ["producao", "Produção"],
            ["estados", "Estados"],
            ["ordens", "Ordens"],
            ["auditoria", "Trilha de auditoria"],
            ["oee-maquina", "OEE por máquina"],
          ].map(([tipo, rotulo]) => (
            <button key={tipo} type="button" className="botao botao--secundario" onClick={() => api.csv(tipo)}>
              {rotulo}
            </button>
          ))}
        </div>
      </Painel>
    </>
  );
}

function papelSessao() {
  try {
    return JSON.parse(localStorage.getItem("oee.session") || "{}")?.papel || "";
  } catch {
    return "";
  }
}

function rotuloStatusManual(status?: string) {
  if (status === "pronto") return "Pronto";
  if (status === "processando") return "Indexando…";
  if (status === "erro") return "Erro";
  return status || "—";
}

export function Manuais({ notify }: { notify: Notify }) {
  const qc = useQueryClient();
  const gestao = papelSessao() === "gestao";
  const { data, isFetching } = useQuery({
    queryKey: ["man"],
    queryFn: api.manuais,
    refetchInterval: (q) => ((q.state.data || []).some((m: any) => m.status === "processando") ? 3000 : false),
  });
  const ds = useQuery({ queryKey: ["ds"], queryFn: api.dataset });
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!gestao || enviando) return;
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const arquivo = fd.get("arquivo") as File | null;
    if (!arquivo || arquivo.size === 0) {
      notify("Selecione um PDF.", "erro");
      return;
    }
    if (arquivo.size > 35 * 1024 * 1024) {
      notify("PDF acima de 35 MB.", "erro");
      return;
    }
    setEnviando(true);
    try {
      await api.uploadManual(fd);
      await qc.invalidateQueries({ queryKey: ["man"] });
      notify("Manual enviado. A indexação começa em seguida.");
      form.reset();
    } catch (err: any) {
      notify(err.message || "Falha no envio", "erro");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <p className="nota">
        Envie o PDF do posto (texto selecionável). O operador vê o passo a passo em O que fazer. Foto de papel sem texto não entra.
      </p>
      {gestao ? (
        <form className="filtros" onSubmit={enviar}>
          <CampoFiltro id="man-titulo" label="Título">
            <input id="man-titulo" name="titulo" required placeholder="Manual do torno CNC 01" disabled={enviando} />
          </CampoFiltro>
          <CampoFiltro id="man-maquina" label="Máquina">
            <select id="man-maquina" name="maquina_id" aria-label="Máquina" disabled={enviando}>
              <option value="">Geral — todas as máquinas</option>
              {(ds.data?.maquinas || []).map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </CampoFiltro>
          <CampoFiltro id="man-arquivo" label="Arquivo PDF (até 35 MB)">
            <input id="man-arquivo" name="arquivo" type="file" accept="application/pdf,.pdf" required disabled={enviando} />
          </CampoFiltro>
          <div className="filtros__acoes">
            <button className="botao botao--primario" type="submit" disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar PDF"}
            </button>
          </div>
        </form>
      ) : (
        <p className="nota">O envio de manuais exige perfil de gestão. O operador usa a tela O que fazer para ver o passo a passo.</p>
      )}
      <Painel titulo={isFetching ? "Manuais indexados — atualizando" : "Manuais indexados"}>
        <Tabela
          cabecalhos={gestao ? ["Título", "Máquina", "Status", "Páginas", "Trechos", "Detalhe", "Ações"] : ["Título", "Máquina", "Status", "Páginas", "Trechos", "Detalhe"]}
          linhas={(data || []).map((man: any) => {
            const detalhe = man.status === "erro" ? man.erro || "Falha na indexação" : man.status === "processando" ? "Aguardando o worker" : "Disponível no chat";
            const cols: any[] = [
              man.titulo,
              man.maquina_id ? nomeDe(ds.data?.maquinas, man.maquina_id) : "Geral",
              <span className={`etiqueta${man.status === "erro" ? " etiqueta--alerta" : ""}`}>{rotuloStatusManual(man.status)}</span>,
              num(man.paginas),
              num(man.chunks),
              detalhe,
            ];
            if (gestao) {
              cols.push(
                <div className="linha-controles">
                  <button
                    type="button"
                    className="botao botao--secundario"
                    disabled={man.status === "processando"}
                    onClick={async () => {
                      try {
                        await api.reprocessarManual(man.id);
                        await qc.invalidateQueries({ queryKey: ["man"] });
                        notify("Indexação reiniciada.");
                      } catch (err: any) {
                        notify(err.message || "Falha ao reprocessar", "erro");
                      }
                    }}
                  >
                    Reindexar
                  </button>
                  <button
                    type="button"
                    className="botao botao--perigo"
                    onClick={async () => {
                      if (!window.confirm(`Excluir o manual “${man.titulo}”? Os trechos saem do chat.`)) return;
                      try {
                        await api.excluirManual(man.id);
                        await qc.invalidateQueries({ queryKey: ["man"] });
                        notify("Manual excluído.");
                      } catch (err: any) {
                        notify(err.message || "Falha ao excluir", "erro");
                      }
                    }}
                  >
                    Excluir
                  </button>
                </div>,
              );
            }
            return cols;
          })}
          vazio="Nenhum manual enviado."
        />
      </Painel>
    </>
  );
}

function RespostaCurta({ texto }: { texto: string }) {
  const limpo = String(texto || "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .trim();
  const linhas = limpo.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const passos = linhas.filter((l) => /^\d+[\).:-]/.test(l));
  const outras = linhas.filter((l) => !/^\d+[\).:-]/.test(l));
  const titulo = outras[0];
  const rodape = outras.slice(1);
  return (
    <div className="chat-resposta">
      {titulo ? <p className="chat-resposta__titulo">{titulo}</p> : null}
      {passos.length ? (
        <ol className="chat-passos">
          {passos.map((p, i) => (
            <li key={i}>{p.replace(/^\d+[\).:-]\s*/, "")}</li>
          ))}
        </ol>
      ) : null}
      {rodape.map((p, i) => (
        <p key={i} className="chat-resposta__nota">
          {p}
        </p>
      ))}
    </div>
  );
}

export function Chat() {
  const ds = useQuery({ queryKey: ["ds"], queryFn: api.dataset });
  const manuais = useQuery({ queryKey: ["man"], queryFn: api.manuais, refetchInterval: 8000 });
  const [maq, setMaq] = useState("");
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<any[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [fonteAberta, setFonteAberta] = useState<string | null>(null);
  const prontos = (manuais.data || []).filter((m: any) => m.status === "pronto");
  const sugestoes = perguntasDoPosto(maq);
  const nomeMaq = (ds.data?.maquinas || []).find((m: any) => m.id === maq)?.nome;

  async function perguntar(texto: string) {
    const pergunta = texto.trim();
    if (!pergunta || enviando) return;
    setErro("");
    setQ("");
    setMsgs((m) => [...m, { papel: "user", texto: pergunta }]);
    setEnviando(true);
    try {
      const r = await api.chat({ pergunta, maquina_id: maq || null });
      setMsgs((m) => [...m, { papel: "assistant", texto: r.resposta, citacoes: r.citacoes }]);
    } catch (err: any) {
      setErro(err.message || "Não deu para consultar agora.");
      setMsgs((m) => [...m, { papel: "assistant", texto: "Não consegui abrir o manual agora. Tente de novo ou chame o supervisor." }]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="chat-tela">
      <p className="nota">
        Escolha a máquina e pergunte o status, a última parada, a produção do turno ou o que fazer. O número sai do apontamento. O passo a passo sai do manual. Nada liga nem para a máquina.
        {prontos.length ? "" : " Ainda não há manual pronto — gestão envia o PDF em Manuais."}
      </p>
      <section className="painel">
        <h3 className="painel__titulo">1. Qual máquina você está?</h3>
        <div className="chat-campo">
          <label htmlFor="chat-maquina">Máquina do posto</label>
          <select
            id="chat-maquina"
            value={maq}
            onChange={(e) => {
              setMaq(e.target.value);
              setMsgs([]);
              setErro("");
            }}
            disabled={enviando}
          >
            <option value="">Escolha a máquina</option>
            {(ds.data?.maquinas || []).map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className="painel">
        <h3 className="painel__titulo">{maq ? `2. Qual o problema em ${nomeMaq}?` : "2. Qual o problema?"}</h3>
        {!maq ? (
          <p className="vazio">Escolha a máquina acima. Aí aparecem as perguntas certas do seu posto.</p>
        ) : (
          <>
            <div className="chat-sugestoes" role="group" aria-label="Problemas mais comuns neste posto">
              {sugestoes.map((s) => (
                <button key={s} type="button" className="chat-sugestao" disabled={enviando} onClick={() => perguntar(s)}>
                  {s}
                </button>
              ))}
            </div>
            <form
              className="chat-composer chat-composer--depois"
              onSubmit={(e) => {
                e.preventDefault();
                perguntar(q);
              }}
            >
              <div className="chat-campo chat-campo--pergunta">
                <label htmlFor="chat-pergunta">Se o problema não está na lista, escreva em uma frase</label>
                <input
                  id="chat-pergunta"
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ex.: alarme F-41, falta de kit, peça queimada"
                  disabled={enviando}
                  autoComplete="off"
                />
              </div>
              <button className="botao botao--primario chat-enviar" type="submit" disabled={enviando || !q.trim()}>
                {enviando ? "Buscando…" : "Ver o que fazer"}
              </button>
            </form>
          </>
        )}
        {erro ? <p className="erro-campo">{erro}</p> : null}
      </section>
      {msgs.length ? (
        <section className="painel">
          <h3 className="painel__titulo">Faça isto agora</h3>
          <div className="chat-mensagens" aria-live="polite">
            {msgs.map((m, i) => (
              <article key={i} className={`chat-bolha ${m.papel === "user" ? "chat-bolha--user" : "chat-bolha--assistente"}`}>
                <p className="chat-bolha__papel">{m.papel === "user" ? "Você perguntou" : "Resposta"}</p>
                {m.papel === "user" ? <p>{m.texto}</p> : <RespostaCurta texto={m.texto} />}
                {m.papel === "assistant"
                  ? (m.citacoes || []).slice(0, 1).map((c: any, j: number) => {
                      const id = `${i}-${j}`;
                      return (
                        <div key={id}>
                          <button type="button" className="chat-fonte" onClick={() => setFonteAberta(fonteAberta === id ? null : id)}>
                            Ver no manual · p. {c.pagina}
                          </button>
                          {fonteAberta === id && c.trecho ? <p className="chat-citacao">{c.trecho}</p> : null}
                        </div>
                      );
                    })
                  : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
