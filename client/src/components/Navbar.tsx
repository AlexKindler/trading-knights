import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TrendingUp, Wallet, Trophy, Menu, LogOut, User, Shield, Sun, Moon, Brain, Zap, Briefcase } from "lucide-react";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/trading", label: "Trading", icon: Zap },
  { href: "/investments", label: "Investments", icon: Briefcase },
  { href: "/mk-parlay", label: "MK Parlay", icon: Trophy },
  { href: "/portfolio", label: "Wallet", icon: Wallet },
  { href: "/leaderboard", label: "Leaderboard", icon: TrendingUp },
  { href: "/mk-ai", label: "MK AI", icon: Brain },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Restore the saved theme on load. Persist BOTH directions so switching to
  // light sticks across reloads; with no saved preference respect the class
  // the HTML shipped with (index.html defaults to dark).
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    } else if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      setIsDark(document.documentElement.classList.contains("dark"));
    }
  }, []);

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(balance);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="hidden font-semibold sm:inline-block" data-testid="text-logo">Trading Knights</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href + "/");
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                  data-testid={`link-nav-${item.label.toLowerCase()}`}
                >
                  <Link href={item.href}>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
            data-testid="button-theme-toggle"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="sr-only">Toggle theme</span>
          </Button>

          {user ? (
            <>
              <div className="hidden items-center gap-2 rounded-md bg-muted px-3 py-1.5 sm:flex">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-sm font-medium" data-testid="text-balance">
                  {formatBalance(user.balance)}
                </span>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2" data-testid="button-user-menu">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs">
                        {user.displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden lg:inline">{user.displayName}</span>
                    {user.status === "VERIFIED" && (
                      <Badge variant="secondary" className="hidden text-xs lg:inline-flex">
                        Verified
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5 sm:hidden">
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className="font-mono font-medium">{formatBalance(user.balance)}</p>
                  </div>
                  <DropdownMenuSeparator className="sm:hidden" />
                  <DropdownMenuItem asChild>
                    <Link href="/portfolio" className="flex cursor-pointer items-center gap-2">
                      <User className="h-4 w-4" />
                      Wallet
                    </Link>
                  </DropdownMenuItem>
                  {user.role === "ADMIN" && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="flex cursor-pointer items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Admin Panel
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="cursor-pointer text-destructive focus:text-destructive"
                    data-testid="button-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" data-testid="link-login">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm" data-testid="link-register">
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            data-testid="button-mobile-menu"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t bg-background p-4 lg:hidden">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={isActive ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2"
                  data-testid={`link-mobile-nav-${item.label.toLowerCase()}`}
                >
                  <Link href={item.href} onClick={() => setMobileMenuOpen(false)}>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
