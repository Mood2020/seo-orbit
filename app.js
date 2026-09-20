(function () {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const toFa = value => String(value).replace(/[0-9]/g, digit => "۰۱۲۳۴۵۶۷۸۹"[digit]);
  const state = {
    currentUrl: "example.com",
    latest: null,
    demo: { overall: 82, technical: 89, content: 76, performance: 78 }
  };

  const toast = (message, type = "success") => {
    const node = $("#toast");
    $("#toastMessage").textContent = message;
    $(".toast-icon", node).textContent = type === "error" ? "!" : "✓";
    node.classList.toggle("error", type === "error");
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 3600);
  };

  const openModal = (title, body) => {
    $("#modalTitle").textContent = title;
    $("#modalBody").textContent = body;
    const modal = $("#modal");
    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");
  };

  const closeModal = () => {
    const modal = $("#modal");
    if (typeof modal.close === "function") modal.close();
    else modal.removeAttribute("open");
  };

  const goTo = view => {
    $$(".nav-item[data-view]").forEach(item => item.classList.toggle("active", item.dataset.view === view));
    $$(".view").forEach(panel => panel.classList.toggle("active", panel.dataset.viewPanel === view));
    const active = $(`.nav-item[data-view="${view}"]`);
    $("#pageTitle").textContent = active ? active.textContent.trim().replace(/\s+/g, " ") : "نمای کلی";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const normalizeUrl = value => {
    let url = value.trim();
    if (!url) throw new Error("آدرس سایت را وارد کن.");
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("آدرس سایت معتبر نیست.");
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  };

  const requestJson = async (url, timeout = 30000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const requestText = async (url, timeout = 22000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  };

  const lighthouseUrl = (url, strategy) => {
    const params = new URLSearchParams({ url, strategy, category: "performance", category: "seo", category: "accessibility", category: "best-practices" });
    // URLSearchParams keeps one category per key only when using append.
    params.delete("category");
    ["performance", "seo", "accessibility", "best-practices"].forEach(category => params.append("category", category));
    return `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
  };

  const getAuditScore = (data, category) => Math.round((data?.lighthouseResult?.categories?.[category]?.score || 0) * 100);

  const inspectHtml = html => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.querySelector("title")?.textContent.trim() || "";
    const description = doc.querySelector('meta[name="description"]')?.content.trim() || "";
    const h1 = [...doc.querySelectorAll("h1")].map(node => node.textContent.trim()).filter(Boolean);
    const headings = [...doc.querySelectorAll("h2, h3")].map(node => node.textContent.trim()).filter(Boolean);
    const images = [...doc.images];
    const noAlt = images.filter(image => !image.hasAttribute("alt") || !image.alt.trim()).length;
    const links = [...doc.querySelectorAll("a[href]")];
    const canonical = doc.querySelector('link[rel="canonical"]')?.href || "";
    const lang = doc.documentElement.lang || "";
    const words = (doc.body?.innerText || "").trim().split(/\s+/).filter(Boolean).length;
    const schema = [...doc.querySelectorAll('script[type="application/ld+json"]')].length;
    const openGraph = ["og:title", "og:description", "og:image"].filter(name => doc.querySelector(`meta[property="${name}"]`)).length;
    const score = Math.max(0, Math.min(100, 100 - (title ? 0 : 18) - (description ? 0 : 15) - (h1.length === 1 ? 0 : 12) - (noAlt ? Math.min(15, noAlt * 2) : 0) - (words < 300 ? 12 : 0) - (canonical ? 0 : 8) - (lang ? 0 : 5)));
    return { title, description, h1, headings, imageCount: images.length, noAlt, linkCount: links.length, canonical, lang, words, schema, openGraph, score };
  };

  const fallbackContent = url => ({ title: new URL(url).hostname, description: "داده‌ی محتوایی در دسترس نبود", h1: [], headings: [], imageCount: 0, noAlt: 0, linkCount: 0, canonical: "", lang: "", words: 0, schema: 0, openGraph: 0, score: 65 });

  const calculateReport = (url, mobile, desktop, content) => {
    const mobilePerformance = getAuditScore(mobile, "performance");
    const desktopPerformance = getAuditScore(desktop, "performance");
    const seo = getAuditScore(mobile || desktop, "seo");
    const accessibility = getAuditScore(mobile || desktop, "accessibility");
    const bestPractices = getAuditScore(mobile || desktop, "best-practices");
    const performance = mobilePerformance || desktopPerformance || state.demo.performance;
    const technical = Math.round((seo || state.demo.technical) * .58 + (bestPractices || 80) * .22 + (content.canonical ? 100 : 55) * .2);
    const overall = Math.round((technical * .34) + (content.score * .28) + (performance * .28) + ((accessibility || 80) * .1));
    return { url, overall, technical, content: content.score, performance, mobilePerformance, desktopPerformance, seo, accessibility, bestPractices, contentAudit: content, checkedAt: new Date().toISOString() };
  };

  const renderScore = (selector, value, progressSelector) => {
    const node = $(selector);
    if (node) node.textContent = toFa(value);
    const progress = progressSelector && $(progressSelector);
    if (progress) progress.style.width = `${value}%`;
  };

  const renderReport = report => {
    state.latest = report;
    state.currentUrl = report.url;
    renderScore("#overallScore", report.overall, "#overallProgress");
    renderScore("#technicalScore", report.technical);
    renderScore("#contentScore", report.content);
    renderScore("#performanceScore", report.performance);
    renderScore("#lighthouseScore", report.performance);
    const issueList = $("#priorityList");
    const issues = [];
    if (!report.contentAudit.title || report.contentAudit.title.length > 60) issues.push(["critical", "عنوان صفحه نیاز به اصلاح دارد", "عنوان خالی است یا بیش از ۶۰ کاراکتر دارد"]);
    if (!report.contentAudit.description) issues.push(["critical", "توضیحات متا پیدا نشد", "برای افزایش CTR یک توضیح ۱۲۰ تا ۱۶۰ کاراکتری بنویس"]);
    if (report.contentAudit.noAlt) issues.push(["warning", "تصاویر بدون متن جایگزین", `${toFa(report.contentAudit.noAlt)} تصویر · دسترسی و سئو`]);
    if (report.contentAudit.words && report.contentAudit.words < 300) issues.push(["info", "این صفحه محتوای کمی دارد", `${toFa(report.contentAudit.words)} کلمه · فرصت توسعه محتوایی`]);
    if (!report.contentAudit.schema) issues.push(["info", "داده ساختاریافته اضافه کن", "FAQ یا Organization می‌تواند نتیجه غنی بسازد"]);
    if (!issues.length) issues.push(["info", "مشکل بحرانی پیدا نشد", "ساختار صفحه برای بررسی‌های بعدی آماده است"]);
    issueList.innerHTML = issues.slice(0, 3).map((issue, index) => `<div class="issue-item"><span class="issue-number ${issue[0]}">${toFa(index + 1)}</span><div><b>${issue[1]}</b><small>${issue[2]}</small></div><span class="issue-arrow">←</span></div>`).join("");
    const domain = new URL(report.url).hostname.replace(/^www\./, "");
    const history = JSON.parse(localStorage.getItem("orbit-history") || "[]").filter(item => item.url !== report.url);
    history.unshift({ url: report.url, score: report.overall, checkedAt: report.checkedAt });
    localStorage.setItem("orbit-history", JSON.stringify(history.slice(0, 8)));
    localStorage.setItem("orbit-last-report", JSON.stringify(report));
    renderHistory();
    toast(`تحلیل ${domain} آماده شد`);
  };

  const renderHistory = () => {
    const body = $("#historyBody");
    const saved = JSON.parse(localStorage.getItem("orbit-history") || "[]");
    if (!saved.length) return;
    body.innerHTML = saved.slice(0, 5).map((item, index) => {
      const host = new URL(item.url).hostname.replace(/^www\./, "");
      const first = host.charAt(0).toUpperCase();
      const colors = ["orange-bg", "violet-bg", "blue-bg", "orange-bg", "violet-bg"];
      const date = new Date(item.checkedAt);
      return `<tr><td><span class="site-favicon ${colors[index]}">${first}</span><b>${host}</b></td><td>${index === 0 ? "امروز" : date.toLocaleDateString("fa-IR")}</td><td><strong class="table-score ${item.score > 85 ? "high" : item.score < 72 ? "medium" : ""}">${toFa(item.score)}</strong></td><td><span class="trend up">↗ تحلیل جدید</span></td><td><span class="status-tag success">کامل شد</span></td><td><button class="row-menu" data-history-url="${item.url}">⋮</button></td></tr>`;
    }).join("");
  };

  const runScan = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    let url;
    try { url = normalizeUrl($("#siteUrl").value); } catch (error) { toast(error.message, "error"); return; }
    form.classList.add("loading");
    $("#scanButton").setAttribute("aria-busy", "true");
    const mobileEnabled = $("#mobileCheck").checked;
    const deepEnabled = $("#deepCheck").checked;
    try {
      const calls = [requestJson(lighthouseUrl(url, mobileEnabled ? "mobile" : "desktop"))];
      if (mobileEnabled) calls.push(requestJson(lighthouseUrl(url, "desktop")));
      if (deepEnabled) calls.push(requestText(url));
      const results = await Promise.allSettled(calls);
      const mobile = results[0].status === "fulfilled" ? results[0].value : null;
      const desktop = mobileEnabled && results[1]?.status === "fulfilled" ? results[1].value : null;
      const htmlResult = deepEnabled ? results[mobileEnabled ? 2 : 1] : null;
      const content = htmlResult?.status === "fulfilled" ? inspectHtml(htmlResult.value) : fallbackContent(url);
      const report = calculateReport(url, mobile, desktop, content);
      renderReport(report);
      if (!mobile && !htmlResult) toast("اتصال به سرویس تحلیل برقرار نشد؛ داده نمونه نمایش داده شد", "error");
      goTo("dashboard");
    } catch (error) {
      toast("تحلیل با خطا روبه‌رو شد؛ دوباره تلاش کن", "error");
    } finally {
      form.classList.remove("loading");
      $("#scanButton").removeAttribute("aria-busy");
    }
  };

  const buildExport = () => {
    const report = state.latest || { url: state.currentUrl, overall: state.demo.overall, technical: state.demo.technical, content: state.demo.content, performance: state.demo.performance, checkedAt: new Date().toISOString() };
    const payload = { product: "Orbit SEO", generatedAt: report.checkedAt, website: report.url, scores: { overall: report.overall, technical: report.technical, content: report.content, performance: report.performance }, contentAudit: report.contentAudit || report.content };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `orbit-seo-${new URL(report.url).hostname.replace(/^www\./, "")}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast("فایل گزارش دانلود شد");
  };

  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-view]");
    if (nav) { goTo(nav.dataset.view); return; }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const actions = {
      export: buildExport,
      "close-modal": closeModal,
      fixes: () => openModal("برنامه پیشنهادی", "اول عنوان‌های طولانی را اصلاح کن، سپس توضیحات متا و متن جایگزین تصاویر را به ترتیب اثرگذاری تکمیل کن."),
      "all-history": () => openModal("آرشیو تحلیل‌ها", "تمام تحلیل‌های این مرورگر در همین دستگاه ذخیره می‌شوند. برای پشتیبان‌گیری از خروجی گزارش استفاده کن."),
      settings: () => openModal("تنظیمات فضای کاری", "در نسخه بعدی می‌توانی دامنه‌های پروژه، زبان گزارش و اتصال‌های Google را از اینجا مدیریت کنی."),
      keyword: () => openModal("خوشه‌ساز کلمات", "کلمه‌ی اصلی را وارد کن تا خوشه‌های پیشنهادی، نیت جست‌وجو و ساختار صفحات ستون استخراج شود."),
      brief: () => openModal("دستیار بریف محتوا", "برای ساخت بریف دقیق، بعد از اجرای تحلیل یک صفحه را از گزارش انتخاب کن. این قابلیت آماده اتصال به داده‌های واقعی پروژه است."),
      competitor: () => openModal("مقایسه رقبا", "دو دامنه رقیب را اضافه کن تا اختلاف امتیاز فنی، سرعت و پوشش موضوعی را کنار هم ببینی."),
      recrawl: () => { goTo("dashboard"); $("#siteUrl").focus(); toast("آدرس سایت را بررسی کن و تحلیل جدید را شروع کن"); }
    };
    if (actions[action.dataset.action]) actions[action.dataset.action]();
  });

  $("#scanForm").addEventListener("submit", runScan);
  $$(".device-tabs button").forEach(button => button.addEventListener("click", () => {
    $$(".device-tabs button").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    if (state.latest) renderScore("#lighthouseScore", button.textContent.trim() === "دسکتاپ" ? (state.latest.desktopPerformance || state.latest.performance) : state.latest.mobilePerformance || state.latest.performance);
  }));
  document.addEventListener("click", event => {
    const historyButton = event.target.closest("[data-history-url]");
    if (historyButton) { $("#siteUrl").value = historyButton.dataset.historyUrl; goTo("dashboard"); toast("پروژه برای تحلیل دوباره آماده شد"); }
  });

  const savedLast = JSON.parse(localStorage.getItem("orbit-last-report") || "null");
  if (savedLast) renderReport(savedLast);
  renderHistory();
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
