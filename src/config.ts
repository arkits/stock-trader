function getEnv(key: string): string {
  const v = process.env[key];
  if (v === undefined || v === "") {
    throw new Error(`Missing env: ${key}`);
  }
  return v;
}

function getEnvOptional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseWeights(
  value: string | undefined,
  fallback: Config["trading"]["research"]["weights"]
): Config["trading"]["research"]["weights"] {
  if (!value) return fallback;
  const out = { ...fallback };
  const pairs = value.split(",").map((s) => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const [k, v] = pair.split("=").map((s) => s.trim());
    if (!k || v == null) continue;
    const num = Number.parseFloat(v);
    if (!Number.isFinite(num)) continue;
    if (k in out) {
      (out as Record<string, number>)[k] = num;
    }
  }
  return out;
}

function getRiskDefaults(
  mode: "conservative" | "balanced" | "aggressive"
): Config["trading"]["research"] {
  if (mode === "conservative") {
    return {
      riskMode: mode,
      confidenceFloor: 0.7,
      recencyHalfLifeDays: 14,
      weights: {
        fundamentals: 0.35,
        technicals: 0.15,
        macro: 0.2,
        sentiment: 0.1,
        quality: 0.1,
        valuation: 0.1,
      },
      maxCorrelation: 0.55,
      sectorCap: 0.3,
      industryCap: 0.2,
      minMarketCap: 2_000_000_000,
      minDollarVolume: 20_000_000,
      maxDrawdown: 0.35,
      excludeSectors: [],
      excludeIndustries: [],
      excludeSymbols: [],
    };
  }
  if (mode === "aggressive") {
    return {
      riskMode: mode,
      confidenceFloor: 0.5,
      recencyHalfLifeDays: 7,
      weights: {
        fundamentals: 0.25,
        technicals: 0.3,
        macro: 0.15,
        sentiment: 0.15,
        quality: 0.05,
        valuation: 0.1,
      },
      maxCorrelation: 0.75,
      sectorCap: 0.45,
      industryCap: 0.35,
      minMarketCap: 500_000_000,
      minDollarVolume: 8_000_000,
      maxDrawdown: 0.5,
      excludeSectors: [],
      excludeIndustries: [],
      excludeSymbols: [],
    };
  }
  return {
    riskMode: mode,
    confidenceFloor: 0.6,
    recencyHalfLifeDays: 10,
    weights: {
      fundamentals: 0.3,
      technicals: 0.25,
      macro: 0.15,
      sentiment: 0.1,
      quality: 0.1,
      valuation: 0.1,
    },
    maxCorrelation: 0.65,
    sectorCap: 0.35,
    industryCap: 0.25,
    minMarketCap: 1_000_000_000,
    minDollarVolume: 12_000_000,
    maxDrawdown: 0.4,
    excludeSectors: [],
    excludeIndustries: [],
    excludeSymbols: [],
  };
}

export interface Config {
  alpaca: {
    keyId: string;
    secretKey: string;
    baseUrl: string;
  };
  openRouter: {
    apiKey: string;
    model: string;
  };
  trading: {
    intervalMinutes: number;
    dryRun: boolean;
    symbols: string[];
    maxOrderNotional?: number;
    researchMode: boolean;
    researchSymbolsCap: number;
    marketConditionSymbols: string[];
    research: {
      riskMode: "conservative" | "balanced" | "aggressive";
      confidenceFloor: number;
      recencyHalfLifeDays: number;
      weights: {
        fundamentals: number;
        technicals: number;
        macro: number;
        sentiment: number;
        quality: number;
        valuation: number;
      };
      maxCorrelation: number;
      sectorCap: number;
      industryCap: number;
      minMarketCap: number;
      minDollarVolume: number;
      maxDrawdown: number;
      excludeSectors: string[];
      excludeIndustries: string[];
      excludeSymbols: string[];
    };
  };
}

