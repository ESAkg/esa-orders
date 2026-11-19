// Общая логика: услуги, проверка данных, хранилище, Telegram.
import { getStore } from "./store.mjs";
import { createHash, randomBytes } from "node:crypto";

// ---------- Услуги (единый список для сайта и бота). Цены — примерные, поменяйте под себя.
export const SERVICES = [
  { id: "landing", icon: "🌐", title: "Сайт-визитка / лендинг", price: "от 5 000 сом", days: "3–7 дней", desc: "Красивый сайт для вас или бизнеса: адаптив под телефон, форма заявки, публикация в интернете." },
  { id: "business", icon: "🏢", title: "Сайт или сервис для бизнеса", price: "от 15 000 сом", days: "2–4 недели", desc: "Личный кабинет, база данных, админка, онлайн-запись, каталог, выгрузка в Excel." },
  { id: "bot", icon: "🤖", title: "Telegram-бот", price: "от 7 000 сом", days: "5–10 дней", desc: "Приём заказов, автоответы, уведомления, рассылки, оплата по реквизитам." },
  { id: "crm", icon: "📊", title: "Программа учёта (как ESA Control)", price: "от 25 000 сом", days: "от 1 месяца", desc: "Задачи, сотрудники, отчёты, аналитика — под процессы вашей фирмы." },
  { id: "app", icon: "📱", title: "Мобильное приложение", price: "от 30 000 сом", days: "от 1 месяца", desc: "Android и iOS или PWA, которое ставится как приложение." },
  { id: "ai", icon: "✨", title: "ИИ-ассистент и автоматизация", price: "от 10 000 сом", days: "1–3 недели", desc: "Чат-ассистент на сайте или в Telegram, автоматизация рутины с помощью нейросетей." },
  { id: "ads", icon: "📣", title: "Реклама и контент с ИИ", price: "от 3 000 сом", days: "2–5 дней", desc: "Видео, Reels, дизайн и тексты для соцсетей с помощью нейросетей." },
  { id: "study", icon: "🎓", title: "Обучение и консультация", price: "от 1 000 сом / час", days: "по договорённости", desc: "Помогу разобраться в программировании, ИИ и запуске своего проекта." },
  { id: "other", icon: "💡", title: "Другое — ваша идея", price: "договорная", days: "обсудим", desc: "Опишите задачу — предложу решение и цену." },
];
export const serviceTitle = (id) => SERVICES.find((s) => s.id === id)?.title || "Другое";

export const STATUS = {
  new: "🆕 Новый — ждёт ответа",
  accepted: "✅ Принят — ожидается оплата/предоплата",
  work: "🛠 В работе",
  done: "🎉 Готов",
  rejected: "❌ Отклонён",
};

// ---------- Утилиты
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const esc = (s = "") =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export const clean = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max) : "";

export function newOrderId() {
  const n = randomBytes(4).readUInt32BE(0) % 900000 + 100000;
  return `ESA-${n}`;
}
export const newKey = () => randomBytes(12).toString("base64url");
export const sameKey = (a, b) =>
  typeof a === "string" && typeof b === "string" && a.length === b.length &&
  createHash("sha256").update(a).digest().equals(createHash("sha256").update(b).digest());

// Проверка заказа с сайта / из бота. Возвращает {ok, order} или {ok:false, error}.
export function validateOrder(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Пустой запрос" };
  if (clean(body.website, 200)) return { ok: false, error: "spam" }; // скрытое поле-ловушка для ботов
  const o = {
    name: clean(body.name, 80),
    contact: clean(body.contact, 120),
    service: SERVICES.some((s) => s.id === body.service) ? body.service : "other",
    budget: clean(body.budget, 60),
    deadline: clean(body.deadline, 60),
    details: clean(body.details, 3000),
  };
  if (o.name.length < 2) return { ok: false, error: "Укажите имя" };
  if (o.contact.length < 5) return { ok: false, error: "Укажите телефон, WhatsApp или Telegram для связи" };
  if (o.details.length < 10) return { ok: false, error: "Опишите задачу хотя бы парой предложений" };
  return { ok: true, order: o };
}

