import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

interface StockCardProps {
  market: MarketWithDetails;
}

export function StockCard({ market }: StockCardProps) {
  const stock = market.stockMeta;
  if (!stock) return null;

  const priceChange = stock.currentPrice - stock.initialPrice;
  const priceChangePercent = ((priceChange / stock.initialPrice) * 100).toFixed(2);
  const isPositive = priceChange > 0;
  const isNegative = priceChange < 0;

  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      clubs: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      sports: "bg-green-500/10 text-green-700 dark:text-green-400",
      events: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      food: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
      activities: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    };
    return colors[category.toLowerCase()] || "bg-muted text-muted-foreground";
  };

  const marketCap = stock.currentPrice * stock.floatSupply;

  return (
    <Link href={`/stocks/${market.id}`}>
      <Card
        className="group p-4 transition-all hover-elevate cursor-pointer"
        data-testid={`card-stock-${stock.ticker}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold">{stock.ticker}</span>
              <Badge variant="secondary" className={`text-xs ${getCategoryColor(market.category)}`}>
                {market.category}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{market.title}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-bold">{formatPrice(stock.currentPrice)}</p>
            <div
              className={`flex items-center justify-end gap-1 text-sm font-medium ${
                isPositive
                  ? "text-green-600 dark:text-green-400"
                  : isNegative
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
              }`}
            >
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : isNegative ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              <span>
                {isPositive ? "+" : ""}
                {priceChangePercent}%
              </span>
            </div>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {market.description}
        </p>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <div>
            <span className="font-medium">Mkt Cap:</span>{" "}
            <span className="font-mono">${(marketCap / 1000).toFixed(1)}K</span>
          </div>
          <div>
            <span className="font-medium">Float:</span>{" "}
            <span className="font-mono">{stock.floatSupply.toLocaleString()}</span>
          </div>
        </div>

        <div className="mt-3 h-8 rounded bg-muted/50">
          <svg className="h-full w-full" viewBox="0 0 100 32" preserveAspectRatio="none">
            <path
              d={`M 0 ${20 - Math.random() * 10} ${Array.from({ length: 10 }, (_, i) =>
                `L ${(i + 1) * 10} ${20 - Math.random() * 15 + Math.random() * 10}`
              ).join(" ")}`}
              fill="none"
              stroke={isPositive ? "#22c55e" : isNegative ? "#ef4444" : "#6b7280"}
              strokeWidth="1.5"
            />
          </svg>
        </div>
      </Card>
    </Link>
  );
}
