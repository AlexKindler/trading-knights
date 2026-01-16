import { useQuery } from "@tanstack/react-query";
import type { MarketWithDetails } from "@shared/schema";
import { TrendingUp, TrendingDown } from "lucide-react";

export function StockTicker() {
  const { data: stocks } = useQuery<MarketWithDetails[]>({
    queryKey: ["/api/stocks"],
  });

  if (!stocks || stocks.length === 0) return null;

  const tickerItems = stocks.map((stock) => {
    const meta = stock.stockMeta;
    if (!meta) return null;

    const change = meta.currentPrice - meta.initialPrice;
    const changePercent = (change / meta.initialPrice) * 100;
    const isPositive = change >= 0;

    return (
      <div
        key={stock.id}
        className="inline-flex items-center gap-2 px-6 whitespace-nowrap"
        data-testid={`ticker-${meta.ticker}`}
      >
        <span className="font-semibold text-foreground">{meta.ticker}</span>
        <span className="font-mono text-sm">${meta.currentPrice.toFixed(2)}</span>
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            isPositive ? "text-green-500" : "text-red-500"
          }`}
        >
          {isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {isPositive ? "+" : ""}
          {changePercent.toFixed(2)}%
        </span>
      </div>
    );
  });

  return (
    <div className="w-full overflow-hidden bg-muted/50 border-b" data-testid="stock-ticker">
      <div className="animate-marquee inline-flex py-2">
        {tickerItems}
        {tickerItems}
      </div>
    </div>
  );
}
