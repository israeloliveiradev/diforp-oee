# OEE DiFORP — chão de fábrica, indicadores e manuais no posto

Plataforma de **OEE** (Overall Equipment Effectiveness) da DiFORP. O operador aponta no posto; a gestão vê disponibilidade, performance, qualidade, paradas e o que pede ação. Os manuais da máquina viram passo a passo na tela **O que fazer**.

Nada da PoC em `legacy/` foi descartado: operação, dashboards, ACMP, insights, auditoria, cadastros, simulador, import/export e a identidade visual (DiFORP) continuam. A diferença é que o cálculo e o dado moram na API e no PostgreSQL, não no `localStorage` do iPad.

Este repositório é o que sobe na VPS com Docker Compose.

---

## O que o sistema faz

| Quem | O que usa |
| --- | --- |
| **Operador** (`operador` / `operador`) | Operação (ordem, produção, parada, refugo, retrabalho), **O que fazer** (procedimento do posto), Configurações só para leitura do essencial |
| **Gestão** (`gestao` / `gestao`) | Visão geral, máquinas, produção, paradas, qualidade, performance, **O que olhar**, ACMP, Manuais, Auditoria, Cadastros, Configurações |

Telas (HashRouter, mesmo contrato da PoC):

- **Operação** — estado da máquina, abrir/fechar ordem, apontar peça, parada com motivo, solicitar manutenção
- **Visão geral / Máquinas / Produção / Paradas / Qualidade / Performance** — OEE e recortes com filtros (planta, área, linha, máquina, produto, ordem, turno, operador)
- **O que olhar** — desvios do período com uma ação (“Faça agora”)
- **O que fazer** — escolhe a máquina, toca no problema, recebe passos do manual (Gemini + pgvector). Nada liga nem para a máquina
- **Manuais** — gestão envia PDF, reprocessa ou exclui; o worker indexa
- **ACMP** — sugere motivo de parada (LightGBM + SHAP; Naive Bayes se houver poucas amostras)
- **Auditoria / Cadastros / Configurações** — trilha, ISA-95, simulador, import/export, seed de demonstração

A cor do cartão **não** é o estado. Vale o nome: Produzindo, Setup, Parada, Microparada, Aguardando material, etc.

---

## Arquitetura

```
navegador (React + Nginx :80)
        │  /api  /docs
        ▼
   FastAPI (api :8000)
        │
        ├── PostgreSQL 16 + pgvector   eventos, cadastros, chunks dos manuais
        ├── Redis                      fila de ingestão de PDF
        └── worker                     indexa manuais, simulador, retreino ACMP
                └── Gemini             embedding + resposta do chat
```

Camadas da API (dependência só para dentro):

`domain` → `application` → `infrastructure` → `presentation`

O browser **não** recalcula OEE. Ele pede `/indicadores` e `/insights`.

| Pasta | Conteúdo |
| --- | --- |
| `apps/api` | FastAPI, Alembic, testes de domínio, worker |
| `apps/web` | SPA Vite/React 18, PWA |
| `infra/nginx` | Proxy `/api` → API, corpo até 40 MB (PDF) |
| `infra/scripts/vps-bootstrap.sh` | Docker na VPS Ubuntu/Debian |
| `docs/manuais` | 10 PDFs de posto + gerador + script de reindexação |
| `legacy/` | PoC HTML/JS — especificação de negócio. Não editar como produto |
| `openapi.yaml` | Contrato resumido; a fonte viva é `http://<host>/openapi.json` |

---

## Stack

- **API:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, JWT (papéis `operador` \| `gestao`)
- **Web:** React 18, Vite, TypeScript, React Query, Chart.js
- **Banco:** PostgreSQL 16 + extensão `vector` (imagem `pgvector/pgvector:pg16`)
- **Fila:** Redis 7
- **ML:** LightGBM + SHAP (fallback Naive Bayes da PoC com menos de 30 amostras)
- **RAG:** Gemini `gemini-embedding-001` (768-d) e `gemini-3.5-flash-lite`
- **Deploy:** Docker Compose + Nginx

