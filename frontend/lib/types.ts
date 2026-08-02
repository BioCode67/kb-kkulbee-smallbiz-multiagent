/**
 * 백엔드 응답의 타입 — backend/app/models/schemas.py 와 짝입니다.
 *
 * 두 곳에 같은 모양을 적는 것은 위험합니다. 한쪽만 고치면 런타임에서야
 * 깨집니다. 그래서 필드 이름을 파이썬 쪽과 글자 그대로 맞추고, 바꿀 일이
 * 생기면 두 파일을 함께 여는 것을 규칙으로 삼습니다.
 */

export type CharacterMotion = 'fly_happy' | 'thinking' | 'explaining' | 'consoling';

export type Intent = 'location' | 'policy' | 'protection' | 'general';

export type AgentKind =
  | 'router' | 'location' | 'policy' | 'protection' | 'guardrail';

export interface FactorContribution {
  key: string;
  label: string;
  value: number;
  unit: string;
  /** 기준점에서 이 요인이 올리고 내린 몫 (%p). 음수면 깎은 것 */
  contribution: number;
  direction: 'up' | 'down' | 'flat';
  reason: string;
}

export interface LocationScore {
  region_name: string;
  industry: string;
  latitude: number | null;
  longitude: number | null;
  base_score: number;
  total_score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  factors: FactorContribution[];
  /** 지도에서 실제 점포를 불러올 때 씁니다 */
  dong_code: string | null;
  industry_code: string | null;
  same_industry_count: number | null;
  /** 서울 생활인구(있으면). 점수에는 안 들어가고 표기만 */
  living_pop: { avg: number; peak_hour: number; peak: number;
                curve: number[]; date: string; source: string } | null;
  /** 이 동네에 덜 나온 업종 / 이미 넘치는 업종 */
  gaps: IndustryGap[];
  crowded: IndustryGap[];
  peer_median: number | null;
  /** fallback이면 내장 표본으로 계산한 값입니다. 화면에 밝혀야 합니다 */
  data_source: 'public_api' | 'fallback';
  note: string;
}

export interface IndustryGap {
  code: string;
  name: string;
  /** 이 동네에 있는 수 */
  here: number;
  /** 비슷한 규모 동네의 평균 */
  expected: number;
  ratio: number;
}

export interface MapPin {
  name: string;
  latitude: number;
  longitude: number;
  score: number;
  grade: string;
  is_target: boolean;
}

/** 접수 상태. 날짜가 안 적힌 공고가 900건 중 385건이라 rolling·unknown이 필요합니다 */
export type OpenStatus = 'open' | 'rolling' | 'upcoming' | 'closed' | 'unknown';

export interface PolicyMatch {
  program_id: string;
  name: string;
  provider: string;
  /** 기업마당 지원분야 — 금융·경영·기술·수출·내수·인력·창업·기타 */
  category: string;
  /** 한도. '한도·최대·이내' 같은 말이 곁에 있을 때만 채워집니다 */
  limit_krw: number | null;
  /** 그 금액을 무엇으로 읽었는지. null이면 금액을 못 읽은 것입니다 */
  amount_basis: string | null;
  rate_pct: number | null;
  period_months: number | null;
  /** 지역 한정. 비어 있으면 전국 */
  regions: string[];
  /** 공고에 적힌 접수기간 원문 — '예산 소진시까지' 같은 것이 그대로 옵니다 */
  apply_period: string;
  apply_deadline: string | null;
  open_status: OpenStatus;
  /** 주는 돈인가 빌리는 돈인가 — 융자·이차보전·보증·보조금·바우처·컨설팅 */
  funding_type: string;
  funding_note: string;
  summary: string;
  eligibility: string[];
  required_docs: string[];
  match_score: number;
  /** 왜 추천했는지 — 화면에 그대로 보여 줍니다 */
  match_reasons: string[];
  apply_url: string;
  /** 기업마당 원문. 사장님이 직접 확인하실 수 있어야 합니다 */
  source_url: string;
}

export interface TermEntry {
  term: string;
  easy: string;
  detail: string;
  caution: string;
}

export interface ProcedureStep {
  step: number;
  title: string;
  description: string;
  documents: string[];
  duration: string;
  contact: string;
}

export interface GuardrailReport {
  passed: boolean;
  violations: string[];
  rewritten: boolean;
  original_excerpt: string;
  disclaimers: string[];
  official_link: string;
}

export interface ProtectionPack {
  dispute_summary: string;
  applicable_rules: string[];
  terms: TermEntry[];
  procedure: ProcedureStep[];
  document_checklist: string[];
}

export type BentoCardKind =
  | 'score' | 'factors' | 'map' | 'policy' | 'terms' | 'procedure'
  | 'notice' | 'gaps' | 'rates' | 'similar' | 'compare';

export interface BentoCard {
  id: string;
  kind: BentoCardKind;
  title: string;
  subtitle: string;
  /** Bento 격자(6칸)에서 차지할 칸 수 */
  span: 1 | 2 | 3 | 4 | 5 | 6;
  accent: 'yellow' | 'brown' | 'green' | 'red' | 'neutral';
  payload: Record<string, unknown>;
}

export interface ChatRequest {
  message: string;
  region?: string | null;
  industry?: string | null;
  session_id?: string | null;
}

export interface ChatResponse {
  session_id: string;
  intent: Intent;
  answer: string;
  character_motion: CharacterMotion;
  cards: BentoCard[];
  location: LocationScore | null;
  pins: MapPin[];
  policies: PolicyMatch[];
  protection: ProtectionPack | null;
  guardrail: GuardrailReport | null;
  /** 서버가 질문을 어떻게 알아들었는지 — 지역·업종·갈래 */
  understood: { region?: string | null; industry?: string | null; intents?: Intent[] };
  /** 다음에 물을 만한 것. 누르면 그대로 질문됩니다 */
  suggestions: string[];
  agent_trace: AgentKind[];
  elapsed_ms: number;
  generated_at: string;
}
