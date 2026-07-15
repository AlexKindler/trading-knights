import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Bot, Send, Loader2, Sparkles, Lock, TrendingUp, Trophy, Brain, Zap } from "lucide-react";
import type { MarketWithDetails } from "@shared/schema";
import { Link } from "wouter";

interface MkAiAdvisorProps {
  currentStock?: MarketWithDetails;
  mode?: "stock" | "sports";
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function MkAiAdvisor({ currentStock, mode = "stock" }: MkAiAdvisorProps) {
  const { user, refreshUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: accessData } = useQuery<{ hasAccess: boolean }>({
    queryKey: ["/api/mk-ai/access"],
    enabled: !!user,
  });

  const hasAccess = accessData?.hasAccess ?? false;

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
        body: JSON.stringify({
          message: userMessage,
          stockId: currentStock?.id,
          mode,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

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
      // Refresh data after AI completes (in case trades were executed)
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/markets"] });
      if (currentStock?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/markets", currentStock.id] });
      }
      refreshUser();
    }
  };

  const suggestedQuestions = mode === "sports"
    ? [
        "Which team should I bet on?",
        "Best odds right now?",
        "Analyze sports markets",
      ]
    : currentStock
    ? [
        `Buy 10 ${currentStock.stockMeta?.ticker}`,
        `Analyze ${currentStock.stockMeta?.ticker}`,
        "My portfolio?",
      ]
    : [
        "Buy top 3 picks",
        "Show portfolio",
        "Invest $100",
      ];

  if (!user) {
    return null;
  }

  return (
    <Card className="mt-4 border-primary/20 shadow-lg overflow-hidden">
      <CardHeader className="pb-2 bg-gradient-to-r from-primary/10 to-purple-500/5 border-b">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-base">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <span>MK AI</span>
            {hasAccess && (
              <Badge variant="secondary" className="text-xs gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                <Zap className="h-2.5 w-2.5" />
                Active
              </Badge>
            )}
          </div>
          {hasAccess && (
            <Link href="/mk-ai">
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Full Chat
              </Button>
            </Link>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!hasAccess ? (
          <div className="p-6 text-center bg-gradient-to-b from-background to-muted/20">
            <div className="flex justify-center mb-3">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/10 flex items-center justify-center border border-primary/20">
                <Lock className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="font-semibold mb-1">Unlock AI Trading Assistant</p>
            <p className="text-xs text-muted-foreground mb-4">
              Get real-time analysis and execute trades with AI
            </p>
            <Link href="/mk-ai">
              <Button size="sm" className="gap-2 shadow-lg shadow-primary/20">
                <Sparkles className="h-3.5 w-3.5" />
                Get MK AI Access
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="h-52 overflow-y-auto p-3 space-y-2 bg-muted/20">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    {mode === "sports" ? (
                      <Trophy className="h-5 w-5 text-primary" />
                    ) : (
                      <TrendingUp className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <p className="text-sm font-medium mb-1">
                    {mode === "sports" ? "Sports Advisor" : "Stock Advisor"}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-[200px]">
                    {currentStock
                      ? `Ask about ${currentStock.stockMeta?.ticker} or execute trades`
                      : "Ask for recommendations or execute trades"
                    }
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-background border rounded-bl-sm shadow-sm"
                      }`}
                    >
                      {msg.role === "assistant" && !msg.content && (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span className="text-xs text-muted-foreground">Thinking...</span>
                        </div>
                      )}
                      {msg.content && (
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {messages.length === 0 && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                {suggestedQuestions.map((q, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="text-xs h-6 px-2 rounded-full"
                    onClick={() => setInput(q)}
                    data-testid={`button-suggestion-${i}`}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t bg-background">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask MK AI..."
                disabled={isLoading}
                className="text-sm h-9"
                data-testid="input-mk-ai-message"
              />
              <Button
                type="submit"
                size="sm"
                className="h-9 w-9 p-0"
                disabled={!input.trim() || isLoading}
                data-testid="button-send-mk-ai"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
