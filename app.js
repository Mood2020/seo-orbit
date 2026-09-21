(function () {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const fa = value => String(value ?? "—").replace(/[0-9]/g, digit => "۰۱۲۳۴۵۶۷۸۹"[digit]);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const state = { latest: null, currentUrl: "", activeRun: null };
  const psiKeyStorage = "orbit-pagespeed-key";
  const backendStorage = "orbit-api-url";
  const getPsiKey = () => localStorage.getItem(psiKeyStorage) || "";
  const getBackendUrl = () => (localStorage.getItem(backendStorage) || "").trim().replace(/\/$/, "");
  const backendEndpoint = (path, params) => {
    const base = getBackendUrl();
    if (!base) return "";
    return `${base}${path}?${new URLSearchParams(params)}`;
  };

  const toast = (message, type = "success") => {
    const node = $("#toast");
    if (!node) return;
    $("#toastMessage", node).textContent = message;
    $(".toast-icon", node).textContent = type === "error" ? "!" : "✓";
    node.classList.toggle("error", type === "error");
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 4200);
  };

  const openModal = (title, html) => {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = html;
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
    let url = String(value || "").trim();
    if (!url) throw new Error("آدرس سایت را وارد کن.");
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("فقط آدرس HTTP یا HTTPS قابل بررسی است.");
    parsed.hash = "";
    parsed.search = parsed.search.replace(/utm_[^=]+=[^&]+&?/gi, "").replace(/[?&]$/, "");
    return parsed.toString().replace(/\/$/, "");
  };

  const fetchWithTimeout = async (url, options = {}, timeout = 30000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  };

  const fetchText = async url => {
    const started = performance.now();
    const candidates = [
      ["direct", url],
      ["allorigins", `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`],
      ["corsproxy", `https://corsproxy.io/?${encodeURIComponent(url)}`],
      ["codetabs", `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`]
    ];
    const backend = backendEndpoint("/api/fetch", { url });
    if (backend) candidates.unshift(["orbit-backend", backend]);
    const errors = [];
    for (const [source, requestUrl] of candidates) {
      try {
        const response = await fetchWithTimeout(requestUrl, {}, source === "direct" ? 12000 : 24000);
        if (!response.ok) {
          const body = await response.text();
          let detail = "";
          try { detail = JSON.parse(body)?.error?.message || ""; } catch { /* Plain upstream error. */ }
          errors.push(`${source}:${response.status}${detail ? `:${detail}` : ""}`);
          continue;
        }
        const text = await response.text();
        if (!text.trim()) { errors.push(`${source}:empty`); continue; }
        return { url, text, ms: Math.round(performance.now() - started), status: response.status, source };
      } catch (error) { errors.push(`${source}:${error.name === "AbortError" ? "timeout" : error.message}`); }
    }
    throw new Error(`دریافت ${url} ناموفق بود (${errors.join(" | ")})${getBackendUrl() ? "" : "؛ برای تحلیل پایدار، آدرس backend را در تنظیمات وارد کن."}`);
  };

  const fetchJson = async url => {
    const response = await fetchWithTimeout(url, {}, 40000);
    const body = await response.text();
    let data;
    try { data = JSON.parse(body); } catch { data = null; }
    if (!response.ok) throw new Error(data?.error?.message || `API با وضعیت ${response.status} پاسخ داد`);
    return data || {};
  };

  const pageSpeedUrl = (url, strategy) => {
    const params = new URLSearchParams({ url, strategy });
    ["performance", "seo", "accessibility", "best-practices"].forEach(category => params.append("category", category));
    const key = getPsiKey();
    if (key) params.set("key", key);
    return getBackendUrl() ? `${getBackendUrl()}/api/pagespeed?${params}` : `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
  };

  const categoryScore = (data, category) => {
    const value = data?.lighthouseResult?.categories?.[category]?.score;
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  };

  const parseRobots = text => {
    const rules = { disallow: [], sitemaps: [] };
    let applies = false;
    String(text || "").split(/\r?\n/).forEach(line => {
      const clean = line.replace(/#.*/, "").trim();
      if (!clean) return;
      const [rawKey, ...rest] = clean.split(":");
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") applies = value === "*";
      if (applies && key === "disallow" && value) rules.disallow.push(value);
      if (key === "sitemap" && /^https?:\/\//i.test(value)) rules.sitemaps.push(value);
    });
    return rules;
  };

  const parseSitemap = (text, baseUrl) => {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) return [];
    return [...doc.querySelectorAll("url > loc, sitemap > loc")].map(node => node.textContent.trim()).filter(value => {
      try { return new URL(value, baseUrl).protocol.startsWith("http"); } catch { return false; }
    }).map(value => new URL(value, baseUrl).toString().replace(/#.*$/, "").replace(/\/$/, ""));
  };

  const isBlocked = (url, rules) => {
    const path = new URL(url).pathname;
    return rules.disallow.some(prefix => prefix === "/" || path.startsWith(prefix));
  };

  const isHtmlCandidate = url => !/\.(?:pdf|zip|rar|7z|jpe?g|png|gif|webp|svg|ico|css|js|xml|json|txt|mp4|mp3|woff2?)(?:$|\?)/i.test(new URL(url).pathname);

  const extractLinks = (html, pageUrl) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const origin = new URL(pageUrl).origin;
    const internal = new Set();
    const external = new Set();
    [...doc.querySelectorAll("a[href]")].forEach(node => {
      try {
        const target = new URL(node.getAttribute("href"), pageUrl);
        target.hash = "";
        const url = target.toString().replace(/\/$/, "");
        if (!/^https?:$/i.test(target.protocol)) return;
        if (target.origin === origin && isHtmlCandidate(url)) internal.add(url);
        else if (target.origin !== origin) external.add(url);
      } catch { /* Ignore malformed href values. */ }
    });
    return { internal: [...internal], external: [...external] };
  };

  const discoverLinks = (html, pageUrl) => extractLinks(html, pageUrl).internal;

  const textLength = value => String(value || "").trim().length;
  const check = (id, label, passed, detail, weight, severity = "warning") => ({ id, label, passed, detail, weight, severity });

  const articleTypes = new Set(["article", "blogposting", "newsarticle", "techarticle", "socialmediaposting"]);
  const schemaObjects = value => {
    const result = [];
    const visit = item => {
      if (Array.isArray(item)) return item.forEach(visit);
      if (!item || typeof item !== "object") return;
      result.push(item);
      if (item["@graph"]) visit(item["@graph"]);
    };
    visit(value);
    return result;
  };
  const jsonLd = doc => [...doc.querySelectorAll('script[type="application/ld+json"]')].flatMap(node => {
    try { return schemaObjects(JSON.parse(node.textContent || "")); } catch { return []; }
  });
  const schemaValue = (value, fallback = "") => {
    if (Array.isArray(value)) return schemaValue(value[0], fallback);
    if (value && typeof value === "object") return String(value.name || value.text || value["@id"] || fallback);
    return value == null ? fallback : String(value);
  };
  const countWords = value => String(value || "").trim().split(/\s+/).filter(Boolean).length;

  const inspectPage = (html, url, meta = {}) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.querySelector("title")?.textContent.trim() || "";
    const description = doc.querySelector('meta[name="description"]')?.content.trim() || "";
    const h1 = [...doc.querySelectorAll("h1")].map(node => node.textContent.trim()).filter(Boolean);
    const headings = [...doc.querySelectorAll("h2, h3")].map(node => node.textContent.trim()).filter(Boolean);
    const images = [...doc.images];
    const noAlt = images.filter(image => !image.hasAttribute("alt") || !image.alt.trim()).length;
    const imageAltRate = images.length ? Math.round(((images.length - noAlt) / images.length) * 100) : 100;
    const links = extractLinks(html, url);
    const internalLinks = links.internal.length;
    const canonical = doc.querySelector('link[rel="canonical"]')?.href || "";
    const robots = doc.querySelector('meta[name="robots"]')?.content.toLowerCase() || "";
    const viewport = Boolean(doc.querySelector('meta[name="viewport"]'));
    const lang = doc.documentElement.lang || "";
    const words = (doc.body?.innerText || "").trim().split(/\s+/).filter(Boolean).length;
    const schema = [...doc.querySelectorAll('script[type="application/ld+json"]')].length;
    const structuredData = jsonLd(doc);
    const articleSchema = structuredData.find(item => {
      const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
      return types.some(type => articleTypes.has(String(type || "").toLowerCase()));
    });
    const articleNode = [...doc.querySelectorAll("article")].sort((a, b) => countWords(b.textContent) - countWords(a.textContent)).find(node => countWords(node.textContent) >= 180 && node.querySelector("h1, h2, h3"));
    const articlePublished = articleSchema?.datePublished || articleSchema?.dateCreated || doc.querySelector('meta[property="article:published_time"], meta[name="datePublished"], meta[itemprop="datePublished"], time[datetime]')?.getAttribute("content") || doc.querySelector("time[datetime]")?.getAttribute("datetime") || "";
    const articleAuthor = schemaValue(articleSchema?.author, doc.querySelector('meta[name="author"], meta[property="article:author"]')?.content || "");
    const articleSection = schemaValue(articleSchema?.articleSection, doc.querySelector('meta[property="article:section"], meta[name="category"]')?.content || "");
    const articlePath = /(?:^|\/)(?:blog|article|articles|news|post|posts|magazine|insights|knowledge|learn|آموزش|مقاله)(?:\/|$)/i.test(new URL(url).pathname);
    const articleWords = countWords(articleNode?.textContent || articleSchema?.articleBody || doc.querySelector("main")?.textContent || doc.body?.textContent || "");
    const isArticle = Boolean(articleSchema || (articlePublished && articleWords >= 120) || articleNode || (articlePath && articleWords >= 180 && (h1.length || title)));
    const articleType = articleSchema ? schemaValue(articleSchema["@type"], "Article") : isArticle ? (articleNode ? "HTML Article" : "URL Article") : "";
    const articleTitle = schemaValue(articleSchema?.headline || articleSchema?.name, h1[0] || title);
    const articleReason = articleSchema ? "JSON-LD Article" : articlePublished ? "article metadata" : articleNode ? "semantic article" : articlePath ? "article URL pattern" : "";
    const articleConfidence = articleSchema || articlePublished ? "high" : articleNode ? "medium" : isArticle ? "low" : "";
    const openGraph = ["og:title", "og:description", "og:image"].filter(name => doc.querySelector(`meta[property="${name}"]`)).length;
    const canonicalOk = !canonical || new URL(canonical, url).origin === new URL(url).origin;
    const technicalChecks = [
      check("https", "اتصال امن HTTPS", new URL(url).protocol === "https:", "آدرس با HTTPS باز شده است", 12, "critical"),
      check("viewport", "متا viewport", viewport, viewport ? "برای موبایل تعریف شده است" : "متا viewport وجود ندارد", 10, "critical"),
      check("lang", "زبان HTML", Boolean(lang), lang ? `زبان صفحه: ${lang}` : "ویژگی lang روی HTML وجود ندارد", 6),
      check("canonical", "Canonical معتبر", canonicalOk, canonical ? canonical : "canonical پیدا نشد", 12),
      check("robots", "عدم مسدودسازی صفحه", !/noindex|none/.test(robots), robots || "robots meta وجود ندارد", 10),
      check("internal-links", "لینک داخلی", internalLinks > 0, `${fa(internalLinks)} لینک داخلی پیدا شد`, 10),
      check("response", "پاسخ صفحه", true, `${fa(meta.ms || 0)}ms از مسیر بررسی`, 10)
    ];
    const contentChecks = [
      check("title", "Title استاندارد", title.length >= 20 && title.length <= 60, title ? `${fa(title.length)} کاراکتر` : "Title خالی است", 16, "critical"),
      check("description", "Meta description", description.length >= 70 && description.length <= 170, description ? `${fa(description.length)} کاراکتر` : "توضیحات متا وجود ندارد", 14, "critical"),
      check("h1", "یک H1 واضح", h1.length === 1, `${fa(h1.length)} H1 پیدا شد`, 14, "critical"),
      check("words", "حجم متن اصلی", words >= 300, `${fa(words)} کلمه متن قابل مشاهده`, 12),
      check("images", "متن جایگزین تصاویر", imageAltRate >= 90, `${fa(imageAltRate)}٪ تصاویر alt دارند`, 10),
      check("headings", "ساختار هدینگ", headings.length > 0, `${fa(headings.length)} زیرعنوان پیدا شد`, 8),
      check("schema", "داده ساختاریافته", schema > 0, schema ? `${fa(schema)} بلوک JSON-LD` : "JSON-LD پیدا نشد", 8),
      check("og", "Open Graph", openGraph >= 2, `${fa(openGraph)} مورد از ۳ مورد اصلی`, 8)
    ];
    const score = checks => Math.round(checks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0) / checks.reduce((sum, item) => sum + item.weight, 0) * 100);
    return { url, title, description, h1, headings, words, images: images.length, noAlt, imageAltRate, internalLinks, internalUrls: links.internal, externalLinks: links.external.length, canonical, robots, viewport, lang, schema, openGraph, article: isArticle, articleTitle, publishedAt: articlePublished, author: articleAuthor, section: articleSection, articleType, articleWords: isArticle ? articleWords : 0, articleConfidence, articleReason, depth: meta.depth || 0, inboundLinks: 0, orphan: false, technicalScore: score(technicalChecks), contentScore: score(contentChecks), technicalChecks, contentChecks, ms: meta.ms || 0 };
  };

  const reportProgress = (message, current = 0, total = 1) => {
    const text = $("#scanStatus");
    const bar = $("#scanProgressBar");
    if (text) text.textContent = message;
    if (bar) bar.style.width = `${Math.max(3, Math.min(100, Math.round(current / Math.max(total, 1) * 100)))}%`;
  };

  const concurrency = async (items, worker, limit = 4) => {
    const output = [];
    let cursor = 0;
    const run = async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try { output[index] = await worker(items[index], index); }
        catch (error) { output[index] = { error: error.message, url: items[index] }; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return output;
  };

  const collectSitemapUrls = async (sitemapUrls, baseUrl, maxUrls) => {
    const collected = new Set();
    const queue = [...new Set(sitemapUrls)].slice(0, 4);
    while (queue.length && collected.size < maxUrls) {
      const sitemap = queue.shift();
      try {
        const response = await fetchText(sitemap);
        const urls = parseSitemap(response.text, baseUrl);
        urls.forEach(url => {
          if (/\.xml(?:$|\?)/i.test(new URL(url).pathname)) queue.push(url);
          else if (new URL(url).origin === new URL(baseUrl).origin) collected.add(url.replace(/\/$/, ""));
        });
      } catch { /* An absent sitemap is a measured finding, not a fake URL list. */ }
    }
    return [...collected].slice(0, maxUrls);
  };

  const crawlSite = async (baseUrl, limit = 20, onProgress = reportProgress) => {
    const origin = new URL(baseUrl).origin;
    onProgress("در حال دریافت صفحه اصلی…", 0, limit + 1);
    const rootResponse = await fetchText(baseUrl);
    const rootPage = inspectPage(rootResponse.text, baseUrl, { ...rootResponse, depth: 0 });
    let robots = { disallow: [], sitemaps: [] };
    let robotsStatus = "در دسترس نیست";
    try {
      const robotsResponse = await fetchText(`${origin}/robots.txt`);
      robots = parseRobots(robotsResponse.text);
      robotsStatus = "دریافت شد";
    } catch { robotsStatus = "یافت نشد یا قابل دریافت نیست"; }
    let sitemapUrls = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`];
    const sitemapPages = await collectSitemapUrls(sitemapUrls, baseUrl, limit * 3);
    const queue = [];
    const queued = new Set([baseUrl]);
    const enqueue = (url, depth) => {
      if (queued.has(url) || pages.length + queue.length >= limit) return;
      try {
        if (new URL(url).origin !== origin || isBlocked(url, robots) || !isHtmlCandidate(url)) return;
        queued.add(url);
        queue.push({ url, depth });
      } catch { /* Ignore malformed discovered URLs. */ }
    };
    sitemapPages.forEach(url => enqueue(url, 1));
    discoverLinks(rootResponse.text, baseUrl).forEach(url => enqueue(url, 1));
    const pages = [rootPage];
    while (queue.length && pages.length < limit) {
      const batch = queue.splice(0, Math.min(4, limit - pages.length));
      const pageResults = await concurrency(batch, async item => {
        onProgress(`در حال بررسی صفحه ${fa(pages.length + 1)} از ${fa(Math.min(limit, pages.length + queue.length + 1))}…`, pages.length, limit);
        try {
          const response = await fetchText(item.url);
          const page = inspectPage(response.text, item.url, { ...response, depth: item.depth });
          return page;
        } catch (error) {
            return { url: item.url, error: error.message, depth: item.depth, internalUrls: [], externalLinks: 0, technicalScore: null, contentScore: null, article: false, articleWords: 0, technicalChecks: [], contentChecks: [], ms: 0 };
        }
      }, 4);
      pageResults.forEach(page => {
        pages.push(page);
        if (!page.error && pages.length < limit) (page.internalUrls || []).forEach(url => enqueue(url, page.depth + 1));
      });
    }
    const validPages = pages.filter(page => !page.error);
    const inbound = new Map();
    validPages.forEach(page => (page.internalUrls || []).forEach(url => inbound.set(url, (inbound.get(url) || 0) + 1)));
    validPages.forEach(page => {
      page.inboundLinks = inbound.get(page.url) || 0;
      page.orphan = page.url !== baseUrl && page.inboundLinks === 0;
      if (page.orphan) page.technicalChecks.push(check("orphan", "صفحه یتیم", false, "صفحه در sitemap یا نتایج crawl پیدا شد اما لینک داخلی ورودی ندارد", 8));
    });
    const duplicateChecks = [
      ["title", "عنوان تکراری", "title تکراری با صفحات دیگر", 8],
      ["description", "توضیحات متای تکراری", "توضیحات متا با صفحات دیگر یکسان است", 6],
      ["h1", "H1 تکراری", "H1 با صفحات دیگر یکسان است", 5]
    ];
    duplicateChecks.forEach(([field, id, label, weight]) => {
      const groups = new Map();
      validPages.forEach(page => {
        const value = field === "h1" ? page.h1[0] : page[field];
        if (value) groups.set(value, [...(groups.get(value) || []), page]);
      });
      groups.forEach(group => {
        if (group.length < 2) return;
        group.forEach(page => page.contentChecks.push(check(id, label, false, `${fa(group.length)} صفحه مقدار یکسان دارند`, weight)));
      });
    });
    const weightedScore = checks => checks.length ? Math.round(checks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0) / checks.reduce((sum, item) => sum + item.weight, 0) * 100) : null;
    validPages.forEach(page => {
      page.technicalScore = weightedScore(page.technicalChecks);
      page.contentScore = weightedScore(page.contentChecks);
    });
    const issues = [];
    const allChecks = validPages.flatMap(page => [...page.technicalChecks, ...page.contentChecks].map(item => ({ ...item, pageUrl: page.url })));
    const grouped = new Map();
    allChecks.filter(item => !item.passed).forEach(item => {
      const previous = grouped.get(item.id);
      grouped.set(item.id, { ...item, count: (previous?.count || 0) + 1, pages: [...(previous?.pages || []), item.pageUrl] });
    });
    pages.filter(page => page.error).forEach(page => {
      const previous = grouped.get("fetch-error");
      grouped.set("fetch-error", {
        id: "fetch-error",
        label: "صفحه قابل دریافت نیست",
        passed: false,
        detail: "در مسیر crawl پاسخ قابل استفاده‌ای دریافت نشد",
        weight: 14,
        severity: "critical",
        count: (previous?.count || 0) + 1,
        pages: [...(previous?.pages || []), page.url]
      });
    });
    [...grouped.values()].sort((a, b) => b.weight * b.count - a.weight * a.count).forEach(item => issues.push(item));
    const avg = key => validPages.length ? Math.round(validPages.reduce((sum, page) => sum + (page[key] || 0), 0) / validPages.length) : null;
    return {
      url: baseUrl,
      origin,
      crawledAt: new Date().toISOString(),
      limit,
      pages,
      validPages: validPages.length,
      failedPages: pages.length - validPages.length,
      robots: { ...robots, status: robotsStatus },
      sitemap: { urls: sitemapPages.length, sources: sitemapUrls },
      technical: avg("technicalScore"),
      content: avg("contentScore"),
      issues,
      internalLinks: validPages.reduce((sum, page) => sum + page.internalLinks, 0),
      externalLinks: validPages.reduce((sum, page) => sum + page.externalLinks, 0),
      orphanPages: validPages.filter(page => page.orphan).length,
      maxDepth: validPages.reduce((max, page) => Math.max(max, page.depth || 0), 0),
      words: validPages.reduce((sum, page) => sum + page.words, 0),
      articles: validPages.filter(page => page.article),
      articleCount: validPages.filter(page => page.article).length,
      articleWords: validPages.reduce((sum, page) => sum + (page.article ? page.articleWords : 0), 0),
      root: rootPage
    };
  };

  const getPsi = async (url, strategy) => {
    try {
      const data = await fetchJson(pageSpeedUrl(url, strategy));
      const audits = data.lighthouseResult?.audits || {};
      const opportunities = Object.values(audits).filter(audit => audit.score !== null && audit.score < 0.9 && (audit.details?.overallSavingsMs || audit.details?.overallSavingsBytes)).sort((a, b) => (b.details?.overallSavingsMs || b.details?.overallSavingsBytes || 0) - (a.details?.overallSavingsMs || a.details?.overallSavingsBytes || 0)).slice(0, 6).map(audit => ({ title: audit.title, description: audit.description, savingsMs: audit.details?.overallSavingsMs || 0, savingsBytes: audit.details?.overallSavingsBytes || 0 }));
      const metric = id => audits[id]?.displayValue || null;
      return { strategy, available: true, performance: categoryScore(data, "performance"), seo: categoryScore(data, "seo"), accessibility: categoryScore(data, "accessibility"), bestPractices: categoryScore(data, "best-practices"), metrics: { lcp: metric("largest-contentful-paint"), cls: metric("cumulative-layout-shift"), inp: metric("interaction-to-next-paint") || metric("experimental-interaction-to-next-paint") }, opportunities, fetchedAt: new Date().toISOString() };
    } catch (error) {
      return { strategy, available: false, error: error.message, performance: null, seo: null, accessibility: null, bestPractices: null, metrics: {}, opportunities: [] };
    }
  };

  const buildReport = (crawl, psiMobile, psiDesktop) => {
    const psiScores = [psiMobile.seo, psiMobile.bestPractices, psiMobile.accessibility].filter(Number.isFinite);
    const technical = crawl.technical === null ? null : Math.round(crawl.technical * .7 + (psiScores.length ? psiScores.reduce((a, b) => a + b, 0) / psiScores.length : crawl.technical) * .3);
    const performance = psiMobile.performance ?? psiDesktop.performance;
    const overallParts = [technical, crawl.content, performance].filter(Number.isFinite);
    return { ...crawl, technical, performance, overall: overallParts.length ? Math.round(overallParts.reduce((a, b) => a + b, 0) / overallParts.length) : null, psi: { mobile: psiMobile, desktop: psiDesktop }, checkedAt: new Date().toISOString() };
  };

  const scoreText = (selector, value, progressSelector) => {
    const node = $(selector);
    if (node) node.textContent = value === null || value === undefined ? "—" : fa(value);
    const progress = progressSelector && $(progressSelector);
    if (progress) progress.style.width = value == null ? "0%" : `${value}%`;
  };

  const emptyRow = (message, detail = "پس از اجرای تحلیل واقعی، داده‌ها اینجا نمایش داده می‌شوند.") => `<tr><td colspan="6"><div class="data-empty"><b>${message}</b><small>${detail}</small></div></td></tr>`;

  const renderHistory = () => {
    const history = JSON.parse(localStorage.getItem("orbit-history-v2") || "[]");
    const body = $("#historyBody");
    if (!history.length) { body.innerHTML = emptyRow("هنوز تحلیلی ثبت نشده است."); return; }
    body.innerHTML = history.slice(0, 8).map((item, index) => {
      const host = new URL(item.url).hostname.replace(/^www\./, "");
      const date = new Date(item.checkedAt).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
      return `<tr><td><span class="site-favicon ${["orange-bg", "violet-bg", "blue-bg"][index % 3]}">${esc(host[0].toUpperCase())}</span><b>${esc(host)}</b></td><td>${date}</td><td><strong class="table-score">${item.score == null ? "—" : fa(item.score)}</strong></td><td><span class="trend neutral">تحلیل واقعی</span></td><td><span class="status-tag success">${item.partial ? "ناقص" : "کامل"}</span></td><td><button class="row-menu" data-history-url="${esc(item.url)}">↻</button></td></tr>`;
    }).join("");
  };

  const renderTechnical = report => {
    const banner = $(".technical-banner");
    $(".technical-banner b").textContent = report.failedPages ? "بخشی از صفحات قابل دریافت نبودند" : "خزیدن صفحات با داده واقعی انجام شد";
    $(".technical-banner p").textContent = `${fa(report.validPages)} صفحه بررسی شد · عمق بیشینه ${fa(report.maxDepth)} · ${fa(report.orphanPages)} صفحه یتیم · robots.txt: ${report.robots.status} · sitemap: ${fa(report.sitemap.urls)} URL`;
    $(".banner-score").innerHTML = `${report.technical == null ? "—" : fa(report.technical)}<span>/۱۰۰</span>`;
    if (banner) banner.classList.toggle("partial", Boolean(report.failedPages));
    const cards = $$(".audit-card");
    const checks = report.pages.flatMap(page => page.technicalChecks || []);
    const cardData = [
      ["ایندکس‌پذیری", "robots، sitemap و صفحات یتیم", checks.filter(item => ["robots", "response", "orphan"].includes(item.id))],
      ["تجربه موبایل", "viewport و اتصال امن", checks.filter(item => ["viewport", "https"].includes(item.id))],
      ["لینک‌سازی داخلی", `${fa(report.internalLinks)} لینک داخلی · عمق ${fa(report.maxDepth)}`, report.pages.filter(page => !page.error).map(page => ({ passed: page.internalLinks > 0 && !page.orphan }))],
      ["Canonical", "canonical صفحات و دامنه", checks.filter(item => item.id === "canonical")]
    ];
    cards.forEach((card, index) => {
      const items = cardData[index][2];
      const value = items.length ? Math.round(items.filter(item => item.passed).length / items.length * 100) : null;
      $(".audit-card b", card).textContent = cardData[index][0];
      $(".audit-card small", card).textContent = cardData[index][1];
      $(".audit-card > strong", card).textContent = value == null ? "—" : fa(value);
    });
    const list = $(".full-issue-list");
    $(".filter-pills").innerHTML = `<button class="active" data-issue-filter="all">همه <b>${fa(report.issues.length)}</b></button><button data-issue-filter="critical">بحرانی <b>${fa(report.issues.filter(issue => issue.severity === "critical").length)}</b></button><button data-issue-filter="warning">هشدار <b>${fa(report.issues.filter(issue => issue.severity !== "critical").length)}</b></button>`;
    list.innerHTML = report.issues.length ? report.issues.slice(0, 12).map((issue, index) => `<div class="full-issue"><span class="issue-status ${issue.severity === "critical" ? "red" : "orange"}">${issue.severity === "critical" ? "!" : "i"}</span><div><b>${esc(issue.label)}</b><small>${fa(issue.count)} صفحه · ${esc(issue.detail)}</small></div><span class="impact ${issue.severity === "critical" ? "high-impact" : "medium-impact"}">${issue.severity === "critical" ? "اثر زیاد" : "هشدار"}</span><button data-issue-id="${esc(issue.id)}">جزئیات ←</button></div>`).join("") : `<div class="data-empty"><b>مسئله‌ای در چک‌های فنی ثبت نشد.</b><small>این نتیجه فقط بر اساس صفحات دریافت‌شده است.</small></div>`;
  };

  const renderContent = report => {
    const values = [report.validPages, report.pages.filter(page => page.contentScore >= 80).length, report.issues.filter(issue => issue.severity !== "critical").length];
    $$(".content-stats strong").forEach((node, index) => { node.textContent = fa(values[index]); });
    $$(".content-stats small").forEach((node, index) => { node.textContent = ["صفحات تحلیل‌شده", "صفحات با محتوای قوی", "فرصت‌های قابل اقدام"][index]; });
    const keywordList = $(".keyword-list");
    const topPages = report.pages.filter(page => !page.error).sort((a, b) => a.contentScore - b.contentScore).slice(0, 5);
    keywordList.innerHTML = topPages.length ? topPages.map(page => `<div class="keyword-row"><div><b>${esc(page.title || new URL(page.url).pathname)}</b><small>${fa(page.words)} کلمه · ${fa(page.contentScore)}/۱۰۰ · عمق ${fa(page.depth)} · ${fa(page.inboundLinks)} لینک ورودی</small></div><span class="position">${page.orphan ? "صفحه یتیم" : page.contentScore < 70 ? "نیازمند کار" : "قابل قبول"}</span><span class="potential">${fa(page.contentScore)}</span></div>`).join("") : `<div class="data-empty"><b>صفحه‌ای برای نمایش نیست.</b></div>`;
    const donut = $(".donut span");
    if (donut) donut.innerHTML = `${fa(report.content)}<small>امتیاز محتوا</small>`;
    $(".donut-legend").innerHTML = `<li><i class="dot purple-dot"></i>صفحات بررسی‌شده <b>${fa(report.validPages)}</b></li><li><i class="dot orange-dot"></i>کلمات متن <b>${fa(report.words)}</b></li><li><i class="dot blue-dot"></i>Schema فعال <b>${fa(report.pages.filter(page => page.schema).length)}</b></li>`;
  };

  const reportArticles = report => report.articles || report.pages.filter(page => page.article);
  const formatDate = value => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("fa-IR");
  };
  const renderArticles = report => {
    const articles = reportArticles(report);
    const categories = new Set(articles.map(article => article.section).filter(Boolean));
    const count = $("#articleCount");
    const words = $("#articleWords");
    const category = $("#articleCategories");
    if (count) count.textContent = fa(articles.length);
    if (words) words.textContent = fa(articles.reduce((sum, article) => sum + (article.articleWords || article.words || 0), 0));
    if (category) category.textContent = fa(categories.size);
    const body = $("#articleBody");
    if (!body) return;
    body.innerHTML = articles.length ? articles.map(article => `<tr><td><b>${esc(article.articleTitle || article.title || "بدون عنوان")}</b><small>${esc(article.url)}</small></td><td>${esc(article.articleType || "Article")}</td><td>${esc(formatDate(article.publishedAt))}</td><td>${esc(article.author || "—")}</td><td>${fa(article.articleWords || article.words || 0)}</td><td>${fa(article.inboundLinks || 0)}</td></tr>`).join("") : `<tr><td colspan="6"><div class="data-empty"><b>مقاله‌ای با شواهد کافی پیدا نشد.</b><small>تشخیص بر اساس JSON-LD، metadata، ساختار article و مسیر URL انجام می‌شود.</small></div></td></tr>`;
  };

  const renderPerformance = report => {
    const mobile = report.psi.mobile;
    const desktop = report.psi.desktop;
    scoreText("#lighthouseScore", mobile.performance);
    const summary = $(".lighthouse-score div:last-child");
    if (summary) summary.innerHTML = `<b>${mobile.available ? "تست Google دریافت شد" : "تست Google در دسترس نیست"}</b><p>${mobile.available ? `SEO: ${fa(mobile.seo)} · دسترسی: ${fa(mobile.accessibility)} · بهترین‌روش‌ها: ${fa(mobile.bestPractices)}` : esc(mobile.error || "پاسخی از PageSpeed دریافت نشد")}</p><span class="last-run">${mobile.available ? "منبع: Google PageSpeed Insights" : "بدون پاسخ معتبر؛ عددی حدس زده نمی‌شود"}</span>`;
    const metrics = mobile.metrics || {};
    $$(".vitals b").forEach((node, index) => { node.textContent = [metrics.lcp, metrics.cls, metrics.inp][index] || "—"; });
    $$(".vitals span").forEach((node, index) => { node.textContent = [metrics.lcp, metrics.cls, metrics.inp][index] ? "دریافت شد" : "داده ندارد"; });
    const opportunities = mobile.opportunities || [];
    $(".opportunities").innerHTML = `<div class="panel-heading"><div><h3>فرصت‌های سرعت</h3><p>فقط موارد برگرفته از پاسخ Google</p></div></div>${opportunities.length ? opportunities.map(item => `<div class="opportunity-row"><span class="opp-icon orange">◌</span><div><b>${esc(item.title)}</b><small>${esc(item.description || "")}</small></div><span>${item.savingsMs ? `${fa(Math.round(item.savingsMs))}ms` : `${fa(Math.round(item.savingsBytes / 1024))}KB`}</span></div>`).join("") : `<div class="data-empty"><b>فرصت قابل گزارش از Google دریافت نشد.</b><small>این به معنی عالی بودن سایت نیست؛ فقط داده‌ای برای نمایش وجود ندارد.</small></div>`}`;
    $(".recommendation-banner p").textContent = desktop.available ? `موبایل ${fa(mobile.performance)} و دسکتاپ ${fa(desktop.performance)}؛ برای تصمیم دقیق، جزئیات هر فرصت را از PageSpeed باز کن.` : "بدون پاسخ معتبر Google، توصیه سرعت تولید نمی‌شود.";
  };

  const renderReport = report => {
    state.latest = report;
    state.currentUrl = report.url;
    scoreText("#overallScore", report.overall, "#overallProgress");
    scoreText("#technicalScore", report.technical);
    scoreText("#contentScore", report.content);
    scoreText("#performanceScore", report.performance);
    const domain = new URL(report.url).hostname.replace(/^www\./, "");
    $(".welcome-row h1").innerHTML = `گزارش واقعی <span class="wave">✦</span>`;
    $(".welcome-row .subhead").textContent = `${domain} · ${fa(report.validPages)} صفحه از ${fa(report.pages.length)} صفحه با داده واقعی بررسی شد · ${fa(report.orphanPages)} صفحه یتیم`;
    $(".scan-copy p").textContent = report.failedPages ? `${fa(report.failedPages)} صفحه قابل دریافت نبود؛ امتیازها فقط از داده‌های موجود محاسبه شده‌اند.` : "تمام اعداد این صفحه از همین crawl و پاسخ Google ساخته شده‌اند.";
    $("#scanStatus").textContent = `گزارش آماده است · ${fa(report.validPages)} صفحه معتبر`;
    $(".score-card .trend").textContent = "snapshot واقعی";
    $(".score-card small").textContent = "بدون مقایسه تا snapshot بعدی";
    const metrics = $$(".metric-card");
    [report.issues.length, report.pages.filter(page => page.contentScore < 70).length, report.failedPages].forEach((value, index) => { if ($(".metric-foot", metrics[index + 1])) $(".metric-foot", metrics[index + 1]).innerHTML = `<i class="${value ? "warn-dot" : "good-dot"}"></i> ${fa(value)} مورد ثبت‌شده`; });
    $("#priorityList").innerHTML = report.issues.length ? report.issues.slice(0, 3).map((issue, index) => `<div class="issue-item"><span class="issue-number ${issue.severity === "critical" ? "critical" : "warning"}">${fa(index + 1)}</span><div><b>${esc(issue.label)}</b><small>${fa(issue.count)} صفحه · ${esc(issue.detail)}</small></div><span class="issue-arrow">←</span></div>`).join("") : `<div class="data-empty"><b>در چک‌های ثبت‌شده مسئله‌ای پیدا نشد.</b></div>`;
    $(".chart-wrap").innerHTML = `<div class="data-empty chart-empty"><b>روند تاریخی بعد از تحلیل‌های بعدی ساخته می‌شود.</b><small>این اولین snapshot واقعی این پروژه است.</small></div>`;
    renderTechnical(report);
    renderContent(report);
    renderArticles(report);
    renderPerformance(report);
    const history = JSON.parse(localStorage.getItem("orbit-history-v2") || "[]").filter(item => item.url !== report.url);
    history.unshift({ url: report.url, score: report.overall, checkedAt: report.checkedAt, partial: Boolean(report.failedPages) });
    localStorage.setItem("orbit-history-v2", JSON.stringify(history.slice(0, 10)));
    localStorage.setItem("orbit-last-report-v2", JSON.stringify(report));
    renderHistory();
    toast(`گزارش واقعی ${domain} آماده شد`);
  };

  const saveDownload = (name, body, type) => {
    const blob = new Blob([body], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const exportReport = (format = "json") => {
    if (!state.latest) { toast("ابتدا یک تحلیل واقعی اجرا کن", "error"); return; }
    if (format === "csv") {
      const rows = [["url", "title", "content_score", "technical_score", "words", "issues"], ...state.latest.pages.map(page => [page.url, page.title, page.contentScore, page.technicalScore, page.words, (page.contentChecks || []).filter(item => !item.passed).map(item => item.id).join("|")])];
      saveDownload("orbit-pages.csv", rows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv;charset=utf-8");
    } else saveDownload(`orbit-${new URL(state.latest.url).hostname}.json`, JSON.stringify(state.latest, null, 2), "application/json");
    toast(`گزارش ${format.toUpperCase()} دانلود شد`);
  };

  const exportArticles = (format = "csv") => {
    if (!state.latest) { toast("ابتدا یک تحلیل واقعی اجرا کن", "error"); return; }
    const articles = reportArticles(state.latest);
    const rows = [["url", "title", "type", "published_at", "author", "section", "words", "inbound_links", "confidence"], ...articles.map(article => [article.url, article.articleTitle || article.title, article.articleType, article.publishedAt, article.author, article.section, article.articleWords || article.words, article.inboundLinks, article.articleConfidence])];
    if (format === "json") saveDownload(`orbit-articles-${new URL(state.latest.url).hostname}.json`, JSON.stringify({ url: state.latest.url, crawledAt: state.latest.crawledAt, articleCount: articles.length, articles }, null, 2), "application/json");
    else saveDownload(`orbit-articles-${new URL(state.latest.url).hostname}.csv`, rows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv;charset=utf-8");
    toast(`خروجی مقاله‌ها (${format.toUpperCase()}) دانلود شد`);
  };

  const keywordTokens = value => value.toLowerCase().replace(/[،؛,|]+/g, " ").split(/\s+/).map(token => token.trim()).filter(token => token.length > 1);
  const clusterKeywords = keywords => {
    const groups = [];
    keywords.forEach(keyword => {
      const tokens = new Set(keywordTokens(keyword));
      let group = groups.find(item => [...tokens].some(token => item.tokens.has(token)));
      if (!group) { group = { tokens: new Set(), items: [] }; groups.push(group); }
      tokens.forEach(token => group.tokens.add(token));
      group.items.push(keyword);
    });
    return groups.map((group, index) => ({ name: [...group.tokens].slice(0, 3).join(" · ") || `خوشه ${index + 1}`, items: group.items }));
  };

  const openKeywordTool = () => openModal("خوشه‌ساز کلمات کلیدی", `<p class="tool-hint">هر کلمه را در یک خط وارد کن. گروه‌بندی بر اساس اشتراک واقعی واژه‌ها انجام می‌شود و حجم جست‌وجو حدس زده نمی‌شود.</p><textarea id="keywordInput" class="tool-textarea" rows="8" placeholder="طراحی سایت\nطراحی سایت فروشگاهی\nسئو تکنیکال\nچک لیست سئو تکنیکال"></textarea><button class="primary-button" id="clusterRun">ساخت خوشه‌ها</button><div id="toolOutput" class="tool-output"></div>`);

  const openSettings = () => openModal("تنظیمات منابع داده", `<p class="tool-hint">برای crawl پایدار، آدرس Worker را وارد کن. GitHub Pages خودش backend اجرا نمی‌کند. این آدرس و کلید فقط در همین مرورگر ذخیره می‌شوند.</p><label class="tool-label" for="backendUrl">آدرس backend</label><input id="backendUrl" class="tool-input" type="url" autocomplete="off" value="${esc(getBackendUrl())}" placeholder="https://orbit-seo-api.example.workers.dev"><label class="tool-label" for="psiApiKey">Google PageSpeed API key اختیاری</label><input id="psiApiKey" class="tool-input" type="password" autocomplete="off" value="${esc(getPsiKey())}" placeholder="AIza..."><button class="primary-button" id="savePsiKey">ذخیره تنظیمات</button><div id="toolOutput" class="tool-output">${getBackendUrl() ? "backend تنظیم شده است." : "backend هنوز تنظیم نشده است."}</div>`);

  const openBriefTool = () => {
    const page = state.latest?.root;
    openModal("دستیار بریف محتوا", `<p class="tool-hint">بریف از داده‌های واقعی صفحه انتخاب‌شده ساخته می‌شود. کلمات کلیدی و حجم جست‌وجو بدون منبع وارد گزارش نمی‌شوند.</p><label class="tool-label">کلمه هدف</label><input id="briefKeyword" class="tool-input" value="${esc(page?.h1?.[0] || "")}" placeholder="مثلاً طراحی سایت فروشگاهی"><label class="tool-label">هدف صفحه</label><select id="briefIntent" class="tool-input"><option>تجاری</option><option>اطلاعاتی</option><option>مقایسه‌ای</option><option>ناوبری</option></select><button class="primary-button" id="briefRun">ساخت بریف از داده صفحه</button><div id="toolOutput" class="tool-output"></div>`);
  };

  const openCompetitorTool = () => openModal("مقایسه واقعی رقبا", `<p class="tool-hint">دامنه دوم با همان crawl محدود و قواعد امتیازدهی پروژه بررسی می‌شود. مقایسه فقط بعد از دریافت داده انجام خواهد شد.</p><label class="tool-label">آدرس رقیب</label><input id="competitorUrl" class="tool-input" placeholder="https://competitor.com"><button class="primary-button" id="competitorRun">شروع مقایسه</button><div id="toolOutput" class="tool-output"></div>`);

  const runCompetitor = async () => {
    if (!state.latest) { $("#toolOutput").innerHTML = "<b>ابتدا سایت اصلی را تحلیل کن.</b>"; return; }
    let url;
    try { url = normalizeUrl($("#competitorUrl").value); } catch (error) { $("#toolOutput").textContent = error.message; return; }
    $("#competitorRun").disabled = true;
    $("#toolOutput").innerHTML = "<span class=\"tool-loading\">در حال دریافت صفحات رقیب…</span>";
    try {
      const crawl = await crawlSite(url, Math.min(10, state.latest.limit), () => {});
      const rows = [["شاخص", state.latest.origin, crawl.origin], ["امتیاز فنی", state.latest.technical, crawl.technical], ["امتیاز محتوا", state.latest.content, crawl.content], ["صفحات معتبر", state.latest.validPages, crawl.validPages], ["مسائل", state.latest.issues.length, crawl.issues.length]];
      $("#toolOutput").innerHTML = `<div class="compare-table">${rows.map((row, index) => `<div><b>${esc(row[0])}</b><span>${index ? (typeof row[1] === "number" ? fa(row[1]) : esc(row[1])) : esc(row[1])}</span><span>${index ? (typeof row[2] === "number" ? fa(row[2]) : esc(row[2])) : esc(row[2])}</span></div>`).join("")}</div><small class="tool-source">منبع: crawl واقعی · سقف ${fa(crawl.limit)} صفحه</small>`;
    } catch (error) { $("#toolOutput").textContent = `مقایسه انجام نشد: ${error.message}`; }
    finally { $("#competitorRun").disabled = false; }
  };

  const runScan = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    let url;
    try { url = normalizeUrl($("#siteUrl").value); } catch (error) { toast(error.message, "error"); return; }
    const limit = Number($("#crawlLimit")?.value || 100);
    const deep = $("#deepCheck")?.checked !== false;
    form.classList.add("loading");
    state.activeRun = true;
    reportProgress("آماده‌سازی تحلیل…", 0, limit + 1);
    try {
      const crawlPromise = crawlSite(url, deep ? limit : 1, reportProgress);
      const psiMobilePromise = $("#mobileCheck")?.checked === false ? Promise.resolve({ strategy: "desktop", available: false, error: "تست موبایل خاموش است" }) : getPsi(url, "mobile");
      const psiDesktopPromise = getPsi(url, "desktop");
      const [crawl, mobile, desktop] = await Promise.all([crawlPromise, psiMobilePromise, psiDesktopPromise]);
      reportProgress("ساخت گزارش نهایی…", limit + 1, limit + 1);
      renderReport(buildReport(crawl, mobile, desktop));
      goTo("dashboard");
      if (!mobile.available && !desktop.available) toast("crawl انجام شد، اما PageSpeed پاسخ نداد؛ هیچ عددی حدس زده نشده است", "error");
    } catch (error) {
      toast(`تحلیل متوقف شد: ${error.message}`, "error");
      reportProgress("تحلیل ناموفق بود", 0, 1);
    } finally {
      form.classList.remove("loading");
      state.activeRun = false;
    }
  };

  const resetDemoMarkup = () => {
    ["#overallScore", "#technicalScore", "#contentScore", "#performanceScore", "#lighthouseScore"].forEach(selector => scoreText(selector, null));
    $("#overallProgress").style.width = "0%";
    $("#priorityList").innerHTML = `<div class="data-empty"><b>هنوز تحلیلی انجام نشده است.</b><small>آدرس سایت را وارد کن تا داده واقعی ساخته شود.</small></div>`;
    $("#historyBody").innerHTML = emptyRow("هنوز تحلیلی ثبت نشده است.");
    $$(".metric-foot").forEach(node => { node.innerHTML = "<i class=\"good-dot\"></i> پس از تحلیل واقعی"; });
    $$(".content-stats strong").forEach(node => { node.textContent = "—"; });
    $$(".audit-card > strong").forEach(node => { node.textContent = "—"; });
    $(".full-issue-list").innerHTML = `<div class="data-empty"><b>پس از crawl واقعی، مسائل اینجا نمایش داده می‌شوند.</b></div>`;
    $(".chart-wrap").innerHTML = `<div class="data-empty chart-empty"><b>داده تاریخی وجود ندارد.</b><small>پس از اجرای تحلیل اول، snapshot ذخیره می‌شود.</small></div>`;
    $(".keyword-list").innerHTML = `<div class="data-empty"><b>هنوز صفحه‌ای تحلیل نشده است.</b><small>پس از crawl، ضعیف‌ترین صفحات اینجا می‌آیند.</small></div>`;
    $(".donut span").innerHTML = "—<small>بدون داده</small>";
    $(".donut-legend").innerHTML = `<li>پوشش موضوعی پس از crawl واقعی ساخته می‌شود.</li>`;
    if ($("#articleCount")) $("#articleCount").textContent = "—";
    if ($("#articleWords")) $("#articleWords").textContent = "—";
    if ($("#articleCategories")) $("#articleCategories").textContent = "—";
    if ($("#articleBody")) $("#articleBody").innerHTML = `<tr><td colspan="6"><div class="data-empty"><b>پس از crawl، مقاله‌های شناسایی‌شده اینجا می‌آیند.</b><small>تشخیص از داده واقعی HTML و JSON-LD انجام می‌شود.</small></div></td></tr>`;
    $(".technical-banner b").textContent = "آماده بررسی واقعی";
    $(".technical-banner p").textContent = "هنوز robots، sitemap یا صفحه‌ای دریافت نشده است.";
    $(".banner-score").innerHTML = "—<span>/۱۰۰</span>";
    $(".score-card .trend").textContent = "بدون داده";
    $(".score-card small").textContent = "پس از تحلیل واقعی محاسبه می‌شود";
    $(".filter-pills").innerHTML = `<button class="active">همه <b>—</b></button>`;
    $(".lighthouse-score div:last-child").innerHTML = "<b>تست Google اجرا نشده است</b><p>پس از تحلیل، فقط امتیاز و متریک برگرفته از PageSpeed نمایش داده می‌شود.</p><span class=\"last-run\">بدون داده</span>";
    $$(".vitals b").forEach(node => { node.textContent = "—"; });
    $$(".vitals span").forEach(node => { node.textContent = "بدون داده"; });
    $(".opportunities").innerHTML = `<div class="panel-heading"><div><h3>فرصت‌های سرعت</h3><p>پس از دریافت پاسخ Google</p></div></div><div class="data-empty"><b>هنوز تستی اجرا نشده است.</b></div>`;
    $(".recommendation-banner p").textContent = "پس از تست واقعی Google، این بخش فقط توصیه‌های برگرفته از همان پاسخ را نشان می‌دهد.";
    if (!$("#scanProgress")) $(".scan-form").insertAdjacentHTML("beforeend", `<div id="scanProgress" class="crawl-progress"><div><span id="scanStatus">آماده تحلیل واقعی</span><b>سقف crawl: <select id="crawlLimit"><option value="100" selected>۱۰۰</option><option value="250">۲۵۰</option><option value="500">۵۰۰</option><option value="1000">۱۰۰۰</option></select> صفحه</b></div><i><em id="scanProgressBar"></em></i></div>`);
  };

  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-view]");
    if (nav) { goTo(nav.dataset.view); return; }
    const history = event.target.closest("[data-history-url]");
    if (history) { $("#siteUrl").value = history.dataset.historyUrl; goTo("dashboard"); toast("آدرس برای تحلیل دوباره آماده شد"); return; }
    const issue = event.target.closest("[data-issue-id]");
     if (issue) { const item = state.latest?.issues.find(row => row.id === issue.dataset.issueId); if (item) openModal(item.label, `<p>${esc(item.detail)}</p><p>تعداد صفحات: <b>${fa(item.count)}</b></p>${item.pages?.length ? `<div class="tool-output">${item.pages.slice(0, 20).map(url => `<div><a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(url)}</a></div>`).join("")}</div>` : ""}<p class="tool-source">این یافته از چک‌های HTML صفحات دریافت‌شده ساخته شده است.</p>`); return; }
    const filter = event.target.closest("[data-issue-filter]");
    if (filter && state.latest) {
      $$("[data-issue-filter]").forEach(item => item.classList.toggle("active", item === filter));
      const selected = filter.dataset.issueFilter;
      const issues = selected === "all" ? state.latest.issues : state.latest.issues.filter(item => selected === "critical" ? item.severity === "critical" : item.severity !== "critical");
      $(".full-issue-list").innerHTML = issues.length ? issues.slice(0, 12).map(issue => `<div class="full-issue"><span class="issue-status ${issue.severity === "critical" ? "red" : "orange"}">${issue.severity === "critical" ? "!" : "i"}</span><div><b>${esc(issue.label)}</b><small>${fa(issue.count)} صفحه · ${esc(issue.detail)}</small></div><span class="impact ${issue.severity === "critical" ? "high-impact" : "medium-impact"}">${issue.severity === "critical" ? "اثر زیاد" : "هشدار"}</span><button data-issue-id="${esc(issue.id)}">جزئیات ←</button></div>`).join("") : `<div class="data-empty"><b>در این دسته مسئله‌ای ثبت نشده است.</b></div>`;
      return;
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const name = action.dataset.action;
    if (name === "close-modal") closeModal();
    if (name === "export") exportReport();
    if (name === "keyword") openKeywordTool();
    if (name === "brief") openBriefTool();
    if (name === "competitor") openCompetitorTool();
     if (name === "settings") openSettings();
     if (name === "export-articles-csv") exportArticles("csv");
     if (name === "export-articles-json") exportArticles("json");
    if (name === "all-history") openModal("آرشیو تحلیل‌ها", `<div class="tool-output">${JSON.parse(localStorage.getItem("orbit-history-v2") || "[]").map(item => `<p><b>${esc(item.url)}</b><br><small>${fa(item.score)} · ${new Date(item.checkedAt).toLocaleString("fa-IR")}</small></p>`).join("") || "هنوز گزارشی ذخیره نشده است."}</div>`);
    if (name === "fixes") goTo("technical");
    if (name === "recrawl") { goTo("dashboard"); $("#siteUrl").focus(); }
  });

  document.addEventListener("click", event => {
    if (event.target.id === "clusterRun") {
      const keywords = $("#keywordInput").value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
      const groups = clusterKeywords(keywords);
      $("#toolOutput").innerHTML = groups.length ? groups.map(group => `<div class="cluster"><b>${esc(group.name)}</b><small>${group.items.map(item => esc(item)).join(" · ")}</small></div>`).join("") : "کلمه‌ای وارد نشده است.";
    }
    if (event.target.id === "briefRun") {
      const page = state.latest?.root;
      const keyword = $("#briefKeyword").value.trim() || page?.h1?.[0] || "موضوع اصلی";
      $("#toolOutput").innerHTML = `<div class="brief-result"><b>بریف ${esc(keyword)}</b><p>عنوان پیشنهادی: ${esc(keyword)} | راهنمای کامل، کاربردی و به‌روز</p><p>ساختار پیشنهادی: مقدمه · تعریف مسئله · مقایسه راهکارها · مراحل اجرا · FAQ · CTA</p><p>پوشش فعلی صفحه: ${fa(page?.words || 0)} کلمه · ${fa(page?.headings?.length || 0)} زیرعنوان · ${page?.schema ? "Schema دارد" : "Schema ندارد"}</p></div>`;
    }
     if (event.target.id === "competitorRun") runCompetitor();
      if (event.target.id === "savePsiKey") {
        const backend = $("#backendUrl")?.value.trim().replace(/\/$/, "") || "";
        const key = $("#psiApiKey")?.value.trim() || "";
        if (backend) localStorage.setItem(backendStorage, backend);
        else localStorage.removeItem(backendStorage);
        if (key) localStorage.setItem(psiKeyStorage, key);
        else localStorage.removeItem(psiKeyStorage);
        closeModal();
        toast(backend ? "تنظیمات backend و PageSpeed در همین مرورگر ذخیره شد" : "تنظیمات backend پاک شد؛ fallback عمومی فعال است");
      }
   });

  $("#scanForm").addEventListener("submit", runScan);
  $$(".device-tabs button").forEach(button => button.addEventListener("click", () => {
    $$(".device-tabs button").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    const data = state.latest?.psi?.[button.textContent.trim() === "دسکتاپ" ? "desktop" : "mobile"];
    if (data) renderPerformance({ ...state.latest, psi: { mobile: button.textContent.trim() === "دسکتاپ" ? state.latest.psi.mobile : data, desktop: state.latest.psi.desktop } });
  }));
  resetDemoMarkup();
  const savedLast = JSON.parse(localStorage.getItem("orbit-last-report-v2") || "null");
  if (savedLast?.pages?.length) renderReport(savedLast);
  else renderHistory();
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
