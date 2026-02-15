import type { Config } from "./config";
import type { Account } from "./alpaca";
import type { Position } from "./alpaca";
import type { Order } from "./alpaca";
import type { SymbolSnapshot } from "./market-data";
import type { RunRecord } from "./db";
import type { ResearchContext } from "./research";

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
  research: {
    ranked: Array<{
      symbol: string;
      score: number;
      confidence: number;
      horizon: "short" | "medium" | "long";
      thesis: string;
      drivers: string[];
      risks: string[];
      nextSteps: string[];
      scorecard: {
        factors: Array<{
          name: string;
          score: number;
          confidence: number;
          evidence: string[];
          sources: string[];
        }>;
        checklist: Array<{
          factor: string;
          status: "pass" | "neutral" | "fail";
          note?: string;
        }>;
        redFlags: string[];
      };
    }>;
    nextSteps: string[];
  };
};

export type AdversarialReview = {
  reviews: Array<{
    symbol: string;
    counterpoints: string[];
    verdict: "accept" | "caution" | "reject";
    confidence: number;
    shouldDrop: boolean;
    sources: string[];
  }>;
  overallRisks: string[];
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
        research: {
          type: "object",
          description: "Research ranking and next-step guidance for candidates",
          properties: {
            ranked: {
              type: "array",
              description: "Ranked list of candidates, highest score first",
              items: {
                type: "object",
                properties: {
                  symbol: { type: "string", description: "Stock symbol e.g. AAPL" },
                  score: { type: "number", description: "0-100 overall score" },
                  confidence: { type: "number", description: "0-1 confidence" },
                  horizon: {
                    type: "string",
                    enum: ["short", "medium", "long"],
                    description: "Expected time horizon for the thesis",
                  },
                  thesis: { type: "string", description: "One-sentence thesis" },
                  drivers: { type: "array", items: { type: "string" }, description: "Key positive drivers" },
                  risks: { type: "array", items: { type: "string" }, description: "Key risks or red flags" },
                  nextSteps: { type: "array", items: { type: "string" }, description: "Follow-up research steps" },
                  scorecard: {
                    type: "object",
                    properties: {
                      factors: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            score: { type: "number" },
                            confidence: { type: "number" },
                            evidence: { type: "array", items: { type: "string" } },
                            sources: { type: "array", items: { type: "string" } },
                          },
                          required: ["name", "score", "confidence", "evidence", "sources"],
                          additionalProperties: false,
                        },
                      },
                      checklist: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            factor: { type: "string" },
                            status: { type: "string", enum: ["pass", "neutral", "fail"] },
                            note: { type: "string" },
                          },
                          required: ["factor", "status"],
                          additionalProperties: false,
                        },
                      },
                      redFlags: { type: "array", items: { type: "string" } },
                    },
                    required: ["factors", "checklist", "redFlags"],
                    additionalProperties: false,
                  },
                },
                required: ["symbol", "score", "confidence", "horizon", "thesis", "drivers", "risks", "nextSteps", "scorecard"],
                additionalProperties: false,
              },
            },
            nextSteps: {
              type: "array",
              description: "Overall next steps for research mode",
              items: { type: "string" },
            },
          },
          required: ["ranked", "nextSteps"],
          additionalProperties: false,
        },
      },
      required: ["reasoning", "actions", "research"],
      additionalProperties: false,
    },
  },
};

const ADVERSARIAL_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "adversarial_review",
    strict: true,
    schema: {
      type: "object",
      properties: {
        reviews: {
          type: "array",
          items: {
            type: "object",
            properties: {
              symbol: { type: "string" },
              counterpoints: { type: "array", items: { type: "string" } },
              verdict: { type: "string", enum: ["accept", "caution", "reject"] },
              confidence: { type: "number" },
              shouldDrop: { type: "boolean" },
              sources: { type: "array", items: { type: "string" } },
            },
            required: ["symbol", "counterpoints", "verdict", "confidence", "shouldDrop", "sources"],
            additionalProperties: false,
          },
        },
        overallRisks: { type: "array", items: { type: "string" } },
      },
      required: ["reviews", "overallRisks"],
      additionalProperties: false,
    },
  },
};

function snapshotToContextShape(s: {
  latestTrade?: { p: number };
  dailyBar?: { o: number; h: number; l: number; c: number; v: number };
  prevDailyBar?: { o: number; h: number; l: number; c: number };
}) {
  const prevClose = s.prevDailyBar?.c;
  const close = s.dailyBar?.c;
  const change = close != null && prevClose != null ? close - prevClose : undefined;
  const changePct =
    close != null && prevClose != null && prevClose !== 0
      ? (close - prevClose) / prevClose
      : undefined;
  const dayRange =
    s.dailyBar != null ? { low: s.dailyBar.l, high: s.dailyBar.h } : undefined;
  const dayRangePct =
    s.dailyBar != null && prevClose != null && prevClose !== 0
      ? (s.dailyBar.h - s.dailyBar.l) / prevClose
      : undefined;
  return {
    lastPrice: s.latestTrade?.p,
    dailyBar: s.dailyBar ? { o: s.dailyBar.o, h: s.dailyBar.h, l: s.dailyBar.l, c: s.dailyBar.c, v: s.dailyBar.v } : undefined,
    prevDailyBar: s.prevDailyBar ? { o: s.prevDailyBar.o, h: s.prevDailyBar.h, l: s.prevDailyBar.l, c: s.prevDailyBar.c } : undefined,
    change,
    changePct,
    dayRange,
    dayRangePct,
  };
}

