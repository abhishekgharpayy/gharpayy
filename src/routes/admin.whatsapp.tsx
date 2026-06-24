import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, Search, Archive, Phone, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/whatsapp")({
  component: WhatsAppInbox,
});

function WhatsAppInbox() {
  const queryClient = useQueryClient();
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <MessageSquare size={14} className="text-accent" /> WhatsApp Inbox
          </h2>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-7"
            />
          </div>
          <div className="flex gap-1 mt-2">
            <button
              onClick={() => setShowArchived(false)}
              className={cn("text-[10px] px-2 py-1 rounded-full border transition-colors",
                !showArchived ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground"
              )}
            >
              Active
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={cn("text-[10px] px-2 py-1 rounded-full border transition-colors",
                showArchived ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground"
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
                          ? "bg-accent text-accent-foreground rounded-br-sm"
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
    </div>
  );
}
