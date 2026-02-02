import type { AlpacaClient } from "./alpaca";
import type { Config } from "./config";
import { notifyTrade } from "./gotify";
import type { TradingAction } from "./openrouter";

export type OrderResult = {
  symbol: string;
  side: string;
  orderId?: string;
  error?: string;
};

export async function executeActions(params: {
  alpaca: AlpacaClient;
  config: Config;
  actions: TradingAction[];
  dryRun: boolean;
}): Promise<OrderResult[]> {
  const { alpaca, config, dryRun } = params;
  const allowlist = new Set(
    config.trading.symbols.map((s) => s.toUpperCase())
  );
  const maxNotional = config.trading.maxOrderNotional;
  const results: OrderResult[] = [];

  for (const a of params.actions) {
    const symbol = a.symbol?.trim().toUpperCase() ?? "";
    if (!symbol) {
      results.push({ symbol: "?", side: a.action, error: "Missing symbol" });
      continue;
    }
    if (a.action === "hold") {
      results.push({ symbol, side: "hold" });
      continue;
    }
    if (!allowlist.has(symbol)) {
      results.push({
        symbol,
        side: a.action,
        error: "Symbol not in allowlist",
      });
      continue;
    }
    if (dryRun) {
      results.push({
        symbol,
        side: a.action,
        error: "Dry run - no order placed",
      });
      continue;
    }

    const notional = a.notional ?? (a.quantity != null ? undefined : 100);
    if (maxNotional != null && notional != null && notional > maxNotional) {
      results.push({
        symbol,
        side: a.action,
        error: `Notional ${notional} exceeds max ${maxNotional}`,
      });
      continue;
    }

    try {
      const order = await alpaca.placeOrder({
        symbol,
        side: a.action as "buy" | "sell",
        qty: a.quantity,
        notional: a.notional ?? (a.quantity == null ? notional : undefined),
        type: "market",
        timeInForce: "day",
      });
      const result = { symbol, side: a.action, orderId: order.id };
      results.push(result);
      try {
        await notifyTrade({
          symbol,
          side: a.action,
          orderId: order.id,
        });
      } catch {
        // Gotify is optional; never let notification failure affect the trade
      }
    } catch (err) {
      results.push({
        symbol,
        side: a.action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
