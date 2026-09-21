package com.mood2020.orbitseo;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://mood2020.github.io/seo-orbit/?app=android";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(8, 17, 31));
        getWindow().setNavigationBarColor(Color.rgb(8, 17, 31));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(246, 248, 252));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                view.loadUrl(request.getUrl().toString());
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(androidShellScript(), null);
            }
        });
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(246, 248, 252));
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        webView.loadUrl(APP_URL);
    }

    private String androidShellScript() {
        return "(function(){"
                + "if(document.documentElement.classList.contains('orbit-android'))return;"
                + "document.documentElement.classList.add('orbit-android');"
                + "var css=\""
                + "html.orbit-android,html.orbit-android body{min-width:320px;background:#f6f8fc;}"
                + "body.orbit-android{padding-top:70px;padding-bottom:88px;}"
                + ".orbit-android .sidebar,.orbit-android .topbar{display:none!important;}"
                + ".orbit-android .main-content{width:100%;margin:0;padding:0 16px 94px;}"
                + ".orbit-android .view{max-width:100%;padding-top:18px;}"
                + ".orbit-android .welcome-row,.orbit-android .page-intro{align-items:flex-start;flex-direction:column;gap:12px;}"
                + ".orbit-android .welcome-row h1,.orbit-android .page-intro h1{font-size:23px;letter-spacing:-.04em;}"
                + ".orbit-android .welcome-row .eyebrow{display:none;}"
                + ".orbit-android .welcome-row .subhead,.orbit-android .page-intro .subhead{font-size:11px;line-height:1.9;}"
                + ".orbit-android .status-pill{align-self:flex-start;}"
                + ".orbit-android .scan-hero{margin-top:18px;padding:18px 16px;border-radius:18px;}"
                + ".orbit-android .scan-copy{gap:10px;}"
                + ".orbit-android .scan-copy h2{font-size:16px;}"
                + ".orbit-android .scan-copy p{font-size:10px;line-height:1.9;}"
                + ".orbit-android .url-input{height:auto;min-height:48px;gap:5px;flex-wrap:wrap;padding:7px 8px;}"
                + ".orbit-android .url-input input{min-width:150px;height:32px;}"
                + ".orbit-android .url-input button{height:34px;margin-right:auto;}"
                + ".orbit-android .scan-options{gap:9px;flex-wrap:wrap;line-height:1.8;}"
                + ".orbit-android .scan-options>span{width:100%;}"
                + ".orbit-android .metric-grid,.orbit-android .content-stats,.orbit-android .article-stats{grid-template-columns:1fr 1fr;gap:9px;}"
                + ".orbit-android .score-card{grid-column:span 2;}"
                + ".orbit-android .dashboard-grid,.orbit-android .two-column,.orbit-android .lab-grid{grid-template-columns:1fr;gap:10px;}"
                + ".orbit-android .section-heading{margin-top:25px;}"
                + ".orbit-android .panel{border-radius:16px;box-shadow:0 10px 28px rgba(22,38,74,.06);}" 
                + ".orbit-android .panel-heading{gap:8px;}"
                + ".orbit-android .article-actions{width:100%;}" 
                + ".orbit-android .article-actions button{flex:1;}"
                + ".orbit-android .technical-banner{align-items:flex-start;border-radius:16px;}"
                + ".orbit-android .audit-grid{grid-template-columns:1fr 1fr;gap:9px;}"
                + ".orbit-android .audit-card{min-height:88px;}"
                + ".orbit-android .full-issue{align-items:flex-start;flex-wrap:wrap;}"
                + ".orbit-android .full-issue>button{margin-right:31px;}"
                + ".orbit-android .impact{margin-right:auto;}"
                + ".orbit-android .lighthouse-score{gap:12px;margin:20px 0;}"
                + ".orbit-android .recommendation-banner{align-items:flex-start;flex-wrap:wrap;}"
                + ".orbit-android .recommendation-banner button{margin-right:40px;}"
                + ".orbit-android .modal{width:calc(100% - 28px);max-height:calc(100% - 32px);overflow:auto;}"
                + ".android-header{position:fixed;z-index:20;top:0;right:0;left:0;height:70px;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;color:#fff;background:#08111f;box-shadow:0 8px 22px rgba(8,17,31,.18);direction:rtl;}"
                + ".android-brand{display:flex;align-items:center;gap:10px;}"
                + ".android-brand-mark{width:38px;height:38px;border-radius:12px;box-shadow:0 6px 16px rgba(91,129,255,.26);}" 
                + ".android-brand b{display:block;font:800 15px/1 \\\"DM Sans\\\",sans-serif;letter-spacing:.12em;}"
                + ".android-brand small{display:block;margin-top:5px;color:#8798b8;font:500 8px/1 \\\"DM Sans\\\",sans-serif;letter-spacing:.12em;}"
                + ".android-header-label{padding:7px 10px;border:1px solid #233653;border-radius:99px;color:#aebdde;font-size:9px;background:#101e32;}"
                + ".android-bottom-nav{position:fixed;z-index:21;right:10px;bottom:10px;left:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:7px;border:1px solid rgba(255,255,255,.08);border-radius:20px;color:#91a1bd;background:rgba(8,17,31,.96);box-shadow:0 12px 30px rgba(8,17,31,.25);direction:rtl;}"
                + ".android-bottom-nav button{min-height:48px;border-radius:14px;color:#91a1bd;background:transparent;font:500 9px \\\"Vazirmatn\\\",sans-serif;}"
                + ".android-bottom-nav button span{display:block;margin-bottom:4px;font-size:17px;line-height:1;}"
                + ".android-bottom-nav button.active{color:#fff;background:#20365b;box-shadow:inset 0 0 0 1px #385992;}"
                + "\";var style=document.createElement('style');style.textContent=css;document.head.appendChild(style);"
                + "var header=document.createElement('header');header.className='android-header';"
                + "header.innerHTML=\"<div class='android-brand'><svg class='android-brand-mark' viewBox='0 0 64 64' aria-hidden='true'><rect width='64' height='64' rx='16' fill='#14294a'/><ellipse cx='32' cy='32' rx='22' ry='12' fill='none' stroke='#6f91ff' stroke-width='3' transform='rotate(-28 32 32)'/><path d='M20 42V32M32 46V23M44 37V28' stroke='#f5b86b' stroke-width='5' stroke-linecap='round'/><circle cx='47' cy='15' r='4' fill='#f5b86b'/></svg><span><b>ORBIT</b><small>SEO COMMAND CENTER</small></span></div><span class='android-header-label'>تحلیل واقعی</span>\";document.body.prepend(header);"
                + "var nav=document.createElement('nav');nav.className='android-bottom-nav';nav.innerHTML=\"<button data-android-view='dashboard' class='active'><span>⌂</span>نمای کلی</button><button data-android-view='articles'><span>▤</span>مقالات</button><button data-android-view='technical'><span>⌁</span>فنی</button><button data-android-view='performance'><span>↗</span>سرعت</button>\";document.body.appendChild(nav);"
                + "function activate(view){var original=document.querySelector('[data-view=\\\"'+view+'\\\"]');if(original)original.click();nav.querySelectorAll('button').forEach(function(item){item.classList.toggle('active',item.getAttribute('data-android-view')===view);});window.scrollTo(0,0);}"
                + "nav.addEventListener('click',function(event){var button=event.target.closest('button[data-android-view]');if(button)activate(button.getAttribute('data-android-view'));});"
                + "})();";
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
