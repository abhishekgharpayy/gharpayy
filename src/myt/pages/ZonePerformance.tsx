import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Map as MapIcon, Plus, Pencil, Trash2, Search, CheckSquare, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { api, type Zone } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const ZONE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

type FormState = { name: string; city: string; areas: string; color: string };
const emptyForm: FormState = { name: '', city: 'Bangalore', areas: '', color: ZONE_COLORS[0] };

export default function ZonePerformance() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.zones.list();
      setZones(list);
    } catch (e) {
      console.warn('[ZonePerformance] Failed to fetch zones:', (e as Error).message);
      toast.error('Failed to load zones: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error('Zone name is required');
      return;
    }
    setBusy(true);
    try {
      await api.zones.create({
        name: createForm.name.trim(),
        city: createForm.city.trim(),
        areas: createForm.areas.split(',').map(a => a.trim()).filter(Boolean),
        color: createForm.color,
      });
      toast.success('Zone created');
      setCreateForm(emptyForm);
      setCreateOpen(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (z: Zone) => {
    setEditing(z);
    setEditForm({
      name: z.name || '',
      city: z.city || '',
      areas: (z.areas || []).join(', '),
      color: z.color || ZONE_COLORS[0],
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editing) return;
    if (!editForm.name.trim()) {
      toast.error('Zone name is required');
      return;
    }
    setBusy(true);
    try {
      await api.zones.update(editing.id, {
        name: editForm.name.trim(),
        city: editForm.city.trim(),
        areas: editForm.areas.split(',').map(a => a.trim()).filter(Boolean),
        color: editForm.color,
      });
      toast.success('Zone updated');
      setEditOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (z: Zone) => {
    if (!confirm(`Delete zone "${z.name}"?`)) return;
    try {
      await api.zones.remove(z.id);
      toast.success('Zone deleted');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} selected zone(s)?`)) return;
    for (const id of selectedIds) {
      try {
        await api.zones.remove(id);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setSelectedIds(new Set());
    toast.success('Zones deleted');
    await load();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredZones.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredZones.map(z => z.id)));
    }
  };

  const filteredZones = zones.filter(z => {
    const term = searchTerm.toLowerCase();
    return (
      z.name.toLowerCase().includes(term) ||
      (z.city && z.city.toLowerCase().includes(term)) ||
      (z.areas || []).some(a => a.toLowerCase().includes(term))
    );
  });

  // Chart data from real zones
  const chartData = zones.map(z => ({
    name: z.name,
    areas: (z.areas || []).length,
  }));

  return (
    <div className="space-y-4 md:space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <MapIcon size={20} className="text-accent" /> Zone Performance
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Manage geographic zones & team routing</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 text-xs rounded-xl">
              <Plus size={12} /> New Zone
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Zone</DialogTitle>
              <DialogDescription>Create a new zone to organize your leads and properties.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Zone name (e.g. Marathahalli Cluster)"
                value={createForm.name}
                onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                className="text-xs"
              />
              <Input
                placeholder="City"
                value={createForm.city}
                onChange={e => setCreateForm({ ...createForm, city: e.target.value })}
                className="text-xs"
              />
              <Input
                placeholder="Areas (comma-separated: Marathahalli, Varthur, Kundalahalli)"
                value={createForm.areas}
                onChange={e => setCreateForm({ ...createForm, areas: e.target.value })}
                className="text-xs"
              />
              <div className="flex gap-2">
                {ZONE_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`color ${c}`}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${createForm.color === c ? 'scale-125 border-foreground' : 'border-transparent'}`}
                    style={{ background: c }}
                    onClick={() => setCreateForm({ ...createForm, color: c })}
                  />
                ))}
              </div>
              <Button className="w-full text-xs" onClick={handleCreate} disabled={busy}>
                {busy ? 'Creating...' : 'Create Zone'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bar Chart — Zones Overview */}
      {zones.length > 0 && (
        <div className="glass-card p-3 md:p-5">
          <h3 className="font-heading font-semibold text-xs md:text-sm mb-3 text-foreground">Zones Overview</h3>
          <div className="h-48 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fill: 'hsl(215 12% 50%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(215 12% 50%)', fontSize: 10 }} axisLine={false} tickLine={false} width={25} />
                <Tooltip contentStyle={{ background: 'hsl(220 18% 12%)', border: '1px solid hsl(220 14% 16%)', borderRadius: '8px', fontSize: '11px', color: 'hsl(210 20% 92%)' }} />
                <Bar dataKey="areas" fill="hsl(217 91% 60%)" radius={[3, 3, 0, 0]} opacity={0.8} name="Areas Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Search + Bulk Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search zones by name, city, or area..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 text-xs h-8"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{filteredZones.length} zone{filteredZones.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
          <CheckSquare size={14} className="text-accent" />
          <span className="text-xs text-foreground font-medium">{selectedIds.size} selected</span>
          <Button variant="ghost" size="sm" className="ml-auto text-xs h-7 text-destructive" onClick={handleBulkDelete}>
            <Trash2 size={12} className="mr-1" /> Delete Selected
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Zone</DialogTitle>
            <DialogDescription>Update the zone details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Zone name"
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              className="text-xs"
            />
            <Input
              placeholder="City"
              value={editForm.city}
              onChange={e => setEditForm({ ...editForm, city: e.target.value })}
              className="text-xs"
            />
            <Input
              placeholder="Areas (comma-separated)"
              value={editForm.areas}
              onChange={e => setEditForm({ ...editForm, areas: e.target.value })}
              className="text-xs"
            />
            <div className="flex gap-2">
              {ZONE_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-label={`color ${c}`}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${editForm.color === c ? 'scale-125 border-foreground' : 'border-transparent'}`}
                  style={{ background: c }}
                  onClick={() => setEditForm({ ...editForm, color: c })}
                />
              ))}
            </div>
            <Button className="w-full text-xs" onClick={handleUpdate} disabled={busy}>
              {busy ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Zone Cards */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Loading zones…</div>
      ) : filteredZones.length === 0 ? (
        <div className="text-center py-10 text-xs text-muted-foreground">
          {zones.length === 0 ? 'No zones created yet. Create your first zone to start routing.' : 'No zones match your search.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredZones.map(zone => (
            <div key={zone.id} className="glass-card p-4 transition-all hover:shadow-md">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(zone.id)}
                    onChange={() => toggleSelect(zone.id)}
                    className="mr-1 accent-accent"
                  />
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: zone.color || '#94a3b8' }}
                  />
                  <h3 className="font-heading font-semibold text-sm text-foreground truncate">{zone.name}</h3>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(zone)} aria-label={`Edit ${zone.name}`}>
                    <Pencil size={12} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(zone)} aria-label={`Delete ${zone.name}`}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                <span className="font-medium text-foreground">City:</span> {zone.city || 'NA'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(zone.areas || []).map((area, i) => (
                  <span key={`${area}-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-foreground">{area}</span>
                ))}
                {(!zone.areas || zone.areas.length === 0) && (
                  <span className="text-[10px] text-muted-foreground">No areas added</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
