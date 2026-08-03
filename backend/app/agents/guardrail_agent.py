"""
Pick 4 — 금융소비자보호법 가드레일과 소비자보호 묶음

AI가 금융 상품을 안내할 때 가장 위험한 것은 단정입니다. "대출 승인 확정",
"무조건 받으실 수 있습니다" 같은 말은 금융소비자보호법이 금지하는 단정적
판단 제공(제19조·제21조)에 해당합니다. 모델이 그런 문장을 만들어 내면
사람이 아니라 코드가 막아야 합니다.

그래서 이 파일은 두 가지를 합니다.
  ① 나가는 문장을 검사해 단정 표현을 안전한 표현으로 바꿉니다.
  ② 무엇을 왜 바꿨는지 기록으로 남깁니다.

기록을 남기는 이유는, 막았다는 주장만으로는 확인할 방법이 없기 때문입니다.
응답에 위반 항목과 원문 일부가 함께 나가므로 심사에서 바로 검증됩니다.
"""
from __future__ import annotations

import re

from app.models.schemas import (
    GuardrailReport,
    ProcedureStep,
    ProtectionPack,
    TermEntry,
)

KB_APPLY_URL = "https://obank.kbstar.com/quics?page=C110260"

# 단정 표현 → 안전한 표현. 앞의 것부터 검사하므로 긴 표현을 먼저 둡니다.
REWRITE: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"대출\s*승인(이)?\s*확정(입니다|됩니다|되었습니다)?"),
     "대출 승인 여부는 심사를 거쳐 결정됩니다",
     "대출 승인을 확정적으로 단정"),
    # 시험이 구멍을 찾았습니다 — '반드시·무조건·100%'는 막으면서
    # "확실히 받으실 수 있습니다"는 통과시키고 있었습니다. 단정은 낱말이
    # 아니라 말투라서, 변형을 넓게 잡고 동사(받다)까지 목적어로 봅니다.
    # 치환은 부사만 갈아 끼워 문장이 자연스럽게 남게 합니다 —
    # "확실히 받으실 수 있습니다" → "심사 결과에 따라 받으실 수 있습니다".
    (re.compile(r"(반드시|무조건|100\s*%|100퍼센트|틀림없이|확실히|확실하게|"
                r"분명히|당연히|누구나)\s*(승인|대출|지원|받)"),
     r"심사 결과에 따라 \2",
     "승인·지원 가능성을 단정"),
    (re.compile(r"(승인|지원|대출)(이|은|는)?\s*(확실|보장)(입니다|됩니다|돼요|되어요)"),
     "심사 결과에 따라 결정됩니다",
     "승인·지원을 보장으로 표현"),
    (re.compile(r"(금리|이자)(가|는)?\s*(확정|보장)(입니다|됩니다)?"),
     "금리는 신용도·담보 조건에 따라 달라집니다",
     "금리를 확정·보장으로 표현"),
    # 2차 시험이 또 구멍을 찾았습니다 — "원금 보장"은 막으면서
    # "원금이 보장"(조사), "수익이 보장"(최고·최대 없이), "손해 볼 일
    # 없습니다"(부정형)는 통과시키고 있었습니다. 단정은 조사를 끼워도
    # 단정입니다.
    (re.compile(r"원금(이|은|도)?\s*보장(되는|됩니다|돼요|입니다|이\s*됩니다)?"
                r"|원금\s*손실(이|은)?\s*없(는|습니다|어요|다)?"),
     "원금 손실이 발생할 수 있고",
     "원금 보장을 표현"),
    (re.compile(r"(반드시|무조건|100\s*%|틀림없이|확실히)?\s*(최고|최대)?\s*"
                r"수익(률)?(이|을|은|도)?\s*(보장|확정)(됩니다|되는|입니다|돼요)?"),
     "수익은 상황에 따라 달라질 수 있습니다",
     "수익을 보장으로 표현"),
    (re.compile(r"(손해|손실)\s*(볼|보실)?\s*일(은|도)?\s*없(습니다|어요|다|는)?"
                r"|(손해|손실)(가|이|는|은)\s*없(습니다|어요|다)"),
     "경우에 따라 손실이 발생할 수 있습니다",
     "손실 가능성이 없다고 표현"),
    (re.compile(r"(즉시|바로)\s*(입금|지급)(됩니다|해\s*드립니다)"),
     "심사 완료 후 지급 절차가 진행됩니다",
     "지급 시점을 단정"),
]

