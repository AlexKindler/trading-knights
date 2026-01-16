import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Markets from "@/pages/Markets";
import MarketDetail from "@/pages/MarketDetail";
import Stocks from "@/pages/Stocks";
import StockDetail from "@/pages/StockDetail";
import Portfolio from "@/pages/Portfolio";
import LeaderboardPage from "@/pages/LeaderboardPage";
import MkAi from "@/pages/MkAi";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Admin from "@/pages/Admin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/markets" component={Markets} />
      <Route path="/markets/:id" component={MarketDetail} />
      <Route path="/stocks" component={Stocks} />
      <Route path="/stocks/:id" component={StockDetail} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/leaderboard" component={LeaderboardPage} />
      <Route path="/mk-ai" component={MkAi} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <main className="flex-1">
              <Router />
            </main>
            <footer className="border-t py-4 mt-8">
              <div className="container mx-auto px-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Not affiliated or endorsed by Menlo School
                </p>
              </div>
            </footer>
          </div>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
