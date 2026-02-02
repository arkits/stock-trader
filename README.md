# Stock Trader

AI-powered stock trading bot that runs on an interval: it fetches your Alpaca account and market data, asks OpenRouter for buy/sell/hold decisions, and can place orders via the Alpaca Trading API. Includes a web dashboard (tRPC + React + shadcn/ui) to view account, positions, runs, and trigger a run manually.

**Stack:** Bun, Alpaca Trading API, Alpaca Market Data API, OpenRouter (structured output), SQLite (run history), Hono + tRPC, React + Vite + shadcn/ui.

---

## Prerequisites

- [Bun](https://bun.sh) >= 1.0.0

---

## Environment variables

Copy `.env.example` to `.env` and set the values below.

### Required

| Variable | Description |
|----------|-------------|
| `APCA_API_KEY_ID` | Alpaca API key ID (from [Alpaca](https://alpaca.markets) dashboard) |
| `APCA_API_SECRET_KEY` | Alpaca API secret key |
| `OPENROUTER_API_KEY` | OpenRouter API key (from [OpenRouter](https://openrouter.ai)) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `APCA_API_BASE_URL` | `https://paper-api.alpaca.markets` | Alpaca base URL. Use `https://api.alpaca.markets` for live. |
| `OPENROUTER_MODEL` | `openai/gpt-4o` | Model for AI decisions (must support structured output). |
| `TRADING_INTERVAL_MINUTES` | `60` | Minutes between bot cycles. |
| `DRY_RUN` | `true` | `true` = suggest only, no orders; `false` = place orders. |
| `SYMBOLS` | `AAPL,GOOGL,MSFT` | Comma-separated symbols to analyze and trade (allowlist). |
| `MAX_ORDER_NOTIONAL` | — | Max dollar amount per order (e.g. `1000`). |
| `DATA_DIR` | `data` | Directory for SQLite run history file. |
| `PORT` | `4108` | HTTP server port. |

---

## Setup

```bash
bun install
cp .env.example .env
# Edit .env with your Alpaca and OpenRouter keys
```

---

## Build

```bash
bun run build
```

Builds the dashboard and typechecks the server.

---

## Run

**Production (server + dashboard served from same process):**

```bash
bun run start
```

- Server: http://localhost:4108  
- Dashboard: http://localhost:4108  
- tRPC: http://localhost:4108/trpc  

**Development:**

- Terminal 1: `bun run dev:server` (server on port 4108)  
- Terminal 2: `cd dashboard && bun run dev` (Vite on port 5173, proxies `/trpc` to server)

---

## Dashboard

- **Overview** — Account (equity, buying power, cash), positions, open orders.  
- **Runs** — Last run (reasoning, actions, orders), run history, “Run now” button.  
- **Config** — Read-only bot config (interval, dry run, symbols).

---

## Safety

- Default is **paper trading** (`APCA_API_BASE_URL` paper) and **dry run** (`DRY_RUN=true`). No real orders until you set live URL and `DRY_RUN=false`.  
- Only symbols in `SYMBOLS` are traded.  
- Use `MAX_ORDER_NOTIONAL` to cap order size if desired.

---

## Scripts

| Script | Description |
|--------|-------------|
| `bun run start` | Run server (and serve dashboard in prod). |
| `bun run dev:server` | Run server with watch. |
| `bun run build` | Build dashboard + typecheck server. |
| `bun run typecheck` | TypeScript check (server). |
| `bun run lint` | Lint server + dashboard. |

---

## GitHub repo and deploy with Dokku

### GitHub

1. Create a new repository on [GitHub](https://github.com/new) (e.g. `stock-trader`).
2. From this project directory:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/stock-trader.git
   git push -u origin main
   ```

   (Use your GitHub username and repo name; use SSH if you prefer: `git@github.com:YOUR_USERNAME/stock-trader.git`.)

### Files used for Dokku

| File | Purpose |
|------|---------|
| `Dockerfile` | Builds with Bun, installs deps, builds dashboard, runs server. Listens on `PORT`. |
| `.dockerignore` | Excludes `.env`, `node_modules`, `data/`, etc. from the image. |
| `app.json` | Dokku healthchecks: after deploy, `GET /` must return 200 (startup check). |

### Deploy with Dokku

1. On your Dokku server, create the app (if it doesn’t exist):

   ```bash
   dokku apps:create stock-trader
   ```

2. On your machine, add the Dokku Git remote and push (Dokku will build from the `Dockerfile`):

   ```bash
   git remote add dokku dokku@YOUR_SERVER:stock-trader
   git push dokku main
   ```

   Replace `YOUR_SERVER` with your Dokku hostname or IP.

3. Set required env vars on Dokku (run on the Dokku server or via `dokku config:set` from your machine if you have Dokku CLI + SSH access):

   ```bash
   dokku config:set stock-trader \
     APCA_API_KEY_ID=your_alpaca_key_id \
     APCA_API_SECRET_KEY=your_alpaca_secret \
     OPENROUTER_API_KEY=your_openrouter_key
   ```

4. Optional env vars:

   ```bash
   dokku config:set stock-trader \
     APCA_API_BASE_URL=https://paper-api.alpaca.markets \
     OPENROUTER_MODEL=openai/gpt-4o \
     TRADING_INTERVAL_MINUTES=60 \
     DRY_RUN=true \
     SYMBOLS=AAPL,GOOGL,MSFT
   ```

5. The app listens on `PORT` (set by Dokku from the Dockerfile `EXPOSE 4108`). Open the app URL to use the dashboard.

**Accessing the app:** Dokku’s proxy (nginx) listens on the exposed port, not Docker’s `-p`. Use the app’s **vhost** with that port:

- On the server, run `dokku urls stock-trader` to see the URL (e.g. `http://stock-trader.agnee:4108`).
- Use that full URL in the browser (e.g. `http://stock-trader.agnee:4108`), not `http://agnee:4108` unless the app’s domain is set to the bare hostname.
- If `agnee:4108` is refused: (1) Try `http://stock-trader.agnee:4108`. (2) Ensure port 4108 is open: `sudo ufw allow 4108 && sudo ufw reload` (if using UFW). (3) Check mapping: `dokku ports:list stock-trader` (should show `http 4108 4108`). To force it: `dokku ports:set stock-trader http:4108:4108`.

The `app.json` healthchecks tell Dokku to wait 5 seconds after deploy, then `GET /`; the app is considered up when that returns 200.
