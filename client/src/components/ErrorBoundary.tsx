import { Component, type ErrorInfo, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary. Catches render/runtime errors anywhere in the
 * subtree so a bad payload (e.g. a malformed Gamma/Polymarket response) can't
 * white-screen the whole app. Mount this near the root (client-core mounts it
 * around the router in App/main).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                An unexpected error occurred while rendering this page. You can try
                again or return to the home page.
              </p>
              {this.state.error?.message && (
                <p className="mt-3 break-words rounded-md bg-muted px-3 py-2 text-left font-mono text-xs text-muted-foreground">
                  {this.state.error.message}
                </p>
              )}
              <div className="mt-6 flex justify-center gap-2">
                <Button variant="outline" onClick={this.handleReset}>
                  Try again
                </Button>
                <Button
                  onClick={() => {
                    this.handleReset();
                    window.location.assign("/");
                  }}
                >
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