---

## Subir local (Docker) — caminho oficial

Requisitos: Docker Desktop (ou Engine + Compose) e, para o chat de manuais, uma `GEMINI_API_KEY`.

```bash
cp .env.example .env
# Edite GEMINI_API_KEY, POSTGRES_PASSWORD e JWT_SECRET
docker compose up -d --build
docker compose exec api python -m oee.seed --demo-dias 7
```

- Interface: http://localhost
- Swagger: http://localhost/docs
- Saúde da API: http://localhost/api/health

Login de demonstração:

- Gestão: `gestao` / `gestao`
- Operador: `operador` / `operador`

Troque essas senhas antes de expor a VPS.

### Manuais de demonstração (O que fazer)

Os PDFs já estão em `docs/manuais/*.pdf`. Depois do seed, envie e indexe:

```bash
# na máquina que alcança http://localhost (gestão precisa estar no seed)
python docs/manuais/reindexar.py
```

O script apaga manuais antigos, sobe os 10 PDFs e espera o status **pronto**. Sem `GEMINI_API_KEY` o upload grava o arquivo, mas a indexação falha e o chat avisa indisponibilidade — ele **não inventa** procedimento.

Para regenerar o texto dos PDFs (Windows, fonte Arial):

```bash
python docs/manuais/gerar_manuais.py
```

---

## Variáveis de ambiente

Copie `.env.example` → `.env`. O arquivo `.env` **não entra no git**.

| Variável | Função |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credencial do Postgres no Compose |
| `DATABASE_URL` | SQLAlchemy (`postgresql+psycopg://...`). No Compose o host é `postgres` |
| `JWT_SECRET` | Assinatura do token. **Troque na VPS** |
| `JWT_EXPIRE_MINUTES` | Validade do login (padrão 720) |
| `GEMINI_API_KEY` | Obrigatória para indexar PDF e responder **O que fazer** |
| `GEMINI_CHAT_MODEL` | Padrão `gemini-3.5-flash-lite` |
| `GEMINI_EMBED_MODEL` | Padrão `gemini-embedding-001` |
| `REDIS_URL` | Fila do worker (`redis://redis:6379/0` no Compose) |
| `APP_ENV` / `LOG_LEVEL` | `development` \| `production`, nível de log |
| `CORS_ORIGINS` | Origens da SPA. Na VPS inclua `http://SEU_IP` ou o domínio |
| `DEMO_DIAS` / `DEMO_SEED` | Tamanho e semente do dataset de demonstração |

Volumes persistentes do Compose: `oee_pg`, `oee_redis`, `oee_models` (ACMP), `oee_uploads` (PDFs).

---

## VPS — do zero ao primeiro login

O Compose publica **80** (SPA + `/api`). Postgres `5432` e Redis `6379` também estão mapeados para debug local. **Na VPS pública, feche 5432 e 6379 no firewall** (ou remova os `ports` desses serviços no `docker-compose.yml` e deixe só a rede interna).

### 1. Preparar o servidor

Ubuntu/Debian, como root:

```bash
sudo bash infra/scripts/vps-bootstrap.sh
```

Instala Docker Engine + Compose plugin.

### 2. Colocar o código

Neste momento o remoto Git **ainda não está definido neste workspace** (de propósito: o remoto anterior não é o da VPS). Depois de criar o repositório certo:

```bash
git clone <URL-DO-REPOSITORIO-CORRETO> /opt/oee
cd /opt/oee
```

Alternativa sem Git: `scp`/`rsync` da pasta do projeto (sem `node_modules`, sem `.env`).

### 3. Ambiente e subida

```bash
cp .env.example .env
nano .env
```

Obrigatório na produção:

