# Orbit SEO

داشبورد فارسی و مدرن برای تحلیل سئو، محتوا و عملکرد سایت؛ ساخته‌شده برای استفاده روی وب و اندروید.

## امکانات نسخه اول

- تحلیل URL با Google PageSpeed Insights / Lighthouse برای موبایل و دسکتاپ
- بررسی محتوای صفحه: title، meta description، H1، headingها، تصاویر بدون alt، canonical، زبان، تعداد کلمات، Schema و Open Graph
- داشبورد امتیاز کلی، سلامت فنی، کیفیت محتوا و عملکرد
- پنل اولویت‌های امروز و گزارش مسائل به ترتیب اثرگذاری
- صفحات جدا برای محتوای کلمات کلیدی، خزنده و Core Web Vitals
- خروجی JSON گزارش و نگهداری تاریخچه تحلیل در مرورگر
- PWA قابل نصب روی موبایل و دسکتاپ
- APK اندروید با GitHub Actions

## اجرا و انتشار

این پروژه بدون build step روی GitHub Pages اجرا می‌شود. فایل `.github/workflows/pages.yml` انتشار خودکار را انجام می‌دهد.

برای ساخت APK از مسیر **Actions > Build Orbit SEO APK > Run workflow** استفاده کن. با انتشار یک Release هم فایل `orbit-seo.apk` به همان Release اضافه می‌شود.

## محدودیت فنی نسخه استاتیک

GitHub Pages بک‌اند ندارد. به همین دلیل Lighthouse از API رسمی Google و بررسی HTML از یک مسیر واسط عمومی استفاده می‌کند. برای اسکن کامل چندصد صفحه، اتصال Search Console، داده‌های GSC/GA4 و زمان‌بندی crawl باید در فاز بعد یک API امن یا Cloudflare Worker اضافه شود؛ کلیدهای Google نباید داخل کد عمومی قرار بگیرند.
