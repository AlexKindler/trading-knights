import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StockCard } from "@/components/StockCard";
import { StockTicker } from "@/components/StockTicker";
import { useAuth } from "@/context/AuthContext";
import { Search, Plus, BarChart3, TrendingUp, TrendingDown, Activity } from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

const categories = ["All", "Clubs", "Sports", "Events", "Food", "Activities"];

type SortOption = "name" | "price" | "change" | "volume";

export default function Stocks() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<SortOption>("name");

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
          return bChange - aChange;
        case "name":
        default:
          return (a.stockMeta?.ticker ?? "").localeCompare(b.stockMeta?.ticker ?? "");
      }
    });

  const topGainers = stocks
    ?.filter((m) => m.stockMeta)
    .sort((a, b) => {
      const aChange = ((a.stockMeta?.currentPrice ?? 0) - (a.stockMeta?.initialPrice ?? 0)) / (a.stockMeta?.initialPrice ?? 1);
      const bChange = ((b.stockMeta?.currentPrice ?? 0) - (b.stockMeta?.initialPrice ?? 0)) / (b.stockMeta?.initialPrice ?? 1);
      return bChange - aChange;
    })
    .slice(0, 3);

  const topLosers = stocks
    ?.filter((m) => m.stockMeta)
    .sort((a, b) => {
      const aChange = ((a.stockMeta?.currentPrice ?? 0) - (a.stockMeta?.initialPrice ?? 0)) / (a.stockMeta?.initialPrice ?? 1);
      const bChange = ((b.stockMeta?.currentPrice ?? 0) - (b.stockMeta?.initialPrice ?? 0)) / (b.stockMeta?.initialPrice ?? 1);
      return aChange - bChange;
    })
    .slice(0, 3);

  return (
    <div className="min-h-screen">
      <StockTicker />
      <div className="px-4 py-8 mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold">
              <BarChart3 className="h-8 w-8 text-primary" />
              Stock Market
            </h1>
            <p className="mt-1 text-muted-foreground">
              Trade student-created stocks for clubs, teams, and more
            </p>
          </div>
          {user?.status === "VERIFIED" && (
            <Link href="/stocks/create">
              <Button className="gap-2" data-testid="button-create-stock">
                <Plus className="h-4 w-4" />
                Create Stock
              </Button>
            </Link>
          )}
        </div>

        {stocks && stocks.length > 0 && (
          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <div className="mb-4 flex items-center gap-2 text-green-600 dark:text-green-400">
                  <TrendingUp className="h-5 w-5" />
                  <span className="font-semibold">Top Gainers</span>
                </div>
                <div className="space-y-3">
                  {topGainers?.map((market) => {
                    const change = ((market.stockMeta?.currentPrice ?? 0) - (market.stockMeta?.initialPrice ?? 0)) / (market.stockMeta?.initialPrice ?? 1) * 100;
                    return (
                      <Link key={market.id} href={`/stocks/${market.id}`}>
                        <div className="flex items-center justify-between rounded-md p-2 hover-elevate cursor-pointer">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold">{market.stockMeta?.ticker}</span>
                            <span className="text-sm text-muted-foreground">{market.title}</span>
                          </div>
                          <span className="font-mono text-green-600 dark:text-green-400">
                            +{change.toFixed(1)}%
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="mb-4 flex items-center gap-2 text-red-600 dark:text-red-400">
                  <TrendingDown className="h-5 w-5" />
                  <span className="font-semibold">Top Losers</span>
                </div>
                <div className="space-y-3">
                  {topLosers?.map((market) => {
                    const change = ((market.stockMeta?.currentPrice ?? 0) - (market.stockMeta?.initialPrice ?? 0)) / (market.stockMeta?.initialPrice ?? 1) * 100;
                    return (
                      <Link key={market.id} href={`/stocks/${market.id}`}>
                        <div className="flex items-center justify-between rounded-md p-2 hover-elevate cursor-pointer">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold">{market.stockMeta?.ticker}</span>
                            <span className="text-sm text-muted-foreground">{market.title}</span>
                          </div>
                          <span className="font-mono text-red-600 dark:text-red-400">
                            {change.toFixed(1)}%
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
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
              data-testid="input-search-stocks"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                data-testid={`button-stock-category-${category.toLowerCase()}`}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          <Button
            variant={sortBy === "name" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSortBy("name")}
            data-testid="button-stock-sort-name"
          >
            A-Z
          </Button>
          <Button
            variant={sortBy === "price" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSortBy("price")}
            data-testid="button-stock-sort-price"
          >
            Price
          </Button>
          <Button
            variant={sortBy === "change" ? "secondary" : "ghost"}
            size="sm"
            className="gap-2"
            onClick={() => setSortBy("change")}
            data-testid="button-stock-sort-change"
          >
            <Activity className="h-4 w-4" />
            Change
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="mt-2 h-4 w-32" />
                <Skeleton className="mt-4 h-8 w-full" />
              </Card>
            ))}
          </div>
        ) : filteredStocks && filteredStocks.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {filteredStocks.map((market) => (
              <StockCard key={market.id} market={market} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No stocks found</h3>
              <p className="mt-2 text-muted-foreground">
                {search || selectedCategory !== "All"
                  ? "Try adjusting your filters"
                  : "Be the first to create a stock listing!"}
              </p>
              {user?.status === "VERIFIED" && (
                <Link href="/stocks/create">
                  <Button className="mt-4 gap-2">
                    <Plus className="h-4 w-4" />
                    Create Stock
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
