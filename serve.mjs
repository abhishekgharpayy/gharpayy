/**
 * Node.js production server for TanStack Start.
 * Serves static assets from dist/client/ and SSR via dist/server/server.js.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = parseInt(process.env.PORT || "3001", 10);
const CLIENT_DIR = join(__dirname, "dist", "client");

// Import the built SSR server
const { default: app } = await import("./dist/server/server.js");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".map": "application/json",
};

async function tryServeStatic(req) {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const filePath = join(CLIENT_DIR, url.pathname);

    // Security: prevent directory traversal
    if (!filePath.startsWith(CLIENT_DIR)) return null;

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return null;

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = await readFile(filePath);

    // Cache hashed assets aggressively (they have content hashes in filenames)
    const isHashed = url.pathname.startsWith("/assets/");
    const cacheControl = isHashed
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600";

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    // 1. Try to serve static files first
    const staticResponse = await tryServeStatic(req);
    if (staticResponse) {
      res.writeHead(staticResponse.status, Object.fromEntries(staticResponse.headers));
      const body = Buffer.from(await staticResponse.arrayBuffer());
      res.end(body);
      return;
    }

    // 2. Fall through to SSR
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD"
        ? await new Promise((resolve) => {
            const chunks = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => resolve(Buffer.concat(chunks)));
          })
        : undefined,
    });

    const response = await app.fetch(request);

    // Write status and headers
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    res.writeHead(response.status, responseHeaders);

    // Stream the response body
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    res.end();
  } catch (err) {
    console.error("Server error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Gharpayy frontend running on http://localhost:${PORT}`);
});
