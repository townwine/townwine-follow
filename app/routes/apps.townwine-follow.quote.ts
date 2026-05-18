import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const QUOTE_URL =
  "https://www.appsheet.com/start/fa633c0c-0a79-41ad-89ba-79f07e81ce36?platform=desktop#appName=TownwineQuotation-780392113&vss=H4sIAAAAAAAAA6WOywrCMBREf6XMOl-QrQiK6EZxY1zE5haCbVKa1FpC_t1bH3StLmeGc5iEm6VhH3V5hTylOW1ohERSOIwtKUiFhXex87WCUNjp5lWu_FBEX_SBY0Y-i48hUoBM3wrkvw8ErCEXbWWpm2wTy5Y3yfPEcTFTyAJNH_WlpudtpnLmrvIlr-bId366EdZueW-1M1tvWFrpOlB-AJLB5ElvAQAA&view=How%20to%20use";

function renderQuotePage() {
  const html = String.raw`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>국가별 와인 견적 | TOWN WINE</title>
    <style>
      :root {
        --c-bg:#F6F1E7;
        --c-line:#D8D0C2;
        --c-text:#2F2C28;
        --header-h:64px;
        --container:1200px;
        --ff-sans:"Pretendard Variable","Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic","Helvetica Neue",Arial,sans-serif;
        --r-sm:2px;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: var(--ff-sans);
        background: var(--c-bg);
        color: var(--c-text);
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      a { color: inherit; text-decoration: none; }

      .container{
        width:100%;
        max-width:var(--container);
        margin:0 auto;
        padding:0 20px;
      }

      .site-header {
        position:sticky;
        top:0;
        z-index:50;
        background:var(--c-bg);
        border-bottom:1px solid var(--c-line);
      }

      .site-header__in{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        align-items:center;
        gap:10px 16px;
        min-height:var(--header-h);
        padding-top:12px;
        padding-bottom:10px;
      }

      .site-header__top{
        display:flex;
        align-items:center;
        min-width:0;
      }

      .brand{
        display:flex;
        align-items:baseline;
        gap:8px;
        font-weight:500;
        font-size:22px;
        letter-spacing:-0.03em;
        color:var(--c-text);
        white-space:nowrap;
      }

      .nav{
        grid-column:1 / -1;
        display:flex;
        align-items:center;
        gap:20px;
        min-width:0;
        overflow-x:auto;
        overflow-y:hidden;
        padding:0 2px 2px;
        scrollbar-width:none;
        -ms-overflow-style:none;
      }

      .nav::-webkit-scrollbar{display:none}

      .nav a{
        flex:0 0 auto;
        font-size:15px;
        color:var(--c-text);
        font-weight:400;
        padding:7px 0;
        letter-spacing:-0.01em;
        position:relative;
        white-space:nowrap;
      }

      .nav a.is-on{
        font-weight:700;
      }

      .nav a.is-on::after{
        content:'';
        position:absolute;
        left:0;
        right:0;
        bottom:-2px;
        height:3px;
        background:var(--c-text);
      }

      .actions{
        display:flex;
        align-items:center;
        justify-self:end;
        gap:6px;
      }

      .icon-btn{
        width:42px;
        height:42px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        border-radius:var(--r-sm);
        color:var(--c-text);
      }

      .icon-btn svg{
        width:21px;
        height:21px;
      }

      .icon-btn__cart-svg{
        width:23px;
        height:23px;
      }

      .quote-shell{
        width:100%;
        margin:0;
        padding:0;
      }

      .frame-wrap{
        border:0;
        border-top:1px solid var(--c-line);
        background:#fff;
        min-height:calc(100vh - 98px);
        overflow:hidden;
      }

      iframe{
        display:block;
        width:100%;
        height:calc(100vh - 98px);
        min-height:760px;
        border:0;
        background:#fff;
      }

      @media(min-width:768px){
        .container{padding:0 32px}
      }

      @media(max-width:899px){
        .site-header__top{
          grid-column:1;
          grid-row:1;
        }
        .actions{
          grid-column:2;
          grid-row:1;
        }
        .nav{
          grid-column:1 / -1;
          grid-row:2;
        }
      }

      @media(min-width:900px){
        .site-header__in{
          grid-template-columns:auto minmax(0,1fr) auto;
          gap:16px 24px;
          padding-top:0;
          padding-bottom:0;
        }
        .nav{
          grid-column:auto;
          justify-content:center;
          gap:28px;
          overflow:visible;
          padding:0;
        }
      }

      @media(max-width:699px){
        .nav a{font-size:14px;font-weight:400}
        .actions{gap:4px}
        .icon-btn{width:38px;height:38px}
        .icon-btn svg{width:20px;height:20px}
        .icon-btn__cart-svg{width:22px;height:22px}
      }

      @media(max-width:640px){
        iframe{
          min-height:640px;
          height:calc(100vh - 90px);
        }
      }
    </style>
  </head>
  <body>
    <header class="site-header">
      <div class="container site-header__in">
        <div class="site-header__top">
          <a class="brand" href="/">TOWN WINE</a>
        </div>
        <nav class="nav" aria-label="주요 메뉴">
          <a href="/">홈</a>
          <a href="/pages/deals">진행 중인 공구</a>
          <a href="/pages/collectors">컬렉터</a>
          <a href="/pages/policy">가이드</a>
          <a class="is-on" href="/apps/townwine-follow/quote">국가별 와인 견적</a>
        </nav>
        <div class="actions">
          <a class="icon-btn" aria-label="검색" href="/search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          </a>
          <a class="icon-btn" aria-label="마이페이지" href="/pages/my-page">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
          </a>
          <a class="icon-btn" aria-label="장바구니" href="/cart">
            <svg class="icon-btn__cart-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8V7a5 5 0 0 1 10 0v1"/><path d="M5 8h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8Z"/></svg>
          </a>
        </div>
      </div>
    </header>

    <main class="quote-shell">
      <section class="frame-wrap" aria-label="국가별 와인 견적 계산기">
        <iframe
          src="${QUOTE_URL}"
          loading="eager"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="clipboard-read; clipboard-write"
          title="국가별 와인 견적 계산기"
        ></iframe>
      </section>
    </main>
  </body>
</html>`;

  return html;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.public.appProxy(request);

  return new Response(renderQuotePage(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
