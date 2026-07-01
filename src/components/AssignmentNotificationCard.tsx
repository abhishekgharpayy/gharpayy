/**
 * AssignmentNotificationCard
 *
 * Displays a single pending assignment notification with Accept and Pass on buttons.
 * Used in the /inbox page and the notification bell dropdown.
 *
 * For "Pass on":
 *  - Lead: shows all active members (any role) except the current user
 *  - Tour: shows all active users with isTcm=true, except the current user
 */

import { useState, useEffect } from "react";
import { CheckCircle2, ArrowRightLeft, User2, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useAssignmentNotifications } from "@/lib/assignment-notifications-store";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useAppState } from "@/myt/lib/app-context";
import { useAuthUser } from "@/lib/auth-store";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api/client";
import { MapPin, CalendarClock, Info } from "lucide-react";

interface UserOption {
  _id: string;
  name: string;
  email: string;
  role: string;
  isTcm?: boolean;
  zones?: string[];
}

interface AssignmentNotificationCardProps {
  notification: any;
  /** Current user's ID — excluded from pass-on options */
  currentUserId?: string;
  /** Compact mode for the bell dropdown */
  compact?: boolean;
  onActionComplete?: () => void;
}

export function AssignmentNotificationCard({
  notification,
  currentUserId,
  compact = false,
  onActionComplete,
}: AssignmentNotificationCardProps) {
  const { accept, passOn } = useAssignmentNotifications();
  const { setTours } = useAppState();
  const authUser = useAuthUser((s) => s.user);
  const globalTours = useApp((s) => s.tours);
  const [showInfo, setShowInfo] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [passing, setPassing] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);

  // Fetch users list when pass-on popover opens
  useEffect(() => {
    if (!passOpen) return;
    setUsersLoading(true);
    
    const fetchPromise = notification.type === "lead" ? api.members.list() : api.tcms.list();
    
    fetchPromise
      .then((res) => {
        let options = res.map((u) => ({ 
          _id: u.id || (u as any)._id, 
          name: u.fullName || u.name || "", 
          email: u.email, 
          role: u.role, 
          isTcm: u.isTcm,
          zones: u.zones || []
        }));
        
        // Exclude self
        options = options.filter((u) => u._id !== currentUserId);
        
        // Filter based on type and zones
        if (notification.type === "tour" && authUser?.zones && authUser.zones.length > 0) {
          options = options.filter((u) => u.zones?.some(z => authUser.zones.includes(z)));
        }
        
        setUsers(options);
      })
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, [passOpen, currentUserId, notification.type, authUser?.zones]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await accept(notification._id, notification.type);
      
      if (notification.type === "tour" && authUser) {
        setTours(prev => prev.map(t => 
          t.id === notification.entityId || (t as any)._id === notification.entityId
            ? { ...t, assignedTo: authUser.id, assignmentStatus: "accepted" }
            : t
        ));
      }

      toast.success(
        notification.type === "lead"
          ? `You accepted ${notification.leadName}'s lead!`
          : `You accepted ${notification.leadName}'s tour!`,
      );
      onActionComplete?.();
    } catch (e) {
      toast.error((e as Error).message ?? "Something went wrong");
    } finally {
      setAccepting(false);
    }
  };

  const handlePassOn = async () => {
    if (!selectedUser) return;
    setPassing(true);
    try {
      await passOn(notification._id, notification.type, selectedUser._id);
      toast.success(`Passed on to ${selectedUser.name}`);
      setPassOpen(false);
      setSelectedUser(null);
      onActionComplete?.();
    } catch (e) {
      toast.error((e as Error).message ?? "Something went wrong");
    } finally {
      setPassing(false);
    }
  };

  const entityLabel = notification.type === "lead" ? "lead" : "tour";
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });

  if (compact) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2.5 border-b border-border/50">
        <div className="flex items-start gap-2">
          <span className="mt-1 h-2 w-2 rounded-full bg-accent shrink-0" />
          <div 
            className="flex-1 min-w-0 cursor-pointer group"
            onClick={() => {
              if (notification.type === "tour") setShowInfo(!showInfo);
            }}
          >
            <p className="text-xs font-semibold text-foreground group-hover:text-accent transition-colors truncate">
              {notification.type === "lead" ? "Lead" : "Tour"} assigned to you
            </p>
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              {notification.assignedByName} assigned {notification.leadName}'s {entityLabel} to you
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[10px] text-muted-foreground/70 font-mono">{timeAgo}</p>
            </div>
            {showInfo && notification.type === "tour" && (
              <div className="mt-2 p-2 rounded bg-muted/30 border border-border/50 text-[10px] space-y-1">
                {(() => {
                  const tour = globalTours.find(t => t.id === notification.entityId);
                  if (!tour) return <div className="text-muted-foreground italic">Details not found.</div>;
                  return (
                    <>
                      <div className="flex items-center gap-1">
                        <CalendarClock className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">When:</span>
                        <span>{(tour as any).tourDate ? `${(tour as any).tourDate} at ${(tour as any).tourTime || "TBD"}` : "TBD"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">Where:</span>
                        <span>{tour.propertyId || "TBD"}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 pl-4">
          {notification.status === "accepted" ? (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium bg-accent/5 px-2 py-0.5 rounded border border-accent/10">
              <CheckCircle2 className="h-2.5 w-2.5 text-success" />
              Accepted
            </div>
          ) : (
            <>
              <Button
                size="sm"
                variant="default"
                className="h-6 text-[10px] px-2 gap-1"
                onClick={handleAccept}
                disabled={accepting || passing}
              >
                {accepting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                Accept
              </Button>
              
              <Popover open={passOpen} onOpenChange={setPassOpen}>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 gap-1"
                    disabled={accepting || passing}
                  >
                    <ArrowRightLeft className="h-2.5 w-2.5" />
                    Pass on
                    <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
            <PopoverContent className="p-0 w-64" align="start">
              <Command>
                <CommandInput placeholder="Search team members…" className="text-xs" />
                <CommandList>
                  {usersLoading && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!usersLoading && <CommandEmpty>No members found.</CommandEmpty>}
                  {!usersLoading && users.length > 0 && (
                    <CommandGroup heading={notification.type === "tour" ? "Active TCMs" : "Team members"}>
                      {users.map((u) => (
                        <CommandItem
                          key={u._id}
                          value={u.name}
                          onSelect={() => setSelectedUser(u)}
                          className={cn(
                            "text-xs cursor-pointer",
                            selectedUser?._id === u._id && "bg-accent/10 text-accent",
                          )}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate">{u.name}</span>
                            <span className="text-muted-foreground text-[10px] truncate">{u.email}</span>
                          </div>
                          {selectedUser?._id === u._id && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-accent ml-auto shrink-0" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
                {selectedUser && (
                  <div className="border-t border-border p-2">
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={handlePassOn}
                      disabled={passing}
                    >
                      {passing
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        : <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />}
                      Pass to {selectedUser.name}
                    </Button>
                  </div>
                )}
              </Command>
            </PopoverContent>
          </Popover>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <li
      className={cn(
        "rounded-xl border p-4 space-y-3 bg-card",
        "border-accent/30 ring-1 ring-accent/10",
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <User2 className="h-4 w-4 text-accent" />
        </div>
          <div 
            className="flex-1 min-w-0 cursor-pointer group"
            onClick={() => {
              if (notification.type === "tour") setShowInfo(!showInfo);
            }}
          >
            <div className="flex items-center gap-2 flex-wrap group-hover:opacity-80 transition-opacity">
              <span className="font-semibold text-sm text-foreground">
                {notification.type === "lead" ? "Lead assigned" : "Tour assigned"}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] capitalize",
                  notification.type === "lead"
                    ? "border-blue-500/30 text-blue-400"
                    : "border-purple-500/30 text-purple-400",
                )}
              >
                {notification.type}
              </Badge>
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5 group-hover:text-foreground/80 transition-colors">
              <span className="text-foreground font-medium">{notification.assignedByName}</span>
              {" "}assigned{" "}
              <span className="text-foreground font-medium">{notification.leadName}</span>
              's {entityLabel} to you
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[11px] text-muted-foreground/70 font-mono">
                {timeAgo}
              </p>
            </div>
            
            {showInfo && notification.type === "tour" && (
              <div className="mt-3 p-2.5 rounded-md bg-muted/30 border border-border/50 text-xs space-y-1.5">
                {(() => {
                  const tour = globalTours.find(t => t.id === notification.entityId);
                  if (!tour) return <div className="text-muted-foreground italic">Tour details not found in local cache.</div>;
                  return (
                    <>
                      <div className="flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">When:</span>
                        <span>{(tour as any).tourDate ? `${(tour as any).tourDate} at ${(tour as any).tourTime || "TBD"}` : "TBD"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">Where:</span>
                        <span>{tour.propertyId || "Location TBD"}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
      </div>

      {/* Action buttons or Accepted state */}
      <div className="flex items-center gap-2 pl-11">
        {notification.status === "accepted" ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium bg-accent/5 px-2.5 py-1 rounded-md border border-accent/10">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            Accepted
          </div>
        ) : (
          <>
            {/* Accept */}
            <Button
              size="sm"
              variant="default"
              className="h-8 text-xs gap-1.5"
              onClick={handleAccept}
              disabled={accepting || passing}
              id={`accept-assignment-${notification._id}`}
            >
              {accepting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCircle2 className="h-3.5 w-3.5" />}
              Accept
            </Button>

            {/* Pass on */}
            <Popover open={passOpen} onOpenChange={setPassOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  disabled={accepting || passing}
                  id={`pass-assignment-${notification._id}`}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Pass on
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-64" align="start">
                <Command>
                  <CommandInput placeholder="Search team members…" className="text-xs" />
                  <CommandList>
                    {usersLoading && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {!usersLoading && <CommandEmpty>No members found.</CommandEmpty>}
                    {!usersLoading && users.length > 0 && (
                      <CommandGroup heading={notification.type === "tour" ? "Active TCMs" : "Team members"}>
                        {users.map((u) => (
                          <CommandItem
                            key={u._id}
                            value={u.name}
                            onSelect={() => setSelectedUser(u)}
                            className={cn(
                              "text-xs cursor-pointer",
                              selectedUser?._id === u._id && "bg-accent/10 text-accent",
                            )}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium truncate">{u.name}</span>
                              <span className="text-muted-foreground text-[10px] truncate">{u.email}</span>
                            </div>
                            {selectedUser?._id === u._id && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-accent ml-auto shrink-0" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                  {selectedUser && (
                    <div className="border-t border-border p-2">
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={handlePassOn}
                        disabled={passing}
                        id={`confirm-pass-assignment-${notification._id}`}
                      >
                        {passing
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          : <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />}
                        Pass to {selectedUser.name}
                      </Button>
                    </div>
                  )}
                </Command>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
    </li>
  );
}
