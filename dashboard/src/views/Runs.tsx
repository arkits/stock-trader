import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "../trpc";

export default function Runs() {
  const lastRun = trpc.bot.getLastRun.useQuery();
  const history = trpc.bot.getRunHistory.useQuery(20);
  const runNow = trpc.bot.runNow.useMutation({
    onSuccess: () => {
      lastRun.refetch();
      history.refetch();
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
        <Button
          onClick={() => runNow.mutate()}
          disabled={runNow.isPending}
        >
          {runNow.isPending ? "Running…" : "Run now"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last run</CardTitle>
          <CardDescription>Most recent bot cycle</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastRun.isLoading && (
            <p className="text-muted-foreground">Loading...</p>
          )}
          {lastRun.isError && (
            <p className="text-destructive">{String(lastRun.error?.message)}</p>
          )}
          {lastRun.data && (
            <>
              <p className="text-sm text-muted-foreground">
                {new Date(lastRun.data.createdAt).toLocaleString()}
              </p>
              <div>
                <p className="text-sm font-medium mb-1">Reasoning</p>
                <pre className="rounded-md border border-border bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                  {lastRun.data.reasoning || "(none)"}
                </pre>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Actions</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {lastRun.data.actions.map((a, i) => (
                    <li key={i}>
                      {a.action} {a.symbol} — {a.reason}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Orders placed</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {lastRun.data.ordersPlaced.map((o, i) => (
                    <li key={i}>
                      {o.symbol} {o.side}{" "}
                      {o.orderId ? `Order ID: ${o.orderId}` : o.error}
                    </li>
                  ))}
                </ul>
              </div>
              {lastRun.data.errors.length > 0 && (
                <p className="text-sm text-destructive">
                  Errors: {lastRun.data.errors.join(", ")}
                </p>
              )}
            </>
          )}
          {!lastRun.data && !lastRun.isLoading && !lastRun.isError && (
            <p className="text-muted-foreground">No runs yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>Recent bot cycles</CardDescription>
        </CardHeader>
        <CardContent>
          {history.isLoading && (
            <p className="text-muted-foreground">Loading...</p>
          )}
          {history.isError && (
            <p className="text-destructive">{String(history.error?.message)}</p>
          )}
          {history.data && history.data.length > 0 && (
            <ul className="space-y-2 text-sm">
              {history.data.map((r) => (
                <li
                  key={r.id}
                  className="flex justify-between py-2 border-b border-border last:border-0"
                >
                  <span>{new Date(r.createdAt).toLocaleString()}</span>
                  <span className="text-muted-foreground">
                    {r.actions.length} action(s), {r.ordersPlaced.length} order(s)
                  </span>
                </li>
              ))}
            </ul>
          )}
          {history.data?.length === 0 && !history.isLoading && (
            <p className="text-muted-foreground">No run history.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
