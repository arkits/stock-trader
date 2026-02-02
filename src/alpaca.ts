import Alpaca from "@alpacahq/alpaca-trade-api";
import type { Config } from "./config";

export type Account = {
  equity: string;
  buyingPower: string;
  cash: string;
  tradingBlocked: boolean;
};

export type Position = {
  symbol: string;
  qty: string;
  marketValue: string;
  costBasis: string;
  unrealizedPl: string;
};

export type Order = {
  id: string;
  symbol: string;
  side: string;
  qty: string;
  type: string;
  status: string;
};

export function createAlpacaClient(config: Config) {
  const alpaca = new Alpaca({
    keyId: config.alpaca.keyId,
    secretKey: config.alpaca.secretKey,
    baseUrl: config.alpaca.baseUrl,
    paper: config.alpaca.baseUrl.includes("paper"),
  });

  return {
    async getAccount(): Promise<Account> {
      const acc = await alpaca.getAccount();
      return {
        equity: acc.equity ?? "0",
        buyingPower: acc.buying_power ?? "0",
        cash: acc.cash ?? "0",
        tradingBlocked: acc.trading_blocked ?? false,
      };
    },

    async getPositions(): Promise<Position[]> {
      const positions = await alpaca.getPositions();
      return (positions ?? []).map((p: Record<string, unknown>) => ({
        symbol: String(p.symbol ?? ""),
        qty: String(p.qty ?? "0"),
        marketValue: String(p.market_value ?? "0"),
        costBasis: String(p.cost_basis ?? "0"),
        unrealizedPl: String(p.unrealized_pl ?? "0"),
      }));
    },

    async getOpenOrders(): Promise<Order[]> {
      const orders = await (alpaca.getOrders as (opts?: { status?: string }) => Promise<unknown>)({ status: "open" });
      const list = Array.isArray(orders) ? orders : [];
      return list.map((o: Record<string, unknown>) => ({
        id: String(o.id ?? ""),
        symbol: String(o.symbol ?? ""),
        side: String(o.side ?? ""),
        qty: String(o.qty ?? "0"),
        type: String(o.type ?? ""),
        status: String(o.status ?? ""),
      }));
    },

    async placeOrder(params: {
      symbol: string;
      side: "buy" | "sell";
      qty?: number;
      notional?: number;
      type?: string;
      timeInForce?: string;
    }): Promise<{ id: string }> {
      const order: Record<string, unknown> = {
        symbol: params.symbol,
        side: params.side,
        type: params.type ?? "market",
        time_in_force: params.timeInForce ?? "day",
      };
      if (params.notional != null) {
        order.notional = String(params.notional);
      } else if (params.qty != null) {
        order.qty = String(params.qty);
      } else {
        throw new Error("Either qty or notional required");
      }
      const result = await alpaca.createOrder(order as Parameters<typeof alpaca.createOrder>[0]);
      return { id: String((result as Record<string, unknown>).id ?? "") };
    },
  };
}

export type AlpacaClient = ReturnType<typeof createAlpacaClient>;
