"""계약서 신호등 시연용 예시 계약서 PDF를 만듭니다 — docs/samples/

'계약서 신호등 — 서명하기 전에 확인하세요' 카드에 끌어다 넣어 볼 수 있는
가상의 계약서 3부입니다. 독소조항 규칙(app/services/contract_scan.py)에
실제로 걸리는 문장을 일부러 심어 두었습니다.

    예시계약서_임대차_독소조항.pdf     — 🚨 위험 3 · ⚠️ 주의 3
    예시계약서_프랜차이즈_독소조항.pdf — 🚨 위험 1 · ⚠️ 주의 3
    예시계약서_임대차_안전.pdf         — 걸리는 조항 없음(초록불)

정직성 원칙
- 만든 뒤 pypdf로 글자를 도로 뽑아 같은 scan() 규칙에 넣어, 기대한 조항이
  '정확히 그것만' 걸리는지 검증합니다. 어긋나면 파일을 남기지 않고 죽습니다.
- 줄바꿈은 어절(공백) 단위로만 합니다 — 낱말 한가운데가 갈라지면 pdf.js
  추출 텍스트에 공백이 끼어 규칙 정규식이 조용히 빗나갑니다.
- 글꼴은 프런트가 쓰는 고운바탕 woff2를 그대로 TTF로 변환해 심습니다.
  글자가 텍스트로 들어가야 브라우저 pdf.js가 읽습니다(스캔 이미지 아님).
- 인물·상호·주소·금액은 전부 허구이고, 각 장 하단에 시연용임을 밝힙니다.

실행 — 만들 때만 필요한 도구라 서빙 requirements.txt에 넣지 않습니다:
    pip install reportlab fonttools brotli pypdf
    python -m scripts.make_contract_samples
"""
from __future__ import annotations

import os
import re
import sys

from fontTools.ttLib import TTFont as FTFont
from pypdf import PdfReader
from reportlab.lib.colors import Color
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.contract_scan import scan  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "..", "frontend", "public")
OUT = os.path.join(ROOT, "..", "docs", "samples")
CACHE = os.path.join(ROOT, ".cache", "fonts")

# 발표자료(make_deck.py)와 같은 잉크·종이 색 — 웹과 같은 얼굴.
INK = Color(0x38 / 255, 0x32 / 255, 0x2A / 255)
GRAY = Color(0x6B / 255, 0x62 / 255, 0x59 / 255)
LINE = Color(0xD9 / 255, 0xD2 / 255, 0xC6 / 255)
PAPER = Color(0xF9 / 255, 0xF6 / 255, 0xEF / 255)
YELLOW = Color(0xFF / 255, 0xBC / 255, 0x00 / 255)
BROWN = Color(0x54 / 255, 0x44 / 255, 0x38 / 255)

W, H = A4
MARGIN = 60
TOP, BOTTOM = H - 78, 84
BODY_W = W - 2 * MARGIN

R, B = "GowunBatang", "GowunBatang-Bold"

BADGE = "KB-꿀비 · 계약서 신호등 시연용 예시"
DISCLAIMER = ("본 문서는 KB-꿀비 '계약서 신호등' 기능 시연을 위해 만든 "
              "가상의 예시이며 실제 계약서가 아닙니다. "
              "인물·상호·주소·금액은 모두 허구입니다.")


def register_fonts() -> None:
    """frontend/public의 고운바탕 woff2 → TTF 변환 후 등록.

    변환본은 gitignore 된 backend/.cache/fonts/에 둡니다 — 원본은
    저장소에 이미 있으니 산출물을 하나 더 커밋할 이유가 없습니다.
    """
    os.makedirs(CACHE, exist_ok=True)
    for src, name in [("gowunbatang-r.woff2", R), ("gowunbatang-b.woff2", B)]:
        ttf = os.path.join(CACHE, name + ".ttf")
        if not os.path.exists(ttf):
            f = FTFont(os.path.join(PUB, src))
            f.flavor = None
            f.save(ttf)
        pdfmetrics.registerFont(TTFont(name, ttf))