export function loadConfig(): Config {
  const baseUrl = getEnvOptional(
    "APCA_API_BASE_URL",
    "https://paper-api.alpaca.markets"
  );
  const riskMode = getEnvOptional("RISK_MODE", "balanced").toLowerCase();
  const resolvedRiskMode =
    riskMode === "conservative" || riskMode === "aggressive"
      ? (riskMode as "conservative" | "aggressive")
      : "balanced";
  const riskDefaults = getRiskDefaults(resolvedRiskMode);

  return {
    alpaca: {
      keyId: getEnv("APCA_API_KEY_ID"),
      secretKey: getEnv("APCA_API_SECRET_KEY"),
      baseUrl: baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl,
    },
    openRouter: {
      apiKey: getEnv("OPENROUTER_API_KEY"),
      model: getEnvOptional("OPENROUTER_MODEL", "openai/gpt-4o"),
    },
    trading: {
      intervalMinutes: Math.max(
        1,
        parseInt(getEnvOptional("TRADING_INTERVAL_MINUTES", "60"), 10) || 60
      ),
      dryRun: getEnvOptional("DRY_RUN", "true").toLowerCase() === "true",
      symbols: parseCsv(getEnvOptional("SYMBOLS", "AAPL,GOOGL,MSFT")).map((s) =>
        s.toUpperCase()
      ),
      maxOrderNotional: process.env.MAX_ORDER_NOTIONAL
        ? parseFloat(process.env.MAX_ORDER_NOTIONAL)
        : undefined,
      researchMode: getEnvOptional("RESEARCH_MODE", "false").toLowerCase() === "true",
      researchSymbolsCap: Math.max(
        0,
        parseInt(getEnvOptional("RESEARCH_SYMBOLS_CAP", "10"), 10) || 10
      ),
      marketConditionSymbols: parseCsv(
        getEnvOptional("MARKET_CONDITION_SYMBOLS", "SPY,QQQ")
      ).map((s) => s.toUpperCase()),
      research: {
        ...riskDefaults,
        confidenceFloor: clamp(
          parseFloat(
            getEnvOptional(
              "RESEARCH_CONFIDENCE_FLOOR",
              String(riskDefaults.confidenceFloor)
            )
          ),
          0,
          1
        ),
        recencyHalfLifeDays: Math.max(
          1,
          parseInt(
            getEnvOptional(
              "RESEARCH_RECENCY_HALF_LIFE_DAYS",
              String(riskDefaults.recencyHalfLifeDays)
            ),
            10
          ) || riskDefaults.recencyHalfLifeDays
        ),
        weights: parseWeights(process.env.RESEARCH_WEIGHTS, riskDefaults.weights),
        maxCorrelation: clamp(
          parseFloat(
            getEnvOptional(
              "RESEARCH_MAX_CORRELATION",
              String(riskDefaults.maxCorrelation)
            )
          ),
          0,
          1
        ),
        sectorCap: clamp(
          parseFloat(
            getEnvOptional("RESEARCH_SECTOR_CAP", String(riskDefaults.sectorCap))
          ),
          0,
          1
        ),
        industryCap: clamp(
          parseFloat(
            getEnvOptional(
              "RESEARCH_INDUSTRY_CAP",
              String(riskDefaults.industryCap)
            )
          ),
          0,
          1
        ),
        minMarketCap: Math.max(
          0,
          parseFloat(
            getEnvOptional(
              "RESEARCH_MIN_MARKET_CAP",
              String(riskDefaults.minMarketCap)
            )
          )
        ),
        minDollarVolume: Math.max(
          0,
          parseFloat(
            getEnvOptional(
              "RESEARCH_MIN_DOLLAR_VOLUME",
              String(riskDefaults.minDollarVolume)
            )
          )
        ),
        maxDrawdown: clamp(
          parseFloat(
            getEnvOptional(
              "RESEARCH_MAX_DRAWDOWN",
              String(riskDefaults.maxDrawdown)
            )
          ),
          0,
          1
        ),
        excludeSectors: parseCsv(getEnvOptional("RESEARCH_EXCLUDE_SECTORS", "")),
        excludeIndustries: parseCsv(
          getEnvOptional("RESEARCH_EXCLUDE_INDUSTRIES", "")
        ),
        excludeSymbols: parseCsv(
          getEnvOptional("RESEARCH_EXCLUDE_SYMBOLS", "")
        ).map((s) => s.toUpperCase()),
      },
    },
  };
}

export type SafeConfig = Pick<Config, "trading">;

export function getSafeConfig(config: Config): SafeConfig {
  return {
    trading: config.trading,
  };
}
