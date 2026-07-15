import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  Send,
  Loader2,
  Bot,
  MessageSquare,
  Wallet,
  ArrowRight,
} from "lucide-react";

const MK_AI_PRICE = 10000;

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function MkAi() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !hasAccess) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage },
      { role: "assistant", content: "" },
    ]);
    setIsLoading(true);

    // Replace the trailing (assistant) bubble as tokens/errors arrive.
    const applyAssistant = (content: string) => {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content };
        return next;
      });
    };

    let assistantMessage = "";
    let streamError: string | null = null;

    try {
      const response = await fetch("/api/mk-ai/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, mode: "stock" }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;

      while (reader && !streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") {
            streamDone = true;
            continue;
          }
          try {
            const data = JSON.parse(payload);
            if (data.error) {
              streamError =
                typeof data.error === "string"
                  ? data.error
                  : "MK AI is unavailable right now.";
              streamDone = true;
              break;
            }
            if (data.done) {
              streamDone = true;
              break;
            }
            if (data.content) {
              assistantMessage += data.content;
              applyAssistant(assistantMessage);
            }
          } catch {
            // Skip invalid/partial JSON
          }
        }
      }

      if (streamError) {
        applyAssistant(`⚠️ ${streamError}`);
      } else if (!assistantMessage) {
        applyAssistant("I couldn't generate a response. Please try again.");
      }
    } catch (error) {
      applyAssistant("Sorry, I encountered an error. Please try again.");
    } finally {
      setIsLoading(false);
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/markets"] });
      refreshUser();
    }
  };

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
      description: "AI-powered analysis of which stocks to buy and sell based on market trends.",
    },
    {
      icon: MessageSquare,
      title: "Natural Conversations",
      description: "Just ask in plain English - 'Buy 10 shares of ROBOT' and MK AI will execute it.",
    },
    {
      icon: Target,
      title: "Market Analysis",
      description: "Deep insights into prediction markets with probability calculations.",
    },
    {
      icon: BarChart3,
      title: "Portfolio Optimization",
      description: "Personalized recommendations to balance your portfolio effectively.",
    },
    {
      icon: Zap,
      title: "Instant Execution",
      description: "MK AI can buy and sell stocks for you with a single command.",
    },
    {
      icon: Sparkles,
      title: "Smart Suggestions",
      description: "Get proactive trade recommendations based on market conditions.",
    },
  ];

  const suggestedPrompts = [
    "What stocks should I buy?",
    "Show me my portfolio",
    "Buy 5 shares of your top pick",
    "Analyze the market for me",
  ];

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md text-center border-primary/20 shadow-lg">
          <CardContent className="pt-8 pb-8">
            <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
              <Brain className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Sign in to access MK AI</h2>
            <p className="mt-2 text-muted-foreground">
              Your personal AI trading assistant that can analyze markets and execute trades
            </p>
            <Link href="/login">
              <Button className="mt-6 gap-2" size="lg" data-testid="button-login-mk-ai">
                Log In
                <ArrowRight className="h-4 w-4" />
              </Button>
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
    <div className="min-h-screen px-4 py-8 bg-gradient-to-b from-primary/5 via-background to-background">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 px-4 py-2 border border-primary/20">
            <Brain className="h-5 w-5 text-primary animate-pulse" />
            <span className="font-medium bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">Powered by OpenAI</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            MK AI
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Your personal AI trading assistant. Ask questions, get analysis, and execute trades with natural language.
          </p>
        </div>

        {hasAccess ? (
          <>
            <Card className="mb-6 border-green-500/30 bg-gradient-to-r from-green-500/10 to-emerald-500/5">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">MK AI Active</h3>
                    <p className="text-sm text-muted-foreground">Full access to AI trading assistant</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-medium">{formatCurrency(user.balance)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Main Chat Interface */}
            <Card className="mb-8 border-primary/20 shadow-lg">
              <CardHeader className="border-b bg-muted/30">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  Chat with MK AI
                </CardTitle>
                <CardDescription>
                  Ask questions, get stock recommendations, or execute trades
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[400px] overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Sparkles className="h-8 w-8 text-primary" />
                      </div>
                      <h3 className="font-semibold text-lg mb-2">How can I help you trade?</h3>
                      <p className="text-muted-foreground text-sm max-w-md mb-6">
                        I can analyze stocks, execute trades, and manage your portfolio. Try one of the suggestions below!
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {suggestedPrompts.map((prompt, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            className="text-sm"
                            onClick={() => setInput(prompt)}
                          >
                            {prompt}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted border rounded-bl-md"
                          }`}
                        >
                          {msg.role === "assistant" && (
                            <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                              <Bot className="h-3 w-3" />
                              MK AI
                            </div>
                          )}
                          <p className="text-sm whitespace-pre-wrap">
                            {msg.content || <Loader2 className="h-4 w-4 animate-spin" />}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <div className="border-t p-4 bg-muted/20">
                  <form onSubmit={handleSubmit} className="flex gap-2">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask MK AI anything about trading..."
                      disabled={isLoading}
                      className="flex-1"
                      data-testid="input-mk-ai-chat"
                    />
                    <Button type="submit" disabled={!input.trim() || isLoading} data-testid="button-send-chat">
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="mb-8 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-purple-500/5 shadow-xl">
            <CardContent className="py-10 text-center">
              <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center mb-4 border border-primary/20">
                <Lock className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-2xl font-bold">Unlock MK AI</h3>
              <p className="mt-2 text-muted-foreground max-w-md mx-auto">
                Get your personal AI trading assistant with the power to analyze markets and execute trades automatically
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <span className="font-mono text-4xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent" data-testid="text-price-mk-ai">
                  {formatCurrency(MK_AI_PRICE)}
                </span>
                <Badge variant="secondary" className="text-sm">One-time</Badge>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Your balance: <span className="font-mono font-semibold">{formatCurrency(user.balance)}</span>
              </div>
              <Button
                className="mt-8 gap-2"
                size="lg"
                onClick={() => purchaseMutation.mutate()}
                disabled={!canAfford || purchaseMutation.isPending}
                data-testid="button-purchase-mk-ai"
              >
                {purchaseMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : !canAfford ? (
                  "Insufficient Balance"
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Purchase MK AI
                  </>
                )}
              </Button>
              {!canAfford && (
                <p className="mt-4 text-sm text-muted-foreground">
                  You need <span className="font-mono font-semibold">{formatCurrency(MK_AI_PRICE - user.balance)}</span> more to purchase
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-1">What MK AI Can Do</h2>
          <p className="text-sm text-muted-foreground">Powerful features to supercharge your trading</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Card
              key={index}
              className={`transition-all hover:shadow-md ${!hasAccess ? "opacity-60" : "hover:border-primary/30"}`}
              data-testid={`card-feature-${index}`}
            >
              <CardHeader className="pb-2">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{feature.title}</CardTitle>
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
          <Card className="mt-8 border-primary/20 bg-gradient-to-r from-primary/5 to-purple-500/5">
            <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 py-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Ready to trade?</h3>
                  <p className="text-sm text-muted-foreground">Use MK AI on the trading page for real-time assistance</p>
                </div>
              </div>
              <Link href="/trading">
                <Button className="gap-2">
                  Go to Trading
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
