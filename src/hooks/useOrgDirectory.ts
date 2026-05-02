// Real members + zones from the API. Falls back to empty arrays if the
// backend isn't reachable (local mode).
import { useEffect, useState } from "react";
import { api, type ManagedUser, type Zone } from "@/lib/api/client";

export interface DirectoryMember {
  id: string;
  name: string;
  role: string;
  zones: string[];
}

export function useOrgMembers() {
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.users.listLite();
        if (cancelled) return;
        setMembers(r.items.map((u: any) => ({ id: u._id, name: u.name, role: u.role, zones: u.zones || [] })));
      } catch {
        if (!cancelled) setMembers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return { members, loading };
}

export function useOrgZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.zones.list();
        if (!cancelled) setZones(list);
      } catch {
        if (!cancelled) setZones([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return { zones, loading };
}

export function useOrgProperties() {
  const [properties, setProperties] = useState<import("@/lib/types").Property[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.properties.list();
        if (!cancelled) setProperties(list);
      } catch {
        if (!cancelled) setProperties([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return { properties, loading };
}
