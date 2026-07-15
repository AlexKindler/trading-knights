import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarketCard } from "@/components/MarketCard";
import { StockCard } from "@/components/StockCard";
import { StockTicker } from "@/components/StockTicker";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import {
  TrendingUp,
  BarChart3,
  Trophy,
  ArrowRight,
  Shield,
  Coins,
  Users,
  Sparkles,
  Zap,
  Brain,
} from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

export default function Home() {
  const { user } = useAuth();

  const {
    data: markets,
    isLoading: marketsLoading,
    isError: marketsError,
    refetch: refetchMarkets,
  } = useQuery<MarketWithDetails[]>({
    queryKey: ["/api/markets"],
  });

  const {
    data: stocks,
    isLoading: stocksLoading,
    isError: stocksError,
    refetch: refetchStocks,
  } = useQuery<MarketWithDetails[]>({
    queryKey: ["/api/stocks"],
  });

  const predictionMarkets = markets?.slice(0, 3) ?? [];
  const stockListings = stocks?.slice(0, 4) ?? [];

  return (
    <div className="min-h-screen">
      <StockTicker />
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/10 via-primary/5 to-background px-4 py-20">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <Badge variant="secondary" className="mb-4 gap-1 px-3 py-1">
            <Sparkles className="h-3 w-3" />
            Menlo School Edition
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
            Trading Knights
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
            The ultimate prediction market for Menlo School. Trade club stocks, bet on school events,
            and compete on the leaderboard — all with play money.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            {!user ? (
              <>
                <Link href="/register">
                  <Button size="lg" className="gap-2 shadow-lg shadow-primary/20" data-testid="button-get-started">
                    Get Started Free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/markets">
                  <Button variant="outline" size="lg" className="gap-2" data-testid="button-explore">
                    <Zap className="h-4 w-4" />
                    Explore Markets
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/trading">
                  <Button size="lg" className="gap-2 shadow-lg shadow-primary/20" data-testid="button-trade-now">
                    <TrendingUp className="h-4 w-4" />
                    Start Trading
                  </Button>
                </Link>
                <Link href="/mk-ai">
                  <Button variant="outline" size="lg" className="gap-2" data-testid="button-mk-ai">
                    <Brain className="h-4 w-4" />
                    Try MK AI
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="px-4 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Coins className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">$1,000</p>
                  <p className="text-sm text-muted-foreground">Starting Balance</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
                  <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">School Only</p>
                  <p className="text-sm text-muted-foreground">@menloschool.org</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10">
                  <Shield className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">Play Money</p>
                  <p className="text-sm text-muted-foreground">No real gambling</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="px-4 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-semibold">Prediction Markets</h2>
            </div>
            <Link href="/markets">
              <Button variant="ghost" className="gap-2" data-testid="link-view-all-markets">
                View All
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {marketsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="p-4">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="mt-3 h-6 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-full" />
                  <div className="mt-4 flex gap-4">
                    <Skeleton className="h-10 w-16" />
                    <Skeleton className="h-10 w-16" />
                  </div>
                </Card>
              ))}
            </div>
          ) : marketsError ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">Couldn't load prediction markets.</p>
                <Button className="mt-3" size="sm" onClick={() => refetchMarkets()} data-testid="button-retry-markets">
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : predictionMarkets.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {predictionMarkets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No prediction markets yet. Check back soon!
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section className="px-4 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-semibold">Stock Market</h2>
            </div>
            <Link href="/stocks">
              <Button variant="ghost" className="gap-2" data-testid="link-view-all-stocks">
                View All
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {stocksLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-4">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="mt-2 h-4 w-32" />
                  <Skeleton className="mt-4 h-8 w-full" />
                </Card>
              ))}
            </div>
          ) : stocksError ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">Couldn't load stocks.</p>
                <Button className="mt-3" size="sm" onClick={() => refetchStocks()} data-testid="button-retry-stocks">
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : stockListings.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {stockListings.map((market) => (
                <StockCard key={market.id} market={market} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No stocks listed yet. Check back soon!
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section className="px-4 py-8">
        <div className="mx-auto max-w-7xl">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col items-center gap-4 py-8 text-center md:flex-row md:text-left">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Trophy className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold">Compete on the Leaderboard</h3>
                <p className="text-muted-foreground">
                  Trade smart, climb the ranks, and see how you compare to other Menlo students!
                </p>
              </div>
              <Link href="/leaderboard">
                <Button className="gap-2" data-testid="link-leaderboard-cta">
                  View Leaderboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
