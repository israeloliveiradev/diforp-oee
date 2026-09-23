import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { api, getToken, setToken } from "./infrastructure/api";
import { ROTAS } from "./domain/catalog";
import {
  Assistente,
  Auditoria,
  Cadastros,
  Chat,
  Configuracoes,
  Insights,
  Manuais,
  Maquinas,
  Operacao,
  Paradas,
  Performance,
  Producao,
  Qualidade,
  VisaoGeral,
} from "./presentation/screens";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

function useSession() {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem("oee.session");
    return raw ? JSON.parse(raw) : null;
  });
  function login(s: any) {
    localStorage.setItem("oee.session", JSON.stringify(s));
    setAuth(s);
  }
  function logout() {
    localStorage.removeItem("oee.session");
    setToken(null);
    setAuth(null);
  }
  return { auth, login, logout };
}

export default function App() {
  const { auth, login, logout } = useSession();
  const loc = useLocation();
  const [modo, setModo] = useState(localStorage.getItem("oee.modo") || "gestao");
  const [aviso, setAviso] = useState<{ msg: string; tipo?: string } | null>(null);
  const notify = (msg: string, tipo = "ok") => {
    setAviso({ msg, tipo });
    setTimeout(() => setAviso(null), 4000);
  };

  useEffect(() => {
    if (auth?.papel === "operador") setModo("operador");
    document.body.setAttribute("data-modo", modo);
    localStorage.setItem("oee.modo", modo);
  }, [modo, auth]);

  const rota = loc.pathname.replace("/", "") || (auth?.papel === "operador" ? "operacao" : "visao-geral");

  useEffect(() => {
    document.body.dataset.rota = rota;
  }, [rota]);

  if (!getToken() || !auth) {
    return <Login onOk={(s) => login(s)} />;
  }

  const visiveis = ROTAS.filter((r) => {
    if (auth.papel === "operador") return r.modo === "ambos";
    return modo === "gestao" || r.modo === "ambos";
  });
  const idx = Math.max(0, ROTAS.findIndex((r) => r.id === rota));
  const modoEfetivo = auth.papel === "operador" ? "operador" : modo;

  return (
    <>
      <div className="filete-semantico" aria-hidden="true">
        <span className="filete-semantico__petroleo" />
        <span className="filete-semantico__ambar" />
        <span className="filete-semantico__salvia" />
        <span className="filete-semantico__pedra" />
      </div>
      <div className="aplicacao">
        <aside className="lateral">
          <div className="marca">
            <div className="marca__logo" role="img" aria-label="DiFORP" />
            <p className="marca__produto">OEE · Monitoramento de Eficiência</p>
          </div>
          <nav className="menu" aria-label="Navegação principal">
            {visiveis.map((r) => (
              <Link
                key={r.id}
                to={`/${r.id}`}
                className={`menu__item${rota === r.id ? " menu__item--ativo" : ""}`}
                data-modo={r.modo}
                aria-current={rota === r.id ? "page" : undefined}
              >
                <span className="menu__icone" aria-hidden="true">
                  {r.icone}
                </span>
                <span className="menu__rotulo">{r.rotulo}</span>
              </Link>
            ))}
          </nav>
          <div className="lateral__rodape">
            {auth.papel === "gestao" && (
              <button type="button" className="botao botao--secundario" style={{ width: "100%" }} onClick={() => setModo(modo === "gestao" ? "operador" : "gestao")}>
                Alternar modo Operador / Gestão
              </button>
            )}
            <p className="marca__produto" style={{ marginTop: 8 }}>
              {auth.nome} · {auth.papel}
            </p>
            <button type="button" className="botao botao--secundario" style={{ width: "100%", marginTop: 8 }} onClick={logout}>
              Sair
            </button>
          </div>
        </aside>
        <div className="principal">
          <header className="topo">
            <div className="topo__identificacao">
              <span className="topo__eyebrow">§ {String(idx + 1).padStart(2, "0")}</span>
              <h2 className="topo__titulo">{ROTAS[idx]?.rotulo || "OEE"}</h2>
            </div>
            <Relogio />
          </header>
          <div className="trace" aria-hidden="true">
            <svg viewBox="0 0 1080 22" preserveAspectRatio="none">
              <line x1="0" y1="11" x2="1080" y2="11" stroke="rgba(159,182,188,.18)" strokeWidth="1" />
              <polyline points="0,11 700,11 712,4 724,19 736,11 1080,11" fill="none" stroke="rgba(159,182,188,.5)" strokeWidth="1.5" />
              <circle cx="724" cy="19" r="3.5" fill="#D97B29" />
            </svg>
          </div>
          <main className="conteudo">
            <Routes>
              <Route path="/" element={<Navigate to={auth.papel === "operador" || modoEfetivo === "operador" ? "/operacao" : "/visao-geral"} replace />} />
              <Route path="/login" element={<Navigate to="/visao-geral" replace />} />
              <Route path="/visao-geral" element={<VisaoGeral />} />
              <Route path="/operacao" element={<Operacao notify={notify} />} />
              <Route path="/maquinas" element={<Maquinas />} />
              <Route path="/producao" element={<Producao />} />
              <Route path="/paradas" element={<Paradas notify={notify} />} />
              <Route path="/qualidade" element={<Qualidade />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/assistente" element={<Assistente notify={notify} />} />
              <Route path="/manuais" element={<Manuais notify={notify} />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/auditoria" element={<Auditoria />} />
              <Route path="/cadastros" element={<Cadastros notify={notify} />} />
              <Route path="/configuracoes" element={<Configuracoes notify={notify} />} />
            </Routes>
          </main>
        </div>
      </div>
      <div id="area-avisos" aria-live="polite">
        {aviso ? <div className={`aviso${aviso.tipo === "erro" ? " aviso--erro" : aviso.tipo === "alerta" ? " aviso--alerta" : ""}`}>{aviso.msg}</div> : null}
      </div>
    </>
  );
}

function Relogio() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="topo__relogio">
      {t.toLocaleDateString("pt-BR")} · {t.toLocaleTimeString("pt-BR")}
    </span>
  );
}

function Login({ onOk }: { onOk: (s: any) => void }) {
  const [login, setLogin] = useState("gestao");
  const [senha, setSenha] = useState("gestao");
  const [erro, setErro] = useState("");
  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.login(login, senha);
      setToken(r.access_token);
      onOk(r);
    } catch (err: any) {
      setErro(err.message || "Falha no login");
    }
  }
  return (
    <div className="login-tela">
      <form className="login-card" onSubmit={entrar}>
        <div className="marca">
          <div className="marca__logo" role="img" aria-label="DiFORP" />
          <p className="marca__produto">OEE · Monitoramento de Eficiência</p>
        </div>
        <h1>Entrar</h1>
        <p>Entre com gestao/gestao ou operador/operador na demonstração.</p>
        <label htmlFor="login">Usuário</label>
        <input id="login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
        <label htmlFor="senha">Senha</label>
        <input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
        {erro && <p className="erro-campo">{erro}</p>}
        <button type="submit" className="botao botao--primario">
          Entrar
        </button>
      </form>
    </div>
  );
}
