import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ExternalLink, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import type { MarketWithDetails, PolymarketLink } from "@shared/schema";

interface ImportedMarket extends MarketWithDetails {
  polymarketLink?: PolymarketLink;
}

export default function MkParlay() {
  const { data: markets, isLoading, error } = useQuery<ImportedMarket[]>({
    queryKey: ["/api/polymarket-markets"],
  });

  const formatOdds = (price: number) => {
    return `${Math.round(price * 100)}%`;
  };

  const getYesOutcome = (market: ImportedMarket) => {
    return market.outcomes?.find(o => o.label.toUpperCase() === "YES");
  };

  const getNoOutcome = (market: ImportedMarket) => {
    return market.outcomes?.find(o => o.label.toUpperCase() === "NO");
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
            <Trophy className="h-5 w-5 text-primary" />
            <span className="font-medium text-primary">Sports Markets</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl" data-testid="text-page-title">
            MK Parlay
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Bet on sports prediction markets with MK Markets play money. Odds update based on trading activity.
          </p>
          <Badge variant="secondary" className="mt-4" data-testid="badge-powered-by">
            Powered by Polymarket
          </Badge>
        </div>

        {isLoading && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i} data-testid={`skeleton-card-${i}`}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                  <div className="flex gap-2 mt-4">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <Card className="text-center" data-testid="error-state">
            <CardContent className="pt-6">
              <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Failed to load markets</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Unable to fetch sports markets. Please try again later.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && markets?.length === 0 && (
          <Card className="text-center" data-testid="empty-state">
            <CardContent className="pt-6">
              <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No sports markets available</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                There are currently no imported sports prediction markets. Check back later!
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && markets && markets.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {markets.map((market) => {
              const yesOutcome = getYesOutcome(market);
              const noOutcome = getNoOutcome(market);
              const yesPrice = yesOutcome?.currentPrice ?? 0.5;
              const noPrice = noOutcome?.currentPrice ?? 0.5;

              return (
                <Card key={market.id} className="overflow-hidden hover-elevate" data-testid={`card-market-${market.id}`}>
                  {market.polymarketLink?.polymarketImage && (
                    <div className="aspect-video w-full overflow-hidden">
                      <img
                        src={market.polymarketLink.polymarketImage}
                        alt={market.title}
                        className="h-full w-full object-cover"
                        data-testid={`img-market-${market.id}`}
                      />
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-2" data-testid={`title-market-${market.id}`}>
                        {market.title}
                      </CardTitle>
                      <Badge variant="outline" className="shrink-0">
                        {market.category}
                      </Badge>
                    </div>
                    {market.description && (
                      <CardDescription className="line-clamp-2" data-testid={`desc-market-${market.id}`}>
                        {market.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg border p-3 mb-4" data-testid={`odds-section-${market.id}`}>
                      <p className="text-sm font-medium mb-2">Current Odds</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className="gap-1"
                          data-testid={`odds-yes-${market.id}`}
                        >
                          <TrendingUp className="h-3 w-3 text-green-500" />
                          YES: {formatOdds(yesPrice)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="gap-1"
                          data-testid={`odds-no-${market.id}`}
                        >
                          <TrendingDown className="h-3 w-3 text-red-500" />
                          NO: {formatOdds(noPrice)}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link href={`/markets/${market.id}`}>
                        <Button size="sm" data-testid={`button-trade-${market.id}`}>
                          Trade Now
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                      </Link>
                      
                      {market.polymarketLink && (
                        <a
                          href={`https://polymarket.com/event/${market.polymarketLink.polymarketSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`link-source-${market.id}`}
                        >
                          <Button variant="outline" size="sm">
                            View Source
                            <ExternalLink className="ml-1 h-3 w-3" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Trade with MK Markets play money. Odds are calculated based on platform trading activity.
          </p>
        </div>
      </div>
    </div>
  );
}
