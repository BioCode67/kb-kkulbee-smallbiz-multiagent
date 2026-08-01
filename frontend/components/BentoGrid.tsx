'use client';

/**
 * Bento Grid — 서버가 정한 카드를 그립니다.
 *
 * 무엇을 보여 줄지는 백엔드가 정합니다(Generative UI). 여기서는 kind만 보고
 * 맞는 컴포넌트를 고릅니다. 화면에 "입지 질문이면 점수 카드" 같은 분기를 두면
 * 카드를 하나 늘릴 때마다 화면을 고쳐야 하고, 곧 백엔드와 어긋납니다.
 */

import { motion } from 'framer-motion';
import type {
  BentoCard, FactorContribution, GuardrailReport, LocationScore,
  PolicyMatch, ProcedureStep, TermEntry,
} from '@/lib/types';
import LocationMap from './LocationMap';

// 서버가 정한 폭(1~6)을 격자 칸으로 옮깁니다. 무엇을 얼마나 넓게 보여
// 줄지는 서버가 압니다 — 지원사업이 네 건이면 넓게, 한 건이면 좁게.
const SPAN: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  5: 'md:col-span-5',
  6: 'md:col-span-6',
};

const ACCENT: Record<string, string> = {
  yellow: 'ring-kb-yellow/[.35] bg-kb-yellow/[.07]',
  brown: 'ring-white/10 bg-white/[.04]',
  green: 'ring-emerald-400/25 bg-emerald-400/[.06]',
  red: 'ring-rose-400/30 bg-rose-400/[.07]',
  neutral: 'ring-white/10 bg-white/[.04]',
};

export default function BentoGrid({ cards }: { cards: BentoCard[] }) {
  if (!cards.length) return null;
  // 6칸 격자를 씁니다. 3칸이었을 때는 폭 2짜리 카드(지도·지원사업)가 늘
  // 화면의 3분의 2만 차지하고 오른쪽 3분의 1이 통째로 비었습니다. 6칸이면
  // 2·3·4·6 어느 폭이든 만들 수 있어 남는 자리가 안 생깁니다.
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-6">
      {cards.map((c, i) => (
        <motion.section
          key={c.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.42, ease: [0.22, 0.9, 0.3, 1] }}
          className={`${SPAN[c.span]} rounded-2xl p-5 shadow-glass ring-1
                      backdrop-blur-xl ${ACCENT[c.accent] ?? ACCENT.neutral}`}
        >
          <header className="mb-4">
            <h3 className="text-[15px] font-bold tracking-tight text-white">{c.title}</h3>
            {c.subtitle && (
              <p className="mt-0.5 text-[12px] leading-relaxed text-white/[.45]">
                {c.subtitle}
              </p>
            )}
          </header>
          <CardBody card={c} />
        </motion.section>
      ))}
    </div>
  );
}

function CardBody({ card }: { card: BentoCard }) {
  const p = card.payload as Record<string, never>;
  switch (card.kind) {
    case 'score': return <ScoreCard s={p as unknown as LocationScore} />;
    case 'factors': return <FactorsCard base={Number(p.base ?? 50)}
                                        factors={p.factors as unknown as FactorContribution[]} />;
    case 'map': return <LocationMap
                          pins={p.pins as never}
                          dongCode={p.dong_code as unknown as string | null}
                          industryCode={p.industry_code as unknown as string | null}
                          industry={p.industry as unknown as string | null}
                          sameIndustryCount={p.same_industry_count as unknown as number | null} />;
    case 'policy': return <PolicyCard items={p.items as unknown as PolicyMatch[]} />;
    case 'terms': return <TermsCard terms={p.terms as unknown as TermEntry[]} />;
    case 'procedure': return <ProcedureCard steps={p.steps as unknown as ProcedureStep[]}
                                            rules={p.rules as unknown as string[]}
                                            checklist={p.checklist as unknown as string[]} />;
    case 'notice': return <NoticeCard r={p as unknown as GuardrailReport} />;
    default: return null;
  }
}

