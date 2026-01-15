import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketCard } from "@/components/MarketCard";
import { useAuth } from "@/context/AuthContext";
import { Search, Plus, Filter, TrendingUp, Clock, Sparkles } from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

const categories = ["All", "Sports", "Clubs", "Elections", "Events", "Academics"];

type SortOption = "newest" | "closing" | "popular";

export default function Markets() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const { data: markets, isLoading } = useQuery<MarketWithDetails[]>({
    queryKey: ["/api/markets"],
  });

  const filteredMarkets = markets
    ?.filter((market) => {
      const matchesSearch =
        market.title.toLowerCase().includes(search.toLowerCase()) ||
        market.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        selectedCategory === "All" ||
        market.category.toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "closing":
          const aClose = a.closeAt ? new Date(a.closeAt).getTime() : Infinity;
          const bClose = b.closeAt ? new Date(b.closeAt).getTime() : Infinity;
          return aClose - bClose;
        case "popular":
          return 0;
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold">
              <TrendingUp className="h-8 w-8 text-primary" />
              Prediction Markets
            </h1>
            <p className="mt-1 text-muted-foreground">
              Bet on outcomes of school events with play money
            </p>
          </div>
          {user?.status === "VERIFIED" && (
            <Link href="/markets/create">
              <Button className="gap-2" data-testid="button-create-market">
                <Plus className="h-4 w-4" />
                Create Market
              </Button>
            </Link>
          )}
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
                data-testid={`button-category-${category.toLowerCase()}`}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          <Button
            variant={sortBy === "newest" ? "secondary" : "ghost"}
            size="sm"
            className="gap-2"
            onClick={() => setSortBy("newest")}
            data-testid="button-sort-newest"
          >
            <Sparkles className="h-4 w-4" />
            Newest
          </Button>
          <Button
            variant={sortBy === "closing" ? "secondary" : "ghost"}
            size="sm"
            className="gap-2"
            onClick={() => setSortBy("closing")}
            data-testid="button-sort-closing"
          >
            <Clock className="h-4 w-4" />
            Closing Soon
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="mt-3 h-6 w-3/4" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-2/3" />
                <div className="mt-4 flex gap-4">
                  <Skeleton className="h-12 w-16" />
                  <Skeleton className="h-12 w-16" />
                </div>
              </Card>
            ))}
          </div>
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
                  : "Be the first to create a prediction market!"}
              </p>
              {user?.status === "VERIFIED" && (
                <Link href="/markets/create">
                  <Button className="mt-4 gap-2">
                    <Plus className="h-4 w-4" />
                    Create Market
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
