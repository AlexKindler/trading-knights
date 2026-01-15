import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  History,
  BarChart3,
  PiggyBank,
} from "lucide-react";
import type { PortfolioSummary, PositionWithDetails, Trade } from "@shared/schema";

export default function Portfolio() {
  const { user } = useAuth();

  const { data: portfolio, isLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio"],
    enabled: !!user,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(date));
  };

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md text-center">
          <CardContent className="pt-6">
            <Wallet className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Sign in to view your portfolio</h2>
            <p className="mt-2 text-muted-foreground">
              Track your positions, trades, and performance
            </p>
            <Link href="/login">
              <Button className="mt-4">Log In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="h-10 w-48" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="mt-8 h-64" />
        </div>
      </div>
    );
  }

  const pnlPercent = portfolio
    ? ((portfolio.totalPnL / 1000) * 100).toFixed(1)
    : "0";
  const isPositivePnL = (portfolio?.totalPnL ?? 0) > 0;
  const isNegativePnL = (portfolio?.totalPnL ?? 0) < 0;

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold">
              <Wallet className="h-8 w-8 text-primary" />
              Portfolio
            </h1>
            <p className="mt-1 text-muted-foreground">
              Track your positions and trading history
            </p>
          </div>
          {user.status !== "VERIFIED" && (
            <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
              Verify email to trade
            </Badge>
          )}
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <PiggyBank className="h-5 w-5" />
                  <span className="text-sm font-medium">Total Value</span>
                </div>
              </div>
              <p className="mt-2 font-mono text-3xl font-bold">
                {formatCurrency(portfolio?.totalValue ?? user.balance)}
              </p>
              <div
                className={`mt-1 flex items-center gap-1 text-sm ${
                  isPositivePnL
                    ? "text-green-600 dark:text-green-400"
                    : isNegativePnL
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                }`}
              >
                {isPositivePnL ? (
                  <TrendingUp className="h-4 w-4" />
                ) : isNegativePnL ? (
                  <TrendingDown className="h-4 w-4" />
                ) : (
                  <Minus className="h-4 w-4" />
                )}
                <span>
                  {isPositivePnL ? "+" : ""}
                  {formatCurrency(portfolio?.totalPnL ?? 0)} ({pnlPercent}%)
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Wallet className="h-5 w-5" />
                <span className="text-sm font-medium">Cash Balance</span>
              </div>
              <p className="mt-2 font-mono text-3xl font-bold">
                {formatCurrency(portfolio?.cashBalance ?? user.balance)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Available to trade</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground">
                <BarChart3 className="h-5 w-5" />
                <span className="text-sm font-medium">Positions Value</span>
              </div>
              <p className="mt-2 font-mono text-3xl font-bold">
                {formatCurrency(portfolio?.positionsValue ?? 0)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {portfolio?.positions.length ?? 0} active positions
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="positions">
          <TabsList>
            <TabsTrigger value="positions" className="gap-2" data-testid="tab-positions">
              <BarChart3 className="h-4 w-4" />
              Positions
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2" data-testid="tab-history">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="positions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Open Positions</CardTitle>
              </CardHeader>
              <CardContent>
                {!portfolio?.positions.length ? (
                  <div className="py-8 text-center">
                    <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">No open positions</p>
                    <Link href="/markets">
                      <Button className="mt-4" variant="outline">
                        Explore Markets
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {portfolio.positions.map((position) => (
                      <Link
                        key={position.id}
                        href={
                          position.outcome
                            ? `/markets/${position.marketId}`
                            : `/stocks/${position.marketId}`
                        }
                      >
                        <div
                          className="flex items-center justify-between rounded-lg border p-4 transition-colors hover-elevate cursor-pointer"
                          data-testid={`row-position-${position.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {position.stockMeta?.ticker ?? position.market?.title}
                              </span>
                              {position.outcome && (
                                <Badge variant="secondary">{position.outcome.label}</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {position.qty} shares @ {formatCurrency(position.avgCost)} avg
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-semibold">
                              {formatCurrency(position.currentValue)}
                            </p>
                            <div
                              className={`flex items-center justify-end gap-1 text-sm ${
                                position.pnl > 0
                                  ? "text-green-600 dark:text-green-400"
                                  : position.pnl < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {position.pnl > 0 ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : position.pnl < 0 ? (
                                <ArrowDownRight className="h-3 w-3" />
                              ) : (
                                <Minus className="h-3 w-3" />
                              )}
                              <span>
                                {position.pnl > 0 ? "+" : ""}
                                {formatCurrency(position.pnl)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Trades</CardTitle>
              </CardHeader>
              <CardContent>
                {!portfolio?.recentTrades.length ? (
                  <div className="py-8 text-center">
                    <History className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">No trading history yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {portfolio.recentTrades.map((trade) => (
                      <div
                        key={trade.id}
                        className="flex items-center justify-between rounded-lg border p-4"
                        data-testid={`row-trade-${trade.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full ${
                              trade.side === "BUY"
                                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                : "bg-red-500/10 text-red-600 dark:text-red-400"
                            }`}
                          >
                            {trade.side === "BUY" ? (
                              <ArrowUpRight className="h-4 w-4" />
                            ) : (
                              <ArrowDownRight className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant={trade.side === "BUY" ? "default" : "secondary"}>
                                {trade.side}
                              </Badge>
                              <span className="font-medium">{trade.qty} shares</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              @ {formatCurrency(trade.price)} per share
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold">
                            {trade.side === "BUY" ? "-" : "+"}
                            {formatCurrency(trade.total)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(trade.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
