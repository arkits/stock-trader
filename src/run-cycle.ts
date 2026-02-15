import type { AlpacaClient } from "./alpaca";
import type { Config } from "./config";
import type { MarketDataClient } from "./market-data";
import { getAdversarialReview, getTradingDecision, type OpenRouterResponse } from "./openrouter";
import { executeActions } from "./executor";
import {
  closePaperTrades,
  getLatestResearchWeights,
  getOpenPaperTrades,
  getRunHistory,
  insertPaperTrades,
  insertPortfolioSnapshot,
  insertResearchError,
  insertResearchRun,
  insertResearchWeightRecord,
  insertRun,
} from "./db";
import { buildResearchContext } from "./research";
import type { ResearchContext } from "./research";

export type RunCycleDeps = {
  alpaca: AlpacaClient;
  marketData: MarketDataClient;
  config: Config;
};

export async function runCycle(deps: RunCycleDeps): Promise<void> {
  const { alpaca, marketData, config } = deps;
  const errors: string[] = [];

  const latestWeights = getLatestResearchWeights();
  if (latestWeights) {
    config.trading.research.weights = {
      ...config.trading.research.weights,
      ...latestWeights.weights,
    };
  }

  const account = await alpaca.getAccount();
  const positions = await alpaca.getPositions();
  const openOrders = await alpaca.getOpenOrders();
  const openPaperTrades = getOpenPaperTrades();

  const positionSymbols = positions.map((p) => p.symbol);
  let researchContext = await buildResearchContext({ marketData, config, positions });
  const researchUniverse =
    researchContext.eligibleSymbols.length > 0
      ? researchContext.eligibleSymbols
      : researchContext.researchSymbols;
  const symbols = [
    ...new Set([
      ...config.trading.symbols,
      ...positionSymbols,
      ...researchUniverse,
      ...config.trading.marketConditionSymbols,
      ...openPaperTrades.map((t) => t.symbol),
    ]),
  ].filter(Boolean);
  const snapshots = await marketData.getSnapshots(symbols);
  const recentRuns = getRunHistory(10);

  let reasoning = "";
  let actions: OpenRouterResponse["actions"] = [];
  let ordersPlaced: Array<{ symbol: string; side: string; orderId?: string; error?: string }> = [];
  let adversarial = null as Awaited<ReturnType<typeof getAdversarialReview>> | null;
  let decision: OpenRouterResponse | null = null;

  try {
    decision = await getTradingDecision({
      config,
      account,
      positions,
      openOrders,
      snapshots,
      recentRuns,
      researchContext,
    });
    reasoning = decision.reasoning;
    actions = decision.actions;

    try {
      adversarial = await getAdversarialReview({
        config,
        account,
        positions,
        openOrders,
        snapshots,
        recentRuns,
        researchContext,
        decision,
      });
    } catch (err) {
      errors.push(
        err instanceof Error ? `Adversarial review failed: ${err.message}` : "Adversarial review failed"
      );
      adversarial = null;
    }

    actions = applyResearchOverrides({
      actions,
      researchContext,
      adversarial,
      confidenceFloor: config.trading.research.confidenceFloor,
    });

    ordersPlaced = await executeActions({
      alpaca,
      config,
      actions,
      dryRun: config.trading.dryRun,
      allowedSymbols: symbols,
    });

    const paperTrades = buildPaperTrades(decision, snapshots, openPaperTrades);
    insertPaperTrades(paperTrades);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const closures = evaluatePaperTrades(openPaperTrades, snapshots);
  closePaperTrades(closures);
  const weightUpdate = updateWeightsFromClosures(closures, openPaperTrades, config);
  if (weightUpdate) {
    insertResearchWeightRecord({ weights: weightUpdate, note: "weekly feedback" });
    config.trading.research.weights = weightUpdate;
  }
  logResearchErrorsFromClosures(closures, openPaperTrades);

  const runId =
    reasoning || actions.length > 0 || errors.length > 0 || ordersPlaced.length > 0
      ? insertRun({
          reasoning,
          actions,
          ordersPlaced,
          errors,
        })
      : null;
  if (runId != null && decision) {
    insertResearchRun({
      runId,
      research: decision.research,
      adversarial,
      analysis: researchContext.analysis ?? null,
    });
  }
  insertPortfolioSnapshot(account.equity);
}

function applyResearchOverrides(params: {
  actions: OpenRouterResponse["actions"];
  researchContext: ResearchContext;
  adversarial: Awaited<ReturnType<typeof getAdversarialReview>> | null;
  confidenceFloor: number;
}): OpenRouterResponse["actions"] {
  const { actions, researchContext, adversarial, confidenceFloor } = params;
  if (!researchContext?.analysis) return actions;
  const candidateMap = new Map(
    researchContext.analysis.candidates.map((c) => [c.symbol, c])
  );
  const excludedSet = new Map(
    researchContext.excludedSymbols.map((e) => [e.symbol, e.reasons])
  );
  const adversarialMap = new Map(
    adversarial?.reviews.map((r) => [r.symbol, r]) ?? []
  );
  return actions.map((action) => {
    if (action.action === "hold") return action;
    const symbol = action.symbol.toUpperCase();
    if (excludedSet.has(symbol)) {
      return { ...action, action: "hold", reason: `Research excluded: ${excludedSet.get(symbol)?.join(", ")}` };
    }
    const candidate = candidateMap.get(symbol);
    const review = adversarialMap.get(symbol);
    if (review?.shouldDrop) {
      return { ...action, action: "hold", reason: `Adversarial reject: ${review.verdict}` };
    }
    if (candidate && candidate.confidence < confidenceFloor) {
      return { ...action, action: "hold", reason: `Confidence ${candidate.confidence.toFixed(2)} below floor` };
    }
    return action;
  });
}

function buildPaperTrades(
  decision: OpenRouterResponse,
  snapshots: Record<string, { dailyBar?: { c: number }; latestTrade?: { p: number } }>,
  openTrades: Array<{ symbol: string }>
): Array<{ symbol: string; entryAt: string; entryPrice: number; horizonDays: number; score: number; confidence: number; factors: Record<string, number>; notes?: string }> {
  const openSymbols = new Set(openTrades.map((t) => t.symbol));
  const now = new Date().toISOString();
  const candidates = decision.research.ranked.slice(0, 5);
  const trades = [];
  for (const c of candidates) {
    if (openSymbols.has(c.symbol)) continue;
    const snap = snapshots[c.symbol];
    const price = snap?.dailyBar?.c ?? snap?.latestTrade?.p;
    if (price == null) continue;
    const factors: Record<string, number> = {};
    for (const f of c.scorecard.factors) {
      factors[f.name] = f.score;
    }
    trades.push({
      symbol: c.symbol,
      entryAt: now,
      entryPrice: price,
      horizonDays: 7,
      score: c.score,
      confidence: c.confidence,
      factors,
      notes: "paper trade",
    });
  }
  return trades;
}

function evaluatePaperTrades(
  openTrades: Array<{ id: number; symbol: string; entryAt: string; entryPrice: number; horizonDays: number }>,
  snapshots: Record<string, { dailyBar?: { c: number }; latestTrade?: { p: number } }>
): Array<{ id: number; exitAt: string; exitPrice: number; returnPct: number; notes?: string }> {
  const now = new Date();
  const closures = [];
  for (const trade of openTrades) {
    const entry = new Date(trade.entryAt);
    const ageDays = (now.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < trade.horizonDays) continue;
    const snap = snapshots[trade.symbol];
    const price = snap?.dailyBar?.c ?? snap?.latestTrade?.p;
    if (price == null || trade.entryPrice === 0) continue;
    const returnPct = (price - trade.entryPrice) / trade.entryPrice;
    closures.push({
      id: trade.id,
      exitAt: now.toISOString(),
      exitPrice: price,
      returnPct,
      notes: "weekly evaluation",
    });
  }
  return closures;
}

function updateWeightsFromClosures(
  closures: Array<{ id: number; returnPct: number }>,
  openTrades: Array<{ id: number; factors: Record<string, number> }>,
  config: Config
): Config["trading"]["research"]["weights"] | null {
  if (closures.length < 3) return null;
  const tradeMap = new Map(openTrades.map((t) => [t.id, t]));
  const winners: Record<string, number[]> = {};
  const losers: Record<string, number[]> = {};
  for (const c of closures) {
    const trade = tradeMap.get(c.id);
    if (!trade) continue;
    const bucket = c.returnPct >= 0 ? winners : losers;
    for (const [k, v] of Object.entries(trade.factors)) {
      const list = bucket[k] ?? [];
      list.push(v);
      bucket[k] = list;
    }
  }
  const weights = { ...config.trading.research.weights } as Config["trading"]["research"]["weights"];
  const lr = 0.05;
  const keys = Object.keys(weights) as Array<keyof typeof weights>;
  for (const key of keys) {
    const winAvg = average(winners[key]);
    const loseAvg = average(losers[key]);
    if (winAvg == null || loseAvg == null) continue;
    const delta = winAvg - loseAvg;
    weights[key] = weights[key] + lr * delta;
  }
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  for (const key of keys) {
    weights[key] = weights[key] / sum;
  }
  return weights;
}

function logResearchErrorsFromClosures(
  closures: Array<{ id: number; returnPct: number }>,
  openTrades: Array<{ id: number; symbol: string; factors: Record<string, number> }>
): void {
  if (closures.length === 0) return;
  const tradeMap = new Map(openTrades.map((t) => [t.id, t]));
  for (const c of closures) {
    if (c.returnPct >= -0.05) continue;
    const trade = tradeMap.get(c.id);
    if (!trade) continue;
    const weakest = Object.entries(trade.factors).sort((a, b) => a[1] - b[1])[0];
    const rule = weakest ? `weak_${weakest[0]}` : undefined;
    insertResearchError({
      symbol: trade.symbol,
      reason: "paper trade loss",
      rule,
      context: weakest ? `factor=${weakest[0]} score=${weakest[1]}` : undefined,
    });
  }
}

function average(values?: number[]): number | null {
  if (!values || values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
