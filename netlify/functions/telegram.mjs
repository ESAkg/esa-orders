// Telegram-бот ESA (webhook). Клиентам — автоответы, меню, заказ прямо в чате, статус заказа.
// Владельцу — карточки заказов с кнопками, ответы клиентам через «Ответить», одобрение отзывов.
import {
  SERVICES, STATUS, serviceTitle, json, esc, sameKey, validateOrder,
  orders, reviews, misc, tg, send, OWNER, orderCard, ownerOrderButtons, saveNewOrder, setOrderStatus,
} from "../lib/core.mjs";

const SITE = () => process.env.URL || "";
const isOwner = (chatId) => OWNER() && String(chatId) === OWNER();

const MENU = {
  inline_keyboard: [
    [{ text: "🛒 Услуги и цены", callback_data: "m:services" }],
    [{ text: "📝 Оформить заказ", callback_data: "m:order" }],
    [{ text: "📦 Мои заказы", callback_data: "m:my" }, { text: "💬 Написать Самату", callback_data: "m:talk" }],
    [{ text: "🌐 Сайт и отзывы", url: SITE() || "https://t.me/E_S_A_0_0" }],
  ],
};

const getState = (chatId) => misc().get(`state/${chatId}`, { type: "json" });
const setState = (chatId, s) => misc().setJSON(`state/${chatId}`, s);
const clearState = (chatId) => misc().delete(`state/${chatId}`);

async function linkOrderToChat(o, chatId) {
  o.chatId = chatId;
  await orders().setJSON(o.id, o);
  const list = (await misc().get(`my/${chatId}`, { type: "json" })) || [];
  if (!list.includes(o.id)) { list.unshift(o.id); await misc().setJSON(`my/${chatId}`, list.slice(0, 20)); }
}

async function forwardToOwner(msg, prefix) {
  const from = msg.from || {};
  const who = `${esc(from.first_name || "")} ${esc(from.last_name || "")}`.trim() + (from.username ? ` (@${esc(from.username)})` : "");
  const r = await send(OWNER(), `<b>${prefix}</b>\nОт: ${who}\n\n${esc(msg.text || "[не текст: фото/файл — откройте чат с ботом]")}\n\n<i>Ответьте на это сообщение (reply) — бот перешлёт ответ клиенту.</i>`);
  if (r?.ok) await misc().setJSON(`fwd/${r.result.message_id}`, { chatId: msg.chat.id });
  if (msg.photo || msg.document || msg.voice) await tg("forwardMessage", { chat_id: OWNER(), from_chat_id: msg.chat.id, message_id: msg.message_id });
}

// ---------- Клиент
async function clientMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (text.startsWith("/start")) {
    const param = text.split(" ")[1] || "";
    const m = param.match(/^(ESA-\d{6})_([A-Za-z0-9_-]{16})$/);
    if (m) {
      const o = await orders().get(m[1], { type: "json" });
      if (o && sameKey(m[2], o.key)) {
        await linkOrderToChat(o, chatId);
        await send(OWNER(), `🔗 Клиент по заказу <b>${esc(o.id)}</b> подключил Telegram. Теперь он будет получать статусы.`);
        return send(chatId, `✅ Заказ <b>${esc(o.id)}</b> привязан к этому чату.\n${esc(STATUS[o.status])}\n\nЯ сообщу сюда, когда Самат примет заказ и когда изменится статус.`, { reply_markup: MENU });
      }
    }
    await clearState(chatId);
    return send(chatId, `Салам, ${esc(msg.from?.first_name || "друг")}! 👋\nЯ бот <b>ESA</b> — помощник Самата Эркебаева.\n\nСайты, Telegram-боты, программы для бизнеса, приложения, ИИ и реклама.\nВыберите, что нужно:`, { reply_markup: MENU });
  }
  if (text === "/myid") return send(chatId, `Ваш chat id: <code>${chatId}</code>`);
  if (text === "/menu" || text === "/help") { await clearState(chatId); return send(chatId, "Главное меню:", { reply_markup: MENU }); }

  const st = await getState(chatId);
  if (st?.step === "details") {
    if (text.length < 10) return send(chatId, "Опишите задачу чуть подробнее (хотя бы пару предложений) 🙂");
    await setState(chatId, { ...st, step: "contact", details: text });
    return send(chatId, "Как с вами связаться? Напишите телефон / WhatsApp,\nили нажмите кнопку, чтобы связаться здесь, в Telegram.", {
      reply_markup: { inline_keyboard: [[{ text: "💬 Пишите мне в Telegram", callback_data: "o:tgcontact" }]] },
    });
  }
  if (st?.step === "contact") return finishBotOrder(msg, st, text);
  if (st?.step === "talk") {
    await clearState(chatId);
    await forwardToOwner(msg, "💬 Сообщение от клиента");
    return send(chatId, "Передал Самату ✅ Он ответит здесь же, обычно в течение пары часов.", { reply_markup: MENU });
  }

  // Любое другое сообщение — автоответ + пересылка владельцу
  await forwardToOwner(msg, "💬 Сообщение боту");
  return send(chatId, "Спасибо за сообщение! Самат ответит здесь, как только сможет 🙌\nА пока можно посмотреть услуги или сразу оформить заказ:", { reply_markup: MENU });
}

