import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ExternalLink, TrendingUp, TrendingDown, Loader2, DollarSign } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  endDate: string;
  volume: number;
  liquidity: number;
  markets: {
    id: string;
    question: string;
    outcomePrices?: string;
    outcomes?: string;
  }[];
}

export default function MkParlay() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loadingEventId, setLoadingEventId] = useState<string | null>(null);

  const { data: events, isLoading, error } = useQuery<PolymarketEvent[]>({
    queryKey: ["/api/polymarket/sports"],
  });

  const betOnMutation = useMutation({
    mutationFn: async (event: PolymarketEvent) => {
      const res = await apiRequest("POST", "/api/polymarket/bet-on", {
        eventId: event.id,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setLoadingEventId(null);
      setLocation(`/markets/${data.marketId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to open betting",
        description: error.message,
        variant: "destructive",
      });
      setLoadingEventId(null);
    },
  });

  const handleBetNow = (event: PolymarketEvent) => {
    if (!user) {
      toast({
        title: "Login required",
        description: "Please log in to place bets",
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }
    setLoadingEventId(event.id);
    betOnMutation.mutate(event);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `$${(volume / 1000).toFixed(0)}K`;
    return `$${volume.toFixed(0)}`;
  };

  const getOdds = (market: PolymarketEvent["markets"][0]) => {
    try {
      if (market.outcomePrices) {
        const prices = JSON.parse(market.outcomePrices);
        return {
          yes: parseFloat(prices[0]) || 0.5,
          no: parseFloat(prices[1]) || 0.5,
        };
      }
    } catch {
      // Fall back to default
    }
    return { yes: 0.5, no: 0.5 };
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
            <Trophy className="h-5 w-5 text-primary" />
            <span className="font-medium text-primary">Sports Betting</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl" data-testid="text-page-title">
            MK Parlay
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Bet on real sports prediction markets with Trading Knights play money.
            Odds are live from Polymarket - trade with your TK balance!
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Badge variant="secondary" data-testid="badge-powered-by">
              Live from Polymarket
            </Badge>
            {user && (
              <Badge variant="outline" className="gap-1">
                <DollarSign className="h-3 w-3" />
                Balance: ${user.balance.toLocaleString()}
              </Badge>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i} data-testid={`skeleton-card-${i}`}>
                <CardHeader>
                  <Skeleton className="h-32 w-full mb-2" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent>
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

        {!isLoading && !error && events?.length === 0 && (
          <Card className="text-center" data-testid="empty-state">
            <CardContent className="pt-6">
              <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No sports markets available</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                There are currently no active sports prediction markets on Polymarket. Check back later!
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && events && events.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => {
              const mainMarket = event.markets[0];
              const odds = mainMarket ? getOdds(mainMarket) : { yes: 0.5, no: 0.5 };
              const isLoadingThis = loadingEventId === event.id;

              return (
                <Card key={event.id} className="overflow-hidden hover-elevate" data-testid={`card-event-${event.id}`}>
                  {event.image && (
                    <div className="aspect-video w-full overflow-hidden bg-muted">
                      <img
                        src={event.image}
                        alt={event.title}
                        className="h-full w-full object-cover"
                        data-testid={`img-event-${event.id}`}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-2" data-testid={`title-event-${event.id}`}>
                        {event.title}
                      </CardTitle>
                    </div>
                    {event.description && (
                      <CardDescription className="line-clamp-2" data-testid={`desc-event-${event.id}`}>
                        {event.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg border p-3 mb-4" data-testid={`odds-section-${event.id}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Live Odds</p>
                        <Badge variant="outline" className="text-xs">
                          Vol: {formatVolume(event.volume)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          className="gap-1 bg-green-500/10 text-green-600 hover:bg-green-500/20"
                          data-testid={`odds-yes-${event.id}`}
                        >
                          <TrendingUp className="h-3 w-3" />
                          YES: {Math.round(odds.yes * 100)}%
                        </Badge>
                        <Badge
                          className="gap-1 bg-red-500/10 text-red-600 hover:bg-red-500/20"
                          data-testid={`odds-no-${event.id}`}
                        >
                          <TrendingDown className="h-3 w-3" />
                          NO: {Math.round(odds.no * 100)}%
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => handleBetNow(event)}
                        disabled={isLoadingThis}
                        data-testid={`button-bet-${event.id}`}
                      >
                        {isLoadingThis ? (
                          <>
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <DollarSign className="mr-1 h-4 w-4" />
                            Bet Now
                          </>
                        )}
                      </Button>
                      
                      <a
                        href={`https://polymarket.com/event/${event.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-source-${event.id}`}
                      >
                        <Button variant="outline" size="sm">
                          View on Polymarket
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Trade with Trading Knights play money. Odds displayed are live from Polymarket.
            Your bets are tracked in your TK portfolio.
          </p>
        </div>
      </div>
    </div>
  );
}
