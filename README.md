# Orbit SEO

داشبورد فارسی و مدرن برای تحلیل سئو، محتوا و عملکرد سایت؛ ساخته‌شده برای استفاده روی وب و اندروید.

## امکانات نسخه فعلی

- crawl واقعی هم‌دامنه با سقف قابل تنظیم، بر اساس لینک‌های داخلی و sitemap
- خزش گرافی چندمرحله‌ای با عمق صفحه، لینک‌های ورودی، صفحات یتیم و لینک‌های خارجی
- خواندن robots.txt، استخراج sitemap و احترام به مسیرهای Disallow
- بررسی تک‌تک صفحات دریافت‌شده: title، meta description، H1، headingها، تصاویر بدون alt، canonical، robots، viewport، زبان، تعداد کلمات، Schema، Open Graph، لینک داخلی و لینک خارجی
- ممیزی پیشرفته تصاویر (alt، فرمت مدرن و lazy loading)، JSON-LD نامعتبر، redirectهای واقعی و فرصت‌های لینک‌سازی داخلی
- probe لینک‌های خارج از سقف crawl از مسیر `/api/probe`؛ اگر endpoint در Worker فعال نباشد، کلاینت آن را به‌عنوان «داده در دسترس نیست» نشان می‌دهد، نه لینک شکسته
- تشخیص title، meta description و H1 تکراری و ثبت صفحات غیرقابل دریافت به‌عنوان مسئله قابل اقدام
- امتیازدهی deterministic با وزن‌های مشخص؛ هیچ عدد تصادفی یا fallback نمایشی وجود ندارد
- PageSpeed Insights / Lighthouse واقعی Google برای موبایل و دسکتاپ، Core Web Vitals و فرصت‌های سرعت
- داشبورد امتیاز کلی، سلامت فنی، کیفیت محتوا، عملکرد و مسائل اولویت‌دار
- خوشه‌ساز واقعی کلمات بر اساس اشتراک واژه‌ها
- ساخت بریف محتوا از عنوان، هدینگ‌ها و حجم واقعی صفحه تحلیل‌شده
- مقایسه crawl واقعی دو دامنه با سقف یکسان
- خروجی JSON، CSV و HTML قابل‌اشتراک، مسیر چاپ/ذخیره PDF و نگهداری تاریخچه تحلیل در مرورگر با روند واقعی snapshotها
- هشدار محلی هنگام crawl بعدی برای افت امتیاز یا افزایش مشکلات؛ این قابلیت جایگزین cron یا monitoring سمت‌سرور نیست
- فهرست مقاله‌ها با تشخیص JSON-LD، metadata، ساختار `article` و الگوی URL؛ شامل عنوان، URL، نوع، تاریخ، نویسنده، دسته، کلمات و لینک‌های ورودی
- crawl قابل تنظیم از ۱۰۰ تا ۱۰۰۰ URL و خروجی جداگانه CSV/JSON برای مقاله‌ها
- امکان ذخیره اختیاری کلید PageSpeed در حافظه محلی مرورگر برای عبور از quota عمومی Google
- backend آماده Cloudflare Worker در `backend/` برای fetch امن HTML، probe لینک و proxy رسمی PageSpeed؛ Worker فعلی: `https://orbit-seo-api.newtazn.workers.dev`
- قرارداد API فاز دوم برای پروژه‌ها و snapshotهای KV، گزارش shareable با token موقت، وضعیت integrationها، OAuth Search Console/GA4، query واقعی Google، providerهای rank/backlink و scheduler webhook
- صفحه «اتصال منابع و پروژه» در داشبورد برای وضعیت credentialها، ذخیره snapshot ابری، لینک گزارش، OAuth و query providerها
- PWA قابل نصب روی موبایل و دسکتاپ
- APK اندروید با GitHub Actions
- APK با پوسته موبایلی اختصاصی، ناوبری پایین، هدر برند و آیکون Orbit مستقل از ظاهر دسکتاپ وب

فهرست قابلیت‌های مرجع و نقشه راه معماری در `SEO_ROADMAP.md` نگهداری می‌شود.

## اجرا و انتشار

این پروژه بدون build step روی GitHub Pages اجرا می‌شود. فایل `.github/workflows/pages.yml` انتشار خودکار را انجام می‌دهد.

برای ساخت APK از مسیر **Actions > Build Orbit SEO APK > Run workflow** استفاده کن. با انتشار یک Release هم فایل `orbit-seo.apk` به همان Release اضافه می‌شود.

## محدودیت فنی نسخه GitHub Pages

GitHub Pages بک‌اند ندارد. برای تحلیل پایدار، Worker داخل `backend/` را deploy کن و آدرس آن را از تنظیمات داشبورد وارد کن. Worker fetch HTML را با timeout، محدودیت حجم، CORS و جلوگیری از آدرس‌های private انجام می‌دهد و PageSpeed را از API رسمی Google عبور می‌دهد. اگر backend تنظیم نشده باشد، fallbackهای عمومی امتحان می‌شوند و در صورت شکست علت واقعی نمایش داده می‌شود؛ امتیاز حدسی تولید نمی‌شود. برای فعال‌سازی فاز دوم، `ORBIT_DATA` KV binding و secretهای مستندشده در `backend/wrangler.toml` را تنظیم کن. بدون آن‌ها UI وضعیت «نیازمند تنظیم» نشان می‌دهد و از تولید داده ساختگی خودداری می‌کند.
