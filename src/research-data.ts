import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Fundamentals = {
  symbol: string;
  sector?: string;
  industry?: string;
  marketCap?: number;
  pe?: number;
  ps?: number;
  evEbitda?: number;
  revenueGrowth?: number;
  epsGrowth?: number;
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  debtToEquity?: number;
  roic?: number;
  roe?: number;
  fcfYield?: number;
};

export type Technicals = {
  symbol: string;
  rsi?: number;
  sma50?: number;
  sma200?: number;
  atrPct?: number;
  beta?: number;
  maxDrawdown?: number;
  momentum1m?: number;
  momentum3m?: number;
  momentum6m?: number;
  correlationWithMarket?: number;
  correlationWithPortfolio?: number;
};

export type MacroData = {
  updatedAt?: string;
  vix?: number;
  yieldCurveSlope?: number;
  inflation?: number;
  unemployment?: number;
  marketTrend?: "up" | "down" | "flat";
  riskOnScore?: number;
};

export type NewsItem = {
  publishedAt: string;
  sentiment?: number;
  importance?: number;
  source?: string;
  headline?: string;
};

export type EarningsCallSummary = {
  publishedAt: string;
  tone?: number;
  guidanceDelta?: number;
  kpiTrends?: string[];
  source?: string;
};

export type InsiderActivity = {
  updatedAt?: string;
  netShares?: number;
  netValue?: number;
  source?: string;
};

export type InstitutionalFlow = {
  updatedAt?: string;
  netShares?: number;
  netValue?: number;
  source?: string;
};

export type LiquidityMetrics = {
  avgVolume?: number;
  avgDollarVolume?: number;
  spreadPct?: number;
};

export type RiskFlags = {
  legalIssues?: boolean;
  accountingAnomaly?: boolean;
  regulatoryOverhang?: boolean;
  highShortInterest?: boolean;
  source?: string;
};

export type ResearchData = {
  fundamentals: Record<string, Fundamentals>;
  technicals: Record<string, Technicals>;
  macro: MacroData;
  news: Record<string, NewsItem[]>;
  earnings: Record<string, EarningsCallSummary[]>;
  insider: Record<string, InsiderActivity>;
  institutional: Record<string, InstitutionalFlow>;
  liquidity: Record<string, LiquidityMetrics>;
  risk: Record<string, RiskFlags>;
  sources: Record<string, string[]>;
  updatedAt?: string;
};

type ResearchFileSet = Partial<ResearchData>;

function readJsonIfExists<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  const raw = readFileSync(path, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function loadResearchData(dir?: string): ResearchData {
  const baseDir = dir ?? process.env.RESEARCH_DATA_DIR ?? "data/research";
  const fileMap: Array<[keyof ResearchFileSet, string]> = [
    ["fundamentals", "fundamentals.json"],
    ["technicals", "technicals.json"],
    ["macro", "macro.json"],
    ["news", "news.json"],
    ["earnings", "earnings.json"],
    ["insider", "insider.json"],
    ["institutional", "institutional.json"],
    ["liquidity", "liquidity.json"],
    ["risk", "risk.json"],
    ["sources", "sources.json"],
  ];
  const data: ResearchData = {
    fundamentals: {},
    technicals: {},
    macro: {},
    news: {},
    earnings: {},
    insider: {},
    institutional: {},
    liquidity: {},
    risk: {},
    sources: {},
  };
  for (const [key, file] of fileMap) {
    const value = readJsonIfExists<ResearchFileSet[typeof key]>(
      join(baseDir, file)
    );
    if (value != null) {
      (data as ResearchFileSet)[key] = value as ResearchFileSet[typeof key];
    }
  }
  const updatedAt = readJsonIfExists<{ updatedAt?: string }>(
    join(baseDir, "meta.json")
  );
  if (updatedAt?.updatedAt) {
    data.updatedAt = updatedAt.updatedAt;
  }
  return data;
}
