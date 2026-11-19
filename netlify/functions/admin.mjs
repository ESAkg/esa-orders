// API приложения владельца: /api/admin/*. Доступ только с ADMIN_TOKEN (заголовок Authorization: Bearer ...).
import { json, orders, reviews, misc, sameKey, rateLimited, STATUS, SERVICES, setOrderStatus, notifyOwner } from "../lib/core.mjs";
import { saveSubscription } from "../lib/push.mjs";

async function authorized(req, context) {
  const token = process.env.ADMIN_TOKEN || "";
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // токен — 192 случайных бита, подобрать его нереально; общий лимит запросов — ниже
  return token.length >= 24 && sameKey(given, token);
}

async function readAll(store, prefix = "") {
  const { blobs } = await store.list({ prefix });
  return (await Promise.all(blobs.map(async (b) => ({ key: b.key, v: await store.get(b.key, { type: "json" }) })))).filter((x) => x.v);
}

export default async (req, context) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");

  if (path === "/api/admin/vapid") return json({ key: process.env.VAPID_PUBLIC_KEY || null });

  if (await rateLimited(req, context, "admin-all", 300, 600)) return json({ error: "Слишком много запросов" }, 429);
  if (!(await authorized(req, context))) return json({ error: "Нет доступа" }, 401);

  let body = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { return json({ error: "Неверный формат" }, 400); } }

  if (path === "/api/admin/data" && req.method === "GET") {
    const all = (await readAll(orders())).map(({ v }) => {
      const { key, ...rest } = v; // секретный ключ клиента наружу не отдаём
      return rest;
    }).sort((a, b) => b.createdAt - a.createdAt);
    const rv = await readAll(reviews());
    return json({
      orders: all,
      reviews: rv.map(({ key, v }) => ({ ...v, state: key.startsWith("ok/") ? "ok" : "pending" })).sort((a, b) => b.createdAt - a.createdAt),
      statuses: STATUS,
      services: SERVICES.map(({ id, title, icon }) => ({ id, title, icon })),
      serverTime: Date.now(),
    });
  }

  if (path === "/api/admin/status" && req.method === "POST") {
    const res = await setOrderStatus(String(body.id || ""), String(body.status || ""));
    if (!res) return json({ error: "Заказ или статус не найден" }, 404);
    return json({ ok: true, status: res.order.status, clientNotified: res.clientNotified });
  }

  if (path === "/api/admin/review" && req.method === "POST") {
    const id = String(body.id || "").replace(/[^A-Za-z0-9_-]/g, "");
    const store = reviews();
    const from = (await store.get(`pending/${id}`, { type: "json" })) ? `pending/${id}` : (await store.get(`ok/${id}`, { type: "json" })) ? `ok/${id}` : null;
    if (!from) return json({ error: "Отзыв не найден" }, 404);
    const r = await store.get(from, { type: "json" });
    await store.delete(from);
    if (body.action === "approve") await store.setJSON(`ok/${id}`, r);
    else if (body.action === "hide") await store.setJSON(`pending/${id}`, r);
    return json({ ok: true });
  }

  if (path === "/api/admin/subscribe" && req.method === "POST") {
    if (!(await saveSubscription(misc(), body.subscription))) return json({ error: "Неверная подписка" }, 400);
    return json({ ok: true });
  }

  if (path === "/api/admin/test-push" && req.method === "POST") {
    await notifyOwner({ title: "🔔 Проверка уведомлений ESA", body: `Всё работает! ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" })}`, tag: "test", url: "/admin/" });
    return json({ ok: true });
  }

  return json({ error: "Не найдено" }, 404);
};

export const config = { path: "/api/admin/*" };
