import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockTicker } from "@/components/StockTicker";
import { TradingWidget } from "@/components/TradingWidget";
import { MkAiAdvisor } from "@/components/MkAiAdvisor";
import { useAuth } from "@/context/AuthContext";
import { 
  Search, Zap, TrendingUp, TrendingDown, Activity, 
  ArrowUpRight, ArrowDownRight, BarChart2, RefreshCw, Timer,
  Target, DollarSign, Clock, CheckCircle2
} from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

export default function Trading() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedStock, setSelectedStock] = useState<MarketWithDetails | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [activeTab, setActiveTab] = useState("stocks");

  const { data: stocks, isLoading: stocksLoading, refetch: refetchStocks } = useQuery<MarketWithDetails[]>({
    queryKey: ["/api/stocks"],
    refetchInterval: 5000,
  });

  const { data: predictions, isLoading: predictionsLoading, refetch: refetchPredictions } = useQuery<MarketWithDetails[]>({
    queryKey: ["/api/markets"],
    refetchInterval: 5000,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      refetchStocks();
      refetchPredictions();
      setLastUpdate(new Date());
    }, 5000);
    return () => clearInterval(interval);
  }, [refetchStocks, refetchPredictions]);

  const getChange = (market: MarketWithDetails) => {
    const meta = market.stockMeta;
    if (!meta) return 0;
    return ((meta.currentPrice - meta.initialPrice) / meta.initialPrice) * 100;
  };

  const filteredStocks = stocks
    ?.filter((market) => {
      const matchesSearch =
        market.title.toLowerCase().includes(search.toLowerCase()) ||
        market.stockMeta?.ticker.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    })
    .sort((a, b) => Math.abs(getChange(b)) - Math.abs(getChange(a)));

  const filteredPredictions = predictions
    ?.filter((market) => {
      return market.title.toLowerCase().includes(search.toLowerCase());
    });

  const gainers = stocks?.filter(s => getChange(s) > 0).sort((a, b) => getChange(b) - getChange(a)).slice(0, 5);
  const losers = stocks?.filter(s => getChange(s) < 0).sort((a, b) => getChange(a) - getChange(b)).slice(0, 5);

  const handleRefresh = () => {
    refetchStocks();
    refetchPredictions();
    setLastUpdate(new Date());
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <StockTicker />
      <div className="px-4 py-6 mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold" data-testid="text-page-title">
              <Zap className="h-8 w-8 text-yellow-500" />
              Trading Floor
            </h1>
            <p className="mt-1 text-muted-foreground flex items-center gap-2" data-testid="text-page-subtitle">
              <Activity className="h-4 w-4 animate-pulse text-green-500" />
              Stocks & Predictions. Real-time. Execute fast.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1 px-3 py-1 animate-pulse border-yellow-500 text-yellow-600">
              <Timer className="h-3 w-3" />
              LIVE
            </Badge>
            {user && (
              <Badge variant="secondary" className="gap-1 px-3 py-1">
                <DollarSign className="h-3 w-3" />
                ${user.balance.toLocaleString()}
              </Badge>
            )}
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              {lastUpdate.toLocaleTimeString()}
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <TabsList className="grid w-full sm:w-auto grid-cols-2">
              <TabsTrigger value="stocks" className="gap-2" data-testid="tab-stocks">
                <BarChart2 className="h-4 w-4" />
                Stocks
              </TabsTrigger>
              <TabsTrigger value="predictions" className="gap-2" data-testid="tab-predictions">
                <Target className="h-4 w-4" />
                Predictions
              </TabsTrigger>
            </TabsList>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={activeTab === "stocks" ? "Search stocks..." : "Search predictions..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
              <Button 
                variant="outline" 
                size="icon"
                onClick={handleRefresh}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <TabsContent value="stocks" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <Card className="border-green-500/30 bg-green-500/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-green-600">
                        <TrendingUp className="h-4 w-4" />
                        Top Gainers
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {gainers?.map((stock) => (
                        <button
                          key={stock.id}
                          onClick={() => setSelectedStock(stock)}
                          className={`w-full flex items-center justify-between p-2 rounded-md hover-elevate text-left ${
                            selectedStock?.id === stock.id ? "bg-primary/10 border border-primary" : "bg-background"
                          }`}
                          data-testid={`button-gainer-${stock.stockMeta?.ticker}`}
                        >
                          <div>
                            <span className="font-mono font-bold text-sm">{stock.stockMeta?.ticker}</span>
                            <span className="text-xs text-muted-foreground ml-2">${stock.stockMeta?.currentPrice.toFixed(2)}</span>
                          </div>
                          <Badge variant="outline" className="text-green-600 border-green-500 text-xs">
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                            +{getChange(stock).toFixed(1)}%
                          </Badge>
                        </button>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-red-500/30 bg-red-500/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                        <TrendingDown className="h-4 w-4" />
                        Top Losers
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {losers?.map((stock) => (
                        <button
                          key={stock.id}
                          onClick={() => setSelectedStock(stock)}
                          className={`w-full flex items-center justify-between p-2 rounded-md hover-elevate text-left ${
                            selectedStock?.id === stock.id ? "bg-primary/10 border border-primary" : "bg-background"
                          }`}
                          data-testid={`button-loser-${stock.stockMeta?.ticker}`}
                        >
                          <div>
                            <span className="font-mono font-bold text-sm">{stock.stockMeta?.ticker}</span>
                            <span className="text-xs text-muted-foreground ml-2">${stock.stockMeta?.currentPrice.toFixed(2)}</span>
                          </div>
                          <Badge variant="outline" className="text-red-600 border-red-500 text-xs">
                            <ArrowDownRight className="h-3 w-3 mr-1" />
                            {getChange(stock).toFixed(1)}%
                          </Badge>
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart2 className="h-4 w-4" />
                      All Stocks ({filteredStocks?.length || 0})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
                      {stocksLoading ? (
                        Array.from({ length: 12 }).map((_, i) => (
                          <Skeleton key={i} className="h-16" />
                        ))
                      ) : (
                        filteredStocks?.map((stock) => {
                          const change = getChange(stock);
                          const isPositive = change >= 0;
                          return (
                            <button
                              key={stock.id}
                              onClick={() => setSelectedStock(stock)}
                              className={`p-3 rounded-lg border hover-elevate text-left transition-all ${
                                selectedStock?.id === stock.id 
                                  ? "border-primary bg-primary/5 ring-1 ring-primary" 
                                  : "border-border"
                              }`}
                              data-testid={`button-stock-${stock.stockMeta?.ticker}`}
                            >
                              <div className="font-mono font-bold text-sm">{stock.stockMeta?.ticker}</div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-sm">${stock.stockMeta?.currentPrice.toFixed(2)}</span>
                                <span className={`text-xs font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}>
                                  {isPositive ? "+" : ""}{change.toFixed(1)}%
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                {user?.status === "VERIFIED" && selectedStock ? (
                  <>
                    <Card className="border-primary/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xl">{selectedStock.stockMeta?.ticker}</span>
                            <Badge variant="outline" className="text-xs">
                              {selectedStock.category}
                            </Badge>
                          </div>
                          <Link href={`/stocks/${selectedStock.id}`}>
                            <Button variant="ghost" size="sm" data-testid="button-view-details">
                              Details
                            </Button>
                          </Link>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground truncate">{selectedStock.title}</p>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <div className="text-3xl font-bold">${selectedStock.stockMeta?.currentPrice.toFixed(2)}</div>
                            <div className={`text-sm ${getChange(selectedStock) >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {getChange(selectedStock) >= 0 ? "+" : ""}{getChange(selectedStock).toFixed(2)}%
                            </div>
                          </div>
                          <div className={`p-3 rounded-full ${getChange(selectedStock) >= 0 ? "bg-green-500/20" : "bg-red-500/20"}`}>
                            {getChange(selectedStock) >= 0 ? (
                              <TrendingUp className="h-6 w-6 text-green-600" />
                            ) : (
                              <TrendingDown className="h-6 w-6 text-red-600" />
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <TradingWidget market={selectedStock} />
                    <MkAiAdvisor currentStock={selectedStock} mode="stock" />
                  </>
                ) : user?.status === "VERIFIED" ? (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                      <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="font-semibold mb-2">Select a Stock</h3>
                      <p className="text-sm text-muted-foreground">
                        Click any stock to start trading
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground mb-4">Sign in to trade</p>
                      <Link href="/login">
                        <Button data-testid="button-login">Login</Button>
                      </Link>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="predictions" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {predictionsLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-48" />
                ))
              ) : filteredPredictions?.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-semibold mb-2">No Predictions Found</h3>
                  <p className="text-sm text-muted-foreground">
                    Check back later for new prediction markets
                  </p>
                </div>
              ) : (
                filteredPredictions?.map((market) => {
                  const yesOutcome = market.outcomes?.find(o => o.label === "YES");
                  const noOutcome = market.outcomes?.find(o => o.label === "NO");
                  const yesPrice = yesOutcome?.currentPrice ?? 0.5;
                  const noPrice = noOutcome?.currentPrice ?? 0.5;
                  
                  return (
                    <Link key={market.id} href={`/markets/${market.id}`}>
                      <Card className="h-full hover-elevate cursor-pointer transition-all">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <Badge variant="outline" className="text-xs">
                              {market.category}
                            </Badge>
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Clock className="h-3 w-3" />
                              {market.closeAt ? new Date(market.closeAt).toLocaleDateString() : "Open"}
                            </Badge>
                          </div>
                          <CardTitle className="text-base mt-2 line-clamp-2">
                            {market.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                            {market.description}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 rounded-md bg-green-500/10 border border-green-500/30 text-center">
                              <div className="text-xs text-muted-foreground">YES</div>
                              <div className="text-lg font-bold text-green-600">
                                {(yesPrice * 100).toFixed(0)}%
                              </div>
                            </div>
                            <div className="p-2 rounded-md bg-red-500/10 border border-red-500/30 text-center">
                              <div className="text-xs text-muted-foreground">NO</div>
                              <div className="text-lg font-bold text-red-600">
                                {(noPrice * 100).toFixed(0)}%
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
