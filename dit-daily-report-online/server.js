import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4178);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    await serveStatic(res, url.pathname);
  } catch (error) {
    const status = error.status || 500;
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(status === 404 ? "Not found" : "Server error");
  }
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`DIT Daily Report running at http://${displayHost}:${port}`);
});

async function serveStatic(res, pathname) {
  const safePath = normalizePath(pathname);
  let filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  if (!existsSync(filePath) || pathname.endsWith("/")) {
    filePath = path.join(publicDir, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const body = await readFile(filePath);

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
  });
  res.end(body);
}

function normalizePath(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0] || "/");
  const trimmed = decoded.replace(/^\/+/, "");
  return trimmed || "index.html";
}
