import type { Config } from "./config";

const DATA_BASE = "https://data.alpaca.markets/v2";

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

export function createMarketDataClient(config: Config) {
  const { keyId, secretKey } = config.alpaca;

  return {
    async getSnapshots(symbols: string[]): Promise<Record<string, SymbolSnapshot>> {
      if (symbols.length === 0) return {};
      const symbolsParam = symbols.join(",");
      const url = `${DATA_BASE}/stocks/snapshots?symbols=${encodeURIComponent(symbolsParam)}`;
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
  };
}

export type MarketDataClient = ReturnType<typeof createMarketDataClient>;
