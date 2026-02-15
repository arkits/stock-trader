import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { AlpacaClient } from "../alpaca";
import type { Config, SafeConfig } from "../config";
import type { RunRecord, ResearchRunRecord } from "../db";
import { getLastRun, getRunHistory, getResearchRunByRunId } from "../db";

export type Context = {
  alpaca: AlpacaClient;
  config: Config;
  getSafeConfig: () => SafeConfig;
  getLastRun: () => RunRecord | null;
  getRunHistory: (limit: number) => RunRecord[];
  getResearchRunByRunId: (runId: number) => ResearchRunRecord | null;
};

export function createContext(params: {
  alpaca: AlpacaClient;
  config: Config;
}): Context {
  return {
    alpaca: params.alpaca,
    config: params.config,
    getSafeConfig: () => ({
      trading: params.config.trading,
    }),
    getLastRun,
    getRunHistory,
    getResearchRunByRunId,
  };
}

export function createFetchContext(ctx: Context) {
  return function (_opts: FetchCreateContextFnOptions): Context {
    return ctx;
  };
}
