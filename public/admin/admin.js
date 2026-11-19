// ESA Заказы — приложение владельца. Пользовательские данные выводятся только через textContent.
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.flat().forEach((k) => k != null && n.append(k)); return n; };
const svgEl = (tag, attrs = {}, ...kids) => { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); kids.forEach((k) => n.append(k)); return n; };
const TZ = "Asia/Bishkek";
const fmtDate = (ts) => new Date(ts).toLocaleString("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dayKey = (ts) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: TZ }); // YYYY-MM-DD
const STATUS_COLORS = { new: "#2ec5ff", accepted: "#ffc93c", work: "#ff9f43", done: "#3ddc97", rejected: "#ff6b6b" };
const STATUS_SHORT = { new: "Новый", accepted: "Принят", work: "В работе", done: "Готов", rejected: "Отклонён" };

let token = "";
try { token = localStorage.getItem("esa_admin_token") || ""; } catch {}
let data = null, filter = "active", seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem("esa_seen") || "[]")); } catch {}

// Вход по ссылке вида /admin/#token=...
const hashToken = new URLSearchParams(location.hash.slice(1)).get("token");
if (hashToken) { token = hashToken; try { localStorage.setItem("esa_admin_token", token); } catch {} history.replaceState(null, "", "/admin/"); }

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (r.status === 401) { showLogin("Ключ не подошёл"); throw new Error("401"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Ошибка сети");
  return j;
}

function showLogin(msg = "") { $("#app").hidden = true; $("#login").hidden = false; $("#loginErr").textContent = msg; }
$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault(); token = $("#tokenInput").value.trim();
  try { localStorage.setItem("esa_admin_token", token); } catch {}
  start();
});

function notice(text) { const n = $("#notice"); n.textContent = text; n.hidden = !text; if (text) setTimeout(() => (n.hidden = true), 4000); }

// ---------- Загрузка
async function load() {
  data = await api("/api/admin/data");
  render();
}
function render() {
  renderChips(); renderOrders(); renderStats(); renderReviews();
  const fresh = data.orders.filter((o) => o.status === "new").length;
  $("#newBadge").hidden = !fresh; $("#newBadge").textContent = fresh;
  const pend = data.reviews.filter((r) => r.state === "pending").length;
  $("#rvBadge").hidden = !pend; $("#rvBadge").textContent = pend;
}

