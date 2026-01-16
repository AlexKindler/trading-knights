import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StockCard } from "@/components/StockCard";
import { StockTicker } from "@/components/StockTicker";
import { useAuth } from "@/context/AuthContext";
import { Search, Plus, BarChart3, TrendingUp, TrendingDown, Target, Shield, Briefcase, PiggyBank } from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

const categories = ["All", "Clubs", "Sports", "Events", "Food", "Activities"];

type SortOption = "name" | "price" | "growth" | "value";

export default function Stocks() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<SortOption>("growth");

  const { data: stocks, isLoading } = useQuery<MarketWithDetails[]>({
    queryKey: ["/api/stocks"],
  });

  const getGrowth = (market: MarketWithDetails) => {
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
        case "growth":
          return getGrowth(b) - getGrowth(a);
        case "value":
          return (a.stockMeta?.currentPrice ?? 0) - (b.stockMeta?.currentPrice ?? 0);
        case "name":
        default:
          return (a.stockMeta?.ticker ?? "").localeCompare(b.stockMeta?.ticker ?? "");
      }
    });

  const steadyGrowth = stocks
    ?.filter((m) => m.stockMeta && getGrowth(m) > 0)
    .sort((a, b) => getGrowth(b) - getGrowth(a))
    .slice(0, 4);

  const valueStocks = stocks
    ?.filter((m) => m.stockMeta && getGrowth(m) < 0)
    .sort((a, b) => getGrowth(a) - getGrowth(b))
    .slice(0, 4);

  const totalMarketCap = stocks?.reduce((acc, m) => {
    const meta = m.stockMeta;
    if (!meta) return acc;
    return acc + (meta.currentPrice * meta.floatSupply);
  }, 0) ?? 0;

  const avgGrowth = stocks?.length 
    ? (stocks.reduce((acc, m) => acc + getGrowth(m), 0) / stocks.length) * 100 
    : 0;

  return (
    <div className="min-h-screen">
      <StockTicker />
      <div className="px-4 py-8 mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold" data-testid="text-page-title">
              <Briefcase className="h-8 w-8 text-primary" />
              Investments
            </h1>
            <p className="mt-1 text-muted-foreground" data-testid="text-page-subtitle">
              Long-term wealth through club growth. Buy and hold quality organizations.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1 px-3 py-1">
              <Shield className="h-3 w-3" />
              Long-Term
            </Badge>
            {user?.status === "VERIFIED" && (
              <Link href="/stocks/create">
                <Button className="gap-2" data-testid="button-create-stock">
                  <Plus className="h-4 w-4" />
                  Create Stock
                </Button>
              </Link>
            )}
          </div>
        </div>

        <Card className="mb-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <PiggyBank className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium">Investment Strategy</p>
                <p className="text-sm text-muted-foreground">
                  Focus on fundamentals. Research club activities, membership, and achievements for long-term growth.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {stocks && stocks.length > 0 && (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">Total Stocks</p>
                  <p className="text-2xl font-bold">{stocks.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">Market Cap</p>
                  <p className="text-2xl font-bold">${(totalMarketCap / 1000).toFixed(0)}K</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">Avg Growth</p>
                  <p className={`text-2xl font-bold ${avgGrowth >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {avgGrowth >= 0 ? "+" : ""}{avgGrowth.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">Your Balance</p>
                  <p className="text-2xl font-bold">${user?.balance?.toLocaleString() ?? 0}</p>
                </CardContent>
              </Card>
            </div>

            <div className="mb-8 grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Growth Leaders
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Strong performers for buy-and-hold</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {steadyGrowth?.map((market) => {
                    const growth = getGrowth(market) * 100;
                    return (
                      <Link key={market.id} href={`/stocks/${market.id}`}>
                        <div className="flex items-center justify-between rounded-md p-2 hover-elevate cursor-pointer">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold">{market.stockMeta?.ticker}</span>
                            <span className="text-sm text-muted-foreground truncate max-w-[150px]">{market.title}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-green-500">+{growth.toFixed(1)}%</span>
                            <p className="text-xs text-muted-foreground">${market.stockMeta?.currentPrice.toFixed(2)}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4 text-blue-500" />
                    Value Opportunities
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Undervalued stocks with potential</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {valueStocks?.map((market) => {
                    const growth = getGrowth(market) * 100;
                    return (
                      <Link key={market.id} href={`/stocks/${market.id}`}>
                        <div className="flex items-center justify-between rounded-md p-2 hover-elevate cursor-pointer">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold">{market.stockMeta?.ticker}</span>
                            <span className="text-sm text-muted-foreground truncate max-w-[150px]">{market.title}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-red-500">{growth.toFixed(1)}%</span>
                            <p className="text-xs text-muted-foreground">${market.stockMeta?.currentPrice.toFixed(2)}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </>
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
            variant={sortBy === "growth" ? "secondary" : "ghost"}
            size="sm"
            className="gap-2"
            onClick={() => setSortBy("growth")}
            data-testid="button-stock-sort-growth"
          >
            <TrendingUp className="h-4 w-4" />
            Growth
          </Button>
          <Button
            variant={sortBy === "value" ? "secondary" : "ghost"}
            size="sm"
            className="gap-2"
            onClick={() => setSortBy("value")}
            data-testid="button-stock-sort-value"
          >
            <Target className="h-4 w-4" />
            Value
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
            variant={sortBy === "name" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSortBy("name")}
            data-testid="button-stock-sort-name"
          >
            A-Z
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
