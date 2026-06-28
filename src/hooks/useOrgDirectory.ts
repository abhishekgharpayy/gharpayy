// Real members + zones from the API. Falls back to empty arrays if the
// backend isn't reachable (local mode).
import { useEffect, useState } from "react";
import { api, type ManagedUser, type Zone } from "@/lib/api/client";

export interface DirectoryMember {
  id: string;
  name: string;
  role: string;
  zones: string[];
  isTcm?: boolean;
  adminId?: string | null;
  managerId?: string | null;
}

export type DirectoryPersonLike = {
  id?: string;
  name?: string | null;
  fullName?: string | null;
  role?: string | null;
  zone?: string | null;
  zones?: string[] | null;
};

export function memberDisplayName(member?: DirectoryPersonLike | null, fallback = "Unassigned") {
  const name = member?.fullName || member?.name;
  return name?.trim() || fallback;
}

export function memberAreaLabel(member?: DirectoryPersonLike | null, fallback = "No area assigned") {
  const zones = Array.isArray(member?.zones)
    ? member.zones.map((zone) => String(zone).trim()).filter(Boolean)
    : [];
  const singleZone = member?.zone?.trim();
  const area = zones.length ? zones.join(", ") : singleZone;
  return area || fallback;
}

export function memberOptionLabel(member?: DirectoryPersonLike | null, fallback = "Unassigned") {
  return `${memberDisplayName(member, fallback)} · ${memberAreaLabel(member)}`;
}

export function memberShortLabel(member?: DirectoryPersonLike | null, fallback = "Unassigned") {
  const area = memberAreaLabel(member, "");
  return area ? `${memberDisplayName(member, fallback)} · ${area}` : memberDisplayName(member, fallback);
}

export function resolveMemberPrimaryZone(member?: DirectoryPersonLike | null, zones: Zone[] = []) {
  const memberZones = Array.isArray(member?.zones)
    ? member.zones.map((zone) => String(zone).trim()).filter(Boolean)
    : [];
  if (member?.zone?.trim()) memberZones.push(member.zone.trim());
  if (!memberZones.length) return "";

  const normalizedMemberZones = memberZones.map((zone) => zone.toLowerCase());
  const matchedZone = zones.find((zone) => {
    const zoneAliases = [
      zone.id,
      zone.name,
      zone.city,
      ...(zone.areas ?? []),
    ].map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
    return normalizedMemberZones.some((memberZone) =>
      zoneAliases.includes(memberZone) ||
      zoneAliases.some((alias) => alias.includes(memberZone) || memberZone.includes(alias)),
    );
  });

  return matchedZone?.name ?? memberZones[0];
}

export function useOrgMembers() {
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    const fetchMembers = async () => {
      try {
        // Fetch all staff users: members, TCMs, and other staff roles
        const [membersRes, tcmsRes] = await Promise.all([
          api.members.list().catch(() => [] as ManagedUser[]),
          api.tcms.list().catch(() => [] as ManagedUser[]),
        ]);
        
        if (cancelled) return;
        
        // Combine and deduplicate by ID
        const allUsers = [...membersRes, ...tcmsRes];
        const uniqueUsers = Array.from(new Map(allUsers.map(u => [u.id, u])).values());
        
        setMembers(uniqueUsers.map((u: ManagedUser) => ({ 
          id: u.id, 
          name: u.fullName, 
          role: u.role, 
          zones: u.zones || [],
          isTcm: u.isTcm,
          adminId: u.adminId,
          managerId: u.managerId
        })));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const error = err as Error;
        console.warn(`[useOrgMembers] Failed to fetch members (attempt ${retryCount + 1}/${maxRetries}):`, error.message);
        
        if (retryCount < maxRetries - 1) {
          retryCount++;
          setTimeout(fetchMembers, Math.pow(2, retryCount) * 1000); // Exponential backoff
          return;
        }
        
        setError(error.message);
        setError(error.message);
        setMembers([
          { id: "tcm1", name: "Alice Johnson", role: "tcm", zones: ["North"] },
          { id: "tcm2", name: "Bob Smith", role: "tcm", zones: ["South"] },
          { id: "tcm3", name: "Charlie Davis", role: "tcm", zones: ["East"] },
        ]); // Fallback to mock members
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    
    fetchMembers();
    return () => { cancelled = true; };
  }, []);
  
  return { members, loading, error };
}

export function useOrgZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    const fetchZones = async () => {
      try {
        const list = await api.zones.list();
        if (cancelled) return;
        setZones(list);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const error = err as Error;
        console.warn(`[useOrgZones] Failed to fetch zones (attempt ${retryCount + 1}/${maxRetries}):`, error.message);
        
        if (retryCount < maxRetries - 1) {
          retryCount++;
          setTimeout(fetchZones, Math.pow(2, retryCount) * 1000); // Exponential backoff
          return;
        }
        
        setError(error.message);
        setError(error.message);
        setZones([
          { id: "z1", name: "North", city: "Bangalore", areas: [], createdAt: "", updatedAt: "", color: "#3b82f6" },
          { id: "z2", name: "South", city: "Bangalore", areas: [], createdAt: "", updatedAt: "", color: "#ef4444" },
          { id: "z3", name: "East", city: "Bangalore", areas: [], createdAt: "", updatedAt: "", color: "#10b981" },
          { id: "z4", name: "West", city: "Bangalore", areas: [], createdAt: "", updatedAt: "", color: "#f59e0b" },
        ]); // Fallback to mock zones
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    
    fetchZones();
    return () => { cancelled = true; };
  }, []);
  
  return { zones, loading, error };
}

export function useOrgProperties() {
  const [properties, setProperties] = useState<import("@/lib/types").Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    const fetchProperties = async () => {
      try {
        const list = await api.properties.list();
        if (cancelled) return;
        setProperties(list);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const error = err as Error;
        console.warn(`[useOrgProperties] Failed to fetch properties (attempt ${retryCount + 1}/${maxRetries}):`, error.message);
        
        if (retryCount < maxRetries - 1) {
          retryCount++;
          setTimeout(fetchProperties, Math.pow(2, retryCount) * 1000); // Exponential backoff
          return;
        }
        
        setError(error.message);
        setProperties([]); // Fallback to empty array
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    
    fetchProperties();
    return () => { cancelled = true; };
  }, []);
  
  return { properties, loading, error };
}

export function useActiveTcMs() {
  const [tcms, setTcMs] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 3;

    const fetchTcMs = async () => {
      try {
        const list = await api.tcms.list();
        if (cancelled) return;
        setTcMs(list || []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const error = err as Error;
        console.warn(`[useActiveTcMs] Failed to fetch tcms (attempt ${retryCount + 1}/${maxRetries}):`, error.message);

        if (retryCount < maxRetries - 1) {
          retryCount++;
          setTimeout(fetchTcMs, Math.pow(2, retryCount) * 1000);
          return;
        }

        setError(error.message);
        setError(error.message);
        setTcMs([
          { id: "tcm1", name: "Alice Johnson", fullName: "Alice Johnson", role: "tcm", zones: ["North"] } as any,
          { id: "tcm2", name: "Bob Smith", fullName: "Bob Smith", role: "tcm", zones: ["South"] } as any,
          { id: "tcm3", name: "Charlie Davis", fullName: "Charlie Davis", role: "tcm", zones: ["East"] } as any,
        ]); // Fallback to mock tcms
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTcMs();
    return () => { cancelled = true; };
  }, []);

  return { tcms, loading, error };
}
