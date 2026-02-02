import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import type { TradingAction } from "./openrouter";
import type { OrderResult } from "./executor";
import type { AdversarialReview } from "./openrouter";
import type { ResearchAnalysis } from "./research-engine";

const MAX_RUNS = 100;
const MAX_PORTFOLIO_SNAPSHOTS = 500;
const MAX_PAPER_TRADES = 500;

export type RunRecord = {
  id: number;
  createdAt: string;
  reasoning: string;
  actions: TradingAction[];
  ordersPlaced: OrderResult[];
  errors: string[];
};

export type ResearchRunRecord = {
  id: number;
  runId: number;
  createdAt: string;
  research: unknown;
  adversarial: AdversarialReview | null;
  analysis: ResearchAnalysis | null;
};

export type PaperTrade = {
  id: number;
  symbol: string;
  createdAt: string;
  entryAt: string;
  entryPrice: number;
  horizonDays: number;
  score: number;
  confidence: number;
  factors: Record<string, number>;
  status: "open" | "closed";
  exitAt?: string;
  exitPrice?: number;
  returnPct?: number;
  notes?: string;
};

export type ResearchWeightRecord = {
  id: number;
  createdAt: string;
  weights: Record<string, number>;
  note?: string;
};

export type ResearchError = {
  id: number;
  createdAt: string;
  symbol: string;
  reason: string;
  rule?: string;
  context?: string;
};

export type PortfolioSnapshot = {
  id: number;
  createdAt: string;
  equity: string;
};

let db: Database | null = null;

function getDb(): Database {
  if (db == null) {
    const dataDir = process.env.DATA_DIR ?? "data";
    try {
      mkdirSync(dataDir, { recursive: true });
    } catch {
      // ignore
    }
    const path = `${dataDir}/runs.db`;
    db = new Database(path);
    db.run(`
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        actions TEXT NOT NULL,
        orders_placed TEXT NOT NULL,
        errors TEXT NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        equity TEXT NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS research_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        research TEXT NOT NULL,
        adversarial TEXT,
        analysis TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS paper_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        created_at TEXT NOT NULL,
        entry_at TEXT NOT NULL,
        entry_price REAL NOT NULL,
        horizon_days INTEGER NOT NULL,
        score REAL NOT NULL,
        confidence REAL NOT NULL,
        factors TEXT NOT NULL,
        status TEXT NOT NULL,
        exit_at TEXT,
        exit_price REAL,
        return_pct REAL,
        notes TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS research_weights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        weights TEXT NOT NULL,
        note TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS research_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        symbol TEXT NOT NULL,
        reason TEXT NOT NULL,
        rule TEXT,
        context TEXT
      )
    `);
  }
  return db;
}

export function insertRun(params: {
  reasoning: string;
  actions: TradingAction[];
  ordersPlaced: OrderResult[];
  errors: string[];
}): number {
  const database = getDb();
  const createdAt = new Date().toISOString();
  database.run(
    `INSERT INTO runs (created_at, reasoning, actions, orders_placed, errors) VALUES (?, ?, ?, ?, ?)`,
    [
      createdAt,
      params.reasoning,
      JSON.stringify(params.actions),
      JSON.stringify(params.ordersPlaced),
      JSON.stringify(params.errors),
    ]
  );
  const row = database.query("SELECT last_insert_rowid() as id").get() as { id: number };
  const id = row.id;

  // Prune old rows: keep only last MAX_RUNS
  database.run(
    `DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT ?)`,
    [MAX_RUNS]
  );
  return id;
}

export function insertPortfolioSnapshot(equity: string): void {
  const database = getDb();
  const createdAt = new Date().toISOString();
  database.run(
    `INSERT INTO portfolio_snapshots (created_at, equity) VALUES (?, ?)`,
    [createdAt, equity]
  );
  database.run(
    `DELETE FROM portfolio_snapshots WHERE id NOT IN (SELECT id FROM portfolio_snapshots ORDER BY id DESC LIMIT ?)`,
    [MAX_PORTFOLIO_SNAPSHOTS]
  );
}

function rowToRecord(r: {
  id: number;
  created_at: string;
  reasoning: string;
  actions: string;
  orders_placed: string;
  errors: string;
}): RunRecord {
  return {
    id: r.id,
    createdAt: r.created_at,
    reasoning: r.reasoning,
    actions: JSON.parse(r.actions) as TradingAction[],
    ordersPlaced: JSON.parse(r.orders_placed) as OrderResult[],
    errors: JSON.parse(r.errors) as string[],
  };
}

export function getLastRun(): RunRecord | null {
  const database = getDb();
  const row = database
    .query(
      `SELECT id, created_at, reasoning, actions, orders_placed, errors FROM runs ORDER BY id DESC LIMIT 1`
    )
    .get() as
    | {
        id: number;
        created_at: string;
        reasoning: string;
        actions: string;
        orders_placed: string;
        errors: string;
      }
    | undefined;
  if (!row) return null;
  return rowToRecord(row);
}

