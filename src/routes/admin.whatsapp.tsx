import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, Search, Archive, Phone, Check, CheckCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/whatsapp")({
  component: WhatsAppInbox,
});

interface LeadItem {
  id: string;
  _id?: string;
  name: string;
  phone: string;
  stage?: string;
}

function WhatsAppInbox() {
  const queryClient = useQueryClient();
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New Chat States
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [newChatPhone, setNewChatPhone] = useState("");
  const [newChatName, setNewChatName] = useState("");
  const [newChatMsg, setNewChatMsg] = useState("");
  const [newChatLeadId, setNewChatLeadId] = useState("");

  const { data: leadsRes } = useQuery({
    queryKey: ["leads", "list-for-whatsapp"],
    queryFn: () => api.leads.list({ limit: 1000 }),
    enabled: newChatOpen,
  });

  const filteredLeads = useMemo(() => {
    if (!leadSearch.trim()) return [];
    const s = leadSearch.toLowerCase();
    return (leadsRes?.items ?? []).filter((l: LeadItem) => 
      (l.name && l.name.toLowerCase().includes(s)) ||
      (l.phone && l.phone.includes(s))
    ).slice(0, 5);
  }, [leadsRes, leadSearch]);

  const startNewChatMutation = useMutation({
    mutationFn: () => api.whatsapp.send(undefined, newChatMsg, undefined, newChatPhone, newChatName, newChatLeadId),
    onSuccess: (res: any) => {
      setNewChatOpen(false);
      setNewChatPhone("");
      setNewChatName("");
      setNewChatMsg("");
      setNewChatLeadId("");
      setLeadSearch("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations"] });
      if (res && res.conversationId) {
        setSelectedConv(res.conversationId);
      }
      toast.success("Conversation started!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: convData, isLoading: convsLoading } = useQuery({
    queryKey: ["whatsapp", "conversations", showArchived, search],
    queryFn: () => api.whatsapp.conversations({ status: showArchived ? "archived" : "active", search: search || undefined }),
    refetchInterval: 10000,
  });

  const conversations = convData?.items ?? [];

  const { data: msgData, isLoading: msgsLoading } = useQuery({
    queryKey: ["whatsapp", "messages", selectedConv],
    queryFn: () => api.whatsapp.messages(selectedConv!),
    enabled: !!selectedConv,
    refetchInterval: 5000,
  });

  const messages = msgData?.items ?? [];

  const sendMutation = useMutation({
    mutationFn: (text: string) => api.whatsapp.send(selectedConv!, text),
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "messages", selectedConv] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async (archived: boolean) => {
      if (selectedConv) await api.whatsapp.archive(selectedConv, archived);
    },
    onSuccess: () => {
      setSelectedConv(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedConversation = conversations.find((c: any) => c.id === selectedConv);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 rounded-xl border border-border bg-card overflow-hidden">
      {/* Conversation list */}
      <div className="w-80 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare size={14} className="text-accent" /> WhatsApp Inbox
            </h2>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1" onClick={() => setNewChatOpen(true)}>
              <Plus size={10} /> New Chat
            </Button>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-7"
            />
          </div>
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => setShowArchived(false)}
              className={cn("text-[11px] font-medium rounded-full px-3 py-1 border transition-colors",
                !showArchived ? "bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground"
              )}
            >
              Active
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={cn("text-[11px] font-medium rounded-full px-3 py-1 border transition-colors",
                showArchived ? "bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground"
              )}
            >
              Archived
            </button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          {convsLoading ? (
            <div className="p-4 text-xs text-muted-foreground">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">No conversations</div>
          ) : (
            conversations.map((conv: any) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv.id)}
                className={cn(
                  "w-full text-left p-3 border-b border-border/50 hover:bg-muted/30 transition-colors",
                  selectedConv === conv.id && "bg-accent/10",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate">{conv.leadName}</span>
                  <div className="flex items-center gap-1">
                    {conv.unreadCount > 0 && (
                      <span className="h-4 min-w-4 rounded-full bg-accent text-[9px] text-accent-foreground font-semibold flex items-center justify-center px-1">
                        {conv.unreadCount}
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground">
                      {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{conv.lastMessage}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Phone size={8} className="text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground">{conv.phone}</span>
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{selectedConversation.leadName}</div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Phone size={8} /> {selectedConversation.phone}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px]"
                onClick={() => archiveMutation.mutate(!showArchived)}
              >
                <Archive size={12} className="mr-1" />
                {showArchived ? "Unarchive" : "Archive"}
              </Button>
            </div>

            <ScrollArea className="flex-1 p-3">
              {msgsLoading ? (
                <div className="text-xs text-muted-foreground text-center py-8">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-8">No messages yet. Send the first message.</div>
              ) : (
                <div className="space-y-2">
                  {messages.map((msg: any) => (
                    <div key={msg.id} className={cn(
                      "flex",
                      msg.direction === "outbound" ? "justify-end" : "justify-start",
                    )}>
                      <div className={cn(
                        "max-w-[75%] rounded-xl px-3 py-2 text-xs",
                        msg.direction === "outbound"
                          ? "bg-primary text-primary-foreground shadow-sm rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm",
                      )}>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        <div className={cn(
                          "flex items-center gap-1 mt-1",
                          msg.direction === "outbound" ? "justify-end" : "justify-start",
                        )}>
                          <span className="text-[9px] opacity-60">
                            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                          </span>
                          {msg.direction === "outbound" && (
                            msg.status === "read" ? <CheckCheck size={10} className="opacity-60" />
                              : msg.status === "delivered" ? <CheckCheck size={10} className="opacity-40" />
                              : <Check size={10} className="opacity-40" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="p-3 border-t border-border">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (messageText.trim()) sendMutation.mutate(messageText.trim());
                }}
                className="flex gap-2"
              >
                <Input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  className="h-9 text-xs flex-1"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 w-9 p-0"
                  disabled={sendMutation.isPending || !messageText.trim()}
                >
                  <Send size={14} />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            <div className="text-center">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
              Select a conversation to start chatting
            </div>
          </div>
        )}
      </div>
      
      {/* New Chat Dialog */}
      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start a New Chat</DialogTitle>
            <DialogDescription>
              Search for a lead from the CRM or enter a phone number directly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            {/* CRM Lead Search */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Search CRM Leads</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Type name or phone number..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              
              {/* Filtered Lead Results */}
              {filteredLeads.length > 0 && (
                <div className="mt-1 border border-border rounded-md bg-card divide-y divide-border overflow-hidden">
                  {filteredLeads.map((l: LeadItem) => (
                    <button
                      key={l.id || l._id}
                      type="button"
                      onClick={() => {
                        setNewChatPhone(l.phone);
                        setNewChatName(l.name);
                        setNewChatLeadId(l.id || l._id || "");
                        setLeadSearch("");
                      }}
                      className="w-full text-left p-2 hover:bg-muted/40 transition-colors flex items-center justify-between text-[11px]"
                    >
                      <span className="font-medium text-foreground">{l.name}</span>
                      <span className="text-muted-foreground">{l.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Direct Input */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Phone Number *</label>
                <Input
                  placeholder="e.g. +919876543210"
                  value={newChatPhone}
                  onChange={(e) => setNewChatPhone(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Name (optional)</label>
                <Input
                  placeholder="e.g. Rahul Kumar"
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* First Message */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">First Message *</label>
              <Input
                placeholder="Type your first message here..."
                value={newChatMsg}
                onChange={(e) => setNewChatMsg(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNewChatOpen(false);
                setNewChatPhone("");
                setNewChatName("");
                setNewChatMsg("");
                setNewChatLeadId("");
                setLeadSearch("");
              }}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => startNewChatMutation.mutate()}
              disabled={startNewChatMutation.isPending || !newChatPhone.trim() || !newChatMsg.trim()}
              className="text-xs h-8"
            >
              {startNewChatMutation.isPending ? "Starting..." : "Start Chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
