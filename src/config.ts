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
  };
}

export function loadConfig(): Config {
  const baseUrl = getEnvOptional(
    "APCA_API_BASE_URL",
    "https://paper-api.alpaca.markets"
  );

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
      symbols: getEnvOptional("SYMBOLS", "AAPL,GOOGL,MSFT")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      maxOrderNotional: process.env.MAX_ORDER_NOTIONAL
        ? parseFloat(process.env.MAX_ORDER_NOTIONAL)
        : undefined,
      researchMode: getEnvOptional("RESEARCH_MODE", "false").toLowerCase() === "true",
      researchSymbolsCap: Math.max(
        0,
        parseInt(getEnvOptional("RESEARCH_SYMBOLS_CAP", "10"), 10) || 10
      ),
      marketConditionSymbols: getEnvOptional("MARKET_CONDITION_SYMBOLS", "SPY,QQQ")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    },
  };
}

export type SafeConfig = Pick<Config, "trading">;

export function getSafeConfig(config: Config): SafeConfig {
  return {
    trading: config.trading,
  };
}
