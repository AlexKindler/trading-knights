import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, Mail, Lock, User, GraduationCap, Shield, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const grades = ["Freshman", "Sophomore", "Junior", "Senior", "Faculty"];

export default function Register() {
  const { register } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [grade, setGrade] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!disclaimerAccepted) {
      setShowDisclaimer(true);
      return;
    }

    setIsLoading(true);

    try {
      await register(email, password, displayName, grade || undefined);
      toast({
        title: "Account created!",
        description: "Please check your email to verify your account.",
      });
      setLocation("/verify-email");
    } catch (error) {
      toast({
        title: "Registration failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisclaimerAccept = () => {
    setDisclaimerAccepted(true);
    setShowDisclaimer(false);
  };

  return (
    <>
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <TrendingUp className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Create an account</CardTitle>
            <CardDescription>
              Join Trading Knights with your Menlo School email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="Your display name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-10"
                    required
                    data-testid="input-display-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@menloschool.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    data-testid="input-email"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Must be a @menloschool.org email address
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    minLength={8}
                    required
                    data-testid="input-password"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="grade">Grade (optional)</Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger data-testid="select-grade">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="Select your grade" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="disclaimer"
                  checked={disclaimerAccepted}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setShowDisclaimer(true);
                    } else {
                      setDisclaimerAccepted(false);
                    }
                  }}
                  data-testid="checkbox-disclaimer"
                />
                <Label htmlFor="disclaimer" className="text-sm leading-tight">
                  I understand this uses <strong>fake money only</strong> for educational purposes.
                  No real gambling, prizes, or cash-outs.
                </Label>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-register">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Log in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDisclaimer} onOpenChange={setShowDisclaimer}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Important Disclaimer
            </DialogTitle>
            <DialogDescription>
              Please read and accept before continuing
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="font-semibold text-yellow-700 dark:text-yellow-400">
                    FAKE MONEY ONLY
                  </p>
                  <p className="mt-1 text-yellow-700 dark:text-yellow-300">
                    This platform uses play money for educational purposes only.
                    There is no real gambling, no cash-outs, and no prizes.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p><strong>By using Trading Knights, you agree that:</strong></p>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>All trading is done with virtual play money only</li>
                <li>This is an educational simulation, not real gambling</li>
                <li>You will not attempt to exchange play money for real value</li>
                <li>You will respect community guidelines and school policies</li>
                <li>You will not create markets about private, harmful, or inappropriate topics</li>
                <li>Your public profile will only show your display name, never your email</li>
              </ul>
            </div>

            <div className="space-y-3">
              <p><strong>Prohibited content includes:</strong></p>
              <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                <li>Markets about self-harm, violence, or doxxing</li>
                <li>Private or personal outcomes about individuals</li>
                <li>Harassment or bullying content</li>
                <li>Anything not related to public, school-sanctioned events</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowDisclaimer(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleDisclaimerAccept} className="flex-1" data-testid="button-accept-disclaimer">
              I Understand & Accept
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
