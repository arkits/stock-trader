import type { Config } from "./config";
import type { Account } from "./alpaca";
import type { Position } from "./alpaca";
import type { Order } from "./alpaca";
import type { SymbolSnapshot } from "./market-data";

export type TradingAction = {
  action: "buy" | "sell" | "hold";
  symbol: string;
  quantity?: number;
  notional?: number;
  reason: string;
};

export type OpenRouterResponse = {
  reasoning: string;
  actions: TradingAction[];
};

const RESPONSE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "trading_decision",
    strict: true,
    schema: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description: "Brief reasoning for the decisions",
        },
        actions: {
          type: "array",
          description: "List of trading actions to take",
          items: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["buy", "sell", "hold"],
                description: "Action to take",
              },
              symbol: {
                type: "string",
                description: "Stock symbol e.g. AAPL",
              },
              quantity: {
                type: "number",
                description: "Number of shares (for buy/sell)",
              },
              notional: {
                type: "number",
                description: "Dollar amount (for buy/sell)",
              },
              reason: {
                type: "string",
                description: "Brief reason for this action",
              },
            },
            required: ["action", "symbol", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["reasoning", "actions"],
      additionalProperties: false,
    },
  },
};

function buildContext(params: {
  account: Account;
  positions: Position[];
  openOrders: Order[];
  snapshots: Record<string, SymbolSnapshot>;
}): string {
  const { account, positions, openOrders, snapshots } = params;
  return JSON.stringify(
    {
      account: {
        equity: account.equity,
        buyingPower: account.buyingPower,
        cash: account.cash,
        tradingBlocked: account.tradingBlocked,
      },
      positions: positions.map((p) => ({
        symbol: p.symbol,
        qty: p.qty,
        marketValue: p.marketValue,
        costBasis: p.costBasis,
        unrealizedPl: p.unrealizedPl,
      })),
      openOrdersCount: openOrders.length,
      openOrdersSummary: openOrders.map((o) => ({
        symbol: o.symbol,
        side: o.side,
        qty: o.qty,
      })),
      marketSnapshots: Object.fromEntries(
        Object.entries(snapshots).map(([sym, s]) => [
          sym,
          {
            lastPrice: s.latestTrade?.p,
            dailyBar: s.dailyBar
              ? { o: s.dailyBar.o, h: s.dailyBar.h, l: s.dailyBar.l, c: s.dailyBar.c, v: s.dailyBar.v }
              : undefined,
            prevDailyBar: s.prevDailyBar
              ? { o: s.prevDailyBar.o, h: s.prevDailyBar.h, l: s.prevDailyBar.l, c: s.prevDailyBar.c }
              : undefined,
          },
        ])
      ),
    },
    null,
    2
  );
}

export async function getTradingDecision(params: {
  config: Config;
  account: Account;
  positions: Position[];
  openOrders: Order[];
  snapshots: Record<string, SymbolSnapshot>;
}): Promise<OpenRouterResponse> {
  const { config } = params;
  const context = buildContext({
    account: params.account,
    positions: params.positions,
    openOrders: params.openOrders,
    snapshots: params.snapshots,
  });

  const systemPrompt = `You are a conservative stock trading assistant. Output only valid JSON that matches the required schema.
Based on the account, positions, open orders, and market snapshots provided, suggest buy/sell/hold actions.
Prefer hold when uncertain. Consider buying power and position sizes. Do not suggest symbols not in the data.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openRouter.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openRouter.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Current state:\n\n${context}` },
      ],
      response_format: RESPONSE_SCHEMA,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter API error: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned no content");
  }

  const parsed = JSON.parse(content) as OpenRouterResponse;
  if (!parsed.reasoning || !Array.isArray(parsed.actions)) {
    throw new Error("Invalid OpenRouter response shape");
  }
  return parsed;
}
