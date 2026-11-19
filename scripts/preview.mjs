// Локальный просмотр без Netlify: node --experimental-test-module-mocks scripts/preview.mjs
// Данные хранятся в памяти, Telegram отключён.
import { mock } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const mem = new Map();
mock.module("@netlify/blobs", { exports: { getStore: ({ name }) => {
  if (!mem.has(name)) mem.set(name, new Map());
  const m = mem.get(name);
  return {
    get: async (k) => m.get(k) ?? null, setJSON: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k),
    list: async ({ prefix = "" } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
} } });

const routes = {
  "/api/services": (await import("../netlify/functions/services.mjs")).default,
  "/api/order": (await import("../netlify/functions/order.mjs")).default,
  "/api/reviews": (await import("../netlify/functions/reviews.mjs")).default,
};
process.env.ADMIN_TOKEN ||= "preview-admin-token-0000000000";
const adminApi = (await import("../netlify/functions/admin.mjs")).default;
// демо-заказы для графиков (только в локальном просмотре)
if (!mem.has("orders")) mem.set("orders", new Map());
const demoSvc = ["landing", "bot", "business", "ai", "landing", "ads", "bot", "crm"], demoSt = ["new", "accepted", "work", "done", "done", "rejected", "new", "done"];
for (let i = 0; i < 26; i++) {
  const id = `ESA-${100000 + i}`;
  mem.get("orders").set(id, { id, key: "k", name: ["Айбек", "Асель", "Нурлан", "Жылдыз"][i % 4], contact: i % 2 ? "+996 555 12 34 56" : "@client_" + i,
    service: demoSvc[i % 8], status: demoSt[i % 8], details: "Демо-заказ: нужен сайт/бот для бизнеса в Оше.", source: i % 3 ? "сайт" : "Telegram-бот",
    createdAt: Date.now() - Math.floor((i * 7919) % 29) * 864e5 - (i * 3571 % 86400) * 1000, history: [] });
}
// пример одобренного отзыва для вида
if (!mem.has("reviews")) mem.set("reviews", new Map());
mem.get("reviews").set("ok/demo", { name: "Демо-клиент", rating: 5, text: "Пример отзыва (только в локальном просмотре).", createdAt: Date.now() });

const root = fileURLToPath(new URL("../public/", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const PORT = Number(process.env.PORT || 8899);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const fn = routes[url.pathname] || (url.pathname.startsWith("/api/admin/") ? adminApi : null);
  if (fn) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await fn(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }), { ip: "127.0.0.1" });
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  const file = normalize(join(root, decodeURIComponent(url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname)));
  if (!file.startsWith(normalize(root))) { res.writeHead(403); return res.end(); }
  try { const data = await readFile(file); res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }); res.end(data); }
  catch { res.writeHead(404); res.end("not found"); }
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}`));