async function finishBotOrder(msgOrCb, st, contactText) {
  const from = msgOrCb.from || {};
  const chatId = st.chatId;
  const contact = contactText || (from.username ? `Telegram @${from.username}` : `Telegram (чат с ботом)`);
  const v = validateOrder({ name: [from.first_name, from.last_name].filter(Boolean).join(" ") || "Клиент", contact, service: st.service, details: st.details });
  if (!v.ok) return send(chatId, `⚠️ ${esc(v.error)}`);
  const o = await saveNewOrder(v.order, "Telegram-бот", chatId);
  await linkOrderToChat(o, chatId);
  await clearState(chatId);
  return send(chatId, `🎉 Заказ <b>${esc(o.id)}</b> принят в обработку!\nУслуга: ${esc(serviceTitle(o.service))}\n\nСамат посмотрит и ответит здесь. Обычно — в течение дня.`, { reply_markup: MENU });
}

async function clientCallback(cb) {
  const chatId = cb.message.chat.id;
  const d = cb.data || "";

  if (d === "m:services") {
    const lines = SERVICES.map((s) => `${s.icon} <b>${esc(s.title)}</b> — ${esc(s.price)}\n<i>${esc(s.desc)}</i>`);
    return send(chatId, `<b>Услуги ESA</b>\n\n${lines.join("\n\n")}\n\nЦены ориентировочные — точная цена после обсуждения задачи.`, {
      reply_markup: { inline_keyboard: [[{ text: "📝 Оформить заказ", callback_data: "m:order" }]] },
    });
  }
  if (d === "m:order") {
    const rows = SERVICES.map((s) => [{ text: `${s.icon} ${s.title}`, callback_data: `o:svc:${s.id}` }]);
    return send(chatId, "Что нужно сделать? Выберите услугу:", { reply_markup: { inline_keyboard: rows } });
  }
  if (d.startsWith("o:svc:")) {
    const service = d.slice(6);
    await setState(chatId, { step: "details", service, chatId });
    return send(chatId, `Отлично: <b>${esc(serviceTitle(service))}</b>.\nТеперь опишите задачу одним сообщением: что нужно, примеры, сроки, бюджет.`);
  }
  if (d === "o:tgcontact") {
    const st = await getState(chatId);
    if (st?.step === "contact") return finishBotOrder(cb, st, "");
    return send(chatId, "Начнём заново:", { reply_markup: MENU });
  }
  if (d === "m:my") {
    const ids = (await misc().get(`my/${chatId}`, { type: "json" })) || [];
    if (!ids.length) return send(chatId, "У вас пока нет заказов. Оформить?", { reply_markup: { inline_keyboard: [[{ text: "📝 Оформить заказ", callback_data: "m:order" }]] } });
    const list = (await Promise.all(ids.map((id) => orders().get(id, { type: "json" })))).filter(Boolean);
    return send(chatId, list.map((o) => `<b>${esc(o.id)}</b> · ${esc(serviceTitle(o.service))}\n${esc(STATUS[o.status])}`).join("\n\n"));
  }
  if (d === "m:talk") {
    await setState(chatId, { step: "talk", chatId });
    return send(chatId, "Напишите сообщение — я передам его Самату лично ✍️");
  }
}

