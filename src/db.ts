import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import type { TradingAction } from "./openrouter";
import type { OrderResult } from "./executor";

const MAX_RUNS = 100;
const MAX_PORTFOLIO_SNAPSHOTS = 500;

export type RunRecord = {
  id: number;
  createdAt: string;
  reasoning: string;
  actions: TradingAction[];
  ordersPlaced: OrderResult[];
  errors: string[];
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