// ---------- Заказы
const FILTERS = [["active", "Активные"], ["new", "Новые"], ["accepted", "Приняты"], ["work", "В работе"], ["done", "Готовы"], ["rejected", "Отклонены"], ["all", "Все"]];
function renderChips() {
  const count = (f) => data.orders.filter((o) => f === "all" || (f === "active" ? !["done", "rejected"].includes(o.status) : o.status === f)).length;
  $("#statusChips").replaceChildren(...FILTERS.map(([f, label]) => {
    const b = el("button", { className: f === filter ? "on" : "", textContent: `${label} · ${count(f)}` });
    b.onclick = () => { filter = f; renderChips(); renderOrders(); };
    return b;
  }));
}
function contactLink(c) {
  const t = c.trim();
  if (/^@[\w\d_]{3,}$/.test(t)) return el("a", { href: `https://t.me/${t.slice(1)}`, textContent: `✈️ ${t}`, target: "_blank", rel: "noopener" });
  const digits = t.replace(/[^\d+]/g, "");
  if (digits.replace("+", "").length >= 9) {
    const wa = el("a", { href: `https://wa.me/${digits.replace("+", "")}`, textContent: "WhatsApp", target: "_blank", rel: "noopener" });
    return el("span", {}, el("a", { href: `tel:${digits}`, textContent: `📞 ${t}` }), " · ", wa);
  }
  return el("span", { textContent: `💬 ${t}` });
}
function renderOrders() {
  const list = data.orders.filter((o) => filter === "all" || (filter === "active" ? !["done", "rejected"].includes(o.status) : o.status === filter));
  if (!list.length) return $("#ordersList").replaceChildren(el("p", { className: "empty", textContent: "Здесь пока пусто 🙌" }));
  const svc = Object.fromEntries(data.services.map((s) => [s.id, `${s.icon} ${s.title}`]));
  $("#ordersList").replaceChildren(...list.map((o) => {
    const btns = el("div", { className: "st-btns" }, ...["accepted", "work", "done", "rejected"].map((s) => {
      const b = el("button", { className: o.status === s ? "cur" : "", textContent: STATUS_SHORT[s] });
      b.onclick = () => changeStatus(o, s, b);
      return b;
    }));
    const hist = (o.history || []).map((h) => `${STATUS_SHORT[h.status]} — ${fmtDate(h.at)}`).join(" · ");
    const card = el("article", { className: "card order" + (seen.has(o.id) ? "" : " fresh"), id: `o-${o.id}` },
      el("div", { className: "top" },
        el("div", {}, el("div", { className: "id", textContent: o.id }), el("span", { className: `badge s-${o.status}`, textContent: STATUS_SHORT[o.status] })),
        el("div", { className: "when" }, el("div", { textContent: fmtDate(o.createdAt) }), el("div", { textContent: o.source || "" }))),
      el("div", { className: "svc", textContent: svc[o.service] || o.service }),
      el("div", { className: "who" }, el("b", { textContent: o.name }), contactLink(o.contact || "")),
      (o.budget || o.deadline) ? el("div", { className: "meta", textContent: [o.budget && `💰 ${o.budget}`, o.deadline && `⏱ ${o.deadline}`].filter(Boolean).join("   ") }) : null,
      el("div", { className: "details", textContent: o.details }),
      hist ? el("div", { className: "meta", textContent: hist }) : null,
      o.chatId ? el("div", { className: "meta", textContent: "✈️ Клиент в Telegram — получит уведомление о статусе" }) : null,
      btns);
    card.addEventListener("click", () => markSeen(o.id, card), { once: true });
    return card;
  }));
  const target = new URLSearchParams(location.hash.slice(1)).get("order");
  if (target) document.getElementById(`o-${target}`)?.scrollIntoView({ block: "center" });
}
function markSeen(id, card) {
  seen.add(id); card.classList.remove("fresh");
  try { localStorage.setItem("esa_seen", JSON.stringify([...seen].slice(-500))); } catch {}
}
async function changeStatus(o, s, btn) {
  btn.disabled = true;
  try {
    const r = await api("/api/admin/status", { method: "POST", body: JSON.stringify({ id: o.id, status: s }) });
    notice(`${o.id}: ${STATUS_SHORT[s]}${r.clientNotified ? " · клиент уведомлён в Telegram" : ""}`);
    await load();
  } catch (e) { if (e.message !== "401") notice("Ошибка: " + e.message); btn.disabled = false; }
}

