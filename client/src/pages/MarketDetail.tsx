import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TradingWidget } from "@/components/TradingWidget";
import { MarketCandlestickChart } from "@/components/MarketCandlestickChart";
import { useAuth } from "@/context/AuthContext";
import {
  Clock,
  Calendar,
  User,
  Flag,
  ArrowLeft,
  TrendingUp,
  MessageSquare,
} from "lucide-react";
import type { MarketWithDetails, Comment } from "@shared/schema";

export default function MarketDetail() {
  const [, params] = useRoute("/markets/:id");
  const { user } = useAuth();
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | undefined>();

  const { data: market, isLoading } = useQuery<MarketWithDetails>({
    queryKey: ["/api/markets", params?.id],
    enabled: !!params?.id,
  });

  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["/api/markets", params?.id, "comments"],
    enabled: !!params?.id,
  });

  const formatDate = (date: Date | null) => {
    if (!date) return "No deadline";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      sports: "bg-green-500/10 text-green-700 dark:text-green-400",
      clubs: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      elections: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
      events: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
      academics: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    };
    return colors[category?.toLowerCase()] || "bg-muted text-muted-foreground";
  };

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

  if (!market) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md text-center">
          <CardContent className="pt-6">
            <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Market not found</h2>
            <Link href="/markets">
              <Button className="mt-4">Back to Markets</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!selectedOutcomeId && market.outcomes?.[0]) {
    setSelectedOutcomeId(market.outcomes[0].id);
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/markets">
          <Button variant="ghost" size="sm" className="mb-4 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Markets
          </Button>
        </Link>

        <div className="flex flex-wrap items-start gap-3">
          <Badge variant="secondary" className={getCategoryColor(market.category)}>
            {market.category}
          </Badge>
          <Badge variant="outline">{market.status}</Badge>
        </div>

        <h1 className="mt-4 text-3xl font-bold">{market.title}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4" />
            <span>Created by {market.creatorName || "Unknown"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>Closes {formatDate(market.closeAt)}</span>
          </div>
          {market.resolveAt && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Resolves {formatDate(market.resolveAt)}</span>
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {market.outcomes && market.outcomes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>YES Price History</CardTitle>
                </CardHeader>
                <CardContent>
                  <MarketCandlestickChart
                    marketId={market.id}
                    outcomeId={market.outcomes[0].id}
                    outcomeLabel="YES"
                  />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {market.description}
                </p>
                {market.resolutionRule && (
                  <div className="mt-4 rounded-lg border bg-muted/50 p-4">
                    <p className="text-sm font-medium">Resolution Rule</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {market.resolutionRule}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Comments
                </CardTitle>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Flag className="h-4 w-4" />
                  Report
                </Button>
              </CardHeader>
              <CardContent>
                {!comments?.length ? (
                  <p className="text-center text-muted-foreground">
                    No comments yet. Be the first to comment!
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

          <div className="lg:sticky lg:top-20">
            <TradingWidget
              market={market}
              selectedOutcomeId={selectedOutcomeId}
              onOutcomeSelect={setSelectedOutcomeId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