/* ── 상권 점수 ─────────────────────────────────────────────────────────── */
function ScoreCard({ s }: { s: LocationScore }) {
  const gradeColor =
    s.grade === 'S' || s.grade === 'A' ? 'text-kb-yellow'
    : s.grade === 'B' ? 'text-white' : 'text-white/60';

  return (
    <div>
      <div className="flex items-end gap-2">
        <span className="text-[44px] font-extrabold leading-none tracking-tighter text-white
                         [font-variant-numeric:tabular-nums]">
          {s.total_score.toFixed(1)}
        </span>
        <span className="pb-1.5 text-sm text-white/40">/ 100</span>
        <span className={`ml-auto pb-1 text-2xl font-black ${gradeColor}`}>{s.grade}</span>
      </div>

      {s.peer_median != null && (
        <div className="mt-4">
          <div className="relative h-1.5 rounded-full bg-white/10">
            <div className="absolute inset-y-0 left-0 rounded-full bg-kb-yellow"
                 style={{ width: `${Math.min(100, s.total_score)}%` }} />
            <div className="absolute -top-1 h-3.5 w-0.5 bg-white/50"
                 style={{ left: `${Math.min(100, s.peer_median)}%` }} />
          </div>
          {/* 50점은 전국 행정동의 한가운데입니다. 요인마다 백분위로 재고
              중간값을 0점 기여로 맞춰 두었으므로, 중간 상권이 정확히 50점을
              받습니다. 임의로 정한 기준선이 아닙니다. */}
          <p className="mt-2 text-[11px] text-white/40">
            전국 행정동 3,450곳의 한가운데가 {s.peer_median}점
            {s.total_score >= s.peer_median ? ' · 중간 이상' : ' · 중간 이하'}
          </p>
        </div>
      )}

      {/* 표본으로 낸 점수를 실측처럼 보이게 두지 않습니다 */}
      <p className={`mt-4 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
        s.data_source === 'public_api'
          ? 'bg-emerald-400/10 text-emerald-200/80'
          : 'bg-amber-400/10 text-amber-200/75'}`}>
        {s.note}
      </p>
    </div>
  );
}

/* ── 요인 기여 (SHAP 방식) ─────────────────────────────────────────────── */
function FactorsCard({ base, factors }: { base: number; factors: FactorContribution[] }) {
  const max = Math.max(...factors.map((f) => Math.abs(f.contribution)), 1);
  const total = base + factors.reduce((a, f) => a + f.contribution, 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[11px] text-white/40">
        <span>기준 {base}점</span>
        <span className="flex-1 border-t border-dashed border-white/[.15]" />
        <span className="font-semibold text-white/70">
          최종 {total.toFixed(1)}점
        </span>
      </div>

      <ul className="space-y-2.5">
        {factors.map((f) => {
          const w = (Math.abs(f.contribution) / max) * 46;
          const up = f.contribution > 0;
          return (
            <li key={f.key}>
              <div className="flex items-baseline gap-2 text-[12px]">
                <span className="w-[86px] shrink-0 text-white/75">{f.label}</span>

                {/* 0을 가운데 두고 양옆으로 뻗는 막대 */}
                <div className="relative h-4 flex-1">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                  <div
                    className={`absolute inset-y-[3px] rounded-sm ${
                      up ? 'bg-kb-yellow' : 'bg-rose-400/80'}`}
                    style={up
                      ? { left: '50%', width: `${w}%` }
                      : { right: '50%', width: `${w}%` }}
                  />
                </div>

                <span className={`w-[52px] shrink-0 text-right font-semibold
                                  [font-variant-numeric:tabular-nums]
                                  ${up ? 'text-kb-yellow' : 'text-rose-300'}`}>
                  {f.contribution > 0 ? '+' : ''}{f.contribution.toFixed(1)}
                </span>
              </div>
              <p className="ml-[94px] mt-0.5 text-[11px] leading-snug text-white/[.35]">
                {f.value}{f.unit} · {f.reason}
              </p>
            </li>
          );
        })}
      </ul>

      {/* 재지 못한 것을 같은 자리에 적습니다.
          유동인구·매출을 점수에 넣지 않았다는 사실을 다른 화면에서 찾아봐야
          알 수 있게 두면 감춘 것이 됩니다. 예전에는 이 값들을 동네 이름
          해시로 만들어 실측처럼 내보내고 있었습니다. */}
      <div className="mt-3.5 rounded-lg bg-white/[.03] px-3 py-2.5 ring-1 ring-white/[.06]">
        <p className="text-[10.5px] font-semibold text-white/50">
          점수에 넣지 않은 것
        </p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-white/[.33]">
          유동인구 · 매출 · 폐업률 · 임대료 — 상가정보 자료에 없습니다.
          추정해 채우지 않았습니다.
        </p>
      </div>
    </div>
  );
}

