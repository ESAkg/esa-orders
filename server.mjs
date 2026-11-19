// Сервер для Render: раздаёт сайт из public/ и вызывает те же обработчики API, что и на Netlify.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const routes = {
  "/api/services": (await import("./netlify/functions/services.mjs")).default,
  "/api/order": (await import("./netlify/functions/order.mjs")).default,
  "/api/reviews": (await import("./netlify/functions/reviews.mjs")).default,
  "/api/telegram": (await import("./netlify/functions/telegram.mjs")).default,
  "/api/tg-setup": (await import("./netlify/functions/tg-setup.mjs")).default,
};

const root = fileURLToPath(new URL("./public/", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8" };
const security = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "strict-transport-security": "max-age=31536000",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://i.postimg.cc; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
// Публичный адрес (Render задаёт RENDER_EXTERNAL_URL) — нужен боту для ссылок и webhook
if (!process.env.URL && process.env.RENDER_EXTERNAL_URL) process.env.URL = process.env.RENDER_EXTERNAL_URL;

const PORT = Number(process.env.PORT || 10000);
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const fn = routes[url.pathname];
    if (fn) {
      const chunks = [];
      let size = 0;
      for await (const c of req) { size += c.length; if (size > 64 * 1024) { res.writeHead(413); return res.end(); } chunks.push(c); }
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
      const request = new Request(`${process.env.URL || "http://localhost"}${url.pathname}${url.search}`, {
        method: req.method, headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      const r = await fn(request, { ip });
      res.writeHead(r.status, { ...security, ...Object.fromEntries(r.headers) });
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (url.pathname === "/healthz") { res.writeHead(200); return res.end("ok"); }
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = normalize(join(root, rel));
    if (!file.startsWith(normalize(root))) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { ...security, "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "public, max-age=300" });
    res.end(data);
  } catch (e) {
    if (e.code !== "ENOENT" && e.code !== "EISDIR") console.error(e);
    if (!res.headersSent) res.writeHead(e.code === "ENOENT" || e.code === "EISDIR" ? 404 : 500, security);
    res.end(e.code === "ENOENT" ? "Не найдено" : "");
  }
}).listen(PORT, () => console.log(`ESA orders on :${PORT}`));

const { warmUp } = await import("./netlify/lib/store.mjs");
warmUp().then(() => console.log("SQL-база подключена")).catch((e) => console.error("SQL-база недоступна:", e.message));
