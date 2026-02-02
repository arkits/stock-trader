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

export default function Overview() {
  const account = trpc.account.get.useQuery();
  const positions = trpc.positions.getAll.useQuery();
  const orders = trpc.orders.getOpen.useQuery();

  if (account.isLoading || account.isError) {
    return (
      <div>
        {account.isError && (
          <p className="text-destructive">{String(account.error?.message)}</p>
        )}
        {account.isLoading && <p className="text-muted-foreground">Loading account...</p>}
      </div>
    );
  }

  const acc = account.data;
  if (!acc) return <p className="text-muted-foreground">Loading account...</p>;

  const fmt = (n: string) =>
    Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Equity, buying power, and cash</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Equity</span>
              <span>${fmt(acc.equity)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Buying power</span>
              <span>${fmt(acc.buyingPower)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cash</span>
              <span>${fmt(acc.cash)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trading blocked</span>
              <span>{acc.tradingBlocked ? "Yes" : "No"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

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
            <p className="text-destructive">{String(positions.error?.message)}</p>
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
                    <TableCell>{p.qty}</TableCell>
                    <TableCell>${Number(p.marketValue).toFixed(2)}</TableCell>
                    <TableCell>${Number(p.costBasis).toFixed(2)}</TableCell>
                    <TableCell>${Number(p.unrealizedPl).toFixed(2)}</TableCell>
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
            <p className="text-destructive">{String(orders.error?.message)}</p>
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
                    <TableCell>{o.qty}</TableCell>
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
    </div>
  );
}
