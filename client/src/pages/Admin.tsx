import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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
  Eye,
  EyeOff,
  Ban,
  Loader2,
} from "lucide-react";
import type { User, Market, Report } from "@shared/schema";

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();

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

        <div className="mb-8 grid gap-4 md:grid-cols-3">
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
                        className="flex items-start justify-between gap-4 rounded-lg border p-4"
                      >
                        <div>
                          <div className="flex items-center gap-2">
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
                        className="flex items-center justify-between gap-4 rounded-lg border p-4"
                      >
                        <div>
                          <div className="flex items-center gap-2">
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
        </Tabs>
      </div>
    </div>
  );
}
