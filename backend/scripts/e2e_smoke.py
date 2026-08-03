"""E2E 스모크 — 시연 전 5분 안에 '전부 살아 있나'를 확인합니다.

밤샘 자율 개선 루프에서 실제로 버그를 잡아낸 배터리를 저장소에 남깁니다
(?mode= 딥링크가 옛 상담에 덮이던 버그, 히어로 exit 미언마운트 버그가
모두 이 종류의 스윕에서 나왔습니다).

실행 (백엔드가 127.0.0.1:8010에 떠 있어야 합니다):
    python -m scripts.e2e_smoke              # 로컬
    BASE=https://kb-kkulbee-smallbiz-multiagent.onrender.com \
        python -m scripts.e2e_smoke          # 프로덕션

playwright는 개발 의존입니다: pip install playwright && playwright install chromium
"""
from __future__ import annotations

import asyncio
import os
import sys

BASE = os.environ.get("BASE", "http://127.0.0.1:8010")

RESULTS: list[tuple[bool, str, str]] = []


def log(name: str, ok: bool, extra: str = "") -> None:
    RESULTS.append((ok, name, extra))
    print(("OK  " if ok else "FAIL"), name, extra)


async def main() -> None:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1600, "height": 950})
        errors: list[str] = []
        pg.on("pageerror", lambda e: errors.append(str(e)))

        await pg.goto(BASE + "/", wait_until="networkidle", timeout=120000)
        await pg.evaluate(
            "localStorage.clear();localStorage.setItem('kkulbee:onboarded','1')")

        # 1) 다섯 갈래 전용 도구가 각자 페이지에 있는가
        tools = {"location": "근거 공개", "gap": "기회 업종 레이더",
                 "policy": "자금 설계사", "protection": "골든타임",
                 "all": "한 번에 브리핑"}
        for mk, marker in tools.items():
            await pg.goto(f"{BASE}/?mode={mk}", wait_until="networkidle",
                          timeout=60000)
            await pg.wait_for_timeout(1200)
            body = await pg.locator("body").inner_text()
            log(f"갈래 {mk}", marker in body, marker)

        # 2) 질문 → 로딩(히어로 언마운트·캔버스 1개) → 답변
        await pg.goto(f"{BASE}/?mode=location", wait_until="networkidle",
                      timeout=60000)
        await pg.wait_for_timeout(1000)
        await pg.fill("#ask input", "연남동에서 카페 열려는데 상권 어때?")
        await pg.press("#ask input", "Enter")
        await pg.wait_for_timeout(2000)
        info = await pg.evaluate(
            "()=>({c:document.querySelectorAll('body > canvas').length,"
            "h:!!document.querySelector('section.hero-glow')})")
        log("로딩 중 캔버스 1·히어로 언마운트",
            info["c"] == 1 and not info["h"], str(info))
        await pg.wait_for_timeout(8000)
        body = await pg.locator("body").inner_text()
        log("답변 카드+글라스박스", "상권 점수" in body and "글라스박스" in body)

        # 3) 지도 카드 — 기본 열림 + 투어 버튼 (헤더를 누르면 닫히니 주의)
        log("지도 기본 열림+투어", await pg.locator("text=▶ 지도 투어").count() >= 1)

        # 4) 찜 → 서랍 (주의: title*='찜'은 헤더 ☆에도 걸립니다 — 정확히)
        await pg.goto(f"{BASE}/?q=창업 자금 지원사업 알려줘",
                      wait_until="networkidle", timeout=120000)
        await pg.wait_for_timeout(8000)
        star = pg.locator("button[title='찜해 두고 마감 챙기기']")
        if await star.count():
            await star.first.scroll_into_view_if_needed()
            await star.first.click()
            await pg.wait_for_timeout(800)
            await pg.locator("header button:has-text('☆')").click()
            await pg.wait_for_timeout(900)
            log("찜 서랍(dialog)", await pg.locator("[role=dialog]").count() == 1)
            await pg.keyboard.press("Escape")
        else:
            log("찜 버튼", False)

        # 5) 지도 클릭이 부르는 주변 가게 API — 카카오 로컬 실검색
        rr = await pg.request.get(
            BASE + "/api/v1/nearby?lat=37.5622&lng=126.9255&q=%EC%B9%B4%ED%8E%98")
        dd = await rr.json()
        log("주변 가게 API", bool(dd.get("ok")) and len(dd.get("places", [])) > 0,
            f"{len(dd.get('places', []))}곳")

        # 6) 모바일 — 가로 오버플로 0
        pm = await b.new_page(viewport={"width": 390, "height": 844})
        await pm.goto(BASE + "/", wait_until="networkidle", timeout=60000)
        await pm.evaluate("localStorage.setItem('kkulbee:onboarded','1')")
        for path in ["/", "/?mode=location", "/?mode=policy",
                     "/?mode=protection", "/?mode=gap", "/?mode=all"]:
            await pm.goto(BASE + path, wait_until="networkidle", timeout=60000)
            await pm.wait_for_timeout(900)
            over = await pm.evaluate(
                "document.documentElement.scrollWidth"
                " - document.documentElement.clientWidth")
            log(f"모바일 {path}", over == 0, f"overflow {over}px")

        log("JS pageerror 0건", not errors,
            errors[0][:80] if errors else "")
        await b.close()

    bad = [r for r in RESULTS if not r[0]]
    print(f"\n=== {len(RESULTS) - len(bad)}/{len(RESULTS)} 통과 ===")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    asyncio.run(main())
