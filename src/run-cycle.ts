import type { AlpacaClient } from "./alpaca";
import type { Config } from "./config";
import type { MarketDataClient } from "./market-data";
import { getTradingDecision, type OpenRouterResponse } from "./openrouter";
import { executeActions } from "./executor";
import { insertRun, insertPortfolioSnapshot } from "./db";

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
  const symbols = [
    ...new Set([...config.trading.symbols, ...positionSymbols]),
  ].filter(Boolean);
  const snapshots = await marketData.getSnapshots(symbols);

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
    });
    reasoning = decision.reasoning;
    actions = decision.actions;

    ordersPlaced = await executeActions({
      alpaca,
      config,
      actions: decision.actions,
      dryRun: config.trading.dryRun,
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
