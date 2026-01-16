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
import { Search, TrendingUp, TrendingDown, Zap, ArrowUpDown, DollarSign } from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

const categories = ["All", "Clubs", "Sports", "Events", "Food", "Activities"];

type SortOption = "name" | "price" | "change" | "volume";

export default function Markets() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<SortOption>("change");

  const { data: stocks, isLoading } = useQuery<MarketWithDetails[]>({
    queryKey: ["/api/stocks"],
  });

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
        case "change":
          const aChange = ((a.stockMeta?.currentPrice ?? 0) - (a.stockMeta?.initialPrice ?? 0)) / (a.stockMeta?.initialPrice ?? 1);
          const bChange = ((b.stockMeta?.currentPrice ?? 0) - (b.stockMeta?.initialPrice ?? 0)) / (b.stockMeta?.initialPrice ?? 1);
          return Math.abs(bChange) - Math.abs(aChange);
        case "name":
        default:
          return (a.stockMeta?.ticker ?? "").localeCompare(b.stockMeta?.ticker ?? "");
      }
    });

  const hotStocks = stocks
    ?.filter((m) => m.stockMeta)
    .sort((a, b) => {
      const aChange = Math.abs(((a.stockMeta?.currentPrice ?? 0) - (a.stockMeta?.initialPrice ?? 0)) / (a.stockMeta?.initialPrice ?? 1));
      const bChange = Math.abs(((b.stockMeta?.currentPrice ?? 0) - (b.stockMeta?.initialPrice ?? 0)) / (b.stockMeta?.initialPrice ?? 1));
      return bChange - aChange;
    })
    .slice(0, 5);

  return (
    <div className="min-h-screen">
      <StockTicker />
      <div className="px-4 py-8 mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold" data-testid="text-page-title">
              <Zap className="h-8 w-8 text-primary" />
              Trading
            </h1>
            <p className="mt-1 text-muted-foreground" data-testid="text-page-subtitle">
              Quick buy and sell stocks for short-term gains
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <DollarSign className="h-3 w-3" />
              {user?.balance?.toLocaleString() ?? 0} Balance
            </Badge>
          </div>
        </div>

        {stocks && stocks.length > 0 && (
          <Card className="mb-8">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-yellow-500" />
                Hot Stocks - Most Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
                {hotStocks?.map((market) => {
                  const change = ((market.stockMeta?.currentPrice ?? 0) - (market.stockMeta?.initialPrice ?? 0)) / (market.stockMeta?.initialPrice ?? 1) * 100;
                  const isPositive = change >= 0;
                  return (
                    <Link key={market.id} href={`/stocks/${market.id}`}>
                      <Card className="hover-elevate cursor-pointer p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-lg">{market.stockMeta?.ticker}</span>
                          <span className={`flex items-center gap-1 text-sm font-medium ${isPositive ? "text-green-500" : "text-red-500"}`}>
                            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {isPositive ? "+" : ""}{change.toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-1">{market.title}</p>
                        <p className="font-mono text-lg mt-2">${market.stockMeta?.currentPrice.toFixed(2)}</p>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
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
            variant={sortBy === "change" ? "secondary" : "ghost"}
            size="sm"
            className="gap-2"
            onClick={() => setSortBy("change")}
            data-testid="button-trading-sort-change"
          >
            <ArrowUpDown className="h-4 w-4" />
            Most Active
          </Button>
          <Button
            variant={sortBy === "price" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSortBy("price")}
            data-testid="button-trading-sort-price"
          >
            Price
          </Button>
          <Button
            variant={sortBy === "name" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSortBy("name")}
            data-testid="button-trading-sort-name"
          >
            A-Z
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
              const change = (meta.currentPrice - meta.initialPrice) / meta.initialPrice * 100;
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
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-mono font-semibold">${meta.currentPrice.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">from ${meta.initialPrice.toFixed(2)}</p>
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
