import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";

interface PolymarketMarket {
  id: string;
  conditionId: string;
  slug: string;
  title: string;
  description?: string;
  image?: string;
  markets?: Array<{
    id: string;
    question: string;
    outcomePrices?: string;
    outcomes?: string;
  }>;
}

export default function MkParlay() {
  const { data: sportsEvents, isLoading, error } = useQuery<PolymarketMarket[]>({
    queryKey: ["/api/polymarket/sports"],
  });

  const formatOdds = (price: number) => {
    return `${Math.round(price * 100)}%`;
  };

  const parseOutcomePrices = (pricesStr?: string): number[] => {
    if (!pricesStr) return [];
    try {
      return JSON.parse(pricesStr);
    } catch {
      return [];
    }
  };

  const parseOutcomes = (outcomesStr?: string): string[] => {
    if (!outcomesStr) return ["Yes", "No"];
    try {
      return JSON.parse(outcomesStr);
    } catch {
      return ["Yes", "No"];
    }
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
            View live sports prediction markets powered by Polymarket. Track odds and see what the crowd thinks.
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
                Unable to fetch sports markets from Polymarket. Please try again later.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && sportsEvents?.length === 0 && (
          <Card className="text-center" data-testid="empty-state">
            <CardContent className="pt-6">
              <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No sports markets found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                There are currently no open sports prediction markets. Check back later!
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && sportsEvents && sportsEvents.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sportsEvents.map((event) => (
              <Card key={event.id} className="overflow-hidden" data-testid={`card-market-${event.id}`}>
                {event.image && (
                  <div className="aspect-video w-full overflow-hidden">
                    <img
                      src={event.image}
                      alt={event.title}
                      className="h-full w-full object-cover"
                      data-testid={`img-market-${event.id}`}
                    />
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg line-clamp-2" data-testid={`title-market-${event.id}`}>
                    {event.title}
                  </CardTitle>
                  {event.description && (
                    <CardDescription className="line-clamp-2" data-testid={`desc-market-${event.id}`}>
                      {event.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {event.markets && event.markets.length > 0 && (
                    <div className="space-y-3">
                      {event.markets.slice(0, 3).map((market) => {
                        const prices = parseOutcomePrices(market.outcomePrices);
                        const outcomes = parseOutcomes(market.outcomes);
                        const yesPrice = prices[0] ?? 0.5;
                        const noPrice = prices[1] ?? 0.5;

                        return (
                          <div key={market.id} className="rounded-lg border p-3" data-testid={`submarket-${market.id}`}>
                            <p className="text-sm font-medium mb-2 line-clamp-1">{market.question}</p>
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className="gap-1"
                                data-testid={`odds-yes-${market.id}`}
                              >
                                <TrendingUp className="h-3 w-3 text-green-500" />
                                {outcomes[0] || "Yes"}: {formatOdds(yesPrice)}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="gap-1"
                                data-testid={`odds-no-${market.id}`}
                              >
                                <TrendingDown className="h-3 w-3 text-red-500" />
                                {outcomes[1] || "No"}: {formatOdds(noPrice)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  <a
                    href={`https://polymarket.com/event/${event.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    data-testid={`link-polymarket-${event.id}`}
                  >
                    View on Polymarket
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Note: This page displays read-only odds from Polymarket. Trading is not available on MK Markets.
          </p>
        </div>
      </div>
    </div>
  );
}
