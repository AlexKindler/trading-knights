import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketCard } from "@/components/MarketCard";
import { Search, TrendingUp } from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

const categories = ["All", "Clubs", "Sports", "Elections", "Events", "Academics"];

export default function Markets() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const { data: markets, isLoading, isError, refetch } = useQuery<MarketWithDetails[]>({
    queryKey: ["/api/markets"],
  });

  const filteredMarkets = markets?.filter((market) => {
    const matchesSearch =
      market.title.toLowerCase().includes(search.toLowerCase()) ||
      market.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === "All" ||
      market.category.toLowerCase() === selectedCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen">
      <div className="px-4 py-8 mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-3xl font-bold" data-testid="text-page-title">
            <TrendingUp className="h-8 w-8 text-primary" />
            Prediction Markets
          </h1>
          <p className="mt-1 text-muted-foreground" data-testid="text-page-subtitle">
            Bet on Menlo events and outcomes. Buy YES or NO — winners settle at $1.00.
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search markets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search-markets"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                data-testid={`button-market-category-${category.toLowerCase()}`}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="mt-3 h-6 w-3/4" />
                <Skeleton className="mt-2 h-4 w-full" />
                <div className="mt-4 flex gap-4">
                  <Skeleton className="h-10 w-16" />
                  <Skeleton className="h-10 w-16" />
                </div>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">Couldn't load markets</h3>
              <p className="mt-2 text-muted-foreground">Something went wrong while loading prediction markets.</p>
              <Button className="mt-4" onClick={() => refetch()} data-testid="button-retry">Retry</Button>
            </CardContent>
          </Card>
        ) : filteredMarkets && filteredMarkets.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No markets found</h3>
              <p className="mt-2 text-muted-foreground">
                {search || selectedCategory !== "All"
                  ? "Try adjusting your filters"
                  : "No prediction markets yet. Check back soon!"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