export function getRunHistory(limit: number): RunRecord[] {
  const database = getDb();
  const rows = database
    .query(
      `SELECT id, created_at, reasoning, actions, orders_placed, errors FROM runs ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as Array<{
    id: number;
    created_at: string;
    reasoning: string;
    actions: string;
    orders_placed: string;
    errors: string;
  }>;
  return rows.map(rowToRecord);
}

export function getPortfolioHistory(limit: number): PortfolioSnapshot[] {
  const database = getDb();
  const rows = database
    .query(
      `SELECT id, created_at, equity FROM portfolio_snapshots ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as Array<{
    id: number;
    created_at: string;
    equity: string;
  }>;
  return rows
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      equity: r.equity,
    }))
    .reverse();
}

export function insertResearchRun(params: {
  runId: number;
  research: unknown;
  adversarial: AdversarialReview | null;
  analysis: ResearchAnalysis | null;
}): number {
  const database = getDb();
  const createdAt = new Date().toISOString();
  database.run(
    `INSERT INTO research_runs (run_id, created_at, research, adversarial, analysis) VALUES (?, ?, ?, ?, ?)`,
    [
      params.runId,
      createdAt,
      JSON.stringify(params.research ?? {}),
      params.adversarial ? JSON.stringify(params.adversarial) : null,
      params.analysis ? JSON.stringify(params.analysis) : null,
    ]
  );
  const row = database.query("SELECT last_insert_rowid() as id").get() as { id: number };
  return row.id;
}

export function insertPaperTrades(trades: Array<Omit<PaperTrade, "id" | "createdAt" | "status">>): void {
  if (trades.length === 0) return;
  const database = getDb();
  const createdAt = new Date().toISOString();
  const stmt = database.prepare(
    `INSERT INTO paper_trades (symbol, created_at, entry_at, entry_price, horizon_days, score, confidence, factors, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
  );
  for (const t of trades) {
    stmt.run([
      t.symbol,
      createdAt,
      t.entryAt,
      t.entryPrice,
      t.horizonDays,
      t.score,
      t.confidence,
      JSON.stringify(t.factors),
      t.notes ?? null,
    ]);
  }
  database.run(
    `DELETE FROM paper_trades WHERE id NOT IN (SELECT id FROM paper_trades ORDER BY id DESC LIMIT ?)`,
    [MAX_PAPER_TRADES]
  );
}

export function getOpenPaperTrades(): PaperTrade[] {
  const database = getDb();
  const rows = database
    .query(
      `SELECT id, symbol, created_at, entry_at, entry_price, horizon_days, score, confidence, factors, status, exit_at, exit_price, return_pct, notes
       FROM paper_trades WHERE status = 'open' ORDER BY id ASC`
    )
    .all() as Array<{
    id: number;
    symbol: string;
    created_at: string;
    entry_at: string;
    entry_price: number;
    horizon_days: number;
    score: number;
    confidence: number;
    factors: string;
    status: string;
    exit_at?: string;
    exit_price?: number;
    return_pct?: number;
    notes?: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    createdAt: r.created_at,
    entryAt: r.entry_at,
    entryPrice: r.entry_price,
    horizonDays: r.horizon_days,
    score: r.score,
    confidence: r.confidence,
    factors: JSON.parse(r.factors) as Record<string, number>,
    status: r.status as "open" | "closed",
    exitAt: r.exit_at ?? undefined,
    exitPrice: r.exit_price ?? undefined,
    returnPct: r.return_pct ?? undefined,
    notes: r.notes ?? undefined,
  }));
}

export function closePaperTrades(
  closings: Array<{
    id: number;
    exitAt: string;
    exitPrice: number;
    returnPct: number;
    notes?: string;
  }>
): void {
  if (closings.length === 0) return;
  const database = getDb();
  const stmt = database.prepare(
    `UPDATE paper_trades SET status = 'closed', exit_at = ?, exit_price = ?, return_pct = ?, notes = ? WHERE id = ?`
  );
  for (const c of closings) {
    stmt.run([c.exitAt, c.exitPrice, c.returnPct, c.notes ?? null, c.id]);
  }
}

export function insertResearchWeightRecord(params: {
  weights: Record<string, number>;
  note?: string;
}): number {
  const database = getDb();
  const createdAt = new Date().toISOString();
  database.run(
    `INSERT INTO research_weights (created_at, weights, note) VALUES (?, ?, ?)`,
    [createdAt, JSON.stringify(params.weights), params.note ?? null]
  );
  const row = database.query("SELECT last_insert_rowid() as id").get() as { id: number };
  return row.id;
}

export function getLatestResearchWeights(): ResearchWeightRecord | null {
  const database = getDb();
  const row = database
    .query(
      `SELECT id, created_at, weights, note FROM research_weights ORDER BY id DESC LIMIT 1`
    )
    .get() as { id: number; created_at: string; weights: string; note?: string } | undefined;
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    weights: JSON.parse(row.weights) as Record<string, number>,
    note: row.note ?? undefined,
  };
}

export function insertResearchError(params: {
  symbol: string;
  reason: string;
  rule?: string;
  context?: string;
}): number {
  const database = getDb();
  const createdAt = new Date().toISOString();
  database.run(
    `INSERT INTO research_errors (created_at, symbol, reason, rule, context) VALUES (?, ?, ?, ?, ?)`,
    [createdAt, params.symbol, params.reason, params.rule ?? null, params.context ?? null]
  );
  const row = database.query("SELECT last_insert_rowid() as id").get() as { id: number };
  return row.id;
}
