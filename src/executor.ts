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
  allowedSymbols?: string[];
}): Promise<OrderResult[]> {
  const { alpaca, config, dryRun, allowedSymbols } = params;
  const allowlist = new Set(
    (allowedSymbols ?? config.trading.symbols).map((s) => s.toUpperCase())
  );
  const maxNotional = config.trading.maxOrderNotional;
  const results: OrderResult[] = [];

  console.log("[executor] loop start", {
    actionCount: params.actions.length,
    dryRun,
    allowlistSize: allowlist.size,
    maxNotional: maxNotional ?? "none",
    symbols: [...allowlist],
  });

  for (let i = 0; i < params.actions.length; i++) {
    const a = params.actions[i];
    const symbol = a.symbol?.trim().toUpperCase() ?? "";
    const loopCtx = { index: i + 1, total: params.actions.length, symbol: symbol || "?", action: a.action };

    if (!symbol) {
      console.log("[executor] action skipped", { ...loopCtx, reason: "Missing symbol" });
      results.push({ symbol: "?", side: a.action, error: "Missing symbol" });
      continue;
    }
    if (a.action === "hold") {
      console.log("[executor] action hold", loopCtx);
      results.push({ symbol, side: "hold" });
      continue;
    }
    if (!allowlist.has(symbol)) {
      console.log("[executor] action skipped", { ...loopCtx, reason: "Symbol not in allowlist" });
      results.push({
        symbol,
        side: a.action,
        error: "Symbol not in allowlist",
      });
      continue;
    }
    if (dryRun) {
      console.log("[executor] action skipped (dry run)", { ...loopCtx, notional: a.notional, quantity: a.quantity });
      results.push({
        symbol,
        side: a.action,
        error: "Dry run - no order placed",
      });
      continue;
    }

    const notional = a.notional ?? (a.quantity != null ? undefined : 100);
    if (maxNotional != null && notional != null && notional > maxNotional) {
      console.log("[executor] action skipped", { ...loopCtx, reason: "Notional exceeds max", notional, maxNotional });
      results.push({
        symbol,
        side: a.action,
        error: `Notional ${notional} exceeds max ${maxNotional}`,
      });
      continue;
    }

    try {
      const orderParams = {
        symbol,
        side: a.action as "buy" | "sell",
        qty: a.quantity,
        notional: a.notional ?? (a.quantity == null ? notional : undefined),
        type: "market" as const,
        timeInForce: "day" as const,
      };
      console.log("[executor] placing order", { ...loopCtx, orderParams });
      const order = await alpaca.placeOrder(orderParams);
      const result = { symbol, side: a.action, orderId: order.id };
      results.push(result);
      console.log("[executor] order placed", { ...loopCtx, orderId: order.id });
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
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[executor] order failed", { ...loopCtx, error: errorMsg });
      results.push({
        symbol,
        side: a.action,
        error: errorMsg,
      });
    }
  }

  console.log("[executor] loop done", { totalActions: params.actions.length, results: results.length, summary: results.map((r) => ({ symbol: r.symbol, side: r.side, orderId: r.orderId, error: r.error })) });
  return results;
}
