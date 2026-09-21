const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_TIMEOUT_MS = 30000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const ALLOWED_STRATEGIES = new Set(["mobile", "desktop"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "X-Orbit-Source, X-Orbit-Status, X-Orbit-Final-Url, X-Orbit-Redirected, X-Orbit-Url"
};

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders, ...headers }
});

const error = (status, code, message, details = {}) => json({ error: { code, message, ...details } }, status);

const readJson = async request => {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_JSON_BYTES) throw new Error("حجم درخواست از حد مجاز بیشتر است.");
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_JSON_BYTES) throw new Error("حجم درخواست از حد مجاز بیشتر است.");
  if (!body.byteLength) return {};
  try { return JSON.parse(new TextDecoder().decode(body)); }
  catch { throw new Error("بدنه JSON معتبر نیست."); }
};

const storageRequired = env => env.ORBIT_DATA && typeof env.ORBIT_DATA.get === "function" ? null : error(503, "storage_not_configured", "برای پروژه‌ها، snapshotها و گزارش‌های shareable، KV binding با نام ORBIT_DATA را تنظیم کن.");
const projectId = origin => encodeURIComponent(new URL(origin).origin).replace(/%/g, "_");
const randomId = () => crypto.randomUUID().replace(/-/g, "");

const bytesToBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const base64ToBytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const encryptionKey = async env => {
  if (!env.GOOGLE_TOKEN_ENCRYPTION_KEY) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.GOOGLE_TOKEN_ENCRYPTION_KEY));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
};
const encryptJson = async (value, env) => {
  const key = await encryptionKey(env);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return `${bytesToBase64(iv)}.${bytesToBase64(encrypted)}`;
};
const decryptJson = async (value, env) => {
  const key = await encryptionKey(env);
  if (!key || !value?.includes(".")) return null;
  const [iv, encrypted] = value.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, key, base64ToBytes(encrypted));
  return JSON.parse(new TextDecoder().decode(plain));
};

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
      "User-Agent": "OrbitSEO/2.0 (+https://mood2020.github.io/seo-orbit/)"
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
    const headers = { Accept: "text/html,application/xhtml+xml", "User-Agent": "OrbitSEO/2.0 (+https://mood2020.github.io/seo-orbit/)" };
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

const handleProjects = async (request, env, url) => {
  const unavailable = storageRequired(env);
  if (unavailable) return unavailable;
  if (url.pathname === "/api/projects" && request.method === "GET") {
    const listed = await env.ORBIT_DATA.list({ prefix: "project:", limit: 100 });
    const projects = await Promise.all(listed.keys.map(item => env.ORBIT_DATA.get(item.name, "json")));
    return json({ source: "orbit-storage", projects: projects.filter(Boolean) });
  }
  if (url.pathname === "/api/projects" && request.method === "POST") {
    try {
      const body = await readJson(request);
      const origin = new URL(body.origin).origin;
      const id = projectId(origin);
      const project = { id, origin, name: String(body.name || new URL(origin).hostname), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await env.ORBIT_DATA.put(`project:${id}`, JSON.stringify(project));
      return json({ source: "orbit-storage", project });
    } catch (err) { return error(400, "invalid_project", err.message); }
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/snapshots$/);
  if (!match) return error(404, "not_found", "مسیر پروژه پیدا نشد.");
  const id = match[1];
  if (request.method === "GET") {
    const listed = await env.ORBIT_DATA.list({ prefix: `snapshot:${id}:`, limit: 50 });
    const snapshots = await Promise.all(listed.keys.map(item => env.ORBIT_DATA.get(item.name, "json")));
    return json({ source: "orbit-storage", projectId: id, snapshots: snapshots.filter(Boolean).sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt))) });
  }
  if (request.method === "POST") {
    try {
      const report = await readJson(request);
      if (!report.url || !report.checkedAt) return error(400, "invalid_snapshot", "گزارش باید url و checkedAt داشته باشد.");
      const snapshot = { id: randomId(), projectId: id, url: report.url, checkedAt: report.checkedAt, overall: report.overall ?? null, technical: report.technical ?? null, content: report.content ?? null, performance: report.performance ?? null, validPages: report.validPages ?? 0, issues: report.issues?.length ?? 0, report };
      await env.ORBIT_DATA.put(`snapshot:${id}:${snapshot.checkedAt}:${snapshot.id}`, JSON.stringify(snapshot));
      return json({ source: "orbit-storage", snapshot }, 201);
    } catch (err) { return error(400, "invalid_snapshot", err.message); }
  }
  return error(405, "method_not_allowed", "فقط GET و POST قابل استفاده است.");
};

