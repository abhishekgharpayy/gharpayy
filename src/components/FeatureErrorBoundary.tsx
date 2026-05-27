import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export class FeatureErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("FeatureErrorBoundary caught an error:", error, errorInfo);
    // Here we could report to Sentry / Datadog
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-danger/20 bg-danger/5 space-y-4">
          <div className="h-12 w-12 rounded-full bg-danger/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-danger" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-danger">Impact Queue is temporarily unavailable</h3>
            <p className="text-xs text-muted-foreground max-w-[300px] mx-auto">
              {this.state.error?.message || "An unexpected error occurred while loading this feature."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-danger/40 text-danger hover:bg-danger/10 gap-2"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RotateCcw className="h-3 w-3" /> Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
