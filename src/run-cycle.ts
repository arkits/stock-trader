import type { AlpacaClient } from "./alpaca";
import type { Config } from "./config";
import type { MarketDataClient } from "./market-data";
import { getTradingDecision, type OpenRouterResponse } from "./openrouter";
import { executeActions } from "./executor";
import { insertRun, insertPortfolioSnapshot, getRunHistory } from "./db";
import { buildResearchContext } from "./research";

export type RunCycleDeps = {
  alpaca: AlpacaClient;
  marketData: MarketDataClient;
  config: Config;
};

export async function runCycle(deps: RunCycleDeps): Promise<void> {
  const { alpaca, marketData, config } = deps;
  const errors: string[] = [];

  const account = await alpaca.getAccount();
  const positions = await alpaca.getPositions();
  const openOrders = await alpaca.getOpenOrders();

  const positionSymbols = positions.map((p) => p.symbol);
  let researchContext = await buildResearchContext({ marketData, config });
  const symbols = [
    ...new Set([
      ...config.trading.symbols,
      ...positionSymbols,
      ...researchContext.researchSymbols,
      ...config.trading.marketConditionSymbols,
    ]),
  ].filter(Boolean);
  const snapshots = await marketData.getSnapshots(symbols);
  const recentRuns = getRunHistory(10);

  let reasoning = "";
  let actions: OpenRouterResponse["actions"] = [];
  let ordersPlaced: Array<{ symbol: string; side: string; orderId?: string; error?: string }> = [];

  try {
    const decision = await getTradingDecision({
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

    ordersPlaced = await executeActions({
      alpaca,
      config,
      actions: decision.actions,
      dryRun: config.trading.dryRun,
      allowedSymbols: symbols,
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  insertRun({
    reasoning,
    actions,
    ordersPlaced,
    errors,
  });
  insertPortfolioSnapshot(account.equity);
}