DISCLAIMERS = [
    "본 안내는 참고용 정보이며 대출 승인·한도·금리를 보장하지 않습니다.",
    "실제 조건은 KB국민은행 심사 결과에 따라 달라집니다.",
    "상환 능력을 넘는 대출은 신용도 하락으로 이어질 수 있습니다.",
]

# Pick 4 요구사항 — 쉬운 용어 사전 15항목
TERMS: list[TermEntry] = [
    TermEntry(term="거치기간", easy="원금은 아직 안 갚고 이자만 내는 기간",
              detail="거치기간이 끝나면 원금과 이자를 함께 갚기 시작합니다.",
              caution="거치기간이 길수록 나중에 갚을 원금이 그대로 남아 월 상환액이 커집니다."),
    TermEntry(term="원리금균등상환", easy="매달 내는 돈이 처음부터 끝까지 같은 방식",
              detail="초반에는 이자 비중이 크고 갈수록 원금 비중이 커집니다.",
              caution="총 이자는 원금균등보다 많습니다."),
    TermEntry(term="원금균등상환", easy="원금을 똑같이 나눠 갚고 이자는 줄어드는 방식",
              detail="처음엔 부담이 크지만 갈수록 월 납입액이 줄어듭니다.",
              caution="초기 부담이 커서 현금 흐름을 먼저 따져야 합니다."),
    TermEntry(term="중도상환수수료", easy="약속한 기간보다 일찍 갚을 때 내는 수수료",
              detail="보통 3년이 지나면 면제됩니다.",
              caution="여유가 생겨 일찍 갚으려다 수수료로 손해 볼 수 있습니다."),
    TermEntry(term="변동금리", easy="시장에 따라 이자율이 오르내리는 방식",
              detail="보통 6개월 또는 1년마다 다시 정합니다.",
              caution="지금 낮다고 계속 낮은 것이 아닙니다."),
    TermEntry(term="고정금리", easy="처음 정한 이자율이 끝까지 그대로인 방식",
              detail="금리가 오를 때 유리합니다.",
              caution="처음 금리가 변동금리보다 높게 시작합니다."),
    TermEntry(term="신용보증서", easy="보증기관이 대신 갚아 주겠다고 써 주는 보증",
              detail="담보가 부족한 소상공인이 대출받을 때 씁니다.",
              caution="보증료를 따로 내야 하고, 갚지 못하면 보증기관에 갚을 빚이 됩니다."),
    TermEntry(term="한도조회", easy="얼마까지 빌릴 수 있는지 미리 알아보는 것",
              detail="가조회는 신용점수에 영향을 주지 않는 경우가 많습니다.",
              caution="정식 심사로 넘어가면 조회 기록이 남습니다."),
    TermEntry(term="DSR", easy="버는 돈에서 빚 갚는 데 쓰는 비율",
              detail="총부채원리금상환비율. 모든 대출의 연간 상환액을 연소득으로 나눈 값입니다.",
              caution="이 비율이 높으면 추가 대출이 막힙니다."),
    TermEntry(term="담보인정비율(LTV)", easy="담보 가치의 몇 %까지 빌려주는지",
              detail="담보가 1억이고 LTV가 70%면 7천만원까지입니다.",
              caution="담보 가치가 떨어지면 추가 담보를 요구받을 수 있습니다."),
    TermEntry(term="연체이자", easy="약속한 날에 못 갚으면 붙는 추가 이자",
              detail="원래 금리에 연체가산금리가 더해집니다.",
              caution="며칠만 늦어도 신용점수에 기록이 남습니다."),
    TermEntry(term="정책자금", easy="정부·지자체가 낮은 금리로 빌려주는 돈",
              detail="소상공인시장진흥공단, 지역신용보증재단 등이 다룹니다.",
              caution="예산이 정해져 있어 조기에 마감되는 경우가 많습니다."),
    TermEntry(term="상환유예", easy="사정이 어려울 때 갚는 시기를 미뤄 주는 것",
              detail="원금 또는 이자 납입을 일정 기간 미룹니다.",
              caution="미룬 이자가 사라지는 것이 아니라 나중에 함께 냅니다."),
    TermEntry(term="채무조정", easy="갚기 어려워졌을 때 조건을 다시 정하는 제도",
              detail="신용회복위원회 등을 통해 금리·기간을 조정합니다.",
              caution="신용도에 기록이 남아 한동안 새 대출이 어렵습니다."),
    TermEntry(term="금융소비자보호법", easy="금융회사가 지켜야 할 설명 의무를 정한 법",
              detail="설명의무·적합성원칙·부당권유금지 등을 규정합니다.",
              caution="설명을 제대로 못 들었다면 계약 취소를 요구할 수 있습니다."),
]

