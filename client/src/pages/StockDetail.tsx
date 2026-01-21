import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TradingWidget } from "@/components/TradingWidget";
import { CandlestickChart } from "@/components/CandlestickChart";
import { MkAiAdvisor } from "@/components/MkAiAdvisor";
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  User,
  Flag,
  MessageSquare,
} from "lucide-react";
import type { MarketWithDetails, Comment } from "@shared/schema";

export default function StockDetail() {
  const [, params] = useRoute("/stocks/:id");

  const { data: market, isLoading } = useQuery<MarketWithDetails>({
    queryKey: ["/api/stocks", params?.id],
    enabled: !!params?.id,
  });

  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["/api/stocks", params?.id, "comments"],
    enabled: !!params?.id,
  });

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(date));
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      clubs: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      sports: "bg-green-500/10 text-green-700 dark:text-green-400",
      events: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      food: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
      activities: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    };
    return colors[category?.toLowerCase()] || "bg-muted text-muted-foreground";
  };

  const stock = market?.stockMeta;
  const priceChange = stock ? stock.currentPrice - stock.initialPrice : 0;
  const priceChangePercent = stock
    ? ((priceChange / stock.initialPrice) * 100).toFixed(2)
    : "0";
  const isPositive = priceChange > 0;
  const isNegative = priceChange < 0;

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-4 h-10 w-3/4" />
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64" />
              <Skeleton className="h-40" />
            </div>
            <Skeleton className="h-80" />
          </div>
        </div>
      </div>
    );
  }

  if (!market || !stock) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md text-center">
          <CardContent className="pt-6">
            <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Stock not found</h2>
            <Link href="/stocks">
              <Button className="mt-4">Back to Stocks</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/stocks">
          <Button variant="ghost" size="sm" className="mb-4 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Stocks
          </Button>
        </Link>

        <div className="flex flex-wrap items-start gap-3">
          <Badge variant="secondary" className={getCategoryColor(market.category)}>
            {market.category}
          </Badge>
          <Badge variant="outline">{market.status}</Badge>
        </div>

        <div className="mt-4 flex flex-wrap items-baseline gap-4">
          <span className="font-mono text-4xl font-bold">{stock.ticker}</span>
          <span className="text-2xl text-muted-foreground">{market.title}</span>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <span className="font-mono text-3xl font-bold">
            ${stock.currentPrice.toFixed(2)}
          </span>
          <div
            className={`flex items-center gap-1 text-lg font-medium ${
              isPositive
                ? "text-green-600 dark:text-green-400"
                : isNegative
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="h-5 w-5" />
            ) : isNegative ? (
              <TrendingDown className="h-5 w-5" />
            ) : (
              <Minus className="h-5 w-5" />
            )}
            <span>
              {isPositive ? "+" : ""}${Math.abs(priceChange).toFixed(2)} (
              {isPositive ? "+" : ""}
              {priceChangePercent}%)
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4" />
            <span>Created by {market.creatorName || "Unknown"}</span>
          </div>
          <div>
            <span className="font-medium">Mkt Cap:</span>{" "}
            <span className="font-mono">
              ${((stock.currentPrice * stock.floatSupply) / 1000).toFixed(1)}K
            </span>
          </div>
          <div>
            <span className="font-medium">Float:</span>{" "}
            <span className="font-mono">{stock.floatSupply.toLocaleString()}</span>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Price History</CardTitle>
              </CardHeader>
              <CardContent>
                <CandlestickChart marketId={market.id} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {market.description}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Discussion
                </CardTitle>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Flag className="h-4 w-4" />
                  Report
                </Button>
              </CardHeader>
              <CardContent>
                {!comments?.length ? (
                  <p className="text-center text-muted-foreground">
                    No discussion yet. Start the conversation!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="rounded-lg border p-4">
                        <p className="text-sm">{comment.text}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatDate(comment.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:sticky lg:top-20 space-y-4">
            <TradingWidget market={market} />
            <MkAiAdvisor currentStock={market} mode="stock" />
          </div>
        </div>
      </div>
    </div>
  );
}