def assert_glyphs(texts: list[str]) -> None:
    """쓰려는 글자가 서브셋 글꼴에 전부 있는지 먼저 확인.

    웹용 서브셋(한글 2,875자)이라 드문 글자는 없을 수 있습니다. 없는
    글자는 네모(□)로 찍히고 추출도 어긋나므로, 그리기 전에 죽는 편이
    낫습니다 — 문구를 흔한 글자로 바꾸라는 뜻입니다.
    """
    used = {ch for t in texts for ch in t if ch != "\n"}
    for name in (R, B):
        cmap = FTFont(os.path.join(CACHE, name + ".ttf")).getBestCmap()
        missing = sorted(ch for ch in used if ord(ch) not in cmap)
        if missing:
            raise SystemExit(
                f"{name} 글꼴에 없는 글자: {missing} — 문구를 바꿔 주세요")


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        cand = w if not cur else cur + " " + w
        if pdfmetrics.stringWidth(cand, font, size) <= width or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


class Doc:
    """위에서 아래로 흘려 쓰는 계약서 캔버스 — 넘치면 스스로 장을 넘깁니다."""

    def __init__(self, path: str):
        self.c = Canvas(path, pagesize=A4)
        self.c.setTitle(os.path.splitext(os.path.basename(path))[0])
        self.c.setAuthor("KB-꿀비 (시연용 예시)")
        self.y = TOP
        self.page = 1
        self._chrome()

    def _chrome(self) -> None:
        c = self.c
        bw = pdfmetrics.stringWidth(BADGE, B, 8) + 16
        c.setFillColor(YELLOW)
        c.roundRect(W - MARGIN - bw, H - 46, bw, 15, 7.5, stroke=0, fill=1)
        c.setFillColor(BROWN)
        c.setFont(B, 8)
        c.drawString(W - MARGIN - bw + 8, H - 42, BADGE)
        c.setFont(R, 8)
        c.setFillColor(GRAY)
        for i, ln in enumerate(wrap(DISCLAIMER, R, 8, BODY_W - 60)):
            c.drawCentredString(W / 2, 52 - i * 11, ln)
        c.drawCentredString(W / 2, 26, f"- {self.page} -")

    def need(self, h: float) -> None:
        if self.y - h < BOTTOM:
            self.c.showPage()
            self.page += 1
            self.y = TOP
            self._chrome()

    def title(self, s: str) -> None:
        c = self.c
        c.setFont(B, 19)
        c.setFillColor(INK)
        c.drawCentredString(W / 2, self.y, s)
        c.setStrokeColor(INK)
        c.setLineWidth(1.1)
        c.line(MARGIN, self.y - 14, W - MARGIN, self.y - 14)
        c.setLineWidth(0.4)
        c.line(MARGIN, self.y - 17, W - MARGIN, self.y - 17)
        self.y -= 42

    def para(self, s: str, font: str = R, size: float = 10.5,
             leading: float = 17, color: Color = INK) -> None:
        lines = wrap(s, font, size, BODY_W)
        self.need(len(lines) * leading)
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        for ln in lines:
            self.c.drawString(MARGIN, self.y, ln)
            self.y -= leading
        self.y -= 3

    def table(self, rows: list[tuple[str, str]]) -> None:
        c, lw, pad, lead = self.c, 118.0, 8.0, 14.0
        vw = BODY_W - lw - 2 * pad - 10
        for label, value in rows:
            lines = wrap(value, R, 10, vw)
            rh = max(len(lines) * lead + 2 * pad - 4, 24)
            self.need(rh)
            top = self.y + 12
            c.setFillColor(PAPER)
            c.rect(MARGIN, top - rh, lw, rh, stroke=0, fill=1)
            c.setStrokeColor(LINE)
            c.setLineWidth(0.7)
            c.rect(MARGIN, top - rh, BODY_W, rh, stroke=1, fill=0)
            c.setFont(B, 9.5)
            c.setFillColor(BROWN)
            c.drawString(MARGIN + pad, top - pad - 7, label)
            c.setFont(R, 10)
            c.setFillColor(INK)
            for i, ln in enumerate(lines):
                c.drawString(MARGIN + lw + pad, top - pad - 7 - i * lead, ln)
            self.y -= rh
        self.y -= 14

    def article(self, head: str, body: str) -> None:
        self.need(34)
        self.c.setFont(B, 11)
        self.c.setFillColor(INK)
        self.c.drawString(MARGIN, self.y, head)
        self.y -= 16.5
        self.para(body)

    def sign(self, date: str, parties: list[tuple[str, str]]) -> None:
        self.need(60 + len(parties) * 30)
        self.y -= 8
        self.c.setStrokeColor(LINE)
        self.c.setLineWidth(0.7)
        self.c.line(MARGIN, self.y, W - MARGIN, self.y)
        self.y -= 26
        self.c.setFont(R, 11)
        self.c.setFillColor(INK)
        self.c.drawCentredString(W / 2, self.y, date)
        self.y -= 30
        for role, name in parties:
            self.c.setFont(B, 10.5)
            self.c.drawString(MARGIN + 6, self.y, role)
            self.c.setFont(R, 10.5)
            self.c.drawString(MARGIN + 120, self.y, name)
            self.c.drawRightString(W - MARGIN - 6, self.y, "(인)")
            self.c.setStrokeColor(LINE)
            self.c.line(MARGIN, self.y - 8, W - MARGIN, self.y - 8)
            self.y -= 28

    def save(self) -> None:
        self.c.save()


