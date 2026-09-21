const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_TIMEOUT_MS = 30000;
const ALLOWED_STRATEGIES = new Set(["mobile", "desktop"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "X-Orbit-Source, X-Orbit-Status, X-Orbit-Final-Url, X-Orbit-Redirected, X-Orbit-Url"
};

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders, ...headers }
});

const error = (status, code, message, details = {}) => json({ error: { code, message, ...details } }, status);

const isPrivateHostname = hostname => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "localhost.localdomain", "broadcasthost"].includes(host) || host.endsWith(".local")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  return false;
};

const parseTarget = raw => {
  if (!raw) throw new Error("پارامتر url ارسال نشده است.");
  let target;
  try { target = new URL(raw); } catch { throw new Error("آدرس URL معتبر نیست."); }
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error("فقط HTTP و HTTPS قابل بررسی است.");
  if (isPrivateHostname(target.hostname)) throw new Error("آدرس‌های local و private قابل بررسی نیستند.");
  target.hash = "";
  return target;
};

const withTimeout = async (request, timeout = MAX_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(request, { signal: controller.signal, redirect: "follow" }); }
  finally { clearTimeout(timer); }
};

const readLimitedText = async response => {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_HTML_BYTES) throw new Error(`حجم پاسخ از ${MAX_HTML_BYTES / 1024 / 1024}MB بیشتر است.`);
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_HTML_BYTES) throw new Error(`حجم پاسخ از ${MAX_HTML_BYTES / 1024 / 1024}MB بیشتر است.`);
  return new TextDecoder().decode(body);
};

const fetchTarget = async target => {
  const request = new Request(target.toString(), {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8",
      "User-Agent": "OrbitSEO/1.3 (+https://mood2020.github.io/seo-orbit/)"
    }
  });
  const response = await withTimeout(request);
  const text = await readLimitedText(response);
  return { response, text };
};

const pageSpeedUrl = (target, strategy, env, userKey) => {
  const params = new URLSearchParams({ url: target.toString(), strategy });
  ["performance", "seo", "accessibility", "best-practices"].forEach(category => params.append("category", category));
  const key = env.PAGESPEED_API_KEY || userKey;
  if (key) params.set("key", key);
  return `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
};

const handleFetch = async (request, env) => {
  let target;
  try { target = parseTarget(new URL(request.url).searchParams.get("url")); }
  catch (err) { return error(400, "invalid_url", err.message); }
  try {
    const { response, text } = await fetchTarget(target);
    return new Response(text, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("content-type") || "text/html; charset=utf-8",
        "X-Orbit-Source": "cloudflare-worker",
        "X-Orbit-Status": String(response.status),
        "X-Orbit-Final-Url": response.url || target.toString(),
        "X-Orbit-Redirected": String(Boolean(response.redirected)),
        "X-Orbit-Url": target.toString()
      }
    });
  } catch (err) {
    const message = err.name === "AbortError" ? "دریافت صفحه timeout شد." : err.message || "دریافت صفحه ناموفق بود.";
    return error(502, "upstream_fetch_failed", message, { url: target.toString() });
  }
};

const handleProbe = async request => {
  let target;
  try { target = parseTarget(new URL(request.url).searchParams.get("url")); }
  catch (err) { return error(400, "invalid_url", err.message); }
  try {
    const headers = { Accept: "text/html,application/xhtml+xml", "User-Agent": "OrbitSEO/1.3 (+https://mood2020.github.io/seo-orbit/)" };
    let response = await withTimeout(new Request(target.toString(), { method: "HEAD", headers }), 20000);
    if (response.status === 405) response = await withTimeout(new Request(target.toString(), { headers }), 20000);
    return json({ url: target.toString(), status: response.status, ok: response.ok, finalUrl: response.url || target.toString(), redirected: Boolean(response.redirected), contentType: response.headers.get("content-type") || "" }, 200, { "X-Orbit-Source": "cloudflare-worker" });
  } catch (err) {
    return error(502, "probe_failed", err.name === "AbortError" ? "بررسی لینک timeout شد." : err.message || "بررسی لینک ناموفق بود.", { url: target.toString() });
  }
};

const handlePageSpeed = async (request, env) => {
  const params = new URL(request.url).searchParams;
  let target;
  try { target = parseTarget(params.get("url")); }
  catch (err) { return error(400, "invalid_url", err.message); }
  const strategy = params.get("strategy") || "mobile";
  if (!ALLOWED_STRATEGIES.has(strategy)) return error(400, "invalid_strategy", "strategy باید mobile یا desktop باشد.");
  try {
    const response = await withTimeout(new Request(pageSpeedUrl(target, strategy, env, params.get("key") || "")), 60000);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "X-Orbit-Source": "google-pagespeed" }
    });
  } catch (err) {
    return error(502, "pagespeed_failed", err.name === "AbortError" ? "درخواست PageSpeed timeout شد." : err.message || "درخواست PageSpeed ناموفق بود.");
  }
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "GET") return error(405, "method_not_allowed", "فقط درخواست GET قابل استفاده است.");
    const url = new URL(request.url);
      if (url.pathname === "/health") return json({ ok: true, service: "orbit-seo-api", version: "1.4.0", time: new Date().toISOString() });
    if (url.pathname === "/api/fetch") return handleFetch(request, env);
    if (url.pathname === "/api/probe") return handleProbe(request);
    if (url.pathname === "/api/pagespeed") return handlePageSpeed(request, env);
    return error(404, "not_found", "مسیر API پیدا نشد.");
  }
};
