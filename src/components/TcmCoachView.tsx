import { useEffect, useState } from "react";
import { Sparkles, Calendar, User, Briefcase, Info, RefreshCw, Building } from "lucide-react";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface AIAdvice {
  advice: string;
  tours: { tourId: string; briefing: string }[];
}

export function TcmCoachView({ compact }: { compact?: boolean }) {
  const [advice, setAdvice] = useState<AIAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  
  const currentTcmId = useApp((s) => s.currentTcmId);
  const tcms = useApp((s) => s.tcms);
  const tours = useApp((s) => s.tours);
  const leads = useApp((s) => s.leads);
  const properties = useApp((s) => s.properties);
  const role = useApp((s) => s.role);

  const myName = tcms.find(t => t.id === currentTcmId)?.name || "there";

  const fetchAdvice = async () => {
    setLoading(true);
    try {
      // Filter tours assigned to this TCM
      const myTours = tours.filter(t => t.assignedTo === currentTcmId || t.tcmId === currentTcmId);
      const myLeads = leads.filter(l => myTours.some(t => t.leadId === l.id));

      const res = await api.ai.getCoachAdvice({ tours: myTours, leads: myLeads, role, userName: myName });
      setAdvice(res);
    } catch (err) {
      console.error("Failed to fetch AI advice", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentTcmId) {
      fetchAdvice();
    }
  }, [currentTcmId, tours.length]);

  return (
    <div className={cn("space-y-4", compact && "text-[13px]")}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Daily Briefing
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Personalized insights for your scheduled tours.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAdvice} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <ScrollArea className={cn(compact ? "h-[500px]" : "h-[600px]")}>
        {loading && !advice ? (
          <div className="space-y-4 animate-pulse pr-4 mt-4">
            <div className="h-20 bg-muted rounded-md" />
            <div className="h-32 bg-muted rounded-md" />
            <div className="h-32 bg-muted rounded-md" />
          </div>
        ) : advice ? (
          <div className="space-y-6 mt-4 pr-4">
            <div className="bg-primary/5 border border-primary/10 rounded-lg p-5 shadow-sm">
              <h3 className="font-semibold flex items-center gap-2 text-primary mb-3">
                <Briefcase className="h-4 w-4" /> Strategy for Today
              </h3>
              <p className="text-[15px] leading-relaxed text-foreground/90">{advice.advice}</p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                Tour Action Plans
              </h3>
              {advice.tours.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No tours scheduled for today.</p>
                </div>
              ) : (
                advice.tours.map((t, idx) => {
                  const tourData = tours.find(x => x.id === t.tourId);
                  const leadData = leads.find(l => l.id === tourData?.leadId);
                  
                  return (
                    <div key={idx} className="border border-border rounded-lg p-4 bg-card shadow-sm">
                      <div className="flex items-start justify-between mb-3 border-b border-border pb-3">
                        <div>
                          <div className="font-medium text-base flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {leadData?.name || "Unknown Lead"}
                          </div>
                            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5" />
                              {tourData?.scheduledAt ? (
                                <>
                                  {new Date(tourData.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(tourData.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </>
                              ) : "Unknown Date/Time"}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                              <Building className="h-3.5 w-3.5" />
                              {tourData?.propertyId ? properties.find(p => p.id === tourData.propertyId)?.name || tourData.propertyId : "Unknown Property"}
                            </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 items-start">
                        <Info className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                        <p className="text-sm leading-relaxed text-foreground">
                          {t.briefing}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* General Pro Tip for TCMs */}
            <div className="mt-8 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" /> Quick Pro-Tip
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                Always follow up within 15 minutes after a tour ends while the experience is still fresh in the client's mind.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Failed to load briefing.
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