# ── 예시 계약서 3부 ───────────────────────────────────────────────────────
# 규칙 열 개(danger 4 + warn 6)가 두 '독소' 문서에 나눠 담겨 전부 한 번씩
# 시연됩니다. '안전' 문서는 같은 주제를 법이 정한 모습대로 적은 대조군.
SAMPLES: list[dict] = [
    {
        "file": "예시계약서_임대차_독소조항.pdf",
        "title": "상가건물 임대차 계약서",
        "intro": ("임대인 김임대(이하 \"갑\"이라 한다)와 임차인 박사장(이하 "
                  "\"을\"이라 한다)은 아래 표시 상가건물에 관하여 다음과 같이 "
                  "임대차계약을 체결한다."),
        "table": [
            ("소재지", "서울특별시 마포구 꿀비로 12, 1층 101호"),
            ("구조·용도", "철근콘크리트조 근린생활시설"),
            ("임차 부분", "1층 101호 전부(전용 33제곱미터)"),
            ("보증금", "금 30,000,000원"),
            ("차임", "월 금 1,800,000원(매월 말일 지급)"),
        ],
        "articles": [
            ("제1조(목적)",
             "갑은 위 상가건물을 을에게 임대하고, 을은 이를 일반음식점 "
             "영업의 용도로 사용한다."),
            ("제2조(계약기간)",
             "임대차 기간은 2026년 9월 1일부터 2028년 8월 31일까지 "
             "24개월로 한다."),
            ("제3조(보증금)",
             "을은 보증금 금 30,000,000원을 계약 체결과 동시에 갑에게 "
             "지급한다."),
            ("제4조(차임의 조정)",   # 🚨 과도한 차임 인상 여지
             "차임은 경제 사정의 변동이 있는 경우 갑이 임의로 인상할 수 "
             "있으며, 을은 지정된 기일에 인상된 차임을 지급하여야 한다."),
            ("제5조(권리금)",        # 🚨 권리금 포기 특약
             "을은 본 계약의 체결과 종료에 관련하여 갑에게 권리금을 일체 "
             "주장하지 않는다."),
            ("제6조(계약의 해지)",   # 🚨 임대인 일방 해지
             "갑은 필요한 때에는 언제든지 본 계약을 해지하고 을에게 "
             "목적물의 명도를 요구할 수 있다."),
            ("제7조(계약의 연장)",   # ⚠️ 자동 연장
             "기간 만료 1개월 전까지 당사자의 이의가 없으면 본 계약은 같은 "
             "조건으로 자동 연장된 것으로 본다."),
            ("제8조(연대보증)",      # ⚠️ 연대보증 요구
             "을은 갑이 승인하는 연대보증인 1인을 세워 본 계약상 을의 채무 "
             "전부를 보증하게 하여야 한다."),
            ("제9조(원상복구)",      # ⚠️ 원상복구 범위 불명확
             "을은 계약 종료 시 원상복구로서 갑이 지정하는 일체의 시설물 "
             "철거와 도장 공사를 을의 비용으로 이행한다."),
            ("제10조(관리비)",
             "관리비는 월 금 150,000원으로 하고 을이 부담한다."),
            ("제11조(비용의 정산)",
             "공과금과 제세공과금은 각 명의에 따라 정산한다."),
        ],
        "special": ["1. 을의 인테리어 공사 기간 7일에 대하여는 차임을 면제한다.",
                    "2. 주차는 건물 내 1대를 무상으로 한다."],
        "date": "2026년 8월 15일",
        "parties": [("임대인(갑)", "김임대"), ("임차인(을)", "박사장")],
        "expect": {"권리금 포기 특약", "과도한 차임 인상 여지",
                   "임대인 일방 해지", "자동 연장·자동 갱신",
                   "원상복구 범위 불명확", "연대보증 요구"},
    },
    {
        "file": "예시계약서_프랜차이즈_독소조항.pdf",
        "title": "가맹계약서",
        "intro": ("가맹본부 주식회사 꿀비에프앤비(이하 \"가맹본부\"라 한다)와 "
                  "가맹점사업자 박사장(이하 \"가맹점사업자\"라 한다)은 "
                  "'꿀비네치킨' 가맹사업에 관하여 다음과 같이 가맹계약을 "
                  "체결한다."),
        "table": [
            ("영업표지", "꿀비네치킨"),
            ("점포 소재지", "서울특별시 마포구 꿀비로 34, 1층"),
            ("계약기간", "2026년 9월 1일부터 2028년 8월 31일까지(24개월)"),
            ("가맹금", "가입비 금 10,000,000원, 교육비 금 3,000,000원"),
            ("계약이행보증금", "금 5,000,000원"),
        ],
        "articles": [
            ("제1조(목적)",
             "가맹본부는 가맹점사업자에게 영업표지의 사용권을 부여하고 "
             "경영과 영업활동에 대한 지원과 교육을 제공하며, "
             "가맹점사업자는 이에 따른 가맹금을 지급한다."),
            ("제2조(영업지역)",
             "가맹본부는 별지에 표시된 범위로 가맹점사업자의 영업지역을 "
             "설정한다."),
            ("제3조(계약의 갱신)",   # 🚨 계약갱신 요구 배제
             "가맹점사업자는 계약기간 만료 시 갱신을 요구하지 못하며, "
             "계약의 갱신 여부는 가맹본부가 영업 방침에 따라 결정한다."),
            ("제4조(광고와 판촉)",   # ⚠️ 광고·판촉비 일방 전가
             "광고 또는 판촉행사에 소요되는 비용은 그 전액을 "
             "가맹점사업자가 부담하며, 행사의 시기와 내용은 가맹본부가 "
             "정한다."),
            ("제5조(경업금지)",      # ⚠️ 경업금지 과다
             "가맹점사업자는 계약의 해지 또는 종료 후 3년간 전국 "
             "어디에서도 동종 업종의 영업을 하지 못한다."),
            ("제6조(위약금)",        # ⚠️ 과도한 위약금
             "가맹점사업자가 계약을 중도 해지하는 경우 위약금으로 가맹금 "
             "총액의 3배에 해당하는 금액을 가맹본부에 지급한다."),
            ("제7조(원부자재의 공급)",
             "가맹점사업자는 가맹본부가 지정하는 원부자재를 지정된 "
             "공급업자로부터 구입하여 사용한다."),
            ("제8조(교육)",
             "가맹점사업자와 종업원은 가맹본부가 실시하는 교육을 "
             "이수하여야 한다."),
            ("제9조(로열티)",
             "가맹점사업자는 매월 매출액의 100분의 4에 해당하는 금액을 "
             "로열티로 가맹본부에 지급한다."),
        ],
        "special": ["1. 점포의 인테리어 시공은 가맹본부가 지정한 업체가 시행한다."],
        "date": "2026년 8월 15일",
        "parties": [("가맹본부", "주식회사 꿀비에프앤비 대표이사 최본부"),
                    ("가맹점사업자", "박사장")],
        "expect": {"계약갱신 요구 배제", "과도한 위약금·위약벌",
                   "경업금지 과다 (프랜차이즈)",
                   "광고·판촉비 일방 전가 (프랜차이즈)"},
    },
    {
        "file": "예시계약서_임대차_안전.pdf",
        "title": "상가건물 임대차 계약서",
        "intro": ("임대인 김임대(이하 \"갑\"이라 한다)와 임차인 박사장(이하 "
                  "\"을\"이라 한다)은 아래 표시 상가건물에 관하여 다음과 같이 "
                  "임대차계약을 체결한다."),
        "table": [
            ("소재지", "서울특별시 마포구 꿀비로 12, 1층 101호"),
            ("임차 부분", "1층 101호 전부(전용 33제곱미터)"),
            ("보증금", "금 30,000,000원"),
            ("차임", "월 금 1,800,000원(매월 말일 지급)"),
        ],
        "articles": [
            ("제1조(목적)",
             "갑은 위 상가건물을 을에게 임대하고, 을은 이를 일반음식점 "
             "영업의 용도로 사용한다."),
            ("제2조(계약기간과 갱신)",
             "임대차 기간은 2026년 9월 1일부터 2028년 8월 31일까지 "
             "24개월로 한다. 을은 상가건물 임대차보호법이 정하는 바에 따라 "
             "최초 임대차 기간을 포함하여 10년의 범위에서 계약의 갱신을 "
             "청구할 수 있고, 갑은 같은 법이 정하는 정당한 사유가 있는 "
             "경우를 제외하고는 이를 거절하지 아니한다."),
            ("제3조(보증금과 차임)",
             "을은 보증금 금 30,000,000원을 계약 체결과 동시에 갑에게 "
             "지급하고, 차임은 매월 말일에 금 1,800,000원을 지급한다."),
            ("제4조(차임의 증액)",
             "차임의 증액은 상가건물 임대차보호법령이 정한 기준에 따라 "
             "청구 당시 차임의 100분의 5를 초과할 수 없으며, 갑과 을이 "
             "협의하여 정한다."),
            ("제5조(권리금의 보호)",
             "갑은 상가건물 임대차보호법 제10조의4가 정하는 바에 따라 을의 "
             "권리금 회수 기회를 보호하고, 이를 방해하는 행위를 하지 "
             "아니한다."),
            ("제6조(계약의 해지)",
             "갑 또는 을은 상대방이 본 계약상 의무를 중대하게 위반한 "
             "경우에 한하여 계약을 해지할 수 있다. 갑은 을이 3기의 "
             "차임액에 이르도록 차임을 연체한 경우가 아니면 연체를 이유로 "
             "계약을 해지하지 못한다."),
            ("제7조(원상회복)",
             "을은 계약이 종료된 때에 목적물을 원상으로 회복하여 갑에게 "
             "반환한다. 다만 통상적인 사용에 따른 마모와 세월의 경과로 "
             "인한 자연 손상은 원상회복의 범위에서 제외한다."),
            ("제8조(수선과 비용의 부담)",
             "목적물의 구조부와 주요 설비에 대한 수선 의무와 비용은 갑이 "
             "부담하고, 을의 고의나 과실로 인한 파손은 을이 그 수리 비용을 "
             "부담한다."),
            ("제9조(보증금의 반환)",
             "갑은 계약이 종료된 경우 목적물을 반환받음과 동시에 보증금 "
             "전액을 을에게 반환한다."),
        ],
        "special": ["1. 입주 전 목적물의 상태는 갑과 을이 함께 사진으로 "
                    "기록하고 각자 1부씩 보관한다.",
                    "2. 본 계약서에 정하지 아니한 사항은 상가건물 "
                    "임대차보호법과 민법의 규정에 따른다."],
        "date": "2026년 8월 15일",
        "parties": [("임대인(갑)", "김임대"), ("임차인(을)", "박사장")],
        "expect": set(),
    },
]