// ---------- Владелец
async function ownerMessage(msg) {
  const text = (msg.text || "").trim();
  if (msg.reply_to_message) {
    const rid = msg.reply_to_message.message_id;
    let target = (await misc().get(`fwd/${rid}`, { type: "json" }))?.chatId;
    if (!target) {
      const m = (msg.reply_to_message.text || "").match(/ESA-\d{6}/);
      if (m) target = (await orders().get(m[0], { type: "json" }))?.chatId;
    }
    if (!target) return send(msg.chat.id, "⚠️ Не нашёл, кому ответить: клиент ещё не подключил Telegram. Свяжитесь по контакту из заказа.");
    const r = await tg("copyMessage", { chat_id: target, from_chat_id: msg.chat.id, message_id: msg.message_id });
    if (r?.ok) {
      await send(target, "↩️ <i>Это ответ от Самата. Можно ответить прямо здесь.</i>");
      return send(msg.chat.id, "✅ Отправлено клиенту.");
    }
    return send(msg.chat.id, "⚠️ Не удалось отправить (клиент мог заблокировать бота).");
  }
  if (text === "/orders") {
    const store = orders();
    const { blobs } = await store.list();
    const all = (await Promise.all(blobs.slice(-200).map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
    all.sort((a, b) => b.createdAt - a.createdAt);
    const active = all.filter((o) => !["done", "rejected"].includes(o.status)).slice(0, 15);
    if (!active.length) return send(msg.chat.id, "Активных заказов нет 🙌");
    return send(msg.chat.id, active.map((o) => `<b>${esc(o.id)}</b> · ${esc(serviceTitle(o.service))} · ${esc(o.name)}\n${esc(STATUS[o.status])}`).join("\n\n") + "\n\nКарточка заказа: /o ESA-XXXXXX");
  }
  const m = text.match(/^\/o\s+(ESA-\d{6})$/i);
  if (m) {
    const o = await orders().get(m[1].toUpperCase(), { type: "json" });
    if (!o) return send(msg.chat.id, "Заказ не найден");
    return send(msg.chat.id, orderCard(o), { reply_markup: ownerOrderButtons(o.id) });
  }
  if (text === "/myid") return send(msg.chat.id, `Ваш chat id: <code>${msg.chat.id}</code>`);
  return send(msg.chat.id, "Команды владельца:\n/orders — активные заказы\n/o ESA-123456 — карточка заказа\nЧтобы ответить клиенту — ответьте (reply) на его сообщение или карточку заказа.");
}

async function ownerCallback(cb) {
  const [act, id] = (cb.data || "").split(":");
  if (act === "rvok" || act === "rvno") {
    const store = reviews();
    const r = await store.get(`pending/${id}`, { type: "json" });
    if (!r) return tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Уже обработан" });
    await store.delete(`pending/${id}`);
    if (act === "rvok") await store.setJSON(`ok/${id}`, r);
    await tg("editMessageText", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: "HTML",
      text: `${act === "rvok" ? "✅ Опубликован" : "🗑 Скрыт"} отзыв от <b>${esc(r.name)}</b> (${r.rating}★):\n${esc(r.text)}` });
    return tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Готово" });
  }

  const map = { acc: "accepted", rej: "rejected", work: "work", done: "done" };
  if (!map[act]) return tg("answerCallbackQuery", { callback_query_id: cb.id });
  const res = await setOrderStatus(id, map[act]);
  if (!res) return tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Заказ не найден" });
  const o = res.order;
  await tg("editMessageText", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text: orderCard(o), parse_mode: "HTML", reply_markup: ownerOrderButtons(o.id) });
  let note = `Статус: ${STATUS[o.status]}`;
  note += o.chatId ? " · клиенту отправлено" : " · клиент не в Telegram, свяжитесь по контакту";
  return tg("answerCallbackQuery", { callback_query_id: cb.id, text: note.slice(0, 190), show_alert: !o.chatId });
}

// ---------- Точка входа
export default async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  const secret = process.env.TG_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return json({ error: "forbidden" }, 403);

  let u;
  try { u = await req.json(); } catch { return json({ ok: true }); }
  try {
    if (u.message && u.message.chat?.type === "private") {
      if (isOwner(u.message.chat.id)) await ownerMessage(u.message);
      else await clientMessage(u.message);
    } else if (u.callback_query) {
      const cb = u.callback_query;
      if (isOwner(cb.from.id) && /^(acc|rej|work|done|rvok|rvno):/.test(cb.data || "")) await ownerCallback(cb);
      else { await tg("answerCallbackQuery", { callback_query_id: cb.id }); await clientCallback(cb); }
    }
  } catch (e) {
    console.error("bot error", e);
  }
  return json({ ok: true }); // всегда 200, чтобы Telegram не повторял запрос бесконечно
};

export const config = { path: "/api/telegram" };
