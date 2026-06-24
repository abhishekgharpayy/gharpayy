import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { requireAuth } from "../../middleware/auth.js";
import { ulid } from "../../../../src/contracts/ids.js";

interface ConversationDoc {
  _id: string;
  tenantId: string;
  leadId: string;
  leadName: string;
  phone: string;
  assignedTo: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  status: "active" | "archived";
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface MessageDoc {
  _id: string;
  tenantId: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  text: string;
  mediaUrl: string;
  status: "sent" | "delivered" | "read" | "failed";
  sentById: string;
  sentByName: string;
  createdAt: string;
}

export function registerWhatsAppRoutes(app: FastifyInstance) {
  const conversations = () => col<ConversationDoc>("whatsapp_conversations");
  const messages = () => col<MessageDoc>("whatsapp_messages");

  app.get("/api/whatsapp/conversations", { preHandler: [requireAuth] }, async (req, reply) => {
    const q = z.object({
      status: z.enum(["active", "archived"]).optional().default("active"),
      search: z.string().optional(),
      limit: z.coerce.number().min(1).max(200).default(100),
      cursor: z.string().optional(),
    }).parse(req.query);

    const filter: Record<string, unknown> = {
      tenantId: req.user!.tenantId,
      status: q.status,
    };
    if (q.search) {
      filter.$or = [
        { leadName: { $regex: q.search, $options: "i" } },
        { phone: { $regex: q.search, $options: "i" } },
      ];
    }
    if (q.cursor) filter._id = { $lt: q.cursor };

    const items = await conversations()
      .find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(q.limit)
      .toArray();

    return reply.send({
      items: items.map((c) => ({
        id: c._id,
        leadId: c.leadId,
        leadName: c.leadName,
        phone: c.phone,
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount,
        status: c.status,
        tags: c.tags,
      })),
      nextCursor: items.length === q.limit ? items[items.length - 1]._id : null,
    });
  });

  app.get("/api/whatsapp/conversations/:id/messages", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = z.object({
      limit: z.coerce.number().min(1).max(200).default(100),
      cursor: z.string().optional(),
    }).parse(req.query);

    const filter: Record<string, unknown> = { tenantId: req.user!.tenantId, conversationId: id };
    if (q.cursor) filter._id = { $lt: q.cursor };

    const items = await messages()
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(q.limit)
      .toArray();

    await conversations().updateOne(
      { _id: id, tenantId: req.user!.tenantId },
      { $set: { unreadCount: 0 } },
    );

    return reply.send({
      items: items.reverse().map((m) => ({
        id: m._id,
        conversationId: m.conversationId,
        direction: m.direction,
        text: m.text,
        mediaUrl: m.mediaUrl,
        status: m.status,
        sentByName: m.sentByName,
        createdAt: m.createdAt,
      })),
      nextCursor: items.length === q.limit ? items[items.length - 1]._id : null,
    });
  });

  const SendMessageBody = z.object({
    conversationId: z.string().min(1),
    text: z.string().min(1).max(5000),
    mediaUrl: z.string().optional().default(""),
  });

  app.post("/api/whatsapp/send", { preHandler: [requireAuth] }, async (req, reply) => {
    try {
      const body = SendMessageBody.parse(req.body);
      const now = new Date().toISOString();

      const conv = await conversations().findOne({
        _id: body.conversationId,
        tenantId: req.user!.tenantId,
      });
      if (!conv) return reply.code(404).send({ code: "NOT_FOUND", message: "Conversation not found" });

      const msgDoc: MessageDoc = {
        _id: ulid(),
        tenantId: req.user!.tenantId,
        conversationId: body.conversationId,
        direction: "outbound",
        text: body.text,
        mediaUrl: body.mediaUrl,
        status: "sent",
        sentById: req.user!.sub,
        sentByName: req.user!.fullName,
        createdAt: now,
      };
      await messages().insertOne(msgDoc);

      await conversations().updateOne(
        { _id: body.conversationId },
        { $set: { lastMessage: body.text, lastMessageAt: now, updatedAt: now } },
      );

      return reply.code(201).send({
        id: msgDoc._id,
        direction: "outbound",
        text: msgDoc.text,
        status: msgDoc.status,
        sentByName: msgDoc.sentByName,
        createdAt: msgDoc.createdAt,
      });
    } catch (e) {
      const err = e as Error;
      return reply.code(400).send({ code: "BAD_REQUEST", message: err.message });
    }
  });

  const WebhookBody = z.object({
    phone: z.string().min(7),
    text: z.string().min(1).max(5000),
    mediaUrl: z.string().optional().default(""),
    messageId: z.string().optional().default(""),
  });

  app.post("/api/whatsapp/webhook/incoming", async (req, reply) => {
    try {
      const body = WebhookBody.parse(req.body);
      const now = new Date().toISOString();
      const tenantId = "tenant_global";

      let conv = await conversations().findOne({ phone: body.phone, tenantId });
      if (!conv) {
        const convId = ulid();
        conv = {
          _id: convId,
          tenantId,
          leadId: "",
          leadName: body.phone,
          phone: body.phone,
          assignedTo: "",
          lastMessage: body.text,
          lastMessageAt: now,
          unreadCount: 1,
          status: "active",
          tags: [],
          createdAt: now,
          updatedAt: now,
        };
        await conversations().insertOne(conv);
      } else {
        await conversations().updateOne(
          { _id: conv._id },
          { $set: { lastMessage: body.text, lastMessageAt: now, updatedAt: now }, $inc: { unreadCount: 1 } },
        );
      }

      const msgDoc: MessageDoc = {
        _id: body.messageId || ulid(),
        tenantId,
        conversationId: conv._id,
        direction: "inbound",
        text: body.text,
        mediaUrl: body.mediaUrl,
        status: "delivered",
        sentById: "",
        sentByName: body.phone,
        createdAt: now,
      };
      await messages().insertOne(msgDoc);

      return reply.send({ ok: true, conversationId: conv._id });
    } catch (e) {
      const err = e as Error;
      return reply.code(400).send({ code: "BAD_REQUEST", message: err.message });
    }
  });

  app.patch("/api/whatsapp/conversations/:id/archive", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { archived } = req.body as { archived: boolean };
    await conversations().updateOne(
      { _id: id, tenantId: req.user!.tenantId },
      { $set: { status: archived ? "archived" : "active", updatedAt: new Date().toISOString() } },
    );
    return reply.send({ ok: true });
  });
}
