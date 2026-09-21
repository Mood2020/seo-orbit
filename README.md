# Orbit SEO

داشبورد فارسی و مدرن برای تحلیل سئو، محتوا و عملکرد سایت؛ ساخته‌شده برای استفاده روی وب و اندروید.

## امکانات نسخه فعلی

- crawl واقعی هم‌دامنه با سقف قابل تنظیم، بر اساس لینک‌های داخلی و sitemap
- خواندن robots.txt، استخراج sitemap و احترام به مسیرهای Disallow
- بررسی تک‌تک صفحات دریافت‌شده: title، meta description، H1، headingها، تصاویر بدون alt، canonical، robots، viewport، زبان، تعداد کلمات، Schema، Open Graph و لینک داخلی
- امتیازدهی deterministic با وزن‌های مشخص؛ هیچ عدد تصادفی یا fallback نمایشی وجود ندارد
- PageSpeed Insights / Lighthouse واقعی Google برای موبایل و دسکتاپ، Core Web Vitals و فرصت‌های سرعت
- داشبورد امتیاز کلی، سلامت فنی، کیفیت محتوا، عملکرد و مسائل اولویت‌دار
- خوشه‌ساز واقعی کلمات بر اساس اشتراک واژه‌ها
- ساخت بریف محتوا از عنوان، هدینگ‌ها و حجم واقعی صفحه تحلیل‌شده
- مقایسه crawl واقعی دو دامنه با سقف یکسان
- خروجی JSON و CSV گزارش و نگهداری تاریخچه تحلیل در مرورگر
- PWA قابل نصب روی موبایل و دسکتاپ
- APK اندروید با GitHub Actions

## اجرا و انتشار

این پروژه بدون build step روی GitHub Pages اجرا می‌شود. فایل `.github/workflows/pages.yml` انتشار خودکار را انجام می‌دهد.

برای ساخت APK از مسیر **Actions > Build Orbit SEO APK > Run workflow** استفاده کن. با انتشار یک Release هم فایل `orbit-seo.apk` به همان Release اضافه می‌شود.

## محدودیت فنی نسخه GitHub Pages

GitHub Pages بک‌اند ندارد. PageSpeed از API رسمی Google و crawl HTML از یک مسیر واسط عمومی استفاده می‌کند. اگر یک صفحه یا API پاسخ ندهد، همان صفحه در گزارش failed/partial ثبت می‌شود و امتیاز حدسی تولید نمی‌شود. برای crawl بدون واسط، هزاران URL، اتصال OAuth به Search Console/GA4، rank tracking و زمان‌بندی crawl باید یک API امن یا Cloudflare Worker اضافه شود؛ کلیدهای Google نباید داخل کد عمومی قرار بگیرند.