def build(spec: dict) -> str:
    path = os.path.join(OUT, spec["file"])
    d = Doc(path)
    d.title(spec["title"])
    d.para(spec["intro"])
    d.y -= 6
    d.table(spec["table"])
    for head, body in spec["articles"]:
        d.article(head, body)
    d.article("특약사항", spec["special"][0])
    for line in spec["special"][1:]:
        d.para(line)
    d.sign(spec["date"], spec["parties"])
    d.save()
    return path


def verify(spec: dict, path: str) -> dict:
    """PDF에서 글자를 도로 뽑아 프런트와 같은 방식으로 정리해 검사.

    ContractScan.tsx는 pdf.js 조각을 공백으로 잇고 \\s+를 한 칸으로
    접습니다 — 여기서도 똑같이 접어 넣어야 같은 것을 검증한 셈이 됩니다.
    """
    text = "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)
    r = scan(re.sub(r"\s+", " ", text).strip())
    got = {f["name"] for f in r.get("findings", [])}
    if got != spec["expect"]:
        raise SystemExit(
            f"{spec['file']}: 기대와 다르게 걸렸습니다\n"
            f"  기대: {sorted(spec['expect'])}\n  실제: {sorted(got)}")
    return r


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    register_fonts()
    strings: list[str] = [BADGE, DISCLAIMER, "(인)"]
    for s in SAMPLES:
        strings += [s["title"], s["intro"], s["date"], *s["special"]]
        strings += [v for row in s["table"] for v in row]
        strings += [t for a in s["articles"] for t in a]
        strings += [v for p in s["parties"] for v in p]
    assert_glyphs(strings)

    for spec in SAMPLES:
        path = build(spec)
        r = verify(spec, path)
        light = "🟢 초록불" if r["clean"] else f"🚨 위험 {r['danger']} · ⚠️ 주의 {r['warn']}"
        print(f"✓ {spec['file']} — {light}")
        for f in r["findings"]:
            print(f"    [{f['level']}] {f['name']}")
    print(f"\n완료 — {os.path.abspath(OUT)}")


if __name__ == "__main__":
    main()
