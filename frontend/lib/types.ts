/**
 * 백엔드 응답의 타입 — backend/app/models/schemas.py 와 짝입니다.
 *
 * 두 곳에 같은 모양을 적는 것은 위험합니다. 한쪽만 고치면 런타임에서야
 * 깨집니다. 그래서 필드 이름을 파이썬 쪽과 글자 그대로 맞추고, 바꿀 일이
 * 생기면 두 파일을 함께 여는 것을 규칙으로 삼습니다.
 */

export type CharacterMotion = 'fly_happy' | 'thinking' | 'explaining';

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
  peer_median: number | null;
  /** fallback이면 내장 표본으로 계산한 값입니다. 화면에 밝혀야 합니다 */
  data_source: 'public_api' | 'fallback';
  note: string;
}

export interface MapPin {
  name: string;
  latitude: number;
  longitude: number;
  score: number;
  grade: string;
  is_target: boolean;
}

export interface PolicyMatch {
  program_id: string;
  name: string;
  provider: string;
  category: '정책자금' | '보증' | 'KB상품' | '바우처' | '컨설팅';
  limit_krw: number | null;
  rate_pct: number | null;
  period_months: number | null;
  eligibility: string[];
  required_docs: string[];
  match_score: number;
  /** 왜 추천했는지 — 화면에 그대로 보여 줍니다 */
  match_reasons: string[];
  apply_url: string;
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
  | 'score' | 'factors' | 'map' | 'policy' | 'terms' | 'procedure' | 'notice';

export interface BentoCard {
  id: string;
  kind: BentoCardKind;
  title: string;
  subtitle: string;
  /** Bento 격자에서 차지할 칸 수 */
  span: 1 | 2 | 3;
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
  agent_trace: AgentKind[];
  elapsed_ms: number;
  generated_at: string;
}
