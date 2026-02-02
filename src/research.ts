import type { Config } from "./config";
import type { MarketDataClient } from "./market-data";
import type { SymbolSnapshot } from "./market-data";

export type ResearchContext = {
  topGainers: string[];
  topLosers: string[];
  mostActive: string[];
  marketConditionSnapshots: Record<string, SymbolSnapshot>;
  researchSymbols: string[];
};

const EMPTY_RESEARCH: ResearchContext = {
  topGainers: [],
  topLosers: [],
  mostActive: [],
  marketConditionSnapshots: {},
  researchSymbols: [],
};

export async function buildResearchContext(deps: {
  marketData: MarketDataClient;
  config: Config;
}): Promise<ResearchContext> {
  const { marketData, config } = deps;
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

  return {
    topGainers,
    topLosers,
    mostActive,
    marketConditionSnapshots,
    researchSymbols,
  };
}