# 분쟁 유형 → 근거 규정과, 사장님이 실제로 쓰는 말.
#
# 처음에는 '불완전판매', '중도상환' 같은 **제도 용어가 그대로 들어 있을 때만**
# 걸렸습니다. 그런데 그 말을 아는 분이면 이미 어디에 민원을 넣을지도 압니다.
# "설명을 제대로 안 해줬어요", "미리 갚는데 왜 돈을 떼요" 같은 말이 실제로
# 들어옵니다. 그 말을 못 알아들으면 이 기능은 없는 것과 같습니다.
DISPUTE_TYPES = {
    "불완전판매": {
        "words": ["설명", "안 알려", "안알려", "못 들었", "못들었", "몰랐",
                  "속았", "사기", "다르게 말", "말이 달라", "얘기 안"],
        "rules": ["금융소비자보호법 제19조(설명의무)",
                  "금융소비자보호법 제21조(부당권유행위 금지)"],
        "summary": ("계약 당시 설명이 충분했는지가 쟁점입니다. 설명의무 위반이 "
                    "인정되면 계약 취소나 손해배상을 요구할 수 있습니다."),
    },
    "금리": {
        "words": ["금리", "이자", "이율", "비싸", "올랐", "인상"],
        "rules": ["금융소비자보호법 제19조(설명의무)", "이자제한법 제2조"],
        "summary": ("약정 금리와 실제 부과 금리가 다른지, 변동 조건을 미리 "
                    "알렸는지가 쟁점입니다. 법정 최고금리를 넘었다면 초과분은 무효입니다."),
    },
    "중도상환": {
        "words": ["중도상환", "미리 갚", "먼저 갚", "일찍 갚", "수수료"],
        "rules": ["금융소비자보호법 제20조(불공정영업행위 금지)"],
        "summary": ("중도상환수수료는 계약서에 적힌 범위 안에서만 받을 수 있습니다. "
                    "대출일로부터 3년이 지나면 원칙적으로 부과할 수 없습니다."),
    },
    "연체": {
        "words": ["연체", "밀렸", "못 갚", "독촉", "추심", "신용등급"],
        "rules": ["금융소비자보호법 제19조(설명의무)", "신용정보법 제18조",
                  "채권의 공정한 추심에 관한 법률 제9조"],
        "summary": ("추심 과정에서 폭언·야간 연락·직장 방문 등은 금지되어 있습니다. "
                    "채무조정(신용회복위원회)으로 상환 조건을 다시 잡는 길도 있습니다."),
    },
    "보증": {
        "words": ["보증", "연대보증", "보증인", "대신 갚"],
        "rules": ["보증인 보호를 위한 특별법 제3조",
                  "금융소비자보호법 제19조(설명의무)"],
        "summary": ("보증 계약은 서면으로 해야 효력이 있고, 보증 채무의 최고액이 "
                    "특정되어 있어야 합니다. 알리지 않은 채무 증가분은 다툴 수 있습니다."),
    },
    "부당권유": {
        "words": ["권유", "가입하래", "끼워", "강요", "떠넘", "꺾기"],
        "rules": ["금융소비자보호법 제21조(부당권유행위 금지)",
                  "금융소비자보호법 제20조(불공정영업행위 금지)"],
        "summary": ("대출을 조건으로 예금·보험 가입을 요구하는 것(구속성 영업, 이른바 "
                    "'꺾기')은 금지되어 있습니다. 계약일 전후 1개월이 판단 기준입니다."),
    },
}

# 옛 이름을 남겨 둡니다 — 다른 곳에서 참조할 수 있습니다.
DISPUTE_RULES = {k: v["rules"] for k, v in DISPUTE_TYPES.items()}