- `POSTGRES_PASSWORD` forte
- `JWT_SECRET` longo e aleatório
- `GEMINI_API_KEY` da conta Google AI
- `CORS_ORIGINS=http://IP_OU_DOMINIO` (e `https://...` se houver TLS)
- `APP_ENV=production`

```bash
docker compose up -d --build
docker compose exec api python -m oee.seed --demo-dias 7
```

Abra `http://IP_DA_VPS`. Login `gestao` / `gestao`.

### 4. Indexar os manuais na VPS

Do seu PC (tunel ou IP liberado) ou de dentro da VPS, apontando o script para a API:

O `docs/manuais/reindexar.py` usa `http://localhost/api`. Na VPS, rode-o **na própria máquina** depois do `compose up`, ou envie os PDFs pela tela **Manuais** (perfil gestão).

Acompanhe o worker:

```bash
docker compose logs -f worker
```

Status esperado em **Manuais**: `pronto`, com páginas e chunks > 0.

### 5. Atualizar a aplicação

```bash
cd /opt/oee
git pull
docker compose up -d --build
```

O banco e os PDFs já indexados permanecem nos volumes. Só reindexe se o conteúdo dos manuais mudar.

### 6. TLS (quando houver domínio)

Este Compose ainda escuta HTTP :80. Para HTTPS, coloque Caddy/Nginx ou um proxy na frente e aponte `CORS_ORIGINS` para o domínio `https`.

---

## Desenvolvimento sem Docker

PostgreSQL 16 com `CREATE EXTENSION vector;` e Redis em `localhost`.

```bash
# API
cd apps/api
python -m venv .venv
source .venv/Scripts/activate   # Git Bash no Windows
pip install -r requirements.txt
export PYTHONPATH=src
export DATABASE_URL=postgresql+psycopg://oee:oee_dev_change_me@localhost:5432/oee
python -m oee.seed --demo-dias 7
uvicorn oee.presentation.main:app --reload --port 8000

# Worker (outro terminal)
cd apps/api
PYTHONPATH=src python -m oee.worker

# Web
cd apps/web
npm install
npm run dev
```

Vite encaminha `/api` para `http://127.0.0.1:8000`.

Testes de domínio (sem Gemini, sem banco):

```bash
cd apps/api
PYTHONPATH=src pytest -q
```

---

## Regras de negócio que a VPS precisa respeitar

- Sem **ordem aberta** não se aponta produção.
- Abrir ordem inicia **Setup**. Produção só depois da liberação no posto.
- **Microparada** = até 5 minutos (300 s) e já voltou. Acima disso é parada com motivo.
- Pedido de manutenção deixa a máquina em **Manutenção**; o operador não religa sozinho.
- Chat de manuais só usa trechos indexados. Se não achar o passo, pede supervisor — não inventa torque, alarme ou peça.
- Operador não altera simulação, ACMP nem import/export nas Configurações.

---

## Limites honestos

- Sem `GEMINI_API_KEY` (ou sem saída HTTPS para a API Google) o chat informa indisponibilidade.
- Modelos Gemini mudam de nome. Se a indexação falhar com “model not found”, atualize `GEMINI_CHAT_MODEL` e `GEMINI_EMBED_MODEL` no `.env` e recrie `api` + `worker`.
- ACMP em CPU. Poucas paradas classificadas → Naive Bayes da PoC.
- `legacy/` é a spec visual/comportamental. Não “simplifique” essas telas no produto sem olhar a PoC.
- Memória do Compose: API e worker 1 GB cada; Postgres 512 MB. VPS pequena demais vai swappar no retreino SHAP.

---

## Agentes Cursor (opcional)

Em `.cursor/agents/`: `architect`, `ml-engineer`, `rag-engineer`, `devops`, `frontend`. Usam as pastas e contratos deste monorepo.

---

## Licença e dados

Uso interno DiFORP / Indústria Modelo (dataset de demonstração). Não publique `.env` nem dumps do Postgres com dados reais.
