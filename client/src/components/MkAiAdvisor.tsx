import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Bot, Send, Loader2, Sparkles, Lock, TrendingUp, Trophy } from "lucide-react";
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
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

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
      let assistantMessage = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                assistantMessage += data.content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    role: "assistant",
                    content: assistantMessage,
                  };
                  return newMessages;
                });
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
      // Refresh data after AI completes (in case trades were executed)
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
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
        "What are the best odds right now?",
        "Analyze the current sports markets",
      ]
    : currentStock
    ? [
        `Buy 10 shares of ${currentStock.stockMeta?.ticker}`,
        `Analyze ${currentStock.stockMeta?.ticker} for me`,
        "What's in my portfolio?",
      ]
    : [
        "Buy your top 3 stock picks for me",
        "What's in my portfolio?",
        "Invest $100 for me",
      ];

  if (!user) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5 text-primary" />
          MK AI Advisor
          <Sparkles className="h-4 w-4 text-yellow-500" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasAccess ? (
          <div className="space-y-4 text-center py-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-3">
                <Lock className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div>
              <p className="font-medium">Unlock MK AI Advisor</p>
              <p className="text-sm text-muted-foreground mt-1">
                Get personalized stock tips and sports predictions
              </p>
            </div>
            <Link href="/mk-ai">
              <Button size="sm" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Get MK AI Access
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="h-48 overflow-y-auto rounded-md border bg-muted/30 p-3 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                  <div className="flex items-center gap-2 mb-2">
                    {mode === "sports" ? (
                      <Trophy className="h-5 w-5" />
                    ) : (
                      <TrendingUp className="h-5 w-5" />
                    )}
                    <span className="font-medium">
                      {mode === "sports" ? "Sports Betting Advisor" : "Stock Advisor"}
                    </span>
                  </div>
                  <p className="text-xs">
                    {mode === "sports" 
                      ? "Ask me about sports predictions and betting strategies!"
                      : currentStock 
                        ? `Ask me about ${currentStock.stockMeta?.ticker} or any other stock!`
                        : "Ask me which stocks to buy or sell!"
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
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border"
                      }`}
                    >
                      {msg.content || (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-1">
                {suggestedQuestions.map((q, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setInput(q)}
                    data-testid={`button-suggestion-${i}`}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask MK AI..."
                disabled={isLoading}
                className="text-sm"
                data-testid="input-mk-ai-message"
              />
              <Button
                type="submit"
                size="icon"
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
