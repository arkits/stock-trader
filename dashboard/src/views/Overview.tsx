import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "../trpc";

function formatCurrency(n: string | number): string {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Overview() {
  const account = trpc.account.get.useQuery();
  const portfolioHistory = trpc.account.getPortfolioHistory.useQuery({
    period: "1M",
    timeframe: "1D",
  });
  const positions = trpc.positions.getAll.useQuery();
  const orders = trpc.orders.getOpen.useQuery();

  if (account.isLoading || account.isError) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        {account.isError && (
          <p className="text-destructive">{String(account.error?.message)}</p>
        )}
        {account.isLoading && (
          <p className="text-muted-foreground">Loading account...</p>
        )}
      </div>
    );
  }

  const acc = account.data;
  if (!acc) return <p className="text-muted-foreground">Loading account...</p>;

  const fmt = formatCurrency;
  const equityNum = Number(acc.equity);

  // Daily change: compare current equity to previous close (last point in 1D history)
  const history = portfolioHistory.data ?? [];
  const previousClose =
    history.length >= 1 ? Number(history[history.length - 1].equity) : null;
  let dailyChange: number | null = null;
  let dailyChangePct: number | null = null;
  if (previousClose != null && previousClose > 0) {
    dailyChange = equityNum - previousClose;
    dailyChangePct = (dailyChange / previousClose) * 100;
  }

  // Chart data: use history if available, otherwise single point with current equity
  const chartData =
    history.length > 0
      ? history.map((s) => ({
          date: s.createdAt,
          equity: Number(s.equity),
          label: formatShortDate(s.createdAt),
        }))
      : [
          {
            date: new Date().toISOString(),
            equity: equityNum,
            label: "Now",
          },
        ];

  const minEquity = Math.min(...chartData.map((d) => d.equity));
  const maxEquity = Math.max(...chartData.map((d) => d.equity));
  const padding = (maxEquity - minEquity) * 0.1 || equityNum * 0.05;
  const domainMin = Math.max(0, minEquity - padding);
  const domainMax = maxEquity + padding;

  return (
    <div className="space-y-10">
      {/* Hero: current equity + chart */}
      <section className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Portfolio
          </h1>
          <p className="text-muted-foreground mt-0.5">
            Total account value over time
          </p>
        </div>

        <Card className="overflow-hidden border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <CardDescription className="text-xs uppercase tracking-wider">
                  Total equity
                </CardDescription>
                <p className="font-mono-numeric mt-1 text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">
                  ${fmt(acc.equity)}
                </p>
                {dailyChange != null && dailyChangePct != null && (
                  <p
                    className={`font-mono-numeric mt-1 text-sm tabular-nums ${
                      dailyChange >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive"
                    }`}
                  >
                    {dailyChange >= 0 ? "+" : ""}${fmt(dailyChange)} (
                    {dailyChangePct >= 0 ? "+" : ""}
                    {dailyChangePct.toFixed(2)}%) today
                  </p>
                )}
              </div>
              {history.length === 0 && !portfolioHistory.isLoading && (
                <p className="text-sm text-muted-foreground">
                  No portfolio history from Alpaca yet
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                >
                  <defs>
                    <linearGradient
                      id="equityGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--primary)"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--primary)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    dy={8}
                  />
                  <YAxis
                    domain={[domainMin, domainMax]}
                    tickFormatter={(v) => `$${formatCurrency(v)}`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    width={72}
                    tickMargin={8}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                    formatter={(value: number | undefined) => [`$${formatCurrency(value ?? 0)}`, "Equity"]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.date
                        ? formatShortDate(payload[0].payload.date)
                        : ""
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#equityGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Account details */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Equity, buying power, and cash</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Equity
                </p>
                <p className="font-mono-numeric mt-1 text-lg font-semibold tabular-nums">
                  ${fmt(acc.equity)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Buying power
                </p>
                <p className="font-mono-numeric mt-1 text-lg font-semibold tabular-nums">
                  ${fmt(acc.buyingPower)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Cash
                </p>
                <p className="font-mono-numeric mt-1 text-lg font-semibold tabular-nums">
                  ${fmt(acc.cash)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Trading
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {acc.tradingBlocked ? (
                    <span className="text-destructive">Blocked</span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Active
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Positions */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Positions</CardTitle>
            <CardDescription>Current holdings</CardDescription>
          </CardHeader>
          <CardContent>
            {positions.isLoading && (
              <p className="text-muted-foreground">Loading positions...</p>
            )}
            {positions.isError && (
              <p className="text-destructive">
                {String(positions.error?.message)}
              </p>
            )}
            {positions.data && positions.data.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Market value</TableHead>
                    <TableHead>Cost basis</TableHead>
                    <TableHead>Unrealized P&amp;L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.data.map((p) => (
                    <TableRow key={p.symbol}>
                      <TableCell className="font-medium">{p.symbol}</TableCell>
                      <TableCell className="font-mono-numeric tabular-nums">
                        {p.qty}
                      </TableCell>
                      <TableCell className="font-mono-numeric tabular-nums">
                        ${Number(p.marketValue).toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono-numeric tabular-nums">
                        ${Number(p.costBasis).toFixed(2)}
                      </TableCell>
                      <TableCell
                        className={`font-mono-numeric tabular-nums ${
                          Number(p.unrealizedPl) >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive"
                        }`}
                      >
                        ${Number(p.unrealizedPl).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {positions.data?.length === 0 && !positions.isLoading && (
              <p className="text-muted-foreground">No positions.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Open orders */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Open orders</CardTitle>
            <CardDescription>Pending orders</CardDescription>
          </CardHeader>
          <CardContent>
            {orders.isLoading && (
              <p className="text-muted-foreground">Loading orders...</p>
            )}
            {orders.isError && (
              <p className="text-destructive">
                {String(orders.error?.message)}
              </p>
            )}
            {orders.data && orders.data.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.data.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.symbol}</TableCell>
                      <TableCell>{o.side}</TableCell>
                      <TableCell className="font-mono-numeric tabular-nums">
                        {o.qty}
                      </TableCell>
                      <TableCell>{o.type}</TableCell>
                      <TableCell>{o.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {orders.data?.length === 0 && !orders.isLoading && (
              <p className="text-muted-foreground">No open orders.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