PROCEDURE = [
    ProcedureStep(
        step=1, title="증빙 모으기",
        description="계약 당시 받은 서류와 상담 기록을 모읍니다. 녹취가 있으면 가장 강합니다.",
        documents=["계약서 사본", "상품설명서", "통장 거래내역", "상담 녹취·문자"],
        duration="1~3일", contact="거래 영업점"),
    ProcedureStep(
        step=2, title="금융회사에 민원 제기",
        description="먼저 해당 금융회사 소비자보호부서에 정식 민원을 넣습니다. 여기서 해결되는 경우가 많습니다.",
        documents=["민원신청서", "1단계 증빙 일체"],
        duration="접수 후 14일 이내 회신", contact="KB국민은행 고객센터 1588-9999"),
    ProcedureStep(
        step=3, title="금융감독원 분쟁조정 신청",
        description="회사 회신에 동의할 수 없으면 금융감독원에 분쟁조정을 신청합니다. 비용은 들지 않습니다.",
        documents=["분쟁조정신청서", "금융회사 회신문", "증빙 일체"],
        duration="통상 30~60일", contact="금융감독원 1332"),
    ProcedureStep(
        step=4, title="소송 또는 조정 수락",
        description="조정안을 받아들이면 재판상 화해와 같은 효력이 생깁니다. 받아들이지 않으면 민사소송으로 갑니다.",
        documents=["조정결정문", "소장(소송 시)"],
        duration="조정 수락 시 즉시", contact="대한법률구조공단 132"),
]


def inspect(text: str) -> GuardrailReport:
    """나가는 문장을 검사하고 필요하면 고쳐 씁니다."""
    violations, out = [], text
    for pattern, safe, why in REWRITE:
        if pattern.search(out):
            violations.append(why)
            out = pattern.sub(safe, out)

    return GuardrailReport(
        passed=not violations,
        violations=violations,
        rewritten=bool(violations),
        original_excerpt=(text[:160] + "…") if violations and len(text) > 160
        else (text if violations else ""),
        disclaimers=DISCLAIMERS if violations or "대출" in text or "금리" in text else [],
        official_link=KB_APPLY_URL,
    )


def apply(text: str) -> tuple[str, GuardrailReport]:
    """검사하고 고친 본문과 기록을 함께 돌려줍니다."""
    report = inspect(text)
    out = text
    for pattern, safe, _ in REWRITE:
        out = pattern.sub(safe, out)
    if report.disclaimers:
        out = out.rstrip() + "\n\n" + "\n".join(f"· {d}" for d in report.disclaimers)
        out += f"\n· 정식 신청: {KB_APPLY_URL}"
    return out, report


def _pick_terms(text: str, k: int = 4) -> list[TermEntry]:
    """본문에 실제로 나온 용어를 골라 붙입니다.

    열다섯 개를 통째로 내보내면 읽지 않습니다. 지금 대화에 나온 것만
    골라야 눈에 들어옵니다.
    """
    hit = [t for t in TERMS if t.term in text or t.easy[:6] in text]
    rest = [t for t in TERMS if t not in hit]
    return (hit + rest)[:k]


def build_protection(text: str, question: str = "") -> ProtectionPack:
    """Pick 4 산출물을 조립합니다 — 분쟁 요약·근거 규정·용어·절차·서류."""
    joined = f"{question} {text}"

    # 사장님 말에서 분쟁 유형을 고릅니다. 여럿이 걸리면 걸린 낱말이 많은
    # 쪽을 대표로 삼되, 근거 규정은 걸린 유형 것을 모두 싣습니다.
    hits: list[tuple[int, str]] = []
    for name, spec in DISPUTE_TYPES.items():
        n = sum(1 for w in spec["words"] if w in joined)
        if n:
            hits.append((n, name))

    rules: list[str] = []
    for _, name in hits:
        rules.extend(DISPUTE_TYPES[name]["rules"])

    if hits:
        hits.sort(reverse=True)
        primary = hits[0][1]
        summary = DISPUTE_TYPES[primary]["summary"]
    else:
        # 유형을 못 고르면 지어내지 않고 절차만 안내합니다.
        rules = DISPUTE_TYPES["불완전판매"]["rules"]
        summary = ("먼저 금융회사에 민원을 넣고, 회신에 동의할 수 없으면 금융감독원 "
                   "분쟁조정으로 넘어가는 순서입니다. 조정에는 비용이 들지 않습니다.")

    docs = sorted({d for s in PROCEDURE for d in s.documents})

    return ProtectionPack(
        dispute_summary=summary,
        applicable_rules=sorted(set(rules)),
        terms=_pick_terms(joined),
        procedure=PROCEDURE,
        document_checklist=docs,
    )