// ---------- Статистика (свои SVG-графики)
function renderStats() {
  const os = data.orders, now = Date.now();
  const by = (f) => os.filter(f).length;
  const month = by((o) => now - o.createdAt < 30 * 864e5), week = by((o) => now - o.createdAt < 7 * 864e5);
  const done = by((o) => o.status === "done"), closed = done + by((o) => o.status === "rejected");
  const ok = data.reviews.filter((r) => r.state === "ok");
  const avg = ok.length ? (ok.reduce((s, r) => s + r.rating, 0) / ok.length).toFixed(1) : "—";
  const kpi = (v, l) => el("div", { className: "kpi" }, el("b", { textContent: v }), el("span", { textContent: l }));
  $("#kpis").replaceChildren(kpi(os.length, "всего заказов"), kpi(week, "за 7 дней"), kpi(month, "за 30 дней"),
    kpi(by((o) => o.status === "new"), "ждут ответа"), kpi(closed ? Math.round((done / closed) * 100) + "%" : "—", "выполнено"), kpi(avg + (ok.length ? "★" : ""), `рейтинг (${ok.length})`));

  // По дням — линия с заливкой
  const days = [...Array(30)].map((_, i) => dayKey(now - (29 - i) * 864e5));
  const perDay = Object.fromEntries(days.map((d) => [d, 0]));
  os.forEach((o) => { const k = dayKey(o.createdAt); if (k in perDay) perDay[k]++; });
  const vals = days.map((d) => perDay[d]), max = Math.max(1, ...vals);
  const W = 320, H = 130, P = 22, x = (i) => P + (i * (W - P - 6)) / 29, y = (v) => H - 18 - (v / max) * (H - 32);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Заказы по дням" },
    svgEl("defs", {}, svgEl("linearGradient", { id: "g", x1: 0, x2: 0, y1: 0, y2: 1 }, svgEl("stop", { offset: 0, "stop-color": "#2ec5ff", "stop-opacity": .45 }), svgEl("stop", { offset: 1, "stop-color": "#2ec5ff", "stop-opacity": 0 }))),
    ...[0, .5, 1].map((t) => svgEl("line", { x1: P, x2: W - 6, y1: y(max * t), y2: y(max * t), stroke: "#1d2f5e" })),
    ...[0, Math.ceil(max / 2), max].map((v) => { const t = svgEl("text", { x: P - 6, y: y(v) + 3, "text-anchor": "end" }); t.textContent = v; return t; }),
    svgEl("path", { d: `${line}L${x(29)},${H - 18}L${x(0)},${H - 18}Z`, fill: "url(#g)" }),
    svgEl("path", { d: line, fill: "none", stroke: "#2ec5ff", "stroke-width": 2, "stroke-linejoin": "round" }),
    ...vals.map((v, i) => v ? svgEl("circle", { cx: x(i), cy: y(v), r: 2.5, fill: "#2ec5ff" }) : svgEl("g")),
    ...[0, 10, 20, 29].map((i) => { const t = svgEl("text", { x: x(i), y: H - 4, "text-anchor": "middle" }); t.textContent = days[i].slice(8) + "." + days[i].slice(5, 7); return t; }));
  $("#chartDays").replaceChildren(svg);

  // Статусы — кольцевая диаграмма
  const st = Object.keys(STATUS_SHORT).map((s) => [s, by((o) => o.status === s)]).filter(([, n]) => n);
  const total = st.reduce((s, [, n]) => s + n, 0);
  const R = 48, C = 2 * Math.PI * R; let off = 0;
  const ring = svgEl("svg", { viewBox: "0 0 120 120", role: "img", "aria-label": "Статусы заказов" },
    svgEl("circle", { cx: 60, cy: 60, r: R, fill: "none", stroke: "#1d2f5e", "stroke-width": 16 }),
    ...st.map(([s, n]) => { const len = (n / total) * C; const c = svgEl("circle", { cx: 60, cy: 60, r: R, fill: "none", stroke: STATUS_COLORS[s], "stroke-width": 16, "stroke-dasharray": `${len} ${C - len}`, "stroke-dashoffset": -off, transform: "rotate(-90 60 60)" }); off += len; return c; }));
  const mid = svgEl("text", { x: 60, y: 66, "text-anchor": "middle", style: "font-size:20px;font-weight:800;fill:#eaf0ff" }); mid.textContent = total; ring.append(mid);
  $("#chartStatus").replaceChildren(ring, el("div", { className: "legend" }, ...(st.length ? st.map(([s, n]) => el("div", {}, el("i", { style: `background:${STATUS_COLORS[s]}` }), `${STATUS_SHORT[s]}: ${n}`)) : [el("span", { className: "muted", textContent: "Пока нет заказов" })])));

  // Услуги — горизонтальные полосы
  const svcCount = data.services.map((s) => [`${s.icon} ${s.title}`, by((o) => o.service === s.id)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  const smax = Math.max(1, ...svcCount.map(([, n]) => n));
  $("#chartServices").replaceChildren(...(svcCount.length ? svcCount.map(([t, n]) => el("div", { className: "hbar" }, el("span", { textContent: t }), el("b", { textContent: n }), el("div", { className: "track" }, el("div", { className: "fill", style: `width:${(n / smax) * 100}%` })))) : [el("span", { className: "muted", textContent: "Пока нет данных" })]));

  // По часам — столбики
  const hours = Array(24).fill(0);
  os.forEach((o) => hours[Number(new Date(o.createdAt).toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false })) % 24]++);
  const hmax = Math.max(1, ...hours), bw = (W - 10) / 24;
  $("#chartHours").replaceChildren(svgEl("svg", { viewBox: `0 0 ${W} 100`, role: "img", "aria-label": "Заказы по часам" },
    ...hours.map((n, h) => svgEl("rect", { x: 5 + h * bw + 1, y: 82 - (n / hmax) * 72, width: bw - 2, height: Math.max(1, (n / hmax) * 72), rx: 2, fill: n ? "#7b5cff" : "#1d2f5e" })),
    ...[0, 6, 12, 18, 23].map((h) => { const t = svgEl("text", { x: 5 + h * bw + bw / 2, y: 96, "text-anchor": "middle" }); t.textContent = h; return t; })));
}

