import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Brain,
  Sparkles,
  TrendingUp,
  BarChart3,
  Clock,
  Target,
  Zap,
  Lock,
  CheckCircle,
} from "lucide-react";

const MK_AI_PRICE = 10000;

export default function MkAi() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: accessData, isLoading: accessLoading } = useQuery<{ hasAccess: boolean }>({
    queryKey: ["/api/mk-ai/access"],
    enabled: !!user,
  });

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mk-ai/purchase", {});
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Welcome to MK AI!",
        description: "You now have access to AI-powered trading insights.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mk-ai/access"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Purchase failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const hasAccess = accessData?.hasAccess ?? false;
  const canAfford = (user?.balance ?? 0) >= MK_AI_PRICE;

  const features = [
    {
      icon: TrendingUp,
      title: "Stock Predictions",
      description: "AI-powered analysis of which stocks to buy and sell based on market trends and patterns.",
    },
    {
      icon: Clock,
      title: "Timing Insights",
      description: "Know exactly when to enter or exit positions for maximum profit potential.",
    },
    {
      icon: Target,
      title: "Market Analysis",
      description: "Deep insights into prediction markets with probability calculations and outcome forecasting.",
    },
    {
      icon: BarChart3,
      title: "Portfolio Optimization",
      description: "Personalized recommendations to balance your portfolio and manage risk effectively.",
    },
    {
      icon: Zap,
      title: "Real-time Alerts",
      description: "Get instant notifications when AI detects profitable trading opportunities.",
    },
    {
      icon: Sparkles,
      title: "Strategy Builder",
      description: "Create custom trading strategies powered by machine learning algorithms.",
    },
  ];

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md text-center">
          <CardContent className="pt-6">
            <Brain className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Sign in to access MK AI</h2>
            <p className="mt-2 text-muted-foreground">
              Get AI-powered trading insights to boost your portfolio
            </p>
            <Link href="/login">
              <Button className="mt-4" data-testid="button-login-mk-ai">Log In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accessLoading) {
    return (
      <div className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="mt-8 h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
            <Brain className="h-5 w-5 text-primary" />
            <span className="font-medium text-primary">Powered by AI</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            MK AI
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Supercharge your trading with artificial intelligence. Get predictive insights,
            timing recommendations, and portfolio optimization powered by advanced algorithms.
          </p>
        </div>

        {hasAccess ? (
          <Card className="mb-8 border-primary/50 bg-primary/5">
            <CardContent className="flex items-center gap-4 py-6">
              <CheckCircle className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-semibold text-lg">You have MK AI access!</h3>
                <p className="text-muted-foreground">
                  AI features are now active. Check out the insights below.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-8 border-2 border-dashed">
            <CardContent className="py-8 text-center">
              <Lock className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-xl font-semibold">Unlock MK AI</h3>
              <p className="mt-2 text-muted-foreground">
                One-time purchase for lifetime access to all AI features
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <span className="font-mono text-3xl font-bold" data-testid="text-price-mk-ai">
                  {formatCurrency(MK_AI_PRICE)}
                </span>
                <Badge variant="secondary">Play Money</Badge>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Your balance: <span className="font-mono font-medium">{formatCurrency(user.balance)}</span>
              </div>
              <Button
                className="mt-6"
                size="lg"
                onClick={() => purchaseMutation.mutate()}
                disabled={!canAfford || purchaseMutation.isPending}
                data-testid="button-purchase-mk-ai"
              >
                {purchaseMutation.isPending ? (
                  "Processing..."
                ) : !canAfford ? (
                  "Insufficient Balance"
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Purchase MK AI
                  </>
                )}
              </Button>
              {!canAfford && (
                <p className="mt-3 text-sm text-muted-foreground">
                  You need {formatCurrency(MK_AI_PRICE - user.balance)} more to purchase
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Card
              key={index}
              className={!hasAccess ? "opacity-60" : ""}
              data-testid={`card-feature-${index}`}
            >
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {feature.description}
                </CardDescription>
                {!hasAccess && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    <span>Unlock to access</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {hasAccess && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Insights Dashboard
              </CardTitle>
              <CardDescription>
                Your personalized trading recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Brain className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 font-semibold">AI Analysis Coming Soon</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Our AI is analyzing market patterns and will provide personalized
                  insights based on your trading history and current market conditions.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
