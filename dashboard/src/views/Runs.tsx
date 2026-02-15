import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useState } from "react";
import { trpc } from "../trpc";

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString();

type ResearchData = {
  ranked?: Array<{
    symbol: string;
    score: number;
    confidence: number;
    horizon: string;
    thesis: string;
    drivers: string[];
    risks: string[];
    nextSteps: string[];
    scorecard?: {
      factors: Array<{
        name: string;
        score: number;
        confidence: number;
        evidence: string[];
        sources: string[];
      }>;
      checklist: Array<{
        factor: string;
        status: string;
        note?: string;
      }>;
      redFlags: string[];
    };
  }>;
  nextSteps?: string[];
};

type AdversarialData = {
  reviews?: Array<{
    symbol: string;
    counterpoints: string[];
    verdict: string;
    confidence: number;
    shouldDrop: boolean;
    sources: string[];
  }>;
  overallRisks?: string[];
};

type AnalysisData = {
  regime?: string;
  candidates?: Array<{
    symbol: string;
    score: number;
    confidence: number;
    checklist?: Array<{
      factor: string;
      status: string;
      note?: string;
    }>;
    redFlags?: string[];
    drivers?: string[];
    risks?: string[];
    nextSteps?: string[];
  }>;
  excluded?: Array<{
    symbol: string;
    reasons: string[];
  }>;
  nextSteps?: string[];
};

type RunData = {
  id: number;
  createdAt: string;
  reasoning: string;
  actions: Array<{ action: string; symbol: string; reason?: string }>;
  ordersPlaced: Array<{ symbol: string; side: string; orderId?: string; error?: string }>;
  errors: string[];
};

