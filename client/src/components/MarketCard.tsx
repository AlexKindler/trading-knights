import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp, TrendingDown, Users } from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

interface MarketCardProps {
  market: MarketWithDetails;
}

export function MarketCard({ market }: MarketCardProps) {
  const yesOutcome = market.outcomes?.find((o) => o.label === "YES");
  const noOutcome = market.outcomes?.find((o) => o.label === "NO");

  const yesPrice = yesOutcome?.currentPrice ?? 0.5;
  const noPrice = noOutcome?.currentPrice ?? 0.5;

  const formatPrice = (price: number) => {
    return `$${(price * 100).toFixed(0)}¢`;
  };

  const formatTimeRemaining = (closeAt: Date | null) => {
    if (!closeAt) return "No deadline";
    const now = new Date();
    const close = new Date(closeAt);
    const diff = close.getTime() - now.getTime();

    if (diff < 0) return "Closed";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return "< 1h";
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      sports: "bg-green-500/10 text-green-700 dark:text-green-400",
      clubs: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      elections: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      events: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      academics: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    };
    return colors[category.toLowerCase()] || "bg-muted text-muted-foreground";
  };

  return (
    <Link href={`/markets/${market.id}`}>
      <Card
        className="group p-4 transition-all hover-elevate cursor-pointer"
        data-testid={`card-market-${market.id}`}
      >
        <div className="flex items-start justify-between gap-2">
          <Badge variant="secondary" className={`text-xs ${getCategoryColor(market.category)}`}>
            {market.category}
          </Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatTimeRemaining(market.closeAt)}</span>
          </div>
        </div>

        <h3 className="mt-3 line-clamp-2 font-semibold leading-tight group-hover:text-primary">
          {market.title}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {market.description}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">YES</p>
              <p className="font-mono text-lg font-semibold text-green-600 dark:text-green-400">
                {formatPrice(yesPrice)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">NO</p>
              <p className="font-mono text-lg font-semibold text-red-600 dark:text-red-400">
                {formatPrice(noPrice)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>124 traders</span>
          </div>
        </div>

        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${yesPrice * 100}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${noPrice * 100}%` }}
          />
        </div>
      </Card>
    </Link>
  );
}
