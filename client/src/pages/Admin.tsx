import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Users,
  Flag,
  CheckCircle,
  XCircle,
  AlertTriangle,
  EyeOff,
  Ban,
  Loader2,
  Calendar,
  Plus,
  Trash2,
  Trophy,
  Download,
  ExternalLink,
  Upload,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { User, Market, Report, Game, MarketWithDetails, PolymarketLink } from "@shared/schema";

const SPORTS = [
  "BASKETBALL",
  "FOOTBALL",
  "SOCCER",
  "BASEBALL",
  "VOLLEYBALL",
  "TENNIS",
  "SWIMMING",
  "TRACK",
  "OTHER",
] as const;

const COMMON_OPPONENTS = [
  "Sacred Heart Prep",
  "Pinewood",
  "Woodside Priory",
  "Eastside Prep",
  "Harker",
  "Crystal Springs Uplands",
  "Castilleja",
  "Notre Dame (Belmont)",
];

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreateGameOpen, setIsCreateGameOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [scoreDialogOpen, setScoreDialogOpen] = useState<string | null>(null);
  const [menloScore, setMenloScore] = useState("");
  const [opponentScore, setOpponentScore] = useState("");
  const getDefaultGameDate = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(19, 0, 0, 0);
    return nextWeek.toISOString().slice(0, 16);
  };

  const [newGame, setNewGame] = useState({
    sport: "BASKETBALL" as typeof SPORTS[number],
    opponent: "",
    isHome: true,
    gameDate: getDefaultGameDate(),
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: user?.role === "ADMIN",
  });

  const { data: reports, isLoading: reportsLoading } = useQuery<Report[]>({
    queryKey: ["/api/admin/reports"],
    enabled: user?.role === "ADMIN",
  });

  const { data: pendingMarkets, isLoading: marketsLoading } = useQuery<Market[]>({
    queryKey: ["/api/admin/markets/pending"],
    enabled: user?.role === "ADMIN",
  });

  const { data: games, isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ["/api/admin/games"],
    enabled: user?.role === "ADMIN",
  });

  interface PolymarketEvent {
    id: string;
    title: string;
    description?: string;
    slug: string;
    image?: string;
  }

  interface ImportedMarket extends MarketWithDetails {
    polymarketLink?: PolymarketLink;
  }

  const { data: polymarketEvents, isLoading: polymarketEventsLoading } = useQuery<PolymarketEvent[]>({
    queryKey: ["/api/polymarket/sports"],
    enabled: user?.role === "ADMIN",
  });

  const { data: importedMarkets, isLoading: importedMarketsLoading } = useQuery<ImportedMarket[]>({
    queryKey: ["/api/polymarket-markets"],
    enabled: user?.role === "ADMIN",
  });

  const suspendUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/suspend`, {});
      if (!res.ok) throw new Error("Failed to suspend user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User suspended" });
    },
  });

  const resolveReportMutation = useMutation({
    mutationFn: async ({ reportId, action }: { reportId: string; action: string }) => {
      const res = await apiRequest("POST", `/api/admin/reports/${reportId}/resolve`, { action });
      if (!res.ok) throw new Error("Failed to resolve report");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      toast({ title: "Report resolved" });
    },
  });

  const createGameMutation = useMutation({
    mutationFn: async (gameData: typeof newGame) => {
      const res = await apiRequest("POST", "/api/admin/games", gameData);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create game");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
      toast({ title: "Game created" });
      setIsCreateGameOpen(false);
      setNewGame({ sport: "BASKETBALL", opponent: "", isHome: true, gameDate: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createMarketMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const res = await apiRequest("POST", `/api/admin/games/${gameId}/create-market`, {});
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create market");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/markets"] });
      toast({ title: "Market created for game" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateScoreMutation = useMutation({
    mutationFn: async ({ gameId, menloScore, opponentScore }: { gameId: string; menloScore: number; opponentScore: number }) => {
      const res = await apiRequest("POST", `/api/admin/games/${gameId}/score`, { menloScore, opponentScore });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update score");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/markets"] });
      toast({ title: "Score updated and market resolved" });
      setScoreDialogOpen(null);
      setMenloScore("");
      setOpponentScore("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteGameMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/games/${gameId}`, {});
      if (!res.ok) throw new Error("Failed to delete game");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
      toast({ title: "Game deleted" });
    },
  });

  const importPolymarketMutation = useMutation({
    mutationFn: async (event: PolymarketEvent) => {
      const res = await apiRequest("POST", "/api/admin/import-polymarket", {
        title: event.title,
        description: event.description,
        slug: event.slug,
        eventId: event.id,
        image: event.image,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to import event");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket-markets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/markets"] });
      toast({ title: "Event imported successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: async (games: Array<{ sport: string; opponent: string; isHome: boolean; gameDate: string }>) => {
      const res = await apiRequest("POST", "/api/admin/games/import-csv", { games });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to import games");
      }
      return res.json();
    },
    onSuccess: (data: { imported: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/games"] });
      toast({ title: `Imported ${data.imported} of ${data.total} games` });
      setIsCsvImportOpen(false);
      setCsvText("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCsvImport = () => {
    const lines = csvText.trim().split("\n").filter(line => line.trim());
    if (lines.length === 0) {
      toast({ title: "No data to import", variant: "destructive" });
      return;
    }

    const games = [];
    for (const line of lines) {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length < 4) {
        toast({ title: "Invalid CSV format", description: `Line "${line}" does not have 4 fields`, variant: "destructive" });
        return;
      }

      const [sport, opponent, homeAway, gameDate] = parts;
      const sportUpper = sport.toUpperCase();
      if (!SPORTS.includes(sportUpper as typeof SPORTS[number])) {
        toast({ title: "Invalid sport", description: `"${sport}" is not a valid sport`, variant: "destructive" });
        return;
      }

      const isHome = homeAway.toLowerCase() === "home" || homeAway.toLowerCase() === "true";

      games.push({
        sport: sportUpper,
        opponent,
        isHome,
        gameDate,
      });
    }

    importCsvMutation.mutate(games);
  };

  const getImportedEventIds = () => {
    if (!importedMarkets) return new Set<string>();
    return new Set(
      importedMarkets
        .filter((m) => m.polymarketLink)
        .map((m) => m.polymarketLink!.polymarketEventId)
    );
  };

  const handleCreateGame = () => {
    if (!newGame.opponent || !newGame.gameDate) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    createGameMutation.mutate(newGame);
  };

  const handleUpdateScore = (gameId: string) => {
    const mScore = parseInt(menloScore);
    const oScore = parseInt(opponentScore);
    if (isNaN(mScore) || isNaN(oScore) || mScore < 0 || oScore < 0) {
      toast({ title: "Please enter valid scores", variant: "destructive" });
      return;
    }
    updateScoreMutation.mutate({ gameId, menloScore: mScore, opponentScore: oScore });
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md text-center">
          <CardContent className="pt-6">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
            <p className="mt-2 text-muted-foreground">
              You need admin privileges to access this page.
            </p>
            <Link href="/">
              <Button className="mt-4">Go Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Admin Panel</h1>
            <p className="text-muted-foreground">Manage users, reports, and content</p>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users?.length ?? 0}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10">
                <Flag className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {reports?.filter((r) => r.status === "PENDING").length ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Pending Reports</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-500/10">
                <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingMarkets?.length ?? 0}</p>
                <p className="text-sm text-muted-foreground">Pending Approvals</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
                <Calendar className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{games?.length ?? 0}</p>
                <p className="text-sm text-muted-foreground">Games</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="reports">
          <TabsList>
            <TabsTrigger value="reports" className="gap-2" data-testid="tab-admin-reports">
              <Flag className="h-4 w-4" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2" data-testid="tab-admin-users">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="games" className="gap-2" data-testid="tab-admin-games">
              <Calendar className="h-4 w-4" />
              Games
            </TabsTrigger>
            <TabsTrigger value="polymarket" className="gap-2" data-testid="tab-admin-polymarket">
              <Download className="h-4 w-4" />
              Polymarket Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Reports Queue</CardTitle>
              </CardHeader>
              <CardContent>
                {reportsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-24" />
                    ))}
                  </div>
                ) : !reports?.length ? (
                  <div className="py-8 text-center">
                    <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                    <p className="mt-4 text-muted-foreground">No pending reports</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reports.map((report) => (
                      <div
                        key={report.id}
                        className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={report.status === "PENDING" ? "default" : "secondary"}>
                              {report.status}
                            </Badge>
                            <Badge variant="outline">{report.targetType}</Badge>
                          </div>
                          <p className="mt-2 text-sm">{report.reason}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Target ID: {report.targetId}
                          </p>
                        </div>
                        {report.status === "PENDING" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                resolveReportMutation.mutate({
                                  reportId: report.id,
                                  action: "dismiss",
                                })
                              }
                              disabled={resolveReportMutation.isPending}
                              data-testid={`button-dismiss-report-${report.id}`}
                            >
                              <XCircle className="mr-1 h-4 w-4" />
                              Dismiss
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                resolveReportMutation.mutate({
                                  reportId: report.id,
                                  action: "hide",
                                })
                              }
                              disabled={resolveReportMutation.isPending}
                              data-testid={`button-hide-content-${report.id}`}
                            >
                              <EyeOff className="mr-1 h-4 w-4" />
                              Hide Content
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {users?.map((u) => (
                      <div
                        key={u.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{u.displayName}</span>
                            <Badge
                              variant={
                                u.status === "VERIFIED"
                                  ? "default"
                                  : u.status === "SUSPENDED"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {u.status}
                            </Badge>
                            {u.role === "ADMIN" && (
                              <Badge variant="outline">Admin</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                          <p className="text-sm text-muted-foreground">
                            Balance: ${u.balance}
                          </p>
                        </div>
                        {u.role !== "ADMIN" && u.status !== "SUSPENDED" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => suspendUserMutation.mutate(u.id)}
                            disabled={suspendUserMutation.isPending}
                            data-testid={`button-suspend-user-${u.id}`}
                          >
                            {suspendUserMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Ban className="mr-1 h-4 w-4" />
                                Suspend
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="games" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>Games Management</CardTitle>
                <div className="flex gap-2">
                  <Dialog open={isCsvImportOpen} onOpenChange={setIsCsvImportOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" data-testid="button-import-csv">
                        <Upload className="mr-1 h-4 w-4" />
                        Import CSV
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Import Games from CSV</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>CSV Data</Label>
                          <Textarea
                            value={csvText}
                            onChange={(e) => setCsvText(e.target.value)}
                            placeholder="BASKETBALL,Sacred Heart Prep,home,2026-01-25T19:00"
                            className="min-h-[150px] font-mono text-sm"
                            data-testid="textarea-csv-import"
                          />
                          <p className="text-sm text-muted-foreground">
                            Format: sport,opponent,home/away,date
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Example: BASKETBALL,Sacred Heart Prep,home,2026-01-25T19:00
                          </p>
                        </div>
                        <Button
                          onClick={handleCsvImport}
                          disabled={importCsvMutation.isPending}
                          className="w-full"
                          data-testid="button-submit-csv-import"
                        >
                          {importCsvMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Import Games"
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={isCreateGameOpen} onOpenChange={setIsCreateGameOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-create-game">
                        <Plus className="mr-1 h-4 w-4" />
                        Add Game
                      </Button>
                    </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Game</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="sport">Sport</Label>
                        <Select
                          value={newGame.sport}
                          onValueChange={(value) => setNewGame({ ...newGame, sport: value as typeof SPORTS[number] })}
                        >
                          <SelectTrigger data-testid="select-sport">
                            <SelectValue placeholder="Select sport" />
                          </SelectTrigger>
                          <SelectContent>
                            {SPORTS.map((sport) => (
                              <SelectItem key={sport} value={sport}>
                                {sport.charAt(0) + sport.slice(1).toLowerCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Quick Select Opponent</Label>
                        <div className="flex flex-wrap gap-2">
                          {COMMON_OPPONENTS.map((opponent) => (
                            <Button
                              key={opponent}
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setNewGame({ ...newGame, opponent })}
                              data-testid={`preset-${opponent.replace(/\s+/g, '-').toLowerCase()}`}
                            >
                              {opponent}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="opponent">Opponent</Label>
                        <Input
                          id="opponent"
                          value={newGame.opponent}
                          onChange={(e) => setNewGame({ ...newGame, opponent: e.target.value })}
                          placeholder="e.g., Sacred Heart Prep"
                          data-testid="input-opponent"
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <Label htmlFor="isHome">Home Game</Label>
                        <Switch
                          id="isHome"
                          checked={newGame.isHome}
                          onCheckedChange={(checked) => setNewGame({ ...newGame, isHome: checked })}
                          data-testid="switch-home-away"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gameDate">Game Date & Time</Label>
                        <Input
                          id="gameDate"
                          type="datetime-local"
                          value={newGame.gameDate}
                          onChange={(e) => setNewGame({ ...newGame, gameDate: e.target.value })}
                          data-testid="input-game-date"
                        />
                      </div>
                      <Button
                        onClick={handleCreateGame}
                        disabled={createGameMutation.isPending}
                        className="w-full"
                        data-testid="button-submit-create-game"
                      >
                        {createGameMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Create Game"
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {gamesLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-20" />
                    ))}
                  </div>
                ) : !games?.length ? (
                  <div className="py-8 text-center">
                    <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 text-muted-foreground">No games scheduled</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {games.map((game) => (
                      <div
                        key={game.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                        data-testid={`game-row-${game.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {game.sport.charAt(0) + game.sport.slice(1).toLowerCase()}
                            </Badge>
                            <span className="font-medium">vs {game.opponent}</span>
                            <Badge variant={game.isHome ? "default" : "secondary"}>
                              {game.isHome ? "Home" : "Away"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatDate(game.gameDate)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                game.status === "COMPLETED"
                                  ? "default"
                                  : game.status === "IN_PROGRESS"
                                  ? "secondary"
                                  : game.status === "CANCELLED"
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {game.status}
                            </Badge>
                            {game.menloScore !== null && game.opponentScore !== null && (
                              <span className="text-sm font-medium">
                                Menlo {game.menloScore} - {game.opponentScore} {game.opponent}
                              </span>
                            )}
                            {game.marketId ? (
                              <Badge variant="secondary">Market Active</Badge>
                            ) : (
                              <Badge variant="outline">No Market</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!game.marketId && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => createMarketMutation.mutate(game.id)}
                              disabled={createMarketMutation.isPending}
                              data-testid={`button-create-market-${game.id}`}
                            >
                              {createMarketMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="mr-1 h-4 w-4" />
                                  Create Market
                                </>
                              )}
                            </Button>
                          )}
                          <Dialog
                            open={scoreDialogOpen === game.id}
                            onOpenChange={(open) => {
                              setScoreDialogOpen(open ? game.id : null);
                              if (!open) {
                                setMenloScore("");
                                setOpponentScore("");
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-enter-score-${game.id}`}
                              >
                                <Trophy className="mr-1 h-4 w-4" />
                                Enter Score
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Enter Final Score</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 pt-4">
                                <div className="space-y-2">
                                  <Label htmlFor="menloScore">Menlo Score</Label>
                                  <Input
                                    id="menloScore"
                                    type="number"
                                    min="0"
                                    value={menloScore}
                                    onChange={(e) => setMenloScore(e.target.value)}
                                    placeholder="0"
                                    data-testid="input-menlo-score"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="opponentScore">{game.opponent} Score</Label>
                                  <Input
                                    id="opponentScore"
                                    type="number"
                                    min="0"
                                    value={opponentScore}
                                    onChange={(e) => setOpponentScore(e.target.value)}
                                    placeholder="0"
                                    data-testid="input-opponent-score"
                                  />
                                </div>
                                <Button
                                  onClick={() => handleUpdateScore(game.id)}
                                  disabled={updateScoreMutation.isPending}
                                  className="w-full"
                                  data-testid="button-submit-score"
                                >
                                  {updateScoreMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Save Score"
                                  )}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteGameMutation.mutate(game.id)}
                            disabled={deleteGameMutation.isPending}
                            data-testid={`button-delete-game-${game.id}`}
                          >
                            {deleteGameMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="polymarket" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Import from Polymarket</CardTitle>
              </CardHeader>
              <CardContent>
                {polymarketEventsLoading || importedMarketsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-20" />
                    ))}
                  </div>
                ) : !polymarketEvents?.length ? (
                  <div className="py-8 text-center">
                    <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 text-muted-foreground">No sports events available from Polymarket</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {polymarketEvents.map((event) => {
                      const importedEventIds = getImportedEventIds();
                      const isImported = importedEventIds.has(event.id);
                      
                      return (
                        <div
                          key={event.id}
                          className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                          data-testid={`polymarket-event-${event.id}`}
                        >
                          <div className="flex items-start gap-3 flex-1">
                            {event.image && (
                              <img
                                src={event.image}
                                alt={event.title}
                                className="h-12 w-12 rounded object-cover"
                              />
                            )}
                            <div className="flex-1">
                              <p className="font-medium line-clamp-1">{event.title}</p>
                              {event.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                  {event.description}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <a
                                  href={`https://polymarket.com/event/${event.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  data-testid={`link-view-polymarket-${event.id}`}
                                >
                                  View on Polymarket
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {isImported ? (
                              <Badge variant="secondary" data-testid={`badge-imported-${event.id}`}>
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Imported
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => importPolymarketMutation.mutate(event)}
                                disabled={importPolymarketMutation.isPending}
                                data-testid={`button-import-${event.id}`}
                              >
                                {importPolymarketMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Download className="mr-1 h-4 w-4" />
                                    Import
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
