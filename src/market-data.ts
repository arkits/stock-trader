import type { Config } from "./config";

const DATA_BASE_V2 = "https://data.alpaca.markets/v2";
const DATA_BASE_V1BETA1 = "https://data.alpaca.markets/v1beta1";

export type SnapshotBar = {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: string;
};

export type SymbolSnapshot = {
  symbol: string;
  latestTrade?: { p: number };
  dailyBar?: SnapshotBar;
  prevDailyBar?: SnapshotBar;
};

async function fetchWithAuth(
  url: string,
  keyId: string,
  secretKey: string
): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": keyId,
      "APCA-API-SECRET-KEY": secretKey,
    },
  });
  if (!res.ok) {
    throw new Error(`Market data API error: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<unknown>;
}

export type MoversResult = {
  gainers: string[];
  losers: string[];
};

export function createMarketDataClient(config: Config) {
  const { keyId, secretKey } = config.alpaca;

  return {
    async getSnapshots(symbols: string[]): Promise<Record<string, SymbolSnapshot>> {
      if (symbols.length === 0) return {};
      const symbolsParam = symbols.join(",");
      const url = `${DATA_BASE_V2}/stocks/snapshots?symbols=${encodeURIComponent(symbolsParam)}`;
      const data = (await fetchWithAuth(url, keyId, secretKey)) as Record<
        string,
        {
          symbol?: string;
          latestTrade?: { p?: number };
          dailyBar?: SnapshotBar;
          previousDailyBar?: SnapshotBar;
        }
      >;
      const out: Record<string, SymbolSnapshot> = {};
      for (const [sym, raw] of Object.entries(data)) {
        if (!raw) continue;
        out[sym] = {
          symbol: raw.symbol ?? sym,
          latestTrade: raw.latestTrade?.p != null ? { p: raw.latestTrade.p } : undefined,
          dailyBar: raw.dailyBar,
          prevDailyBar: raw.previousDailyBar,
        };
      }
      return out;
    },

    async getMovers(): Promise<MoversResult> {
      const url = `${DATA_BASE_V1BETA1}/screener/stocks/movers?top=20`;
      const data = (await fetchWithAuth(url, keyId, secretKey)) as {
        gainers?: unknown[];
        losers?: unknown[];
      };
      const parseMoverSymbols = (arr: unknown[] | undefined): string[] =>
        (arr ?? [])
          .map((item) => (item && typeof item === "object" && "symbol" in item ? String((item as { symbol: unknown }).symbol) : null))
          .filter((s): s is string => typeof s === "string" && s.length > 0);
      return {
        gainers: parseMoverSymbols(data.gainers),
        losers: parseMoverSymbols(data.losers),
      };
    },

    async getMostActives(limit = 10): Promise<string[]> {
      const url = `${DATA_BASE_V1BETA1}/screener/stocks/most-actives?top=${Math.max(1, limit)}`;
      const raw = (await fetchWithAuth(url, keyId, secretKey)) as unknown;
      const arr = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && "most_actives" in raw && Array.isArray((raw as { most_actives: unknown }).most_actives)
          ? (raw as { most_actives: unknown[] }).most_actives
          : [];
      return arr
        .map((item: unknown) =>
          item && typeof item === "object" && "symbol" in item ? String((item as { symbol: unknown }).symbol) : null
        )
        .filter((s: string | null): s is string => typeof s === "string" && s.length > 0);
    },
  };
}

export type MarketDataClient = ReturnType<typeof createMarketDataClient>;
