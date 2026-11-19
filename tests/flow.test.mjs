// Автотесты: хранилище Netlify Blobs и Telegram API подменены заглушками.
// Запуск: node --experimental-test-module-mocks --test tests/
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

const stores = new Map();
function memStore(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  const m = stores.get(name);
  return {
    get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, structuredClone(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix = "" } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}
mock.module("@netlify/blobs", { exports: { getStore: ({ name }) => memStore(name) } });

const sent = [];
let msgId = 1000;
globalThis.fetch = async (url, opts) => {
  const method = String(url).split("/").pop();
  const body = JSON.parse(opts.body);
  sent.push({ method, ...body });
  return { json: async () => ({ ok: true, result: { message_id: ++msgId } }) };
};

Object.assign(process.env, {
  TG_BOT_TOKEN: "test-token", TG_OWNER_CHAT_ID: "111", TG_WEBHOOK_SECRET: "s3cret",
  TG_BOT_USERNAME: "esa_test_bot", PAY_INFO: "MBank +996 000", URL: "https://esa.example",
});

const order = (await import("../netlify/functions/order.mjs")).default;
const reviewsFn = (await import("../netlify/functions/reviews.mjs")).default;
const bot = (await import("../netlify/functions/telegram.mjs")).default;
process.env.ADMIN_TOKEN = "admin-test-token-abcdefghijklmnop";
const admin = (await import("../netlify/functions/admin.mjs")).default;
const adminReq = (path, body, tok = process.env.ADMIN_TOKEN) => new Request(`https://esa.example${path}`, {
  method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });

const ctx = (ip = "1.1.1.1") => ({ ip });
const post = (path, body, headers = {}) => new Request(`https://esa.example${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const tgUpdate = (u) => bot(post("/api/telegram", u, { "x-telegram-bot-api-secret-token": "s3cret" }));
const msg = (chatId, text, extra = {}) => ({ message: { message_id: ++msgId, chat: { id: chatId, type: "private" }, from: { id: chatId, first_name: "Айбек" }, text, ...extra } });
const cb = (chatId, data, messageId = 1) => ({ callback_query: { id: "cb" + msgId++, from: { id: chatId }, data, message: { message_id: messageId, chat: { id: chatId } } } });

beforeEach(() => { sent.length = 0; });

test("заказ с сайта: проверка полей", async () => {
  let r = await order(post("/api/order", { name: "A", contact: "", details: "" }), ctx("9.9.9.1"));
  assert.equal(r.status, 400);
  r = await order(post("/api/order", { name: "Бот", contact: "+996555", details: "спам спам спам", website: "x" }), ctx("9.9.9.2"));
  assert.equal(r.status, 200);
  assert.equal(sent.length, 0, "заказ из ловушки не должен уходить владельцу");
});

let siteOrder;
test("заказ с сайта: сохраняется, владелец получает карточку с экранированием", async () => {
  const r = await order(post("/api/order", { name: "<b>Нурлан</b>", contact: "+996 555 123", service: "bot", details: "Нужен бот для кафе <script>" }), ctx("2.2.2.2"));
  assert.equal(r.status, 200);
  siteOrder = await r.json();
  assert.match(siteOrder.id, /^ESA-\d{6}$/);
  assert.ok(siteOrder.botLink.startsWith("https://t.me/esa_test_bot?start=" + siteOrder.id + "_"));
  const card = sent.find((s) => s.method === "sendMessage" && s.chat_id === "111");
  assert.ok(card, "владелец уведомлён");
  assert.ok(card.text.includes("&lt;b&gt;Нурлан") && card.text.includes("&lt;script&gt;"), "HTML клиента экранирован");
  assert.equal(card.reply_markup.inline_keyboard[0][0].callback_data, `acc:${siteOrder.id}`);
});

test("статус заказа: без ключа не отдаётся, с ключом — отдаётся", async () => {
  let r = await order(new Request(`https://esa.example/api/order?id=${siteOrder.id}&k=wrong`), ctx());
  assert.equal(r.status, 404);
  r = await order(new Request(`https://esa.example/api/order?id=${siteOrder.id}&k=${siteOrder.key}`), ctx());
  assert.equal((await r.json()).status, "new");
});

test("ограничение частоты: 6-й заказ за час с одного адреса отклоняется", async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await order(post("/api/order", { name: "Тест", contact: "+996 700", details: "Описание задачи номер " + i }), ctx("3.3.3.3"));
  assert.equal(last.status, 429);
});

test("бот: чужой запрос без секрета отклоняется", async () => {
  const r = await bot(post("/api/telegram", msg(5, "/start"), { "x-telegram-bot-api-secret-token": "bad" }));
  assert.equal(r.status, 403);
});

