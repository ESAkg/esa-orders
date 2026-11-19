// ESA — сайт заказов. Данные пользователей вставляются только через textContent (защита от XSS).
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => n.append(k));
  return n;
};
const starsText = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

async function api(path, opts) {
  const r = await fetch(path, { headers: { "content-type": "application/json" }, ...opts });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error(data.error || "Ошибка сети. Попробуйте ещё раз.");
  return data;
}

// ---------- Услуги
async function loadServices() {
  const grid = $("#servicesGrid");
  const select = $("#serviceSelect");
  try {
    const { services, bot } = await api("/api/services");
    grid.replaceChildren(...services.map((s) => {
      const btn = el("button", { className: "btn btn-sm btn-ghost", type: "button", textContent: "Заказать" });
      btn.addEventListener("click", () => { select.value = s.id; $("#order").scrollIntoView(); $("#orderForm [name=name]").focus({ preventScroll: true }); });
      return el("div", { className: "card" },
        el("div", { className: "icon", textContent: s.icon }),
        el("h3", { textContent: s.title }),
        el("p", { textContent: s.desc }),
        el("div", { className: "price", textContent: s.price }),
        el("div", { className: "muted small", textContent: "Срок: " + s.days }),
        btn);
    }));
    select.replaceChildren(...services.map((s) => el("option", { value: s.id, textContent: `${s.icon} ${s.title} — ${s.price}` })));
    if (bot) $("#botLinkHero").href = `https://t.me/${bot}`;
  } catch (e) {
    grid.replaceChildren(el("p", { className: "muted", textContent: "Не удалось загрузить услуги. Напишите в Telegram." }));
  }
}

// ---------- Заказ
$("#orderForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target, msg = $("#orderMsg"), btn = f.querySelector("button[type=submit]");
  const body = Object.fromEntries(new FormData(f));
  msg.className = "form-msg"; msg.textContent = "";
  btn.disabled = true; btn.textContent = "Отправляю…";
  try {
    const r = await api("/api/order", { method: "POST", body: JSON.stringify(body) });
    f.hidden = true;
    $("#doneId").textContent = r.id;
    const link = `${location.origin}/?order=${encodeURIComponent(r.id)}&k=${encodeURIComponent(r.key || "")}#status`;
    $("#doneStatusLink").href = link; $("#doneStatusLink").textContent = link;
    if (r.botLink) { $("#doneBot").href = r.botLink; $("#doneBot").hidden = false; }
    $("#orderDone").hidden = false;
    try { localStorage.setItem("esa_last_order", JSON.stringify({ id: r.id, key: r.key })); } catch {}
  } catch (e) {
    msg.className = "form-msg err"; msg.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = "Отправить заказ";
  }
});

// ---------- Отзывы
async function loadReviews() {
  try {
    const r = await api("/api/reviews");
    $("#avg").textContent = r.count ? r.average.toFixed(1) : "—";
    $("#avgHero").textContent = r.count ? `${r.average.toFixed(1)} ★` : "новый";
    $("#avgStars").textContent = r.count ? starsText(r.average) : "";
    $("#cnt").textContent = r.count ? `${r.count} отзыв(ов)` : "Пока нет отзывов — будьте первым!";
    $("#reviewsList").replaceChildren(...r.items.map((it) =>
      el("div", { className: "card review" },
        el("div", { className: "who" }, el("span", { textContent: it.name }), el("time", { textContent: new Date(it.createdAt).toLocaleDateString("ru-RU") })),
        el("div", { className: "stars", textContent: starsText(it.rating) }),
        el("p", { textContent: it.text }))));
  } catch {
    $("#cnt").textContent = "Отзывы временно недоступны";
  }
}

let rating = 0;
const starBox = $("#starInput");
for (let i = 1; i <= 5; i++) {
  const b = el("button", { type: "button", textContent: "★", ariaLabel: `${i} из 5` });
  b.setAttribute("role", "radio");
  b.addEventListener("click", () => {
    rating = i;
    [...starBox.children].forEach((c, j) => { c.classList.toggle("on", j < i); c.setAttribute("aria-checked", String(j === i - 1)); });
  });
  starBox.append(b);
}

$("#reviewForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target, msg = $("#reviewMsg"), btn = f.querySelector("button[type=submit]");
  const body = { ...Object.fromEntries(new FormData(f)), rating };
  msg.className = "form-msg";
  if (!rating) { msg.className = "form-msg err"; msg.textContent = "Поставьте оценку звёздами"; return; }
  btn.disabled = true;
  try {
    const r = await api("/api/reviews", { method: "POST", body: JSON.stringify(body) });
    msg.className = "form-msg ok"; msg.textContent = r.message || "Спасибо!";
    f.reset(); rating = 0; [...starBox.children].forEach((c) => c.classList.remove("on"));
  } catch (e) {
    msg.className = "form-msg err"; msg.textContent = e.message;
  } finally { btn.disabled = false; }
});

// ---------- Статус заказа
async function loadStatus() {
  const p = new URLSearchParams(location.search);
  let id = p.get("order"), k = p.get("k");
  if (!id) { try { ({ id, k } = JSON.parse(localStorage.getItem("esa_last_order") || "{}")); } catch {} }
  if (!id || !k) return;
  const out = $("#statusOut");
  try {
    const r = await api(`/api/order?id=${encodeURIComponent(id)}&k=${encodeURIComponent(k)}`);
    out.textContent = `Заказ ${r.id} (${r.service}): ${r.statusText}`;
  } catch (e) { out.textContent = `Заказ ${id}: ${e.message}`; }
}

loadServices(); loadReviews(); loadStatus();