function buildContext(params: {
  account: Account;
  positions: Position[];
  openOrders: Order[];
  snapshots: Record<string, SymbolSnapshot>;
  recentRuns?: RunRecord[];
  researchContext?: ResearchContext;
}): string {
  const { account, positions, openOrders, snapshots, recentRuns, researchContext } = params;
  const payload: Record<string, any> = {
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
      Object.entries(snapshots).map(([sym, s]) => [sym, snapshotToContextShape(s)])
    ),
  };
  if (recentRuns != null && recentRuns.length > 0) {
    payload.recentRunHistory = recentRuns.map((r) => ({
      createdAt: r.createdAt,
      reasoning: r.reasoning,
      actions: r.actions,
      ordersPlaced: r.ordersPlaced,
      errors: r.errors,
    }));
  }
  if (researchContext != null && (researchContext.topGainers.length > 0 || researchContext.topLosers.length > 0 || researchContext.mostActive.length > 0 || Object.keys(researchContext.marketConditionSnapshots).length > 0)) {
    payload.research = {
      topGainers: researchContext.topGainers,
      topLosers: researchContext.topLosers,
      mostActive: researchContext.mostActive,
      researchSymbols: researchContext.researchSymbols,
      eligibleSymbols: researchContext.eligibleSymbols,
      excludedSymbols: researchContext.excludedSymbols,
      marketConditionSnapshots: Object.fromEntries(
        Object.entries(researchContext.marketConditionSnapshots).map(([sym, s]) => [sym, snapshotToContextShape(s)])
      ),
    };
    if (researchContext.analysis) {
      payload.research.analysis = {
        regime: researchContext.analysis.regime,
        weights: researchContext.analysis.weights,
        constraints: researchContext.analysis.constraints,
        dataQuality: researchContext.analysis.dataQuality,
        nextSteps: researchContext.analysis.nextSteps,
        candidates: researchContext.analysis.candidates.slice(0, 30).map((c) => ({
          symbol: c.symbol,
          sector: c.sector,
          industry: c.industry,
          score: c.score,
          confidence: c.confidence,
          factorScores: c.factorScores,
          checklist: c.checklist,
          redFlags: c.redFlags,
          drivers: c.drivers,
          risks: c.risks,
          nextSteps: c.nextSteps,
          sources: c.sources,
          dataQuality: c.dataQuality,
          regime: c.regime,
        })),
        excluded: researchContext.analysis.excluded,
      };
    }
  }
  return JSON.stringify(payload, null, 2);
}

export async function getTradingDecision(params: {
  config: Config;
  account: Account;
  positions: Position[];
  openOrders: Order[];
  snapshots: Record<string, SymbolSnapshot>;
  recentRuns?: RunRecord[];
  researchContext?: ResearchContext;
}): Promise<OpenRouterResponse> {
  const { config } = params;
  const context = buildContext({
    account: params.account,
    positions: params.positions,
    openOrders: params.openOrders,
    snapshots: params.snapshots,
    recentRuns: params.recentRuns,
    researchContext: params.researchContext,
  });

  const systemPrompt = `You are a conservative stock trading assistant. Output only valid JSON that matches the required schema.
Based on the account, positions, open orders, and market snapshots provided, suggest buy/sell/hold actions.
Consider recent run history and research (movers, market conditions) when deciding; prefer symbols from the provided data.
Prefer hold when uncertain. Consider buying power and position sizes. Do not suggest symbols not in the data.
For research ranking, rank candidates from eligible research symbols if provided; otherwise rank from market snapshots.
Tool-first policy: cite data sources in scorecard evidence and sources before reasoning. If evidence is missing, say so.
Return ranked symbols in descending score order with 2-3 primary drivers, concise risks, and actionable next steps.`;

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
  if (!parsed.reasoning || !Array.isArray(parsed.actions) || parsed.research == null || !Array.isArray(parsed.research.ranked)) {
    throw new Error("Invalid OpenRouter response shape");
  }
  return parsed;
}

export async function getAdversarialReview(params: {
  config: Config;
  account: Account;
  positions: Position[];
  openOrders: Order[];
  snapshots: Record<string, SymbolSnapshot>;
  recentRuns?: RunRecord[];
  researchContext?: ResearchContext;
  decision: OpenRouterResponse;
}): Promise<AdversarialReview> {
  const { config, decision } = params;
  const context = buildContext({
    account: params.account,
    positions: params.positions,
    openOrders: params.openOrders,
    snapshots: params.snapshots,
    recentRuns: params.recentRuns,
    researchContext: params.researchContext,
  });
  const systemPrompt = `You are a skeptical research reviewer. Output only valid JSON that matches the required schema.
Critically evaluate the proposed research ranking and actions. Provide counterpoints, risks, and whether each symbol should be dropped.
Tool-first policy: cite data sources in sources before reasoning; if evidence is missing, say so.`;

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
        { role: "user", content: `Proposed decision:\n\n${JSON.stringify(decision, null, 2)}` },
      ],
      response_format: ADVERSARIAL_SCHEMA,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter adversarial error: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter adversarial returned no content");
  }

  const parsed = JSON.parse(content) as AdversarialReview;
  if (!Array.isArray(parsed.reviews)) {
    throw new Error("Invalid adversarial response shape");
  }
  return parsed;
}
