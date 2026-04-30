import { useState } from 'react';
import { useAppState } from '@/myt/lib/app-context';
import { zones, teamMembers } from '@/myt/lib/mock-data';
import { Lead } from '@/myt/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Plus, Phone, ArrowRight, Sparkles, Zap } from 'lucide-react';
import { useNavigate } from '@/shims/react-router-dom';
import { RequestAccessSheet } from '@/components/leads/RequestAccessSheet';
import { useIdentityStore } from '@/lib/lead-identity/store';
import { QuickAddLeadPanel } from '@/components/leads/QuickAddLeadPanel';

export default function MYTLeadTracker() {
  const { leads, setLeads, currentMemberId } = useAppState();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'quick' | 'manual' | 'requests'>('quick');
  const identityLeadCount = useIdentityStore((s) => s.leads.length);
  const [showForm, setShowForm] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', area: '', budget: '10000',
    moveInDate: '', dateConfirmed: false,
  });

  const myLeads = currentMemberId
    ? leads.filter(l => l.addedBy === currentMemberId)
    : leads;

  const qualified = myLeads.filter(l => l.mytQualified);
  const unqualified = myLeads.filter(l => !l.mytQualified);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const budget = parseInt(form.budget);
    const moveIn = new Date(form.moveInDate);
    const areaCovered = zones.some(z => z.area.toLowerCase() === form.area.toLowerCase());
    const daysToMoveIn = (moveIn.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    const mytQualified = areaCovered && budget >= 7000 && daysToMoveIn <= 15 && form.dateConfirmed;

    const agent = currentMemberId
      ? teamMembers.find(m => m.id === currentMemberId)
      : teamMembers.find(m => m.role === 'flow-ops');

    const newLead: Lead = {
      id: `l${Date.now()}`,
      name: form.name,
      phone: form.phone,
      area: form.area,
      budget,
      moveInDate: form.moveInDate,
      dateConfirmed: form.dateConfirmed,
      status: mytQualified ? 'qualified' : 'contacted',
      mytQualified,
      addedBy: agent?.id || 'm1',
      addedByName: agent?.name || 'Rahul Sharma',
      createdAt: new Date().toISOString(),
      notes: '',
    };
    setLeads(prev => [newLead, ...prev]);
    toast.success(mytQualified ? 'MYT Qualified! Ready for tour' : 'Lead added — not MYT qualified');
    setForm({ name: '', phone: '', area: '', budget: '10000', moveInDate: '', dateConfirmed: false });
    setShowForm(false);
  };

  const pushToTour = (lead: Lead) => {
    navigate('/myt/schedule', { state: { lead } });
  };

  const selectClass = "w-full h-10 bg-surface-2 border border-border rounded-md px-3 text-sm text-foreground";

  return (
    <div className="space-y-3 animate-slide-up">
      {/* Compact header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-heading font-bold text-foreground leading-tight">MYT Lead Tracker</h1>
          <p className="text-[11px] text-muted-foreground">
            Paste any format · auto-dedup against {identityLeadCount} unified leads
          </p>
        </div>
      </div>

      {/* Mode tabs + inline KPIs */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-border pb-2">
        <div className="flex gap-1 rounded-lg border border-border p-0.5 bg-surface-2/50">
          <button onClick={() => setMode('quick')} className={`px-3 py-1 text-[11px] rounded-md inline-flex items-center gap-1 ${mode === 'quick' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Sparkles className="h-3 w-3" />Quick Add
          </button>
          <button onClick={() => setMode('manual')} className={`px-3 py-1 text-[11px] rounded-md ${mode === 'manual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Manual
          </button>
          <button onClick={() => setMode('requests')} className={`px-3 py-1 text-[11px] rounded-md ${mode === 'requests' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Requests
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-role-tcm/30 bg-role-tcm/10 px-2.5 py-1 text-[11px] text-role-tcm">
            <CheckCircle className="h-3 w-3" />
            <span className="font-semibold">{qualified.length}</span> MYT Qualified
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-[11px] text-danger">
            <XCircle className="h-3 w-3" />
            <span className="font-semibold">{unqualified.length}</span> Not Qualified
          </span>
        </div>
      </div>

      {mode === 'quick' && (
        <div className="rounded-lg border border-border bg-surface-2/40 p-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Unified Quick Add — paste, manual, and dedup all flow through the same questions.
          </p>
          <Button size="sm" onClick={() => setShowQuickAdd(true)} className="h-8 text-xs gap-1.5 shrink-0">
            <Zap className="h-3.5 w-3.5" /> Open Quick Add
          </Button>
        </div>
      )}
      {mode === 'requests' && <RequestAccessSheet />}
      {mode === 'manual' && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="h-8 text-xs gap-1">
            <Plus className="h-3.5 w-3.5" /> {showForm ? 'Hide form' : 'Manual MYT form'}
          </Button>
        </div>
      )}

      {/* Add Lead Form */}
      {mode === 'manual' && showForm && (
        <form onSubmit={handleSubmit} className="glass-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-muted-foreground text-xs">Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="bg-surface-2 border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required className="bg-surface-2 border-border" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-muted-foreground text-xs">Area</Label>
              <select value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} className={selectClass}>
                <option value="">Select Area</option>
                {zones.map(z => <option key={z.id} value={z.area}>{z.area}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Budget (₹)</Label>
              <Input type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} className="bg-surface-2 border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Move-in Date</Label>
              <Input type="date" value={form.moveInDate} onChange={e => setForm(f => ({ ...f, moveInDate: e.target.value }))} required className="bg-surface-2 border-border" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={form.dateConfirmed} onChange={e => setForm(f => ({ ...f, dateConfirmed: e.target.checked }))} className="rounded" />
            Date confirmed by lead
          </label>
          <Button type="submit" className="w-full">Add & Qualify Lead</Button>
        </form>
      )}

      {/* Qualified Leads */}
      <div className="glass-card p-3 md:p-5">
        <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold mb-3 text-role-tcm"><CheckCircle className="h-3.5 w-3.5" /> MYT Qualified — Push to Tour</h3>
        <div className="space-y-2">
          {qualified.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No qualified leads yet</p>}
          {qualified.map(l => (
            <div key={l.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-surface-2/50">
              <div className="min-w-0">
                <span className="font-medium text-foreground text-sm">{l.name}</span>
                <span className="text-muted-foreground text-xs ml-2">{l.area} · ₹{l.budget.toLocaleString()}</span>
                <span className="text-muted-foreground text-xs ml-2">Move-in: {l.moveInDate}</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href={`tel:${l.phone}`} className="p-2 rounded-md bg-primary/10 text-primary">
                  <Phone className="h-3.5 w-3.5" />
                </a>
                {l.status !== 'tour-scheduled' && (
                  <Button size="sm" onClick={() => pushToTour(l)} className="h-8 text-xs gap-1">
                    <ArrowRight className="h-3.5 w-3.5" /> Schedule Tour
                  </Button>
                )}
                {l.status === 'tour-scheduled' && (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-role-tcm/15 text-role-tcm">Tour Set</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Unqualified */}
      <div className="glass-card p-3 md:p-5">
        <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold mb-3 text-danger"><XCircle className="h-3.5 w-3.5" /> Not Qualified</h3>
        <div className="space-y-2">
          {unqualified.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">All leads are qualified!</p>}
          {unqualified.map(l => (
            <div key={l.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-surface-2/30">
              <div className="min-w-0">
                <span className="font-medium text-foreground text-sm">{l.name}</span>
                <span className="text-muted-foreground text-xs ml-2">{l.area} · ₹{l.budget.toLocaleString()}</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {l.budget < 7000 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">Low budget</span>}
                {!l.dateConfirmed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning">No date</span>}
                {!zones.some(z => z.area === l.area) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">Area N/A</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      
      <QuickAddLeadPanel open={showQuickAdd} onClose={() => setShowQuickAdd(false)} />
    </div>
  );
}
