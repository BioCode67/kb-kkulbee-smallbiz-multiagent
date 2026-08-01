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

const SPAN: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
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
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
    case 'map': return <LocationMap pins={p.pins as never} />;
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
          <p className="mt-2 text-[11px] text-white/40">
            같은 업종 상권 중앙값 {s.peer_median}점
            {s.total_score >= s.peer_median ? ' · 평균 이상' : ' · 평균 이하'}
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
    </div>
  );
}

/* ── 지원사업 ──────────────────────────────────────────────────────────── */
function PolicyCard({ items }: { items: PolicyMatch[] }) {
  const won = (v: number | null) =>
    v == null ? '한도 별도'
    : v >= 100_000_000 ? `${(v / 100_000_000).toFixed(v % 100_000_000 ? 1 : 0)}억원`
    : `${Math.round(v / 10_000_000)}천만원`;

  return (
    <ul className="space-y-3">
      {items.map((m) => (
        <li key={m.program_id}
            className="rounded-xl bg-black/20 p-3.5 ring-1 ring-white/[.07]">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-white">{m.name}</p>
              <p className="mt-0.5 text-[11px] text-white/[.45]">
                {m.provider} · {m.category}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-kb-yellow/[.15] px-2 py-0.5
                             text-[11px] font-bold text-kb-yellow
                             [font-variant-numeric:tabular-nums]">
              {m.match_score.toFixed(0)}점
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/[.65]">
            <span>한도 <b className="text-white/90">{won(m.limit_krw)}</b></span>
            {m.rate_pct != null && (
              <span>금리 <b className="text-white/90">{m.rate_pct}%</b></span>
            )}
            {m.period_months && <span>최장 {m.period_months / 12}년</span>}
          </div>

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

          {m.apply_url && (
            <a href={m.apply_url} target="_blank" rel="noreferrer"
               className="mt-2.5 inline-block text-[11px] font-semibold text-kb-yellow
                          underline-offset-2 hover:underline">
              신청 안내 보기 →
            </a>
          )}
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