// ---------- Отзывы
function renderReviews() {
  const rv = data.reviews;
  if (!rv.length) return $("#reviewsList").replaceChildren(el("p", { className: "empty", textContent: "Отзывов пока нет" }));
  $("#reviewsList").replaceChildren(...rv.map((r) => {
    const act = (label, action) => { const b = el("button", { textContent: label }); b.onclick = () => reviewAction(r.id, action); return b; };
    return el("article", { className: "card review" },
      el("div", { className: "order" }, el("div", { className: "top" }, el("b", { textContent: r.name }), el("span", { className: "when muted", textContent: fmtDate(r.createdAt) }))),
      el("div", { className: "stars", textContent: "★".repeat(r.rating) + "☆".repeat(5 - r.rating) }),
      el("p", { textContent: r.text }),
      el("span", { className: `badge ${r.state === "ok" ? "s-done" : "s-accepted"}`, textContent: r.state === "ok" ? "Опубликован" : "Ждёт проверки" }),
      el("div", { className: "row" }, r.state === "ok" ? act("Скрыть", "hide") : act("✅ Опубликовать", "approve"), act("🗑 Удалить", "delete")));
  }));
}
async function reviewAction(id, action) {
  if (action === "delete" && !confirm("Удалить отзыв навсегда?")) return;
  try { await api("/api/admin/review", { method: "POST", body: JSON.stringify({ id, action }) }); await load(); } catch (e) { if (e.message !== "401") notice(e.message); }
}

// ---------- Вкладки
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== `tab-${b.dataset.tab}`));
  scrollTo(0, 0);
}));
if (location.hash.includes("reviews")) document.querySelector('[data-tab="reviews"]').click();

// ---------- Push-уведомления
const b64 = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
async function enablePush(silent) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) { if (!silent) notice("Этот браузер не поддерживает уведомления"); return; }
  const reg = await navigator.serviceWorker.ready;
  if (Notification.permission !== "granted") {
    if (silent) return;
    if ((await Notification.requestPermission()) !== "granted") return notice("Уведомления запрещены — включите их в настройках приложения");
  }
  const { key } = await fetch("/api/admin/vapid").then((r) => r.json());
  if (!key) return notice("На сервере не настроены уведомления");
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
  await api("/api/admin/subscribe", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON() }) });
  $("#bellBtn").classList.add("on");
  if (!silent) { await api("/api/admin/test-push", { method: "POST", body: "{}" }); notice("Уведомления включены — отправил проверочное 🔔"); }
}
$("#bellBtn").onclick = () => enablePush(false).catch((e) => notice("Не удалось: " + e.message));
$("#refreshBtn").onclick = () => load().then(() => notice("Обновлено")).catch(() => {});

// ---------- Старт
async function start() {
  if (!token) return showLogin();
  try { await load(); } catch (e) { if (e.message !== "401") { $("#app").hidden = false; $("#login").hidden = true; notice("Нет связи с сервером: " + e.message); } return; }
  $("#login").hidden = true; $("#app").hidden = false;
  enablePush(true).catch(() => {});
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/" }).catch(() => {});
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data === "refresh") load().catch(() => {}); });
setInterval(() => { if (document.visibilityState === "visible" && token && data) load().catch(() => {}); }, 30000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && data) load().catch(() => {}); });
start();