test("бот: клиент привязывает заказ с сайта по ссылке, владелец принимает — клиент получает реквизиты", async () => {
  await tgUpdate(msg(555, `/start ${siteOrder.id}_${siteOrder.key}`));
  assert.ok(sent.some((s) => s.chat_id === 555 && s.text.includes("привязан")));
  sent.length = 0;
  await tgUpdate(cb(111, `acc:${siteOrder.id}`));
  const toClient = sent.find((s) => s.method === "sendMessage" && s.chat_id === 555);
  assert.ok(toClient && toClient.text.includes("MBank +996 000"), "клиент получил реквизиты");
  assert.ok(sent.some((s) => s.method === "editMessageText"), "карточка владельца обновлена");
});

test("бот: клиент не может нажать кнопку владельца", async () => {
  await tgUpdate(cb(555, `rej:${siteOrder.id}`));
  const r = await order(new Request(`https://esa.example/api/order?id=${siteOrder.id}&k=${siteOrder.key}`), ctx("4.4.4.4"));
  assert.equal((await r.json()).status, "accepted");
});

test("бот: заказ прямо в чате", async () => {
  await tgUpdate(msg(777, "/start"));
  await tgUpdate(cb(777, "m:order"));
  await tgUpdate(cb(777, "o:svc:landing"));
  await tgUpdate(msg(777, "Нужен сайт для салона красоты в Оше"));
  sent.length = 0;
  await tgUpdate(cb(777, "o:tgcontact"));
  const owner = sent.find((s) => s.chat_id === "111");
  assert.ok(owner && owner.text.includes("Сайт-визитка") && owner.text.includes("салона красоты"));
  assert.ok(sent.some((s) => s.chat_id === 777 && s.text.includes("принят в обработку")));
});

test("бот: сообщение клиента пересылается владельцу, ответ владельца — клиенту", async () => {
  await tgUpdate(msg(888, "Здравствуйте, сколько стоит бот?"));
  const fwd = sent.find((s) => s.chat_id === "111" && s.text.includes("сколько стоит"));
  assert.ok(fwd);
  assert.ok(sent.some((s) => s.chat_id === 888 && s.text.includes("Самат ответит")), "автоответ клиенту");
  const fwdMsgId = msgId; // id ответа Telegram на пересылку
  const ownerReplyTarget = [...stores.get("misc").keys()].find((k) => k.startsWith("fwd/"));
  sent.length = 0;
  await tgUpdate(msg(111, "От 7000 сом", { reply_to_message: { message_id: Number(ownerReplyTarget.slice(4)), text: "..." } }));
  assert.ok(sent.some((s) => s.method === "copyMessage" && s.chat_id === 888), "ответ ушёл клиенту");
  assert.ok(fwdMsgId);
});

test("отзывы: появляются только после одобрения владельцем", async () => {
  let r = await reviewsFn(post("/api/reviews", { name: "Асель", rating: 5, text: "Отличный сайт, быстро!" }), ctx("5.5.5.5"));
  assert.equal(r.status, 200);
  let list = await (await reviewsFn(new Request("https://esa.example/api/reviews"), ctx())).json();
  assert.equal(list.count, 0);
  const btn = sent.find((s) => s.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.startsWith("rvok:"));
  await tgUpdate(cb(111, btn.reply_markup.inline_keyboard[0][0].callback_data));
  list = await (await reviewsFn(new Request("https://esa.example/api/reviews"), ctx())).json();
  assert.equal(list.count, 1);
  assert.equal(list.average, 5);
  r = await reviewsFn(post("/api/reviews", { name: "X", rating: 9, text: "плохая оценка" }), ctx("5.5.5.6"));
  assert.equal(r.status, 400);
});

test("приложение: без ключа — 401, с ключом — заказы без секретного ключа клиента", async () => {
  assert.equal((await admin(adminReq("/api/admin/data", null, "wrong-token"), ctx("6.6.6.1"))).status, 401);
  const r = await admin(adminReq("/api/admin/data"), ctx("6.6.6.2"));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(d.orders.length >= 2);
  assert.ok(d.orders.every((o) => !("key" in o)), "секретный ключ клиента не отдаётся");
  assert.ok(d.orders[0].createdAt >= d.orders[d.orders.length - 1].createdAt, "сортировка: новые сверху");
});

test("приложение: смена статуса уведомляет клиента в Telegram", async () => {
  sent.length = 0;
  const r = await admin(adminReq("/api/admin/status", { id: siteOrder.id, status: "done" }), ctx("6.6.6.3"));
  const j = await r.json();
  assert.equal(j.status, "done");
  assert.equal(j.clientNotified, true);
  assert.ok(sent.some((s) => s.chat_id === 555 && s.text.includes("готов")));
  assert.equal((await admin(adminReq("/api/admin/status", { id: siteOrder.id, status: "hack" }), ctx("6.6.6.4"))).status, 404);
});

test("приложение: подписка на уведомления проверяется", async () => {
  assert.equal((await admin(adminReq("/api/admin/subscribe", { subscription: { endpoint: "http://evil" } }), ctx("6.6.6.5"))).status, 400);
  const ok = await admin(adminReq("/api/admin/subscribe", { subscription: { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } } }), ctx("6.6.6.6"));
  assert.equal(ok.status, 200);
});
