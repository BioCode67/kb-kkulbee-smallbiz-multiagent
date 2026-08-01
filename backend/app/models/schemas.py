"""
KB-꿀비 응답 계약 — 프런트엔드와 주고받는 모든 것의 형태

여기가 화면과 서버 사이의 유일한 약속입니다. 3D 마스코트의 동작 상태부터
상권 점수의 요인별 기여, 금소법 검사 결과까지 전부 이 파일을 거칩니다.

느슨한 dict로 주고받으면 화면 쪽에서 옵셔널 체이닝이 끝없이 늘어나고,
어느 필드가 언제 없는지 아무도 모르게 됩니다. 그래서 모든 응답을 여기서
막습니다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CharacterMotion(str, Enum):
    """3D 꿀비의 동작 상태.

    응답마다 반드시 하나가 실려 나갑니다. 화면은 이 값으로 Spline 씬의
    애니메이션을 바꿉니다. 값이 없으면 마스코트가 멈춰 서서 서비스가
    고장 난 것처럼 보입니다.
    """

    FLY_HAPPY = "fly_happy"      # 좋은 소식 — 높은 점수, 지원사업 매칭
    THINKING = "thinking"        # 분석 중 — 스트리밍 대기
    EXPLAINING = "explaining"    # 설명 중 — 근거·절차 안내


class AgentKind(str, Enum):
    ROUTER = "router"
    LOCATION = "location"
    POLICY = "policy"
    PROTECTION = "protection"
    GUARDRAIL = "guardrail"


class Intent(str, Enum):
    """어느 과제로 보낼지. 라우터가 정합니다."""

    LOCATION = "location"        # Pick 2 — 최적 입지
    POLICY = "policy"            # Pick 3 — 정책자금·대출
    PROTECTION = "protection"    # Pick 4 — 소비자보호
    GENERAL = "general"


# ── Pick 2. 입지 ──────────────────────────────────────────────────────────
class FactorContribution(BaseModel):
    """상권 점수를 만든 요인 하나.

    SHAP과 같은 방식으로 읽습니다. 기준점(50점)에서 각 요인이 몇 점을
    올리고 내렸는지 더하면 최종 점수가 나옵니다. 화면의 막대 하나가
    이 객체 하나입니다.
    """

    model_config = ConfigDict(populate_by_name=True)

    key: str = Field(description="요인 식별자", examples=["floating_pop"])
    label: str = Field(description="화면에 보일 이름", examples=["유동인구"])
    value: float = Field(description="원자료 값")
    unit: str = Field(default="", description="원자료 단위")
    contribution: float = Field(description="점수 기여 (%p). 음수면 깎은 것")
    direction: Literal["up", "down", "flat"] = "flat"
    reason: str = Field(default="", description="왜 이 방향인지 한 줄")

    @model_validator(mode="after")
    def _dir(self):
        """방향은 기여에서 나옵니다. 따로 넘기는 값이 아닙니다.

        처음에는 field_validator(mode="before")로 두었는데, 기본값 "flat"이
        허용값 목록에 들어 있어 검증기 첫 줄에서 그대로 반환됐습니다. 그래서
        기여가 -12.87인 요인도 direction이 flat으로 나갔습니다. 값이 틀린 게
        아니라 계산 자체가 건너뛰어진 것이라 눈에 안 띄었습니다.
        """
        object.__setattr__(self, "direction",
                           "up" if self.contribution > 0.5
                           else "down" if self.contribution < -0.5 else "flat")
        return self


class LocationScore(BaseModel):
    """한 상권의 점수와 그 근거."""

    region_name: str
    industry: str = Field(default="한식음식점")
    latitude: float | None = None
    longitude: float | None = None

    base_score: float = Field(default=50.0, description="기준점")
    total_score: float = Field(ge=0, le=100)
    grade: Literal["S", "A", "B", "C", "D"] = "C"
    factors: list[FactorContribution] = Field(default_factory=list)

    # 지도에서 실제 점포를 불러오려면 어느 동네·어느 업종인지가 필요합니다.
    dong_code: str | None = Field(default=None, description="행정동 코드")
    industry_code: str | None = Field(default=None, description="업종 소분류 코드")
    same_industry_count: int | None = Field(default=None, description="동 안 동종업종 점포 수")

    # 이 동네에 덜 나온 업종 / 이미 넘치는 업종
    gaps: list["IndustryGap"] = Field(default_factory=list)
    crowded: list["IndustryGap"] = Field(default_factory=list)

    peer_median: float | None = Field(default=None, description="같은 업종 상권 중앙값")
    data_source: Literal["public_api", "fallback"] = "fallback"
    note: str = ""

    @model_validator(mode="after")
    def _grade(self):
        """등급은 점수에서 나옵니다. 따로 넘기는 값이 아닙니다.

        전에는 grade를 안 넘기면 기본값 "C"가 그대로 나갔습니다. 검증기가
        "이미 올바른 값"으로 보고 통과시켰기 때문입니다. 86.5점짜리 상권이
        화면에 C등급으로 찍히고 있었습니다.
        """
        s = self.total_score
        object.__setattr__(
            self, "grade",
            "S" if s >= 85 else "A" if s >= 72 else "B" if s >= 58
            else "C" if s >= 45 else "D")
        return self


class IndustryGap(BaseModel):
    """이 동네에 상대적으로 적거나 많은 업종 하나.

    '기회'라고 단정하지 않습니다. 적은 데는 이유가 있을 수 있습니다 —
    임대료, 상권 성격, 배후 인구. 그래서 '몇 곳 있고 비슷한 규모 동네는
    평균 몇 곳'이라는 사실만 싣고 판단은 사장님께 맡깁니다.
    """

    code: str
    name: str
    here: int = Field(description="이 동네에 있는 수")
    expected: float = Field(description="비슷한 규모 동네의 평균")
    ratio: float = Field(description="here / expected")


class MapPin(BaseModel):
    """지도에 찍을 점 하나."""

    name: str
    latitude: float
    longitude: float
    score: float
    grade: str = "C"
    is_target: bool = False


# ── Pick 3. 정책자금 ──────────────────────────────────────────────────────
class PolicyMatch(BaseModel):
    """찾아낸 지원사업 하나 — 기업마당 실제 공고에서 옵니다.

    처음에는 category를 '정책자금·보증·KB상품·바우처·컨설팅' 다섯으로 못
    박아 두었습니다. 손으로 적은 열두 건일 때는 맞았지만, 실제 공고 900건은
    중소벤처기업부의 분야 구분(금융·경영·기술·수출·내수·인력·창업)을 씁니다.
    화면에 보이라고 남의 자료를 우리 분류에 억지로 끼워 넣으면 그때부터
    출처와 화면이 어긋납니다. 그래서 원 분류를 그대로 싣습니다.

    limit_krw도 마찬가지입니다. 예전 수집기는 본문에서 찾은 **가장 큰 금액**을
    한도라고 적었습니다. 그래서 "총사업비 4,000억원"이 한도로 나갔습니다.
    지금은 '한도·최대·이내' 같은 말이 곁에 있을 때만 읽고, 무엇을 근거로
    읽었는지 amount_basis에 남깁니다. 모르면 비웁니다.
    """

    program_id: str
    name: str
    provider: str = Field(description="주관 기관")
    category: str = Field(default="기타", description="기업마당 지원분야")
    limit_krw: int | None = Field(default=None, description="한도 (원). 근거가 확실할 때만")
    amount_basis: str | None = Field(default=None, description="그 금액을 무엇으로 읽었는지")
    rate_pct: float | None = Field(default=None, description="금리 (%)")
    period_months: int | None = None
    regions: list[str] = Field(default_factory=list, description="지역 한정. 비면 전국")
    apply_period: str = Field(default="", description="공고에 적힌 접수기간 원문")
    apply_deadline: str | None = Field(default=None, description="마감일 (YYYY-MM-DD)")
    open_status: Literal["open", "rolling", "upcoming", "closed", "unknown"] = "unknown"
    # 사장님들이 가장 많이 헷갈리는 것 — 주는 돈인가 빌리는 돈인가.
    funding_type: str = Field(default="기타", description="융자·이차보전·보증·보조금·바우처·컨설팅")
    funding_note: str = Field(default="", description="그게 무슨 뜻인지 한 줄")
    summary: str = Field(default="", description="사업개요 발췌")
    eligibility: list[str] = Field(
        default_factory=list, description="공고가 밝힌 지원대상 (☞ 첫 줄)")
    required_docs: list[str] = Field(
        default_factory=list, description="공고가 밝힌 지원내용 (☞ 둘째 줄부터)")
    match_score: float = Field(default=0.0, ge=0, le=100)
    match_reasons: list[str] = Field(default_factory=list, description="왜 추천했는지 (XAI)")
    apply_url: str = ""
    source_url: str = Field(default="", description="기업마당 원문")


# ── Pick 4. 소비자보호 ────────────────────────────────────────────────────
class TermEntry(BaseModel):
    """어려운 금융 용어 하나를 쉬운 말로."""

    term: str
    easy: str = Field(description="한 줄로 풀어 쓴 뜻")
    detail: str = ""
    caution: str = Field(default="", description="이 용어에서 흔히 오해하는 지점")


class ProcedureStep(BaseModel):
    """분쟁·신청 절차의 한 단계."""

    step: int = Field(ge=1, le=4)
    title: str
    description: str
    documents: list[str] = Field(default_factory=list)
    duration: str = Field(default="", examples=["3~5영업일"])
    contact: str = ""


class GuardrailReport(BaseModel):
    """금소법 검사 결과.

    막았으면 무엇을 왜 막았는지 남깁니다. 심사에서 "정말 작동하는가"를
    물었을 때 이 기록이 답이 됩니다.
    """

    passed: bool
    violations: list[str] = Field(default_factory=list)
    rewritten: bool = False
    original_excerpt: str = ""
    disclaimers: list[str] = Field(default_factory=list)
    official_link: str = ""


class ProtectionPack(BaseModel):
    """Pick 4 산출물 묶음."""

    dispute_summary: str = ""
    applicable_rules: list[str] = Field(default_factory=list)
    terms: list[TermEntry] = Field(default_factory=list)
    procedure: list[ProcedureStep] = Field(default_factory=list)
    document_checklist: list[str] = Field(default_factory=list)


# ── 화면 조립 ─────────────────────────────────────────────────────────────
class BentoCardKind(str, Enum):
    SCORE = "score"
    FACTORS = "factors"
    MAP = "map"
    POLICY = "policy"
    TERMS = "terms"
    PROCEDURE = "procedure"
    NOTICE = "notice"
    GAPS = "gaps"


class BentoCard(BaseModel):
    """화면이 그릴 카드 하나.

    무엇을 그릴지 서버가 정합니다(Generative UI). 화면은 kind만 보고
    맞는 컴포넌트를 고르면 되고, 질문에 따라 카드 구성이 달라집니다.
    """

    model_config = ConfigDict(use_enum_values=True)

    id: str
    kind: BentoCardKind
    title: str
    subtitle: str = ""
    span: Literal[1, 2, 3, 4, 5, 6] = Field(
        default=2, description="Bento 격자(6칸)에서 차지할 칸")
    accent: Literal["yellow", "brown", "green", "red", "neutral"] = "neutral"
    payload: dict = Field(default_factory=dict)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    region: str | None = Field(default=None, examples=["서울 마포구 연남동"])
    industry: str | None = Field(default=None, examples=["한식음식점"])
    session_id: str | None = None


class ChatResponse(BaseModel):
    """모든 대화 응답의 최종 형태.

    character_motion은 반드시 채워집니다(기본값 있음). 화면이 이 값을
    못 받으면 3D 마스코트가 멈춥니다.
    """

    model_config = ConfigDict(use_enum_values=True)

    session_id: str
    intent: Intent
    answer: str
    character_motion: CharacterMotion = CharacterMotion.EXPLAINING
    cards: list[BentoCard] = Field(default_factory=list)

    location: LocationScore | None = None
    pins: list[MapPin] = Field(default_factory=list)
    policies: list[PolicyMatch] = Field(default_factory=list)
    protection: ProtectionPack | None = None
    guardrail: GuardrailReport | None = None

    # 서버가 질문을 어떻게 알아들었는지. 화면이 이것을 보여 주면 사용자가
    # 잘못 알아들었을 때 바로 알 수 있습니다 — 조용히 틀린 답을 주는 것이
    # 가장 나쁩니다.
    understood: dict = Field(default_factory=dict, description="지역·업종·갈래")
    # 다음에 물을 만한 것. 상담은 한 번의 답으로 끝나지 않습니다.
    suggestions: list[str] = Field(default_factory=list)

    agent_trace: list[AgentKind] = Field(default_factory=list, description="거쳐 간 에이전트")
    elapsed_ms: int = 0
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
