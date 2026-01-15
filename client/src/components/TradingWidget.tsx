import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";

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

  const isPredictionMarket = market.type === "PREDICTION";
  const selectedOutcome = market.outcomes?.find((o) => o.id === selectedOutcomeId);
  const currentPrice = isPredictionMarket
    ? selectedOutcome?.currentPrice ?? 0.5
    : market.stockMeta?.currentPrice ?? 10;

  const qty = parseInt(quantity) || 0;
  const total = qty * currentPrice;
  const estimatedReturn = isPredictionMarket ? qty * 1 - total : 0;

  const tradeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/trades", {
        marketId: market.id,
        outcomeId: selectedOutcomeId,
        side,
        qty,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Trade failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Trade executed!",
        description: `Successfully ${side === "BUY" ? "bought" : "sold"} ${qty} shares`,
      });
      setQuantity("");
      refreshUser();
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
    const maxQty = Math.floor(user.balance / currentPrice);
    setQuantity(Math.min(maxQty, 1000).toString());
  };

  const canTrade = user?.status === "VERIFIED" && qty > 0 && total <= (user?.balance ?? 0);

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
                  ${(outcome.currentPrice * 100).toFixed(0)}¢
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
            <span className="font-mono font-medium">${currentPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total cost</span>
            <span className="font-mono font-medium">${total.toFixed(2)}</span>
          </div>
          {isPredictionMarket && side === "BUY" && qty > 0 && (
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Potential return</span>
              <span className="font-mono font-medium text-green-600 dark:text-green-400">
                +${estimatedReturn.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {user && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span>
              Balance: <span className="font-mono font-medium">${user.balance.toFixed(2)}</span>
            </span>
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
