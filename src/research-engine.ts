import type { Position } from "./alpaca";
import type { Config } from "./config";
import type { SymbolSnapshot } from "./market-data";
import type {
  EarningsCallSummary,
  Fundamentals,
  InsiderActivity,
  InstitutionalFlow,
  LiquidityMetrics,
  MacroData,
  NewsItem,
  ResearchData,
  RiskFlags,
  Technicals,
} from "./research-data";

export type MarketRegime = "risk_on" | "risk_off" | "high_vol" | "neutral";

export type FactorChecklistItem = {
  factor: string;
  status: "pass" | "neutral" | "fail";
  note?: string;
};

export type ResearchCandidate = {
  symbol: string;
  sector?: string;
  industry?: string;
  score: number;
  confidence: number;
  factorScores: {
    fundamentals: number;
    technicals: number;
    macro: number;
    sentiment: number;
    quality: number;
    valuation: number;
    peer: number;
  };
  checklist: FactorChecklistItem[];
  redFlags: string[];
  drivers: string[];
  risks: string[];
  nextSteps: string[];
  sources: string[];
  dataQuality: number;
  regime: MarketRegime;
};

export type ResearchExclusion = {
  symbol: string;
  reasons: string[];
  sector?: string;
  industry?: string;
};

export type ResearchAnalysis = {
  regime: MarketRegime;
  candidates: ResearchCandidate[];
  excluded: ResearchExclusion[];
  weights: Config["trading"]["research"]["weights"];
  constraints: Config["trading"]["research"];
  nextSteps: string[];
  dataQuality: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (max === min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function decayWeight(publishedAt: string | undefined, halfLifeDays: number): number {
  if (!publishedAt) return 0;
  const ts = Date.parse(publishedAt);
  if (!Number.isFinite(ts)) return 0;
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 1;
  return Math.pow(0.5, ageDays / Math.max(1, halfLifeDays));
}

function detectRegime(macro: MacroData): MarketRegime {
  const vix = macro.vix ?? 0;
  const riskOn = macro.riskOnScore ?? 0.5;
  const trend = macro.marketTrend ?? "flat";
  if (vix >= 25) return "high_vol";
  if (riskOn >= 0.6 && trend === "up") return "risk_on";
  if (riskOn <= 0.4 && trend === "down") return "risk_off";
  return "neutral";
}

function computeFundamentalScore(f: Fundamentals | undefined): number {
  if (!f) return 0.5;
  const growth = average([
    scorePositive(f.revenueGrowth, 0.05, 0.15),
    scorePositive(f.epsGrowth, 0.05, 0.2),
  ]);
  const profitability = average([
    scorePositive(f.operatingMargin, 0.1, 0.25),
    scorePositive(f.netMargin, 0.05, 0.2),
  ]);
  const leverage = scoreInverse(f.debtToEquity, 1.0, 3.0);
  return average([growth, profitability, leverage]);
}

function computeQualityScore(f: Fundamentals | undefined): number {
  if (!f) return 0.5;
  return average([
    scorePositive(f.roic, 0.1, 0.2),
    scorePositive(f.roe, 0.1, 0.25),
    scorePositive(f.fcfYield, 0.03, 0.08),
  ]);
}

function computeValuationScore(f: Fundamentals | undefined): number {
  if (!f) return 0.5;
  const peScore = scoreInverse(f.pe, 15, 40);
  const psScore = scoreInverse(f.ps, 3, 10);
  const evScore = scoreInverse(f.evEbitda, 10, 25);
  return average([peScore, psScore, evScore]);
}

function computeTechnicalScore(t: Technicals | undefined, s: SymbolSnapshot | undefined): number {
  if (!t && !s) return 0.5;
  const rsiScore =
    t?.rsi != null ? clamp(1 - Math.abs(t.rsi - 50) / 50, 0, 1) : 0.5;
  const momentum = average([
    scorePositive(t?.momentum1m, 0.02, 0.08),
    scorePositive(t?.momentum3m, 0.04, 0.15),
    scorePositive(t?.momentum6m, 0.06, 0.2),
  ]);
  const price = s?.dailyBar?.c ?? s?.latestTrade?.p;
  const trendScore =
    price != null && t?.sma200 != null
      ? clamp((price - t.sma200) / Math.max(1, t.sma200) + 0.5, 0, 1)
      : 0.5;
  return average([rsiScore, momentum, trendScore]);
}

function computeSentimentScore(
  news: NewsItem[] | undefined,
  earnings: EarningsCallSummary[] | undefined,
  insider: InsiderActivity | undefined,
  institutional: InstitutionalFlow | undefined,
  halfLifeDays: number
): number {
  const newsScore = weightedAverage(
    (news ?? []).map((n) => ({
      value: normalize((n.sentiment ?? 0) + 1, 0, 2),
      weight: (n.importance ?? 1) * decayWeight(n.publishedAt, halfLifeDays),
    }))
  );
  const earningsScore = weightedAverage(
    (earnings ?? []).map((e) => ({
      value: normalize((e.tone ?? 0) + 1, 0, 2),
      weight: decayWeight(e.publishedAt, halfLifeDays),
    }))
  );
  const insiderScore = insider?.netValue != null ? normalize(insider.netValue, -1_000_000, 1_000_000) : 0.5;
  const institutionalScore =
    institutional?.netValue != null ? normalize(institutional.netValue, -5_000_000, 5_000_000) : 0.5;
  return average([newsScore, earningsScore, insiderScore, institutionalScore]);
}

function computeMacroScore(macro: MacroData, regime: MarketRegime): number {
  const riskOn = macro.riskOnScore ?? 0.5;
  const trendScore = macro.marketTrend === "up" ? 0.7 : macro.marketTrend === "down" ? 0.3 : 0.5;
  const vixPenalty = macro.vix != null ? clamp(1 - (macro.vix - 15) / 20, 0, 1) : 0.5;
  const base = average([riskOn, trendScore, vixPenalty]);
  if (regime === "high_vol") return base * 0.8;
  if (regime === "risk_on") return clamp(base + 0.1, 0, 1);
  if (regime === "risk_off") return clamp(base - 0.1, 0, 1);
  return base;
}

function computePeerScore(
  f: Fundamentals | undefined,
  peerMedians: Record<string, number | undefined>
): number {
  if (!f) return 0.5;
  const scores: number[] = [];
  if (f.revenueGrowth != null && peerMedians.revenueGrowth != null) {
    scores.push(compareToMedian(f.revenueGrowth, peerMedians.revenueGrowth));
  }
  if (f.netMargin != null && peerMedians.netMargin != null) {
    scores.push(compareToMedian(f.netMargin, peerMedians.netMargin));
  }
  if (f.pe != null && peerMedians.pe != null) {
    scores.push(compareToMedian(peerMedians.pe, f.pe));
  }
  if (f.fcfYield != null && peerMedians.fcfYield != null) {
    scores.push(compareToMedian(f.fcfYield, peerMedians.fcfYield));
  }
  return scores.length > 0 ? average(scores) : 0.5;
}

function compareToMedian(value: number, medianValue: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(medianValue)) return 0.5;
  const diff = value - medianValue;
  const scale = Math.max(0.0001, Math.abs(medianValue));
  return clamp(0.5 + diff / (2 * scale), 0, 1);
}

function average(values: Array<number | undefined>): number {
  const list = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (list.length === 0) return 0.5;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

function weightedAverage(items: Array<{ value: number; weight: number }>): number {
  const filtered = items.filter((i) => Number.isFinite(i.value) && Number.isFinite(i.weight) && i.weight > 0);
  if (filtered.length === 0) return 0.5;
  const totalWeight = filtered.reduce((a, b) => a + b.weight, 0);
  if (totalWeight === 0) return 0.5;
  return filtered.reduce((a, b) => a + b.value * b.weight, 0) / totalWeight;
}

function scorePositive(value: number | undefined, mid: number, high: number): number {
  if (value == null || !Number.isFinite(value)) return 0.5;
  if (value <= 0) return 0.2;
  if (value >= high) return 1;
  if (value <= mid) return 0.6;
  return normalize(value, mid, high);
}

function scoreInverse(value: number | undefined, good: number, bad: number): number {
  if (value == null || !Number.isFinite(value)) return 0.5;
  if (value <= good) return 1;
  if (value >= bad) return 0.2;
  return clamp(1 - (value - good) / (bad - good), 0, 1);
}

function buildChecklist(f: Fundamentals | undefined): FactorChecklistItem[] {
  const checklist: FactorChecklistItem[] = [
    buildChecklistItem("growth", f?.revenueGrowth, 0, 0.05),
    buildChecklistItem("profitability", f?.netMargin, 0.02, 0.08),
    buildChecklistItem("leverage", f?.debtToEquity != null ? 1 / f.debtToEquity : undefined, 0.3, 1),
    buildChecklistItem("moat", f?.grossMargin, 0.35, 0.5),
    buildChecklistItem("valuation", f?.pe != null ? 1 / f.pe : undefined, 0.02, 0.06),
  ];
  return checklist;
}

function buildChecklistItem(
  factor: string,
  value: number | undefined,
  neutralFloor: number,
  passFloor: number
): FactorChecklistItem {
  if (value == null || !Number.isFinite(value)) {
    return { factor, status: "neutral", note: "missing" };
  }
  if (value >= passFloor) return { factor, status: "pass" };
  if (value >= neutralFloor) return { factor, status: "neutral" };
  return { factor, status: "fail" };
}

function collectDrivers(
  f: Fundamentals | undefined,
  t: Technicals | undefined,
  earnings: EarningsCallSummary[] | undefined,
  insider: InsiderActivity | undefined,
  institutional: InstitutionalFlow | undefined
): string[] {
  const drivers: string[] = [];
  if (f?.revenueGrowth != null && f.revenueGrowth > 0.1) drivers.push("Strong revenue growth");
  if (f?.netMargin != null && f.netMargin > 0.15) drivers.push("High profitability");
  if (f?.roic != null && f.roic > 0.15) drivers.push("High ROIC quality");
  if (t?.momentum3m != null && t.momentum3m > 0.1) drivers.push("Positive 3M momentum");
  if (t?.rsi != null && t.rsi < 40) drivers.push("RSI reset provides upside");
  const latestEarnings = earnings?.[0];
  if (latestEarnings?.tone != null && latestEarnings.tone > 0.4) drivers.push("Positive earnings call tone");
  if (latestEarnings?.guidanceDelta != null && latestEarnings.guidanceDelta > 0) drivers.push("Guidance raised");
  if (latestEarnings?.kpiTrends?.some((t) => /up|growth|improv/i.test(t))) {
    drivers.push("KPIs trending up");
  }
  if (insider?.netValue != null && insider.netValue > 0) drivers.push("Insider buying activity");
  if (institutional?.netValue != null && institutional.netValue > 0) drivers.push("Institutional inflows");
  return drivers.slice(0, 3);
}

function collectRisks(
  liquidity: LiquidityMetrics | undefined,
  risk: RiskFlags | undefined,
  t: Technicals | undefined,
  earnings: EarningsCallSummary[] | undefined
): string[] {
  const risks: string[] = [];
  if (liquidity?.avgDollarVolume != null && liquidity.avgDollarVolume < 10_000_000) {
    risks.push("Low liquidity");
  }
  if (risk?.legalIssues) risks.push("Legal overhang");
  if (risk?.accountingAnomaly) risks.push("Accounting anomaly");
  if (t?.maxDrawdown != null && t.maxDrawdown > 0.4) risks.push("Deep drawdown risk");
  const latestEarnings = earnings?.[0];
  if (latestEarnings?.tone != null && latestEarnings.tone < -0.3) risks.push("Negative earnings tone");
  if (latestEarnings?.guidanceDelta != null && latestEarnings.guidanceDelta < 0) risks.push("Guidance cut");
  if (latestEarnings?.kpiTrends?.some((t) => /down|declin|deterior/i.test(t))) {
    risks.push("KPIs trending down");
  }
  return risks.slice(0, 3);
}

function computeDataQuality(parts: Array<unknown>): number {
  const total = parts.length;
  if (total === 0) return 0.5;
  const present = parts.filter((p) => p != null).length;
  return clamp(present / total, 0.2, 1);
}

function adjustWeightsForRegime(
  weights: Config["trading"]["research"]["weights"],
  regime: MarketRegime
): Config["trading"]["research"]["weights"] {
  const out = { ...weights };
  if (regime === "high_vol") {
    out.quality += 0.05;
    out.valuation += 0.05;
    out.technicals -= 0.05;
    out.sentiment -= 0.05;
  }
  if (regime === "risk_on") {
    out.technicals += 0.05;
    out.sentiment += 0.05;
    out.valuation -= 0.05;
    out.quality -= 0.05;
  }
  if (regime === "risk_off") {
    out.fundamentals += 0.05;
    out.valuation += 0.05;
    out.technicals -= 0.05;
    out.sentiment -= 0.05;
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0) || 1;
  for (const key of Object.keys(out)) {
    out[key as keyof typeof out] = out[key as keyof typeof out] / sum;
  }
  return out;
}

function buildRedFlags(
  constraints: Config["trading"]["research"],
  f: Fundamentals | undefined,
  t: Technicals | undefined,
  liquidity: LiquidityMetrics | undefined,
  risk: RiskFlags | undefined
): string[] {
  const flags: string[] = [];
  if (constraints.minMarketCap > 0 && f?.marketCap != null && f.marketCap < constraints.minMarketCap) {
    flags.push("market cap below minimum");
  }
  if (constraints.minDollarVolume > 0 && liquidity?.avgDollarVolume != null && liquidity.avgDollarVolume < constraints.minDollarVolume) {
    flags.push("dollar volume below minimum");
  }
  if (constraints.maxDrawdown > 0 && t?.maxDrawdown != null && t.maxDrawdown > constraints.maxDrawdown) {
    flags.push("drawdown exceeds max");
  }
  if (risk?.legalIssues) flags.push("legal issues");
  if (risk?.accountingAnomaly) flags.push("accounting anomaly");
  if (risk?.regulatoryOverhang) flags.push("regulatory overhang");
  if (risk?.highShortInterest) flags.push("high short interest");
  return flags;
}

function sectorIndustryWeights(positions: Position[], fundamentals: Record<string, Fundamentals>) {
  const sectorTotals = new Map<string, number>();
  const industryTotals = new Map<string, number>();
  let total = 0;
  for (const p of positions) {
    const value = Number.parseFloat(p.marketValue);
    if (!Number.isFinite(value)) continue;
    total += value;
    const f = fundamentals[p.symbol];
    const sector = f?.sector ?? "unknown";
    const industry = f?.industry ?? "unknown";
    sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + value);
    industryTotals.set(industry, (industryTotals.get(industry) ?? 0) + value);
  }
  return { sectorTotals, industryTotals, total: total || 1 };
}

function computePeerMedians(
  symbols: string[],
  fundamentals: Record<string, Fundamentals>
): Record<string, Record<string, number | undefined>> {
  const bySector = new Map<string, Fundamentals[]>();
  for (const symbol of symbols) {
    const f = fundamentals[symbol];
    if (!f) continue;
    const sector = f.sector ?? "unknown";
    const list = bySector.get(sector) ?? [];
    list.push(f);
    bySector.set(sector, list);
  }
  const mediansBySector: Record<string, Record<string, number | undefined>> = {};
  for (const [sector, list] of bySector.entries()) {
    const vals = (selector: (f: Fundamentals) => number | undefined) =>
      list.map(selector).filter((v): v is number => v != null && Number.isFinite(v));
    mediansBySector[sector] = {
      revenueGrowth: median(vals((f) => f.revenueGrowth)),
      netMargin: median(vals((f) => f.netMargin)),
      pe: median(vals((f) => f.pe)),
      fcfYield: median(vals((f) => f.fcfYield)),
    };
  }
  return mediansBySector;
}

export function buildResearchAnalysis(params: {
  symbols: string[];
  snapshots: Record<string, SymbolSnapshot>;
  positions: Position[];
  researchData: ResearchData;
  config: Config;
}): ResearchAnalysis {
  const { symbols, snapshots, positions, researchData, config } = params;
  const regime = detectRegime(researchData.macro);
  const peerMedians = computePeerMedians(symbols, researchData.fundamentals);
  const { sectorTotals, industryTotals, total } = sectorIndustryWeights(
    positions,
    researchData.fundamentals
  );
  const effectiveWeights = adjustWeightsForRegime(
    config.trading.research.weights,
    regime
  );

  const candidates: ResearchCandidate[] = [];
  const excluded: ResearchExclusion[] = [];
  const nextSteps: string[] = [];
  let dataQualitySum = 0;

  for (const symbol of symbols) {
    const f = researchData.fundamentals[symbol];
    const t = researchData.technicals[symbol];
    const news = researchData.news[symbol];
    const earnings = researchData.earnings[symbol];
    const insider = researchData.insider[symbol];
    const institutional = researchData.institutional[symbol];
    const liquidity = researchData.liquidity[symbol];
    const risk = researchData.risk[symbol];
    const snapshot = snapshots[symbol];

    const fundamentalsScore = computeFundamentalScore(f);
    const technicalsScore = computeTechnicalScore(t, snapshot);
    const macroScore = computeMacroScore(researchData.macro, regime);
    const sentimentScore = computeSentimentScore(
      news,
      earnings,
      insider,
      institutional,
      config.trading.research.recencyHalfLifeDays
    );
    const qualityScore = computeQualityScore(f);
    const valuationScore = computeValuationScore(f);
    const peerScore = computePeerScore(
      f,
      peerMedians[f?.sector ?? "unknown"] ?? {}
    );

    const weights = effectiveWeights;
    const weightedScore =
      fundamentalsScore * weights.fundamentals +
      technicalsScore * weights.technicals +
      macroScore * weights.macro +
      sentimentScore * weights.sentiment +
      qualityScore * weights.quality +
      valuationScore * weights.valuation +
      peerScore * 0.05;

    const checklist = buildChecklist(f);
    const redFlags = buildRedFlags(config.trading.research, f, t, liquidity, risk);
    const drivers = collectDrivers(f, t, earnings, insider, institutional);
    const risks = collectRisks(liquidity, risk, t, earnings);
    const dataQuality = computeDataQuality([
      f,
      t,
      news,
      earnings,
      insider,
      institutional,
      liquidity,
      risk,
    ]);
    dataQualitySum += dataQuality;

    const sector = f?.sector ?? "unknown";
    const industry = f?.industry ?? "unknown";

    const exclusionReasons: string[] = [];
    if (config.trading.research.excludeSymbols.includes(symbol)) {
      exclusionReasons.push("excluded symbol");
    }
    if (config.trading.research.excludeSectors.includes(sector)) {
      exclusionReasons.push("excluded sector");
    }
    if (config.trading.research.excludeIndustries.includes(industry)) {
      exclusionReasons.push("excluded industry");
    }
    if (redFlags.length > 0) {
      exclusionReasons.push(...redFlags.map((r) => `red flag: ${r}`));
    }
    if (t?.correlationWithPortfolio != null && t.correlationWithPortfolio > config.trading.research.maxCorrelation) {
      exclusionReasons.push("correlation above max");
    }
    const sectorWeight = (sectorTotals.get(sector) ?? 0) / total;
    const industryWeight = (industryTotals.get(industry) ?? 0) / total;
    if (sectorWeight > config.trading.research.sectorCap) {
      exclusionReasons.push("sector cap exceeded");
    }
    if (industryWeight > config.trading.research.industryCap) {
      exclusionReasons.push("industry cap exceeded");
    }

    if (exclusionReasons.length > 0) {
      excluded.push({ symbol, reasons: exclusionReasons, sector, industry });
      continue;
    }

    const confidence = clamp(
      weightedScore * 0.7 + dataQuality * 0.3,
      0,
      1
    );

    if (!earnings || earnings.length === 0) {
      nextSteps.push(`${symbol}: fetch earnings call summary`);
    }
    if (!news || news.length === 0) {
      nextSteps.push(`${symbol}: review recent news sentiment`);
    }
    if (!insider) {
      nextSteps.push(`${symbol}: check insider activity`);
    }
    if (!institutional) {
      nextSteps.push(`${symbol}: check institutional flows`);
    }

    candidates.push({
      symbol,
      sector,
      industry,
      score: clamp(weightedScore, 0, 1),
      confidence,
      factorScores: {
        fundamentals: fundamentalsScore,
        technicals: technicalsScore,
        macro: macroScore,
        sentiment: sentimentScore,
        quality: qualityScore,
        valuation: valuationScore,
        peer: peerScore,
      },
      checklist,
      redFlags,
      drivers,
      risks,
      nextSteps: [
        ...new Set([
          ...buildNextStepsFromChecklist(checklist),
          ...(dataQuality < 0.6 ? ["fill missing data for key factors"] : []),
        ]),
      ],
      sources: researchData.sources[symbol] ?? [],
      dataQuality,
      regime,
    });
  }

  const sorted = candidates.sort((a, b) => b.score - a.score);
  const overallQuality = candidates.length > 0 ? dataQualitySum / candidates.length : 0.5;

  return {
    regime,
    candidates: sorted,
    excluded,
    weights: effectiveWeights,
    constraints: config.trading.research,
    nextSteps: [...new Set(nextSteps)].slice(0, 15),
    dataQuality: overallQuality,
  };
}

function buildNextStepsFromChecklist(checklist: FactorChecklistItem[]): string[] {
  const steps: string[] = [];
  for (const item of checklist) {
    if (item.status === "fail") {
      steps.push(`revalidate ${item.factor} thesis`);
    }
    if (item.status === "neutral" && item.note === "missing") {
      steps.push(`collect missing ${item.factor} data`);
    }
  }
  return steps;
}
