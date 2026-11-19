// GET /api/reviews — одобренные отзывы и средняя оценка. POST — новый отзыв (появится после вашего одобрения в боте).
import { json, validateReview, rateLimited, reviews, tgEnabled, send, OWNER, esc, newKey, notifyOwner } from "../lib/core.mjs";

export default async (req, context) => {
  const store = reviews();

  if (req.method === "GET") {
    const { blobs } = await store.list({ prefix: "ok/" });
    const items = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
    items.sort((a, b) => b.createdAt - a.createdAt);
    const avg = items.length ? items.reduce((s, r) => s + r.rating, 0) / items.length : 0;
    return json({
      count: items.length,
      average: Math.round(avg * 10) / 10,
      items: items.slice(0, 50).map(({ name, rating, text, createdAt }) => ({ name, rating, text, createdAt })),
    });
  }

  if (req.method !== "POST") return json({ error: "Метод не поддерживается" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Неверный формат" }, 400); }
  const v = validateReview(body);
  if (!v.ok) return v.error === "spam" ? json({ ok: true }) : json({ error: v.error }, 400);
  if (await rateLimited(req, context, "review", 3, 3600)) return json({ error: "Слишком часто, попробуйте позже" }, 429);

  const id = newKey().slice(0, 10);
  const r = { ...v.review, id, createdAt: Date.now() };
  await store.setJSON(`pending/${id}`, r);
  await notifyOwner({ title: `⭐ Новый отзыв: ${"★".repeat(r.rating)}`, body: `${r.name}: ${r.text.slice(0, 140)}`, tag: `review-${id}`, url: "/admin/#reviews" });

  if (tgEnabled()) {
    await send(OWNER(), `<b>⭐ Новый отзыв (${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)})</b>\n<b>${esc(r.name)}:</b> ${esc(r.text)}\n\nОпубликовать на сайте?`, {
      reply_markup: { inline_keyboard: [[{ text: "✅ Опубликовать", callback_data: `rvok:${id}` }, { text: "🗑 Скрыть", callback_data: `rvno:${id}` }]] },
    });
  }
  return json({ ok: true, message: "Спасибо! Отзыв появится после проверки." });
};

export const config = { path: "/api/reviews" };
