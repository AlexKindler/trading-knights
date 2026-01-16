import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StockTicker } from "@/components/StockTicker";
import { useAuth } from "@/context/AuthContext";
import { Search, TrendingUp, TrendingDown, Zap, ArrowUpDown, DollarSign, Clock, BarChart2 } from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

const categories = ["All", "Clubs", "Sports", "Events", "Food", "Activities"];

type SortOption = "volatility" | "price" | "momentum";

export default function Markets() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<SortOption>("volatility");

  const { data: stocks, isLoading } = useQuery<MarketWithDetails[]>({
    queryKey: ["/api/stocks"],
  });

  const getVolatility = (market: MarketWithDetails) => {
    const meta = market.stockMeta;
    if (!meta) return 0;
    return Math.abs((meta.currentPrice - meta.initialPrice) / meta.initialPrice);
  };

  const getMomentum = (market: MarketWithDetails) => {
    const meta = market.stockMeta;
    if (!meta) return 0;
    return (meta.currentPrice - meta.initialPrice) / meta.initialPrice;
  };

  const filteredStocks = stocks
    ?.filter((market) => {
      const matchesSearch =
        market.title.toLowerCase().includes(search.toLowerCase()) ||
        market.stockMeta?.ticker.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        selectedCategory === "All" ||
        market.category.toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "price":
          return (b.stockMeta?.currentPrice ?? 0) - (a.stockMeta?.currentPrice ?? 0);
        case "momentum":
          return getMomentum(b) - getMomentum(a);
        case "volatility":
        default:
          return getVolatility(b) - getVolatility(a);
      }
    });

  const highVolatility = stocks
    ?.filter((m) => m.stockMeta && getVolatility(m) > 0.05)
    .sort((a, b) => getVolatility(b) - getVolatility(a))
    .slice(0, 4);

  const bullishMomentum = stocks
    ?.filter((m) => m.stockMeta && getMomentum(m) > 0)
    .sort((a, b) => getMomentum(b) - getMomentum(a))
    .slice(0, 3);

  const bearishMomentum = stocks
    ?.filter((m) => m.stockMeta && getMomentum(m) < 0)
    .sort((a, b) => getMomentum(a) - getMomentum(b))
    .slice(0, 3);

  return (
    <div className="min-h-screen">
      <StockTicker />
      <div className="px-4 py-8 mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold" data-testid="text-page-title">
              <Zap className="h-8 w-8 text-yellow-500" />
              Trading
            </h1>
            <p className="mt-1 text-muted-foreground" data-testid="text-page-subtitle">
              Short-term profits from price swings. Buy low, sell high, move fast.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1 px-3 py-1">
              <Clock className="h-3 w-3" />
              Short-Term
            </Badge>
            <Badge variant="outline" className="gap-1 px-3 py-1">
              <DollarSign className="h-3 w-3" />
              ${user?.balance?.toLocaleString() ?? 0}
            </Badge>
          </div>
        </div>

        {stocks && stocks.length > 0 && (
          <div className="mb-8 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart2 className="h-4 w-4 text-purple-500" />
                  High Volatility
                </CardTitle>
                <p className="text-xs text-muted-foreground">Big price swings = trading opportunities</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {highVolatility?.map((market) => {
                  const volatility = getVolatility(market) * 100;
                  const change = getMomentum(market) * 100;
                  const isPositive = change >= 0;
                  return (
                    <Link key={market.id} href={`/stocks/${market.id}`}>
                      <div className="flex items-center justify-between rounded-md p-2 hover-elevate cursor-pointer">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{market.stockMeta?.ticker}</span>
                          <Badge variant="outline" className="text-xs">{volatility.toFixed(1)}% vol</Badge>
                        </div>
                        <span className={`font-mono text-sm ${isPositive ? "text-green-500" : "text-red-500"}`}>
                          {isPositive ? "+" : ""}{change.toFixed(1)}%
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-green-600 dark:text-green-400">
                  <TrendingUp className="h-4 w-4" />
                  Bullish Momentum
                </CardTitle>
                <p className="text-xs text-muted-foreground">Stocks trending upward</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {bullishMomentum?.map((market) => {
                  const change = getMomentum(market) * 100;
                  return (
                    <Link key={market.id} href={`/stocks/${market.id}`}>
                      <div className="flex items-center justify-between rounded-md p-2 hover-elevate cursor-pointer">
                        <span className="font-mono font-bold">{market.stockMeta?.ticker}</span>
                        <span className="font-mono text-sm text-green-500">+{change.toFixed(1)}%</span>
                      </div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
                  <TrendingDown className="h-4 w-4" />
                  Bearish Momentum
                </CardTitle>
                <p className="text-xs text-muted-foreground">Potential short or buy-the-dip</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {bearishMomentum?.map((market) => {
                  const change = getMomentum(market) * 100;
                  return (
                    <Link key={market.id} href={`/stocks/${market.id}`}>
                      <div className="flex items-center justify-between rounded-md p-2 hover-elevate cursor-pointer">
                        <span className="font-mono font-bold">{market.stockMeta?.ticker}</span>
                        <span className="font-mono text-sm text-red-500">{change.toFixed(1)}%</span>
                      </div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="mb-6 flex flex-col gap-4 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by ticker or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search-trading"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                data-testid={`button-trading-category-${category.toLowerCase()}`}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          <Button
            variant={sortBy === "volatility" ? "secondary" : "ghost"}
            size="sm"
            className="gap-2"
            onClick={() => setSortBy("volatility")}
            data-testid="button-trading-sort-volatility"
          >
            <ArrowUpDown className="h-4 w-4" />
            Volatility
          </Button>
          <Button
            variant={sortBy === "momentum" ? "secondary" : "ghost"}
            size="sm"
            className="gap-2"
            onClick={() => setSortBy("momentum")}
            data-testid="button-trading-sort-momentum"
          >
            <TrendingUp className="h-4 w-4" />
            Momentum
          </Button>
          <Button
            variant={sortBy === "price" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSortBy("price")}
            data-testid="button-trading-sort-price"
          >
            Price
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="mt-2 h-4 w-32" />
                <Skeleton className="mt-4 h-8 w-full" />
              </Card>
            ))}
          </div>
        ) : filteredStocks && filteredStocks.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredStocks.map((market) => {
              const meta = market.stockMeta;
              if (!meta) return null;
              const change = getMomentum(market) * 100;
              const volatility = getVolatility(market) * 100;
              const isPositive = change >= 0;
              
              return (
                <Link key={market.id} href={`/stocks/${market.id}`}>
                  <Card className="hover-elevate cursor-pointer p-4 h-full" data-testid={`trading-card-${meta.ticker}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono font-bold text-xl">{meta.ticker}</span>
                        <p className="text-sm text-muted-foreground line-clamp-1">{market.title}</p>
                      </div>
                      <Badge variant={isPositive ? "default" : "destructive"} className="font-mono">
                        {isPositive ? "+" : ""}{change.toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs gap-1">
                        <BarChart2 className="h-3 w-3" />
                        {volatility.toFixed(1)}% vol
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-mono font-semibold">${meta.currentPrice.toFixed(2)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950">
                          Buy
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                          Sell
                        </Button>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Zap className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No stocks found</h3>
              <p className="mt-2 text-muted-foreground">
                {search || selectedCategory !== "All"
                  ? "Try adjusting your filters"
                  : "No stocks available for trading yet."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
