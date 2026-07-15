import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowUpRight, ArrowDownRight, Wallet, Package } from "lucide-react";
import type { MarketWithDetails, Position } from "@shared/schema";

interface TradingWidgetProps {
  market: MarketWithDetails;
  selectedOutcomeId?: string;
  onOutcomeSelect?: (outcomeId: string) => void;
}

export function TradingWidget({ market, selectedOutcomeId, onOutcomeSelect }: TradingWidgetProps) {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("");

  // Fetch user's portfolio to get owned shares
  const { data: portfolio } = useQuery<{ positions: Position[] }>({
    queryKey: ["/api/portfolio"],
    enabled: !!user,
  });

  // Find owned shares for this market
  const ownedPosition = portfolio?.positions?.find(
    (p) => p.marketId === market.id && (market.type === "STOCK" || p.outcomeId === selectedOutcomeId)
  );
  const ownedShares = ownedPosition?.qty ?? 0;

  const isPredictionMarket = market.type === "PREDICTION";
  const selectedOutcome = market.outcomes?.find((o) => o.id === selectedOutcomeId);
  const currentPrice = isPredictionMarket
    ? selectedOutcome?.currentPrice ?? 0.5
    : market.stockMeta?.currentPrice ?? 10;

  // Strict integer quantity parsing: reject decimals ("2.5"), scientific
  // notation ("1e2"), and anything outside 1..1000.
  const rawQty = quantity.trim();
  const isValidQty = /^\d+$/.test(rawQty);
  const qty = isValidQty ? parseInt(rawQty, 10) : 0;
  const qtyInRange = qty >= 1 && qty <= 1000;
  const total = Math.round(qty * currentPrice * 100) / 100;
  // Gross payout if a winning YES/NO share settles at $1.00 each.
  const grossPayout = isPredictionMarket ? qty : 0;

  const tradeMutation = useMutation({
    mutationFn: async () => {
      // Use fetch directly so we surface the clean server-provided message.
      // (apiRequest throws a wrapped "400: {json}" string that leaks internals.)
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          marketId: market.id,
          outcomeId: selectedOutcomeId ?? null,
          side,
          qty,
        }),
      });
      if (!res.ok) {
        let message = "Trade failed";
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {
          // non-JSON error body; keep the default message
        }
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Trade executed!",
        description: `Successfully ${side === "BUY" ? "bought" : "sold"} ${qty} ${qty === 1 ? "share" : "shares"}`,
      });
      setQuantity("");
      refreshUser();
      // Prices and balances live under several keys (staleTime is Infinity),
      // so invalidate every surface this trade can affect.
      queryClient.invalidateQueries({ queryKey: ["/api/stocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stocks", market.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/markets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/markets", market.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Trade failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleMaxClick = () => {
    if (!user) return;
    if (side === "BUY") {
      const maxQty = Math.floor(user.balance / currentPrice);
      setQuantity(Math.min(maxQty, 1000).toString());
    } else {
      // For selling, max is owned shares
      setQuantity(Math.min(ownedShares, 1000).toString());
    }
  };

  // Validate trade conditions
  const canBuy = user?.status === "VERIFIED" && qtyInRange && total <= (user?.balance ?? 0);
  const canSell = user?.status === "VERIFIED" && qtyInRange && qty <= ownedShares;
  const canTrade = side === "BUY" ? canBuy : canSell;

  if (market.status !== "OPEN") {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            This market is {market.status.toLowerCase()}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          Trade
          {isPredictionMarket && selectedOutcome && (
            <span className="font-mono text-primary">({selectedOutcome.label})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPredictionMarket && market.outcomes && (
          <div className="flex gap-2">
            {market.outcomes.map((outcome) => (
              <Button
                key={outcome.id}
                variant={selectedOutcomeId === outcome.id ? "default" : "outline"}
                className="flex-1"
                onClick={() => onOutcomeSelect?.(outcome.id)}
                data-testid={`button-outcome-${outcome.label.toLowerCase()}`}
              >
                {outcome.label}
                <span className="ml-2 font-mono">
                  {Math.round(outcome.currentPrice * 100)}¢
                </span>
              </Button>
            ))}
          </div>
        )}

        <Tabs value={side} onValueChange={(v) => setSide(v as "BUY" | "SELL")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="BUY" className="gap-2" data-testid="tab-buy">
              <ArrowUpRight className="h-4 w-4" />
              Buy
            </TabsTrigger>
            <TabsTrigger value="SELL" className="gap-2" data-testid="tab-sell">
              <ArrowDownRight className="h-4 w-4" />
              Sell
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="quantity">Shares</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleMaxClick}
              data-testid="button-max"
            >
              Max
            </Button>
          </div>
          <Input
            id="quantity"
            type="number"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="1"
            max="1000"
            data-testid="input-quantity"
          />
        </div>

        <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Price per share</span>
            <span className="font-mono font-medium">
              {isPredictionMarket ? `${Math.round(currentPrice * 100)}¢` : `$${currentPrice.toFixed(2)}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{side === "BUY" ? "Total cost" : "Proceeds"}</span>
            <span className="font-mono font-medium">${total.toFixed(2)}</span>
          </div>
          {isPredictionMarket && side === "BUY" && qtyInRange && (
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Potential payout</span>
              <span className="font-mono font-medium text-green-600 dark:text-green-400">
                ${grossPayout.toFixed(2)}
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Orders fill at the current market price, which may move with your trade.
          </p>
        </div>

        {user && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" />
              <span>
                Balance: <span className="font-mono font-medium">${user.balance.toFixed(2)}</span>
              </span>
            </div>
            {ownedShares > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4" />
                <span>
                  Owned: <span className="font-mono font-medium">{ownedShares} shares</span>
                </span>
              </div>
            )}
          </div>
        )}

        <Button
          className="w-full"
          disabled={!canTrade || tradeMutation.isPending}
          onClick={() => tradeMutation.mutate()}
          data-testid="button-execute-trade"
        >
          {tradeMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              {side === "BUY" ? "Buy" : "Sell"} {qty > 0 ? `${qty} shares` : "Shares"}
            </>
          )}
        </Button>

        {!user && (
          <p className="text-center text-sm text-muted-foreground">
            Please log in to trade
          </p>
        )}

        {user && user.status !== "VERIFIED" && (
          <p className="text-center text-sm text-destructive">
            Please verify your email to trade
          </p>
        )}
      </CardContent>
    </Card>
  );
}
