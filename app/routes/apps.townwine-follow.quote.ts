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
        --bg: #f7f2e7;
        --text: #272320;
        --muted: #736c64;
        --line: rgba(39, 35, 32, 0.14);
        --panel: #fbf8f2;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Helvetica Neue", Arial, sans-serif;
        background: var(--bg);
        color: var(--text);
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      .site-header {
        position: sticky;
        top: 0;
        z-index: 20;
        background: var(--bg);
        border-bottom: 1px solid var(--line);
      }

      .header-inner {
        max-width: 1440px;
        margin: 0 auto;
        padding: 22px 48px 18px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 32px;
      }

      .brand {
        font-size: 32px;
        font-weight: 900;
        letter-spacing: -0.04em;
        white-space: nowrap;
      }

      .nav {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 34px;
        font-size: 16px;
        font-weight: 500;
      }

      .nav a {
        position: relative;
        padding: 8px 0;
      }

      .nav a.is-on::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: -19px;
        height: 4px;
        background: var(--text);
      }

      .actions {
        display: flex;
        align-items: center;
        gap: 18px;
        color: var(--text);
      }

      .icon {
        width: 20px;
        height: 20px;
        display: inline-flex;
      }

      .quote-shell {
        max-width: 1440px;
        margin: 0 auto;
        padding: 28px 48px 48px;
      }

      .quote-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 18px;
      }

      .quote-kicker {
        font-size: 12px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 10px;
      }

      .quote-title {
        margin: 0;
        font-size: clamp(34px, 4vw, 56px);
        line-height: 1.02;
        letter-spacing: -0.05em;
      }

      .quote-sub {
        margin: 10px 0 0;
        font-size: 16px;
        line-height: 1.7;
        color: var(--muted);
      }

      .quote-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 0 18px;
        border: 1px solid var(--line);
        background: var(--panel);
        font-size: 15px;
        font-weight: 600;
      }

      .btn--dark {
        background: var(--text);
        color: #fff;
        border-color: var(--text);
      }

      .frame-wrap {
        border: 1px solid var(--line);
        background: #fff;
        min-height: calc(100vh - 250px);
        overflow: hidden;
      }

      iframe {
        display: block;
        width: 100%;
        height: calc(100vh - 250px);
        min-height: 720px;
        border: 0;
        background: #fff;
      }

      @media (max-width: 1024px) {
        .header-inner {
          grid-template-columns: 1fr;
          justify-items: center;
          gap: 18px;
          padding: 20px 24px 16px;
        }

        .nav {
          gap: 20px;
          flex-wrap: wrap;
        }

        .nav a.is-on::after {
          bottom: -10px;
        }

        .quote-shell {
          padding: 22px 20px 28px;
        }

        .quote-head {
          flex-direction: column;
        }
      }

      @media (max-width: 640px) {
        .brand {
          font-size: 24px;
        }

        .nav {
          font-size: 15px;
          gap: 16px;
        }

        .quote-title {
          font-size: 34px;
        }

        .quote-sub {
          font-size: 15px;
        }

        iframe {
          min-height: 640px;
          height: calc(100vh - 220px);
        }
      }
    </style>
  </head>
  <body>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/">TOWN WINE</a>
        <nav class="nav" aria-label="주요 메뉴">
          <a href="/">홈</a>
          <a href="/pages/deals">진행 중인 공구</a>
          <a href="/pages/collectors">컬렉터</a>
          <a href="/pages/policy">가이드</a>
          <a class="is-on" href="/apps/townwine-follow/quote">국가별 와인 견적</a>
        </nav>
        <div class="actions" aria-hidden="true">
          <span class="icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          </span>
          <span class="icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <span class="icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8V7a5 5 0 0 1 10 0v1"/><path d="M5 8h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8Z"/></svg>
          </span>
        </div>
      </div>
    </header>

    <main class="quote-shell">
      <div class="quote-head">
        <div>
          <div class="quote-kicker">Country Quote</div>
          <h1 class="quote-title">국가별 와인 견적</h1>
          <p class="quote-sub">메뉴바는 그대로 유지하고, 이 페이지 아래에서 바로 견적 계산기를 확인할 수 있도록 연결했습니다.</p>
        </div>
        <div class="quote-actions">
          <a class="btn btn--dark" href="${QUOTE_URL}" target="_blank" rel="noopener noreferrer">새 창으로 열기</a>
        </div>
      </div>

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