/* ── 지원사업 ──────────────────────────────────────────────────────────── */

/** 접수 상태를 한 눈에. 마감이 가까우면 색이 달라집니다. */
function StatusChip({ m }: { m: PolicyMatch }) {
  const days = m.apply_deadline
    ? Math.ceil(
        (new Date(m.apply_deadline + 'T23:59:59').getTime() - Date.now()) / 86_400_000,
      )
    : null;

  const [text, tone] =
    m.open_status === 'open' && days != null
      ? days <= 7
        ? [`마감 ${days}일 전`, 'bg-red-500/[.16] text-red-300 ring-red-400/25']
        : [`${m.apply_deadline}까지`, 'bg-emerald-500/[.14] text-emerald-300 ring-emerald-400/20']
      : m.open_status === 'rolling'
        ? [m.apply_period || '상시 접수', 'bg-sky-500/[.13] text-sky-300 ring-sky-400/20']
        : m.open_status === 'upcoming'
          ? [`${m.apply_period} 예정`, 'bg-amber-500/[.13] text-amber-300 ring-amber-400/20']
          : [m.apply_period || '기간 미기재', 'bg-white/[.06] text-white/50 ring-white/10'];

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ${tone}`}>
      {text}
    </span>
  );
}

function PolicyCard({ items }: { items: PolicyMatch[] }) {
  const won = (v: number) =>
    v >= 100_000_000
      ? `${(v / 100_000_000).toFixed(v % 100_000_000 ? 1 : 0)}억원`
      : v >= 10_000_000
        ? `${Math.round(v / 10_000_000)}천만원`
        : `${Math.round(v / 10_000).toLocaleString()}만원`;

  return (
    <ul className="space-y-3">
      {items.map((m) => (
        <li key={m.program_id}
            className="rounded-xl bg-black/20 p-3.5 ring-1 ring-white/[.07]
                       transition hover:ring-white/[.14]">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold leading-snug text-white">{m.name}</p>
              <p className="mt-1 text-[11px] text-white/[.45]">
                {m.provider} · {m.category}
                {m.regions.length > 0 ? ` · ${m.regions.join('·')}` : ' · 전국'}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-kb-yellow/[.15] px-2 py-0.5
                             text-[11px] font-bold text-kb-yellow
                             [font-variant-numeric:tabular-nums]">
              {m.match_score.toFixed(0)}점
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5
                          text-[11.5px] text-white/[.65]">
            <StatusChip m={m} />
            {/* 금액은 근거가 있을 때만 씁니다. 예전에는 본문에서 찾은 가장 큰
                금액을 '한도'라고 적어 총사업비가 한도로 둔갑했습니다. */}
            {m.limit_krw != null && (
              <span>
                {m.amount_basis ?? '금액'} <b className="text-white/90">{won(m.limit_krw)}</b>
              </span>
            )}
            {m.rate_pct != null && (
              <span>금리 <b className="text-white/90">{m.rate_pct}%</b></span>
            )}
          </div>

          {/* 공고가 밝힌 지원대상·지원내용. 예전에는 이 칸이 늘 비어 있었습니다
              — 900건 전부에 ☞로 적혀 있는데 뽑아 쓰지 않았습니다. */}
          {(m.eligibility.length > 0 || m.required_docs.length > 0) && (
            <dl className="mt-2.5 space-y-1.5 rounded-lg bg-black/25 px-3 py-2.5">
              {m.eligibility.length > 0 && (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-[10.5px] font-bold text-white/40">대상</dt>
                  <dd className="text-[11.5px] leading-snug text-white/[.72]">
                    {m.eligibility[0]}
                  </dd>
                </div>
              )}
              {m.required_docs.slice(0, 2).map((d, i) => (
                <div key={i} className="flex gap-2">
                  <dt className="shrink-0 text-[10.5px] font-bold text-white/40">
                    {i === 0 ? '내용' : '\u00a0\u00a0\u00a0\u00a0'}
                  </dt>
                  <dd className="text-[11.5px] leading-snug text-white/[.72]">{d}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* 추천 이유 — 왜 이걸 골랐는지 밝히지 않으면 근거가 없습니다 */}
          {m.match_reasons.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {m.match_reasons.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-white/50">
                  <span className="text-kb-yellow/70">·</span>{r}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2.5 flex items-center gap-3">
            {m.apply_url && (
              <a href={m.apply_url} target="_blank" rel="noreferrer"
                 className="text-[11px] font-semibold text-kb-yellow
                            underline-offset-2 hover:underline">
                신청 안내 보기 →
              </a>
            )}
            {/* 원문 링크는 반드시 둡니다. 우리가 요약한 것을 사장님이
                직접 대조하실 수 있어야 합니다. */}
            {m.source_url && m.source_url !== m.apply_url && (
              <a href={m.source_url} target="_blank" rel="noreferrer"
                 className="text-[11px] text-white/40 underline-offset-2 hover:underline">
                기업마당 공고 원문
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── 쉬운 용어 ─────────────────────────────────────────────────────────── */
function TermsCard({ terms }: { terms: TermEntry[] }) {
  return (
    <ul className="space-y-3">
      {terms.map((t) => (
        <li key={t.term}>
          <p className="text-[12.5px] font-semibold text-kb-yellow">{t.term}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-white/75">{t.easy}</p>
          {t.caution && (
            <p className="mt-1 text-[11px] leading-snug text-rose-200/[.65]">
              주의 — {t.caution}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── 분쟁 절차 ─────────────────────────────────────────────────────────── */
function ProcedureCard({ steps, rules, checklist }:
  { steps: ProcedureStep[]; rules: string[]; checklist: string[] }) {
  return (
    <div>
      <ol className="relative space-y-4 border-l border-white/[.12] pl-5">
        {steps.map((s) => (
          <li key={s.step} className="relative">
            <span className="absolute -left-[26px] grid h-5 w-5 place-items-center
                             rounded-full bg-kb-yellow text-[11px] font-bold text-kb-ink">
              {s.step}
            </span>
            <p className="text-[13px] font-semibold text-white">{s.title}</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/[.55]">
              {s.description}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-white/[.38]">
              {s.duration && <span>소요 {s.duration}</span>}
              {s.contact && <span>{s.contact}</span>}
            </div>
          </li>
        ))}
      </ol>

      {rules?.length > 0 && (
        <div className="mt-4 rounded-lg bg-black/20 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-white/[.55]">근거 규정</p>
          <ul className="mt-1 space-y-0.5">
            {rules.map((r) => (
              <li key={r} className="text-[11px] text-white/[.45]">· {r}</li>
            ))}
          </ul>
        </div>
      )}

      {checklist?.length > 0 && (
        <div className="mt-2.5">
          <p className="mb-1.5 text-[11px] font-semibold text-white/[.55]">준비 서류</p>
          <div className="flex flex-wrap gap-1.5">
            {checklist.map((d) => (
              <span key={d} className="rounded-md bg-white/[.07] px-2 py-1
                                       text-[11px] text-white/[.65]">{d}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 가드레일 알림 ─────────────────────────────────────────────────────── */
function NoticeCard({ r }: { r: GuardrailReport }) {
  return (
    <div>
      <p className="text-[12px] leading-relaxed text-white/70">
        금융소비자보호법에 따라 단정적인 표현을 안전한 표현으로 바꿨습니다.
      </p>
      <ul className="mt-2.5 space-y-1">
        {r.violations.map((v, i) => (
          <li key={i} className="flex gap-1.5 text-[11.5px] text-rose-200/75">
            <span>·</span>{v}
          </li>
        ))}
      </ul>
      {r.original_excerpt && (
        <p className="mt-2.5 rounded-md bg-black/25 px-2.5 py-2 text-[11px]
                      leading-snug text-white/[.35] line-through">
          {r.original_excerpt}
        </p>
      )}
    </div>
  );
}