const integrationStatus = env => ({
  gsc: { configured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI && env.GOOGLE_TOKEN_ENCRYPTION_KEY), missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GOOGLE_TOKEN_ENCRYPTION_KEY"].filter(key => !env[key]) },
  ga4: { configured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI && env.GOOGLE_TOKEN_ENCRYPTION_KEY), missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GOOGLE_TOKEN_ENCRYPTION_KEY"].filter(key => !env[key]) },
  rank: { configured: Boolean(env.RANK_PROVIDER_URL && env.RANK_PROVIDER_TOKEN), missing: ["RANK_PROVIDER_URL", "RANK_PROVIDER_TOKEN"].filter(key => !env[key]) },
  backlink: { configured: Boolean(env.BACKLINK_PROVIDER_URL && env.BACKLINK_PROVIDER_TOKEN), missing: ["BACKLINK_PROVIDER_URL", "BACKLINK_PROVIDER_TOKEN"].filter(key => !env[key]) },
  storage: { configured: Boolean(env.ORBIT_DATA) },
  scheduler: { configured: Boolean(env.ORBIT_SCHEDULER_URL) }
});

const handleIntegrationStatus = async (request, env) => json({ source: "orbit-config", checkedAt: new Date().toISOString(), integrations: integrationStatus(env) });

const googleScopes = service => service === "gsc" ? "https://www.googleapis.com/auth/webmasters.readonly" : "https://www.googleapis.com/auth/analytics.readonly";
const handleGoogleStart = async (request, env, url) => {
  const service = url.searchParams.get("service");
  if (!["gsc", "ga4"].includes(service)) return error(400, "invalid_service", "service باید gsc یا ga4 باشد.");
  const status = integrationStatus(env)[service];
  if (!status.configured) return error(503, "google_not_configured", "تنظیمات Google OAuth کامل نیست.", { missing: status.missing });
  const unavailable = storageRequired(env);
  if (unavailable) return unavailable;
  const state = randomId();
  await env.ORBIT_DATA.put(`oauth:${state}`, JSON.stringify({ service, createdAt: Date.now() }), { expirationTtl: 600 });
  const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI, response_type: "code", access_type: "offline", prompt: "consent", scope: googleScopes(service), state });
  return json({ source: "google-oauth", service, authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
};

const handleGoogleCallback = async (request, env, url) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return error(400, "invalid_oauth_callback", "code و state لازم است.");
  const unavailable = storageRequired(env);
  if (unavailable) return unavailable;
  const pending = await env.ORBIT_DATA.get(`oauth:${state}`, "json");
  if (!pending) return error(400, "expired_oauth_state", "وضعیت OAuth منقضی یا نامعتبر است.");
  if (!env.GOOGLE_TOKEN_ENCRYPTION_KEY) return error(503, "token_storage_not_configured", "کلید رمزنگاری tokenهای Google تنظیم نشده است.");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.GOOGLE_REDIRECT_URI, grant_type: "authorization_code" }) });
  const body = await response.json();
  if (!response.ok || !body.access_token) return error(502, "google_token_exchange_failed", body.error_description || "تبادل token از Google ناموفق بود.");
  const encrypted = await encryptJson({ ...body, storedAt: Date.now() }, env);
  await env.ORBIT_DATA.put(`google-token:${pending.service}`, encrypted);
  await env.ORBIT_DATA.delete(`oauth:${state}`);
  return json({ source: "google-oauth", service: pending.service, connected: true, expiresIn: body.expires_in || null });
};

const googleToken = async (service, env) => {
  const encrypted = await env.ORBIT_DATA?.get(`google-token:${service}`);
  return encrypted ? decryptJson(encrypted, env) : null;
};

const handleGscQuery = async (request, env) => {
  const status = integrationStatus(env).gsc;
  if (!status.configured) return error(503, "gsc_not_configured", "Search Console هنوز متصل نشده است.", { missing: status.missing });
  const unavailable = storageRequired(env);
  if (unavailable) return unavailable;
  const token = await googleToken("gsc", env);
  if (!token?.access_token) return error(401, "gsc_not_connected", "ابتدا Search Console را متصل کن.");
  let body;
  try { body = await readJson(request); } catch (err) { return error(400, "invalid_query", err.message); }
  if (!body.siteUrl) return error(400, "missing_site_url", "siteUrl لازم است.");
  const response = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(body.siteUrl)}/searchAnalytics/query`, { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ startDate: body.startDate, endDate: body.endDate, dimensions: body.dimensions || ["query", "page"], rowLimit: Math.min(Number(body.rowLimit || 1000), 25000) }) });
  const data = await response.json();
  if (!response.ok) return error(response.status, "gsc_query_failed", data.error?.message || "درخواست Search Console ناموفق بود.");
  return json({ source: "gsc", fetchedAt: new Date().toISOString(), data });
};

const handleGa4Query = async (request, env) => {
  const status = integrationStatus(env).ga4;
  if (!status.configured) return error(503, "ga4_not_configured", "GA4 هنوز متصل نشده است.", { missing: status.missing });
  const unavailable = storageRequired(env);
  if (unavailable) return unavailable;
  const token = await googleToken("ga4", env);
  if (!token?.access_token) return error(401, "ga4_not_connected", "ابتدا GA4 را متصل کن.");
  let body;
  try { body = await readJson(request); } catch (err) { return error(400, "invalid_query", err.message); }
  if (!body.propertyId) return error(400, "missing_property_id", "propertyId لازم است.");
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(body.propertyId)}:runReport`, { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ dateRanges: body.dateRanges || [{ startDate: "28daysAgo", endDate: "today" }], dimensions: body.dimensions || [{ name: "pagePath" }], metrics: body.metrics || [{ name: "screenPageViews" }, { name: "averageSessionDuration" }], limit: Math.min(Number(body.limit || 1000), 10000) }) });
  const data = await response.json();
  if (!response.ok) return error(response.status, "ga4_query_failed", data.error?.message || "درخواست GA4 ناموفق بود.");
  return json({ source: "ga4", fetchedAt: new Date().toISOString(), data });
};

