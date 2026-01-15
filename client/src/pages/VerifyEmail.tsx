import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Mail, CheckCircle, XCircle, RefreshCw } from "lucide-react";

export default function VerifyEmail() {
  const { user, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [status, setStatus] = useState<"pending" | "verifying" | "success" | "error">("pending");
  const [isResending, setIsResending] = useState(false);

  const token = new URLSearchParams(search).get("token");

  useEffect(() => {
    if (token) {
      verifyToken(token);
    }
  }, [token]);

  const verifyToken = async (verificationToken: string) => {
    setStatus("verifying");
    try {
      const res = await apiRequest("POST", "/api/auth/verify-email", { token: verificationToken });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Verification failed");
      }
      setStatus("success");
      await refreshUser();
      toast({
        title: "Email verified!",
        description: "Your account is now active. You received $1,000 to start trading!",
      });
      setTimeout(() => setLocation("/"), 2000);
    } catch (error) {
      setStatus("error");
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Invalid or expired token",
        variant: "destructive",
      });
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      const res = await apiRequest("POST", "/api/auth/resend-verification", {});
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to resend");
      }
      toast({
        title: "Verification email sent!",
        description: "Please check your inbox.",
      });
    } catch (error) {
      toast({
        title: "Failed to resend",
        description: error instanceof Error ? error.message : "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  if (user?.status === "VERIFIED") {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
            <h2 className="mt-4 text-2xl font-semibold">Already Verified!</h2>
            <p className="mt-2 text-muted-foreground">
              Your email has been verified. You can start trading now.
            </p>
            <Button className="mt-6" onClick={() => setLocation("/")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "verifying") {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <Loader2 className="mx-auto h-16 w-16 animate-spin text-primary" />
            <h2 className="mt-4 text-2xl font-semibold">Verifying your email...</h2>
            <p className="mt-2 text-muted-foreground">Please wait a moment.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
            <h2 className="mt-4 text-2xl font-semibold">Email Verified!</h2>
            <p className="mt-2 text-muted-foreground">
              You received $1,000 play money to start trading. Redirecting...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error" && token) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <XCircle className="mx-auto h-16 w-16 text-red-500" />
            <h2 className="mt-4 text-2xl font-semibold">Verification Failed</h2>
            <p className="mt-2 text-muted-foreground">
              This verification link is invalid or has expired.
            </p>
            <Button className="mt-6" onClick={handleResend} disabled={isResending}>
              {isResending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend Verification Email
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            We sent a verification link to your Menlo School email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Click the link in your email to verify your account and receive{" "}
            <strong>$1,000 play money</strong> to start trading.
          </p>

          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm font-medium">Dev Mode</p>
            <p className="mt-1 text-xs text-muted-foreground">
              If email sending is not configured, check the server logs for the verification link.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-4">
            <Button variant="outline" onClick={handleResend} disabled={isResending}>
              {isResending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend Verification Email
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
