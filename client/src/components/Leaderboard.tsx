import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, TrendingUp, TrendingDown, Minus, Crown, Medal } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import type { LeaderboardEntry } from "@shared/schema";

type TimeFilter = "all" | "week" | "month";

export function Leaderboard() {
  const { user } = useAuth();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const { data: leaderboard, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard", timeFilter],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Medal className="h-5 w-5 text-amber-600" />;
      default:
        return null;
    }
  };

  const getRankBadgeClass = (rank: number) => {
    switch (rank) {
      case 1:
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
      case 2:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/30";
      case 3:
        return "bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-500/30";
      default:
        return "";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Leaderboard
        </CardTitle>
        <Tabs value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-leaderboard-all">
              All Time
            </TabsTrigger>
            <TabsTrigger value="week" data-testid="tab-leaderboard-week">
              This Week
            </TabsTrigger>
            <TabsTrigger value="month" data-testid="tab-leaderboard-month">
              This Month
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {!leaderboard || leaderboard.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No rankings yet. Start trading to appear on the leaderboard!
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry) => {
              const isCurrentUser = user && entry.userId === user.id;
              const isTop3 = entry.rank <= 3;

              return (
                <div
                  key={entry.userId}
                  className={`flex items-center gap-4 rounded-lg p-3 transition-colors ${
                    isCurrentUser
                      ? "border-2 border-primary bg-primary/5"
                      : isTop3
                      ? "bg-muted/50"
                      : "hover:bg-muted/30"
                  }`}
                  data-testid={`row-leaderboard-${entry.rank}`}
                >
                  <div className="flex w-12 items-center justify-center">
                    {isTop3 ? (
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${getRankBadgeClass(entry.rank)}`}>
                        {getRankIcon(entry.rank)}
                      </div>
                    ) : (
                      <span className="text-lg font-semibold text-muted-foreground">
                        #{entry.rank}
                      </span>
                    )}
                  </div>

                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={isTop3 ? "bg-primary/10 text-primary" : ""}>
                      {entry.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isTop3 ? "text-lg" : ""}`}>
                        {entry.displayName}
                      </span>
                      {entry.grade && (
                        <Badge variant="secondary" className="text-xs">
                          {entry.grade}
                        </Badge>
                      )}
                      {isCurrentUser && (
                        <Badge variant="outline" className="text-xs">
                          You
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Cash: {formatCurrency(entry.cashBalance)}</span>
                      <span>Positions: {formatCurrency(entry.positionsValue)}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`font-mono font-bold ${isTop3 ? "text-xl" : "text-lg"}`}>
                      {formatCurrency(entry.totalValue)}
                    </p>
                    <div
                      className={`flex items-center justify-end gap-1 text-sm ${
                        entry.changePercent > 0
                          ? "text-green-600 dark:text-green-400"
                          : entry.changePercent < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {entry.changePercent > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : entry.changePercent < 0 ? (
                        <TrendingDown className="h-3 w-3" />
                      ) : (
                        <Minus className="h-3 w-3" />
                      )}
                      <span>
                        {entry.changePercent > 0 ? "+" : ""}
                        {entry.changePercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