export function validateReview(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Пустой запрос" };
  if (clean(body.website, 200)) return { ok: false, error: "spam" };
  const rating = Number(body.rating);
  const r = { name: clean(body.name, 60), text: clean(body.text, 1000), rating };
  if (r.name.length < 2) return { ok: false, error: "Укажите имя" };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Поставьте оценку от 1 до 5" };
  if (r.text.length < 5) return { ok: false, error: "Напишите пару слов" };
  return { ok: true, review: r };
}

// ---------- Хранилище (Supabase на Render или Netlify Blobs — см. store.mjs)
const lazyStore = (name) => {
  let p;
  const s = () => (p ??= getStore({ name, consistency: "strong" }));
  return {
    get: (...a) => s().then((x) => x.get(...a)),
    setJSON: (...a) => s().then((x) => x.setJSON(...a)),
    delete: (...a) => s().then((x) => x.delete(...a)),
    list: (...a) => s().then((x) => x.list(...a)),
  };
};
export const orders = () => lazyStore("orders");
export const reviews = () => lazyStore("reviews");
export const misc = () => lazyStore("misc");

// Простое ограничение частоты: не больше `limit` действий за `windowSec` с одного адреса.
export async function rateLimited(req, context, bucket, limit, windowSec) {
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
  const key = `rl/${bucket}/${createHash("sha256").update(ip).digest("hex").slice(0, 24)}`;
  const store = misc();
  const now = Date.now();
  const hits = ((await store.get(key, { type: "json" })) || []).filter((t) => now - t < windowSec * 1000);
  if (hits.length >= limit) return true;
  hits.push(now);
  await store.setJSON(key, hits);
  return false;
}

// ---------- Telegram
const TG = () => `https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}`;
export const tgEnabled = () => Boolean(process.env.TG_BOT_TOKEN && process.env.TG_OWNER_CHAT_ID);
export const OWNER = () => String(process.env.TG_OWNER_CHAT_ID || "");

export async function tg(method, payload) {
  if (!process.env.TG_BOT_TOKEN) return null;
  try {
    const r = await fetch(`${TG()}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!data.ok) console.error("Telegram error", method, data.description);
    return data;
  } catch (e) {
    console.error("Telegram fetch failed", method, e.message);
    return null;
  }
}
export const send = (chat_id, text, extra = {}) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

export function orderCard(o) {
  return [
    `<b>📝 Заказ ${esc(o.id)}</b>`,
    `<b>Статус:</b> ${esc(STATUS[o.status] || o.status)}`,
    `<b>Услуга:</b> ${esc(serviceTitle(o.service))}`,
    `<b>Имя:</b> ${esc(o.name)}`,
    `<b>Контакт:</b> ${esc(o.contact)}`,
    o.budget ? `<b>Бюджет:</b> ${esc(o.budget)}` : "",
    o.deadline ? `<b>Срок:</b> ${esc(o.deadline)}` : "",
    `<b>Задача:</b>\n${esc(o.details)}`,
    o.chatId ? `\n💬 Клиент подключил Telegram — можно ответить ему ответом (reply) на это сообщение.` : "",
    `<i>Источник: ${esc(o.source || "сайт")} · ${new Date(o.createdAt).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" })}</i>`,
  ].filter(Boolean).join("\n");
}

export const ownerOrderButtons = (id) => ({
  inline_keyboard: [
    [{ text: "✅ Принять", callback_data: `acc:${id}` }, { text: "❌ Отклонить", callback_data: `rej:${id}` }],
    [{ text: "🛠 В работе", callback_data: `work:${id}` }, { text: "🎉 Готово", callback_data: `done:${id}` }],
  ],
});

export async function notifyOwnerNewOrder(o) {
  if (!tgEnabled()) return;
  await send(OWNER(), orderCard(o), { reply_markup: ownerOrderButtons(o.id) });
}

export async function saveNewOrder(data, source, chatId) {
  const o = { ...data, id: newOrderId(), key: newKey(), status: "new", source, chatId: chatId || null, createdAt: Date.now(), history: [] };
  await orders().setJSON(o.id, o);
  await notifyOwnerNewOrder(o);
  return o;
}
