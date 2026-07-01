import { createFileRoute, redirect } from "@tanstack/react-router";
import { useApp } from "@/lib/store";
import { useAuthUser } from "@/lib/auth-store";
import { useState, useEffect, useMemo } from "react";
import { Award, Trophy, Medal, Zap, Clock, Star, Target, CheckCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { normalizeLeadRecord } from "@/lib/lead-helpers";
import type { Lead, TCM, FollowUp } from "@/lib/types";

export const Route = createFileRoute("/admin/leaderboard")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  component: AdminLeaderboard,
});

function AdminLeaderboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tcms, setTcms] = useState<TCM[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [lRes, tRes, fRes] = await Promise.all([
          api.leads.list({ limit: 2000 }),
          api.tcms.list(),
          api.followUps.list({ limit: 2000 })
        ]);
        setLeads(((lRes?.items || []) as any[]).map(l => normalizeLeadRecord(l)));
        setTcms((tRes || []).map(t => {
          const initials = (t.fullName || t.name || t.username || "TC").substring(0, 2).toUpperCase();
          const name = t.fullName || t.name || t.username || "TCM";
          return { id: t.id, name, initials, zone: t.zones?.[0] || "All", totalLeads: 0, conversionRate: 0, totalTasks: 0, completionRate: 0, avgResponseMins: 0 };
        }));
        setFollowUps((fRes?.items || []) as unknown as FollowUp[]);
      } catch (err) {
        console.error("Failed to fetch leaderboard data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const leaderboard = useMemo(() => {
    const tcmStats = tcms.map(tcm => {
      // 1. Completion Rate Score
      const myTasks = followUps.filter(f => f.tcmId === tcm.id);
      const totalTasks = myTasks.length;
      const completedTasks = myTasks.filter(f => f.done).length;
      const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;
      const completionScore = completionRate * 40; // 40 max points

      // 2. Conversion Score
      const myLeads = leads.filter(l => l.assignedTcmId === tcm.id);
      const totalLeads = myLeads.length;
      const bookedLeads = myLeads.filter(l => l.stage === "booked").length;
      const conversionRate = totalLeads > 0 ? bookedLeads / totalLeads : 0;
      const conversionScore = conversionRate * 40; // 40 max points

      // 3. Response Speed Score (Mocked from conversionRate property in DB to stand-in for response speed if missing)
      const avgResponseMins = tcm.avgResponseMins || 15;
      let responseScore = 20; // 20 max points
      if (avgResponseMins > 5) responseScore -= 5;
      if (avgResponseMins > 15) responseScore -= 5;
      if (avgResponseMins > 60) responseScore -= 10;
      
      const totalScore = Math.round(completionScore + conversionScore + responseScore);

      return {
        ...tcm,
        completionRate: Math.round(completionRate * 100),
        conversionRate: Math.round(conversionRate * 100),
        avgResponseMins,
        totalScore,
        totalLeads,
        totalTasks
      };
    }).sort((a, b) => b.totalScore - a.totalScore);

    return tcmStats;
  }, [tcms, leads, followUps]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Calculating TCM performance scores...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500 pb-12">
      <div className="text-center py-8 bg-gradient-to-r from-orange-600/10 via-amber-600/10 to-yellow-600/10 rounded-2xl border border-border">
        <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-amber-600">
          TCM Performance Leaderboard
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
          Recognizing our top performing Transaction Coordination Managers across deal conversions, task completions, and response speeds.
        </p>
      </div>

      {/* Podium */}
      {leaderboard.length >= 3 && (
        <div className="flex items-end justify-center gap-4 h-64 mt-8">
          {/* 2nd Place */}
          <div className="flex flex-col items-center animate-in slide-in-from-bottom-8 duration-700 delay-100">
            <div className="text-center mb-4">
              <p className="font-bold text-lg text-slate-400">{leaderboard[1].name}</p>
              <p className="text-2xl font-black text-slate-300">{leaderboard[1].totalScore} pts</p>
            </div>
            <div className="w-32 bg-slate-800 rounded-t-lg h-32 flex justify-center pt-4 border-t-4 border-slate-400 shadow-[0_0_15px_rgba(148,163,184,0.3)]">
              <Medal className="w-12 h-12 text-slate-400" />
            </div>
          </div>

          {/* 1st Place */}
          <div className="flex flex-col items-center animate-in slide-in-from-bottom-12 duration-1000 z-10">
            <div className="text-center mb-4">
              <p className="font-bold text-xl text-amber-500">{leaderboard[0].name}</p>
              <p className="text-3xl font-black text-amber-400 drop-shadow-md">{leaderboard[0].totalScore} pts</p>
            </div>
            <div className="w-40 bg-slate-800 rounded-t-lg h-40 flex justify-center pt-4 border-t-4 border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.4)]">
              <Trophy className="w-16 h-16 text-amber-400" />
            </div>
          </div>

          {/* 3rd Place */}
          <div className="flex flex-col items-center animate-in slide-in-from-bottom-4 duration-500 delay-200">
            <div className="text-center mb-4">
              <p className="font-bold text-lg text-amber-700">{leaderboard[2].name}</p>
              <p className="text-2xl font-black text-amber-600">{leaderboard[2].totalScore} pts</p>
            </div>
            <div className="w-32 bg-slate-800 rounded-t-lg h-24 flex justify-center pt-4 border-t-4 border-amber-700 shadow-[0_0_15px_rgba(180,83,9,0.3)]">
              <Award className="w-12 h-12 text-amber-700" />
            </div>
          </div>
        </div>
      )}

      {/* Detailed Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden mt-12">
        <div className="p-5 border-b border-border/50 bg-muted/20">
          <h3 className="font-semibold text-lg flex items-center gap-2 uppercase tracking-wide text-muted-foreground">
            <Target className="w-5 h-5" /> Detailed Rankings
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-6 py-4">Rank</th>
                <th className="px-6 py-4">TCM Name</th>
                <th className="px-6 py-4 text-center">Conversion %</th>
                <th className="px-6 py-4 text-center">Task Completion %</th>
                <th className="px-6 py-4 text-center">Avg Response (mins)</th>
                <th className="px-6 py-4 text-right">Total Points</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((t, index) => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <td className="px-6 py-4 font-bold text-muted-foreground">#{index + 1}</td>
                  <td className="px-6 py-4 font-semibold flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                      {t.initials}
                    </div>
                    {t.name}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-500 px-2 py-1 rounded-full font-mono text-xs font-bold">
                      <Star className="w-3 h-3" /> {t.conversionRate}%
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="inline-flex items-center gap-1 bg-green-500/10 text-green-500 px-2 py-1 rounded-full font-mono text-xs font-bold">
                      <CheckCircle className="w-3 h-3" /> {t.completionRate}%
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-500 px-2 py-1 rounded-full font-mono text-xs font-bold">
                      <Zap className="w-3 h-3" /> {t.avgResponseMins}m
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-black text-lg text-primary">{t.totalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
