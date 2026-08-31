/* =========================================================
   NUBNUB — app logic
   All data lives in localStorage. No backend, no build step.
   ========================================================= */
(() => {
  "use strict";

  /* ---------- constants ---------- */
  const LS_TX = "nubnub.transactions";
  const LS_INV = "nubnub.inventory";

  const EXPENSE_CATS = ["อาหาร", "ของใช้", "เดินทาง", "บันเทิง", "ที่พัก/บิล", "สุขภาพ", "อื่นๆ"];
  const INCOME_CATS  = ["เงินเดือน", "รายได้เสริม", "ของขวัญ", "อื่นๆ"];
  const INV_CATS     = ["ของกิน", "ของใช้ในบ้าน", "ของใช้ส่วนตัว", "สัตว์เลี้ยง", "อื่นๆ"];

  const LOW_DAYS_THRESHOLD = 3;

  /* ---------- state ---------- */
  let transactions = loadJSON(LS_TX, []);
  let inventory    = loadJSON(LS_INV, []);
  let txFilter  = "all";
  let invFilter = "all";

  /* ---------- helpers ---------- */
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("โหลดข้อมูลไม่สำเร็จ", key, e);
      return fallback;
    }
  }
  function saveTx()  { localStorage.setItem(LS_TX, JSON.stringify(transactions)); }
  function saveInv() { localStorage.setItem(LS_INV, JSON.stringify(inventory)); }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function addDays(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
  }
  function diffDays(fromISO, toISO) {
    const a = new Date(fromISO + "T00:00:00");
    const b = new Date(toISO + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }
  function formatMoney(n) {
    const v = Number(n) || 0;
    return v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  }
  function formatDateShort(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 1800);
  }

  /* =========================================================
     TAB NAVIGATION
     ========================================================= */
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
      document.querySelectorAll(".page").forEach((p) => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.getElementById(btn.dataset.page).classList.add("is-active");
    });
  });

  document.getElementById("tx-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    txFilter = btn.dataset.filter;
    [...btn.parentElement.children].forEach((b) => b.classList.toggle("is-active", b === btn));
    renderTransactions();
  });
  document.getElementById("inv-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    invFilter = btn.dataset.filter;
    [...btn.parentElement.children].forEach((b) => b.classList.toggle("is-active", b === btn));
    renderInventory();
  });

  /* =========================================================
     RENDER: transactions + summary
     ========================================================= */
  function renderSummary() {
    const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    document.getElementById("sum-income").textContent = formatMoney(income);
    document.getElementById("sum-expense").textContent = formatMoney(expense);
    document.getElementById("sum-balance").textContent = formatMoney(income - expense);
  }

  const ICON_EXPENSE = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v16M17 8.5c0-1.9-2.2-3.5-5-3.5s-5 1.4-5 3.2c0 4 10 2 10 6 0 1.8-2.2 3.3-5 3.3s-5-1.6-5-3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
  const ICON_INCOME  = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_TRASH   = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0 1 12a1 1 0 001 1h6a1 1 0 001-1l1-12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function renderTransactions() {
    const list = document.getElementById("tx-list");
    const empty = document.getElementById("tx-empty");
    let items = [...transactions].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
    if (txFilter !== "all") items = items.filter((t) => t.type === txFilter);

    if (items.length === 0) {
      list.innerHTML = "";
      empty.hidden = false;
    } else {
      empty.hidden = true;
      list.innerHTML = items.map((t) => `
        <li class="tx-item is-${t.type}">
          <span class="tx-icon">${t.type === "income" ? ICON_INCOME : ICON_EXPENSE}</span>
          <span class="tx-main">
            <div class="tx-name">${escapeHtml(t.name)}</div>
            <div class="tx-meta">${escapeHtml(t.category)} · ${formatDateShort(t.date)}</div>
          </span>
          <span class="tx-amount">${t.type === "income" ? "+" : "-"}${formatMoney(t.amount)}</span>
          <button class="tx-del" data-del-tx="${t.id}" aria-label="ลบรายการ">${ICON_TRASH}</button>
        </li>
      `).join("");
    }
    renderSummary();
  }

  document.getElementById("tx-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-del-tx]");
    if (!btn) return;
    transactions = transactions.filter((t) => t.id !== btn.dataset.delTx);
    saveTx();
    renderTransactions();
    toast("ลบรายการแล้ว");
  });

  /* =========================================================
     INVENTORY: derived math
     ========================================================= */
  function currentPurchase(item) { return item.purchases[item.purchases.length - 1]; }

  function invDerived(item) {
    const cur = currentPurchase(item);
    const expiry = addDays(cur.date, cur.estDays);
    const daysLeft = diffDays(todayISO(), expiry);
    let status = "ok";
    if (daysLeft < 0) status = "out";
    else if (daysLeft <= LOW_DAYS_THRESHOLD) status = "low";

    const avgPrice = item.purchases.reduce((s, p) => s + p.price, 0) / item.purchases.length;
    const priceDiff = cur.price - item.normalPrice;

    const learned = item.purchases.map((p) => p.actualDays).filter((d) => d != null && d > 0);
    const suggestedDays = learned.length
      ? Math.round(learned.reduce((s, d) => s + d, 0) / learned.length)
      : cur.estDays;

    const totalSpan = Math.max(cur.estDays, 1);
    const usedRatio = Math.min(Math.max(1 - daysLeft / totalSpan, 0), 1);

    return { cur, expiry, daysLeft, status, avgPrice, priceDiff, suggestedDays, usedRatio };
  }

  /* =========================================================
     RENDER: inventory
     ========================================================= */
  const ICON_REFILL = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 0114-5.3M20 4v4h-4M20 12a8 8 0 01-14 5.3M4 20v-4h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function statusLabel(s) {
    if (s === "ok") return "ปกติ";
    if (s === "low") return "ใกล้หมด";
    return "หมดแล้ว";
  }
  function daysLeftLabel(daysLeft) {
    if (daysLeft < 0) return { num: Math.abs(daysLeft), unit: "วันที่แล้ว (เกินกำหนด)" };
    if (daysLeft === 0) return { num: "วันนี้", unit: "คาดว่าจะหมด" };
    return { num: daysLeft, unit: "วันจะหมด" };
  }

  function renderInventory() {
    const list = document.getElementById("inv-list");
    const empty = document.getElementById("inv-empty");
    let items = [...inventory].sort((a, b) => a.name.localeCompare(b.name, "th"));

    const decorated = items.map((item) => ({ item, d: invDerived(item) }));
    let filtered = decorated;
    if (invFilter === "low") filtered = decorated.filter((x) => x.d.status === "low");
    if (invFilter === "out") filtered = decorated.filter((x) => x.d.status === "out");
    filtered.sort((a, b) => a.d.daysLeft - b.d.daysLeft);

    if (filtered.length === 0) {
      list.innerHTML = "";
      empty.hidden = false;
    } else {
      empty.hidden = true;
      list.innerHTML = filtered.map(({ item, d }) => {
        const dl = daysLeftLabel(d.daysLeft);
        const diffTag = d.priceDiff < 0
          ? `<span class="price-diff cheaper">ถูกกว่าปกติ ${formatMoney(Math.abs(d.priceDiff))}</span>`
          : d.priceDiff > 0
          ? `<span class="price-diff pricier">แพงกว่าปกติ ${formatMoney(d.priceDiff)}</span>`
          : `<span class="price-diff same">เท่าราคาปกติ</span>`;
        return `
        <li class="inv-card is-${d.status}">
          <div class="inv-top">
            <span class="inv-name-wrap">
              <span class="inv-name">${escapeHtml(item.name)}</span>
              <span class="inv-cat">${escapeHtml(item.category)}</span>
            </span>
            <span class="status-badge status-${d.status}">${statusLabel(d.status)}</span>
          </div>

          <div class="inv-days">${dl.num}<span class="unit">${dl.unit}</span></div>
          <div class="inv-bar-track"><div class="inv-bar-fill" style="width:${Math.round(d.usedRatio * 100)}%"></div></div>

          <div class="inv-price-row">
            <span>ล่าสุด <b>${formatMoney(d.cur.price)}</b> · เฉลี่ย ${formatMoney(d.avgPrice)} · ปกติ ${formatMoney(item.normalPrice)}</span>
            ${diffTag}
          </div>

          <div class="inv-actions">
            <button class="btn-mini primary" data-refill="${item.id}">${ICON_REFILL} เติมของ</button>
            <button class="btn-mini ghost-del" data-del-inv="${item.id}" aria-label="ลบของชิ้นนี้">${ICON_TRASH}</button>
          </div>
        </li>`;
      }).join("");
    }
  }

  document.getElementById("inv-list").addEventListener("click", (e) => {
    const refillBtn = e.target.closest("[data-refill]");
    const delBtn = e.target.closest("[data-del-inv]");
    if (refillBtn) openRefillForm(refillBtn.dataset.refill);
    if (delBtn) {
      const item = inventory.find((i) => i.id === delBtn.dataset.delInv);
      if (item && confirm(`ลบ "${item.name}" ออกจากสต็อกใช่ไหม?`)) {
        inventory = inventory.filter((i) => i.id !== item.id);
        saveInv();
        renderInventory();
        toast("ลบของออกจากสต็อกแล้ว");
      }
    }
  });

  /* =========================================================
     BOTTOM SHEET (modal) — generic open/close
     ========================================================= */
  const overlay = document.getElementById("overlay");
  const sheetBody = document.getElementById("sheet-body");

  function openSheet(html) {
    sheetBody.innerHTML = html;
    overlay.classList.add("is-open");
  }
  function closeSheet() {
    overlay.classList.remove("is-open");
  }
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSheet(); });

  function catOptions(cats, selected) {
    return cats.map((c) => `<option value="${escapeHtml(c)}" ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
  }

  /* -------- FAB: choose what to add depending on current page -------- */
  document.getElementById("fab-add").addEventListener("click", () => {
    const onInventoryPage = document.getElementById("page-inventory").classList.contains("is-active");
    if (onInventoryPage) openAddInventoryForm();
    else openAddTransactionForm();
  });

  /* =========================================================
     FORM: add transaction
     ========================================================= */
  function openAddTransactionForm() {
    openSheet(`
      <h3 class="form-title">บันทึกรายการเงิน</h3>
      <div class="segmented" id="tx-type-toggle">
        <button type="button" class="is-active" data-type="expense">รายจ่าย</button>
        <button type="button" data-type="income">รายรับ</button>
      </div>
      <form id="tx-form">
        <div class="field">
          <label for="tx-name">ชื่อรายการ</label>
          <input id="tx-name" required placeholder="เช่น ข้าวมันไก่, ค่ารถ">
        </div>
        <div class="field-row">
          <div class="field">
            <label for="tx-amount">จำนวนเงิน (บาท)</label>
            <input id="tx-amount" type="number" inputmode="decimal" min="0" step="0.01" required placeholder="0">
          </div>
          <div class="field">
            <label for="tx-date">วันที่</label>
            <input id="tx-date" type="date" value="${todayISO()}" required>
          </div>
        </div>
        <div class="field">
          <label for="tx-category">หมวดหมู่</label>
          <select id="tx-category">${catOptions(EXPENSE_CATS)}</select>
        </div>
        <button type="submit" class="btn-primary">บันทึก</button>
      </form>
    `);

    let currentType = "expense";
    const toggle = document.getElementById("tx-type-toggle");
    const catSelect = document.getElementById("tx-category");
    toggle.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      currentType = b.dataset.type;
      [...toggle.children].forEach((c) => c.classList.toggle("is-active", c === b));
      catSelect.innerHTML = catOptions(currentType === "expense" ? EXPENSE_CATS : INCOME_CATS);
    });

    document.getElementById("tx-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("tx-name").value.trim();
      const amount = parseFloat(document.getElementById("tx-amount").value);
      const date = document.getElementById("tx-date").value || todayISO();
      const category = catSelect.value;
      if (!name || !(amount > 0)) return;

      transactions.push({ id: uid(), type: currentType, name, amount, category, date });
      saveTx();
      renderTransactions();
      closeSheet();
      toast("บันทึกรายการแล้ว");
    });
  }

  /* =========================================================
     FORM: add new inventory item
     ========================================================= */
  function openAddInventoryForm() {
    openSheet(`
      <h3 class="form-title">เพิ่มของในสต็อก</h3>
      <form id="inv-form">
        <div class="field">
          <label for="inv-name">ชื่อของ</label>
          <input id="inv-name" required placeholder="เช่น อาหารแมว, ยาสีฟัน">
        </div>
        <div class="field">
          <label for="inv-category">หมวดหมู่</label>
          <select id="inv-category">${catOptions(INV_CATS)}</select>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="inv-normal-price">ราคาปกติ (บาท)</label>
            <input id="inv-normal-price" type="number" inputmode="decimal" min="0" step="0.01" required placeholder="0">
          </div>
          <div class="field">
            <label for="inv-price">ราคาที่ซื้อครั้งนี้</label>
            <input id="inv-price" type="number" inputmode="decimal" min="0" step="0.01" required placeholder="0">
          </div>
        </div>
        <div class="field">
          <label for="inv-days">คาดว่าใช้ได้กี่วัน</label>
          <input id="inv-days" type="number" inputmode="numeric" min="1" required placeholder="เช่น 7">
        </div>
        <p class="hint-box">กะคร่าวๆ ก็พอ ครั้งหน้าตอนเติมของ ระบบจะช่วยคำนวณจำนวนวันให้เองจากที่ใช้จริง</p>
        <label class="checkbox-row"><input type="checkbox" id="inv-log-expense" checked> บันทึกเป็นรายจ่ายด้วย</label>
        <button type="submit" class="btn-primary">เพิ่มของ</button>
      </form>
    `);

    document.getElementById("inv-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("inv-name").value.trim();
      const category = document.getElementById("inv-category").value;
      const normalPrice = parseFloat(document.getElementById("inv-normal-price").value);
      const price = parseFloat(document.getElementById("inv-price").value);
      const estDays = parseInt(document.getElementById("inv-days").value, 10);
      const logExpense = document.getElementById("inv-log-expense").checked;
      if (!name || !(normalPrice >= 0) || !(price >= 0) || !(estDays > 0)) return;

      const date = todayISO();
      inventory.push({
        id: uid(), name, category, normalPrice,
        purchases: [{ id: uid(), date, price, estDays, actualDays: null }],
      });
      saveInv();

      if (logExpense) {
        transactions.push({ id: uid(), type: "expense", name, amount: price, category: "ของใช้", date });
        saveTx();
        renderTransactions();
      }

      renderInventory();
      closeSheet();
      toast("เพิ่มของในสต็อกแล้ว");
    });
  }

  /* =========================================================
     FORM: refill existing inventory item
     ========================================================= */
  function openRefillForm(itemId) {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;
    const d = invDerived(item);
    const actualUsed = diffDays(d.cur.date, todayISO());

    openSheet(`
      <h3 class="form-title">เติมของ · ${escapeHtml(item.name)}</h3>
      <p class="hint-box">รอบที่แล้วใช้ไปจริง ${actualUsed >= 0 ? actualUsed : 0} วัน ระบบแนะนำจำนวนวันรอบถัดไปให้ด้านล่าง (แก้ไขได้)</p>
      <form id="refill-form">
        <div class="field-row">
          <div class="field">
            <label for="refill-price">ราคาที่ซื้อครั้งนี้</label>
            <input id="refill-price" type="number" inputmode="decimal" min="0" step="0.01" required placeholder="0" value="${d.cur.price}">
          </div>
          <div class="field">
            <label for="refill-days">คาดว่าใช้ได้กี่วัน</label>
            <input id="refill-days" type="number" inputmode="numeric" min="1" required value="${d.suggestedDays}">
          </div>
        </div>
        <label class="checkbox-row"><input type="checkbox" id="refill-log-expense" checked> บันทึกเป็นรายจ่ายด้วย</label>
        <button type="submit" class="btn-primary">ยืนยันเติมของ</button>
        <button type="button" class="btn-secondary" id="refill-cancel">ยกเลิก</button>
      </form>
    `);

    document.getElementById("refill-cancel").addEventListener("click", closeSheet);

    document.getElementById("refill-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const price = parseFloat(document.getElementById("refill-price").value);
      const estDays = parseInt(document.getElementById("refill-days").value, 10);
      const logExpense = document.getElementById("refill-log-expense").checked;
      if (!(price >= 0) || !(estDays > 0)) return;

      const today = todayISO();
      d.cur.actualDays = Math.max(actualUsed, 0);
      item.purchases.push({ id: uid(), date: today, price, estDays, actualDays: null });
      saveInv();

      if (logExpense) {
        transactions.push({ id: uid(), type: "expense", name: item.name, amount: price, category: "ของใช้", date: today });
        saveTx();
        renderTransactions();
      }

      renderInventory();
      closeSheet();
      toast("เติมของเรียบร้อย");
    });
  }

  /* =========================================================
     INIT
     ========================================================= */
  renderTransactions();
  renderInventory();
})();
