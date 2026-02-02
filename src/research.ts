import type { Config } from "./config";
import type { MarketDataClient } from "./market-data";
import type { SymbolSnapshot } from "./market-data";
import type { ResearchAnalysis } from "./research-engine";
import { buildResearchAnalysis } from "./research-engine";
import { loadResearchData } from "./research-data";
import type { Position } from "./alpaca";

export type ResearchContext = {
  topGainers: string[];
  topLosers: string[];
  mostActive: string[];
  marketConditionSnapshots: Record<string, SymbolSnapshot>;
  researchSymbols: string[];
  analysis?: ResearchAnalysis;
  eligibleSymbols: string[];
  excludedSymbols: Array<{ symbol: string; reasons: string[] }>;
};

const EMPTY_RESEARCH: ResearchContext = {
  topGainers: [],
  topLosers: [],
  mostActive: [],
  marketConditionSnapshots: {},
  researchSymbols: [],
  analysis: undefined,
  eligibleSymbols: [],
  excludedSymbols: [],
};

export async function buildResearchContext(deps: {
  marketData: MarketDataClient;
  config: Config;
  positions: Position[];
}): Promise<ResearchContext> {
  const { marketData, config, positions } = deps;
  if (!config.trading.researchMode) {
    return EMPTY_RESEARCH;
  }

  const cap = config.trading.researchSymbolsCap;
  const halfCap = Math.max(1, Math.floor(cap / 2));

  const [movers, mostActive, marketConditionSnapshots] = await Promise.all([
    marketData.getMovers(),
    marketData.getMostActives(cap),
    config.trading.marketConditionSymbols.length > 0
      ? marketData.getSnapshots(config.trading.marketConditionSymbols)
      : Promise.resolve({} as Record<string, SymbolSnapshot>),
  ]);

  const topGainers = movers.gainers.slice(0, halfCap);
  const topLosers = movers.losers.slice(0, halfCap);
  const researchSymbols = [...new Set([...topGainers, ...topLosers, ...mostActive])].slice(0, cap);
  const snapshots = await marketData.getSnapshots(researchSymbols);
  const researchData = loadResearchData();
  const analysis = buildResearchAnalysis({
    symbols: researchSymbols,
    snapshots,
    positions,
    researchData,
    config,
  });
  const eligibleSymbols = analysis.candidates.map((c) => c.symbol);
  const excludedSymbols = analysis.excluded.map((e) => ({ symbol: e.symbol, reasons: e.reasons }));

  return {
    topGainers,
    topLosers,
    mostActive,
    marketConditionSnapshots,
    researchSymbols,
    analysis,
    eligibleSymbols,
    excludedSymbols,
  };
}
