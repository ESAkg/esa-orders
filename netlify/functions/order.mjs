// POST /api/order — новый заказ с сайта. GET /api/order?id=..&k=.. — статус заказа (нужен секретный ключ).
import { json, validateOrder, saveNewOrder, rateLimited, orders, STATUS, serviceTitle, sameKey } from "../lib/core.mjs";

export default async (req, context) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const id = (url.searchParams.get("id") || "").toUpperCase();
    const k = url.searchParams.get("k") || "";
    if (!/^ESA-\d{6}$/.test(id)) return json({ error: "Неверный номер заказа" }, 400);
    if (await rateLimited(req, context, "status", 30, 600)) return json({ error: "Слишком часто, попробуйте позже" }, 429);
    const o = await orders().get(id, { type: "json" });
    if (!o || !sameKey(k, o.key)) return json({ error: "Заказ не найден" }, 404);
    return json({ id: o.id, status: o.status, statusText: STATUS[o.status], service: serviceTitle(o.service), createdAt: o.createdAt });
  }

  if (req.method !== "POST") return json({ error: "Метод не поддерживается" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Неверный формат" }, 400); }

  const v = validateOrder(body);
  if (!v.ok) return v.error === "spam" ? json({ ok: true, id: "ESA-000000" }) : json({ error: v.error }, 400);
  if (await rateLimited(req, context, "order", 5, 3600)) return json({ error: "Слишком много заказов подряд. Напишите в Telegram." }, 429);

  const o = await saveNewOrder(v.order, "сайт");
  const bot = process.env.TG_BOT_USERNAME;
  return json({
    ok: true,
    id: o.id,
    key: o.key,
    botLink: bot ? `https://t.me/${bot}?start=${o.id}_${o.key}` : null,
  });
};

export const config = { path: "/api/order" };
