import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { requireAuth, requireScope } from "../../middleware/auth.js";
import { ulid } from "../../../../src/contracts/ids.js";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dir, "../../../uploads");
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

export interface MediaDoc {
  _id: string;
  tenantId: string;
  propertyId: string;
  roomId: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  caption: string;
  isPrimary: boolean;
  createdAt: string;
}

async function saveBase64Image(base64: string): Promise<{ fileName: string; mimeType: string }> {
  const matches = base64.match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/);
  if (!matches) throw new Error("Invalid base64 image");
  const mimeType = matches[1];
  const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
  const data = Buffer.from(matches[3], "base64");
  const fileName = `${ulid()}.${ext}`;
  const filePath = join(UPLOAD_DIR, fileName);
  await import("fs/promises").then((fs) => fs.writeFile(filePath, data));
  return { fileName, mimeType };
}

export function registerMediaRoutes(app: FastifyInstance) {
  const media = () => col<MediaDoc>("property_media");

  app.get("/api/media/:propertyId", { preHandler: [requireAuth] }, async (req, reply) => {
    const { propertyId } = req.params as { propertyId: string };
    const items = await media()
      .find({ tenantId: req.user!.tenantId, propertyId })
      .sort({ createdAt: -1 })
      .toArray();
    return reply.send(items.map((m) => ({
      id: m._id,
      propertyId: m.propertyId,
      roomId: m.roomId,
      url: `/uploads/${m.fileName}`,
      thumbUrl: `/uploads/${m.fileName}`,
      caption: m.caption,
      isPrimary: m.isPrimary,
      size: m.size,
      mimeType: m.mimeType,
      createdAt: m.createdAt,
    })));
  });

  app.post("/api/media/upload", { preHandler: [requireAuth, requireScope("inventory.block")] }, async (req, reply) => {
    try {
      const body = z.object({
        propertyId: z.string().min(1),
        roomId: z.string().optional().default(""),
        image: z.string().min(1),
        caption: z.string().max(200).optional().default(""),
        isPrimary: z.boolean().optional().default(false),
      }).parse(req.body);

      const { fileName, mimeType } = await saveBase64Image(body.image);
      const now = new Date().toISOString();

      if (body.isPrimary) {
        await media().updateMany(
          { tenantId: req.user!.tenantId, propertyId: body.propertyId },
          { $set: { isPrimary: false } },
        );
      }

      const doc: MediaDoc = {
        _id: ulid(),
        tenantId: req.user!.tenantId,
        propertyId: body.propertyId,
        roomId: body.roomId,
        originalName: fileName,
        fileName,
        mimeType,
        size: 0,
        caption: body.caption,
        isPrimary: body.isPrimary,
        createdAt: now,
      };
      await media().insertOne(doc);

      return reply.code(201).send({
        id: doc._id,
        propertyId: doc.propertyId,
        roomId: doc.roomId,
        url: `/uploads/${doc.fileName}`,
        caption: doc.caption,
        isPrimary: doc.isPrimary,
        createdAt: doc.createdAt,
      });
    } catch (e) {
      const err = e as Error;
      return reply.code(400).send({ code: "BAD_REQUEST", message: err.message });
    }
  });

  app.delete("/api/media/:id", { preHandler: [requireAuth, requireScope("inventory.block")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await media().findOneAndDelete({ _id: id, tenantId: req.user!.tenantId });
    if (!doc) return reply.code(404).send({ code: "NOT_FOUND", message: "Media not found" });
    try { unlinkSync(join(UPLOAD_DIR, doc.fileName)); } catch { /* ignore */ }
    return reply.send({ ok: true });
  });

  app.patch("/api/media/:id/primary", { preHandler: [requireAuth, requireScope("inventory.block")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await media().findOne({ _id: id, tenantId: req.user!.tenantId });
    if (!doc) return reply.code(404).send({ code: "NOT_FOUND", message: "Media not found" });
    await media().updateMany(
      { tenantId: req.user!.tenantId, propertyId: doc.propertyId },
      { $set: { isPrimary: false } },
    );
    await media().updateOne({ _id: id }, { $set: { isPrimary: true } });
    return reply.send({ ok: true });
  });
}

export async function getPrimaryPhoto(propertyId: string, tenantId: string): Promise<string | null> {
  const doc = await col<MediaDoc>("property_media").findOne(
    { tenantId, propertyId, isPrimary: true },
    { sort: { createdAt: -1 } },
  );
  return doc ? `/uploads/${doc.fileName}` : null;
}
