// Одноразовая настройка бота: POST /api/tg-setup с заголовком x-setup-secret = TG_WEBHOOK_SECRET.
// Регистрирует адрес webhook, команды и описание бота.
import { json, tg } from "../lib/core.mjs";

export default async (req) => {
  const secret = process.env.TG_WEBHOOK_SECRET;
  if (req.method !== "POST" || !secret || req.headers.get("x-setup-secret") !== secret) return json({ error: "forbidden" }, 403);
  const base = process.env.URL;
  const results = {
    webhook: await tg("setWebhook", {
      url: `${base}/api/telegram`,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }),
    commands: await tg("setMyCommands", {
      commands: [
        { command: "start", description: "Главное меню" },
        { command: "menu", description: "Услуги, заказ, мои заказы" },
      ],
    }),
    description: await tg("setMyDescription", {
      description: "Бот ESA — Самат Эркебаев. Закажите сайт, Telegram-бота, программу для бизнеса, приложение, ИИ-ассистента или рекламу. Ответ — в течение дня.",
    }),
    short: await tg("setMyShortDescription", { short_description: "Заказы ESA: сайты, боты, программы, ИИ. Ош, Кыргызстан." }),
  };
  return json({ ok: true, results });
};

export const config = { path: "/api/tg-setup" };