function ResearchDetails({ data }: { data: { research?: unknown; adversarial?: unknown; analysis?: unknown } | null | undefined }) {
  if (!data) {
    return <p className="text-sm text-muted-foreground">No research data available.</p>;
  }

  const researchData = data.research as ResearchData | null;
  const adversarial = data.adversarial as AdversarialData | null;
  const analysis = data.analysis as AnalysisData | null;

  return (
    <div className="space-y-4">
      {researchData?.ranked && researchData.ranked.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Ranked Candidates</p>
          <div className="space-y-3">
            {researchData.ranked.map((candidate, i) => (
              <div
                key={i}
                className="rounded-md border border-border/60 bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{candidate.symbol}</span>
                  <span className="text-sm text-muted-foreground">
                    Score: {candidate.score.toFixed(2)} | Conf:{" "}
                    {(candidate.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {candidate.thesis}
                </p>
                {candidate.drivers.length > 0 && (
                  <div className="mb-1">
                    <p className="text-xs font-medium text-green-600 dark:text-green-400">
                      Drivers:
                    </p>
                    <ul className="list-disc list-inside text-xs text-muted-foreground">
                      {candidate.drivers.map((d, j) => (
                        <li key={j}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {candidate.risks.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      Risks:
                    </p>
                    <ul className="list-disc list-inside text-xs text-muted-foreground">
                      {candidate.risks.map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {adversarial?.reviews && adversarial.reviews.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Adversarial Review</p>
          <div className="space-y-2">
            {adversarial.reviews.map((review, i) => (
              <div
                key={i}
                className="rounded-md border border-border/60 bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{review.symbol}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      review.verdict === "accept"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : review.verdict === "reject"
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    }`}
                  >
                    {review.verdict}
                  </span>
                </div>
                {review.counterpoints.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-muted-foreground">
                    {review.counterpoints.map((c, j) => (
                      <li key={j}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          {adversarial.overallRisks && adversarial.overallRisks.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                Overall Risks:
              </p>
              <ul className="list-disc list-inside text-xs text-muted-foreground">
                {adversarial.overallRisks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {analysis?.candidates && analysis.candidates.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">
            Final Analysis
            {analysis.regime && (
              <span className="ml-2 text-xs text-muted-foreground">
                (Regime: {analysis.regime})
              </span>
            )}
          </p>
          <div className="space-y-2">
            {analysis.candidates.map((candidate, i) => (
              <div
                key={i}
                className="rounded-md border border-border/60 bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{candidate.symbol}</span>
                  <span className="text-sm text-muted-foreground">
                    Score: {candidate.score.toFixed(2)} | Conf:{" "}
                    {(candidate.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {candidate.checklist && candidate.checklist.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {candidate.checklist.map((item, j) => (
                      <span
                        key={j}
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          item.status === "pass"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : item.status === "fail"
                              ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {item.factor}
                      </span>
                    ))}
                  </div>
                )}
                {candidate.redFlags && candidate.redFlags.length > 0 && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Red flags: {candidate.redFlags.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
          {analysis.excluded && analysis.excluded.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-muted-foreground">
                Excluded: {analysis.excluded.map((e) => e.symbol).join(", ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunDetails({ run }: { run: RunData }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {formatTimestamp(run.createdAt)}
      </p>
      <div>
        <p className="text-sm font-medium mb-1">Reasoning</p>
        <pre className="rounded-md border border-border bg-muted/50 p-4 text-sm whitespace-pre-wrap">
          {run.reasoning || "(none)"}
        </pre>
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Actions</p>
        {run.actions.length > 0 ? (
          <ul className="list-disc list-inside space-y-1 text-sm">
            {run.actions.map((action, i) => (
              <li key={i}>
                {action.action} {action.symbol} —{" "}
                {action.reason || "No reason provided"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">(none)</p>
        )}
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Orders placed</p>
        {run.ordersPlaced.length > 0 ? (
          <ul className="list-disc list-inside space-y-1 text-sm">
            {run.ordersPlaced.map((order, i) => (
              <li key={i}>
                {order.symbol} {order.side}{" "}
                {order.orderId ? `Order ID: ${order.orderId}` : order.error}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">(none)</p>
        )}
      </div>
      {run.errors.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1 text-destructive">Errors</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-destructive">
            {run.errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default function Runs() {
  const lastRun = trpc.bot.getLastRun.useQuery();
  const history = trpc.bot.getRunHistory.useQuery(20);
  const runNow = trpc.bot.runNow.useMutation({
    onSuccess: () => {
      lastRun.refetch();
      history.refetch();
    },
  });
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const expandedResearch = trpc.bot.getResearchRun.useQuery(expandedRunId ?? 0, {
    enabled: expandedRunId !== null,
  });
  const lastRunResearch = trpc.bot.getResearchRun.useQuery(lastRun.data?.id ?? 0, {
    enabled: !!lastRun.data?.id,
  });

  const isLoading = lastRun.isLoading || history.isLoading;
  const isError = lastRun.isError || history.isError;

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
          {isLoading && <p className="text-muted-foreground">Loading...</p>}
          {isError && (
            <p className="text-destructive">{String(lastRun.error?.message ?? history.error?.message)}</p>
          )}
          {lastRun.data ? (
            <div className="space-y-4">
              <RunDetails run={lastRun.data} />
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium mb-2">Research Details</p>
                {lastRunResearch.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading research...</p>
                ) : lastRunResearch.isError ? (
                  <p className="text-sm text-destructive">{String(lastRunResearch.error?.message)}</p>
                ) : (
                  <ResearchDetails data={lastRunResearch.data} />
                )}
              </div>
            </div>
          ) : !isLoading && !isError ? (
            <p className="text-muted-foreground">No runs yet.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>Recent bot cycles</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-muted-foreground">Loading...</p>}
          {isError && (
            <p className="text-destructive">{String(history.error?.message)}</p>
          )}
          {history.data && history.data.length > 0 ? (
            <ul className="space-y-3 text-sm">
              {history.data.map((r) => {
                const isExpanded = expandedRunId === r.id;
                return (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border/60 bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-4 px-3 py-3">
                      <div className="space-y-1">
                        <p className="font-medium">{formatTimestamp(r.createdAt)}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.actions.length} {r.actions.length === 1 ? "action" : "actions"},{" "}
                          {r.ordersPlaced.length} {r.ordersPlaced.length === 1 ? "order" : "orders"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedRunId(isExpanded ? null : r.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? "Hide details" : "View details"}
                      </Button>
                    </div>
                    <div
                      className={`border-t border-border/60 px-3 pt-3 space-y-4 overflow-hidden transition-all duration-200 ${
                        isExpanded ? "pb-4 max-h-[2000px] opacity-100" : "pb-0 max-h-0 opacity-0"
                      }`}
                    >
                      <RunDetails run={r} />
                      <div className="border-t border-border/60 pt-4">
                        <p className="text-sm font-medium mb-2">Research Details</p>
                        {isExpanded && expandedResearch.isLoading ? (
                          <p className="text-sm text-muted-foreground">Loading research...</p>
                        ) : isExpanded && expandedResearch.isError ? (
                          <p className="text-sm text-destructive">{String(expandedResearch.error?.message)}</p>
                        ) : (
                          <ResearchDetails data={expandedResearch.data} />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : !isLoading && !isError ? (
            <p className="text-muted-foreground">No run history.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