const handleProviderQuery = async (request, env, kind) => {
  const prefix = kind === "rank" ? "RANK_PROVIDER" : "BACKLINK_PROVIDER";
  const endpoint = env[`${prefix}_URL`];
  const token = env[`${prefix}_TOKEN`];
  if (!endpoint || !token) return error(503, `${kind}_not_configured`, `provider مربوط به ${kind} تنظیم نشده است.`);
  let body;
  try { body = await readJson(request); } catch (err) { return error(400, "invalid_query", err.message); }
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "OrbitSEO/2.0" }, body: JSON.stringify(body) });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok) return error(response.status, `${kind}_provider_failed`, data.error?.message || `provider ${kind} پاسخ ناموفق داد.`);
  return json({ source: kind, fetchedAt: new Date().toISOString(), data });
};

const handleShareReport = async (request, env, url) => {
  const unavailable = storageRequired(env);
  if (unavailable) return unavailable;
  if (request.method === "POST" && url.pathname === "/api/reports/share") {
    try {
      const report = await readJson(request);
      if (!report.url || !report.checkedAt) return error(400, "invalid_report", "گزارش باید url و checkedAt داشته باشد.");
      const token = randomId();
      await env.ORBIT_DATA.put(`share:${token}`, JSON.stringify({ token, createdAt: new Date().toISOString(), report }), { expirationTtl: 60 * 60 * 24 * 30 });
      return json({ source: "orbit-storage", token, path: `/api/reports/share/${token}`, expiresIn: 2592000 }, 201);
    } catch (err) { return error(400, "invalid_report", err.message); }
  }
  const match = url.pathname.match(/^\/api\/reports\/share\/([A-Za-z0-9]+)$/);
  if (request.method === "GET" && match) {
    const shared = await env.ORBIT_DATA.get(`share:${match[1]}`, "json");
    return shared ? json({ source: "orbit-storage", ...shared }, 200, { "Cache-Control": "public, max-age=300" }) : error(404, "share_not_found", "گزارش shareable پیدا نشد.");
  }
  return error(405, "method_not_allowed", "مسیر گزارش shareable نامعتبر است.");
};

const handleSchedule = async (request, env) => {
  if (!env.ORBIT_SCHEDULER_URL) return error(503, "scheduler_not_configured", "برای زمان‌بندی پایدار، ORBIT_SCHEDULER_URL را تنظیم کن.");
  let body;
  try { body = await readJson(request); } catch (err) { return error(400, "invalid_schedule", err.message); }
  const response = await fetch(env.ORBIT_SCHEDULER_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.ORBIT_SCHEDULER_TOKEN || ""}` }, body: JSON.stringify(body) });
  const data = await response.text();
  if (!response.ok) return error(response.status, "scheduler_failed", data.slice(0, 500));
  return json({ source: "orbit-scheduler", data: data.slice(0, 500) });
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (!["GET", "POST"].includes(request.method)) return error(405, "method_not_allowed", "فقط درخواست GET و POST قابل استفاده است.");
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "orbit-seo-api", version: "2.0.0", time: new Date().toISOString(), integrations: integrationStatus(env) });
    if (url.pathname === "/api/fetch") return handleFetch(request, env);
    if (url.pathname === "/api/probe") return handleProbe(request);
    if (url.pathname === "/api/pagespeed") return handlePageSpeed(request, env);
    if (url.pathname === "/api/projects" || url.pathname.startsWith("/api/projects/")) return handleProjects(request, env, url);
    if (url.pathname === "/api/integrations/status") return handleIntegrationStatus(request, env);
    if (url.pathname === "/api/integrations/google/start") return handleGoogleStart(request, env, url);
    if (url.pathname === "/api/integrations/google/callback") return handleGoogleCallback(request, env, url);
    if (url.pathname === "/api/gsc/query") return handleGscQuery(request, env);
    if (url.pathname === "/api/ga4/query") return handleGa4Query(request, env);
    if (url.pathname === "/api/providers/rank") return handleProviderQuery(request, env, "rank");
    if (url.pathname === "/api/providers/backlinks") return handleProviderQuery(request, env, "backlink");
    if (url.pathname === "/api/reports/share" || url.pathname.startsWith("/api/reports/share/")) return handleShareReport(request, env, url);
    if (url.pathname === "/api/schedules") return handleSchedule(request, env);
    return error(404, "not_found", "مسیر API پیدا نشد.");
  }
};
