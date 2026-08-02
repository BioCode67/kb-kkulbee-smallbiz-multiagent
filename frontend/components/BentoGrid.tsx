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
  BentoCard, FactorContribution, GuardrailReport, IndustryGap, LocationScore,
  PolicyMatch, ProcedureStep, TermEntry,
} from '@/lib/types';
import { useEffect, useState } from 'react';
import DraftModal from './DraftModal';
import { isSaved, onSavedChange, toggleSaved } from '@/lib/saved';
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

const BAR: Record<string, string> = {
  yellow: 'bg-gradient-to-r from-kb-yellow to-kb-yellow/20',
  brown: 'bg-gradient-to-r from-white/25 to-transparent',
  green: 'bg-gradient-to-r from-emerald-400 to-emerald-400/15',
  red: 'bg-gradient-to-r from-rose-400 to-rose-400/15',
  neutral: 'bg-gradient-to-r from-white/20 to-transparent',
};

const ACCENT: Record<string, string> = {
  yellow: 'ring-kb-yellow/[.35] bg-kb-yellow/[.07]',
  brown: 'ring-kb-ink/[.12] bg-white/70',
  green: 'ring-emerald-400/25 bg-emerald-400/[.06]',
  red: 'ring-rose-400/30 bg-rose-400/[.07]',
  neutral: 'ring-kb-ink/[.12] bg-white/70',
};

// 처음부터 펼칠 것과 접어 둘 것 — "정보가 너무 많아 뭘 봐야 할지 모르겠다"는
// 피드백의 답입니다. 결론(점수·매칭·절차)은 펼치고, 근거와 곁가지(요인 분해·
// 지도·기회 업종·닮은 동네·금리·용어)는 제목만 보이게 접습니다. 접힌 카드도
// 제목·부제가 있어 무엇이 들었는지 알고 누를 수 있습니다.
const OPEN_BY_DEFAULT = new Set(['score', 'policy', 'procedure', 'notice', 'compare']);

export default function BentoGrid({ cards }: { cards: BentoCard[] }) {
  if (!cards.length) return null;
  // 6칸 격자를 씁니다. 3칸이었을 때는 폭 2짜리 카드(지도·지원사업)가 늘
  // 화면의 3분의 2만 차지하고 오른쪽 3분의 1이 통째로 비었습니다. 6칸이면
  // 2·3·4·6 어느 폭이든 만들 수 있어 남는 자리가 안 생깁니다.
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-6">
      {cards.map((c, i) => (
        <Card key={c.id} c={c} i={i} />
      ))}
    </div>
  );
}

function Card({ c, i }: { c: BentoCard; i: number }) {
  const [open, setOpen] = useState(OPEN_BY_DEFAULT.has(c.kind));
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06, duration: 0.42, ease: [0.22, 0.9, 0.3, 1] }}
      className={`${SPAN[c.span]} relative overflow-hidden rounded-2xl
                  shadow-glass ring-1 backdrop-blur-xl
                  ${open ? 'p-5' : 'p-0'}
                  ${c.kind === 'map' ? 'print:hidden ' : ''}${ACCENT[c.accent] ?? ACCENT.neutral}`}
    >
      {/* 카드 머리의 가는 색띠. 카드가 여럿일 때 종류를 색으로 먼저
          구분하게 해 줍니다 — 제목을 읽기 전에 눈이 갈래를 잡습니다. */}
      <span aria-hidden className={`absolute inset-x-0 top-0 h-[3px]
                                    ${BAR[c.accent] ?? BAR.neutral}`} />
      <header
        role="button" tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((v) => !v); }}
        className={`flex cursor-pointer items-start justify-between gap-3
                    ${open ? 'mb-4' : 'p-5'}`}
      >
        <div>
          <h3 className="font-display text-[18px] text-kb-ink">{c.title}</h3>
          {c.subtitle && (
            <p className="mt-0.5 text-[14px] leading-relaxed text-kb-ink/78">
              {c.subtitle}
            </p>
          )}
        </div>
        <span aria-hidden
              className={`mt-0.5 shrink-0 text-[15px] text-kb-ink/50 transition-transform
                          ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </header>
      {/* 접혀 있어도 DOM에는 둡니다(지도 제외) — 화면에서는 숨고 인쇄에서는
          나옵니다. 종이 리포트는 근거까지 실려야 창구에서 통합니다. */}
      {(open || c.kind !== 'map') && (
        <div className={open ? '' : 'hidden print:block px-5 pb-5'}>
          <CardBody card={c} />
        </div>
      )}
    </motion.section>
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
                                            checklist={p.checklist as unknown as string[]}
                                            question={p.question as unknown as string} />;
    case 'notice': return <NoticeCard r={p as unknown as GuardrailReport} />;
    case 'gaps': return <GapsCard gaps={p.gaps as unknown as IndustryGap[]}
                                  crowded={p.crowded as unknown as IndustryGap[]}
                                  region={p.region as unknown as string} />;
    case 'rates': return <RatesCard d={p as unknown as BankRates} />;
    case 'compare': return <CompareCard a={p.a as never} b={p.b as never} />;
    case 'similar': return <SimilarCard items={p.items as unknown as SimilarDong[]}
                                        industry={p.industry as unknown as string} />;
    default: return null;
  }
}

/* ── 상권 점수 ─────────────────────────────────────────────────────────── */

/** 등급별 색. 노랑이 진할수록 좋은 자리입니다. */
const GRADE_TONE: Record<string, { ring: string; text: string; label: string }> = {
  S: { ring: '#FFBC00', text: 'text-kb-amber', label: '아주 좋은 자리' },
  A: { ring: '#FFD35C', text: 'text-kb-amber', label: '좋은 자리' },
  B: { ring: '#E8DCC6', text: 'text-kb-ink', label: '무난한 자리' },
  C: { ring: '#B9A88F', text: 'text-kb-ink/80', label: '따져 볼 자리' },
  D: { ring: '#8A7866', text: 'text-kb-ink/82', label: '신중할 자리' },
};

function ScoreCard({ s }: { s: LocationScore }) {
  const g = GRADE_TONE[s.grade] ?? GRADE_TONE.C;

  // 원형 게이지. 가로 막대는 "몇 점"만 말하지만, 원은 0과 100 사이 어디쯤인지를
  // 한눈에 보여 줍니다. 눈금(50점)을 함께 그어 두면 '중간보다 위인가'가
  // 숫자를 읽기 전에 들어옵니다.
  const R = 52;
  const C = 2 * Math.PI * R;
  const filled = (Math.min(100, Math.max(0, s.total_score)) / 100) * C;

  return (
    <div>
      {/* 게이지를 위에, 등급을 아래에 둡니다. 가로로 나란히 놓았더니 카드가
          좁아(6칸 중 2칸) 오른쪽 글이 세 줄로 끼었습니다. 세로가 낫습니다. */}
      <div className="flex flex-col items-center">
        <div className="relative">
          <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-90">
            <circle cx="66" cy="66" r={R} fill="none"
                    stroke="rgba(255,255,255,.09)" strokeWidth="11" />
            <circle cx="66" cy="66" r={R} fill="none"
                    stroke={g.ring} strokeWidth="11" strokeLinecap="round"
                    strokeDasharray={`${filled} ${C - filled}`}
                    style={{ transition: 'stroke-dasharray .9s cubic-bezier(.22,.9,.3,1)' }} />
            {/* 전국 한가운데(50점) 눈금. 이게 있어야 '중간보다 위인가'가
                숫자를 읽기 전에 들어옵니다. */}
            <line x1="66" y1="6" x2="66" y2="19"
                  stroke="rgba(255,255,255,.55)" strokeWidth="2"
                  transform="rotate(180 66 66)" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[31px] font-extrabold leading-none tracking-tight
                             text-kb-ink [font-variant-numeric:tabular-nums]">
              <CountUp value={s.total_score} />
            </span>
            <span className="mt-1 text-[12.5px] text-kb-ink/68">/ 100점</span>
          </div>
        </div>

        <div className="mt-2.5 flex items-baseline gap-2">
          <span className={`text-[26px] font-black leading-none ${g.text}`}>{s.grade}</span>
          <span className="text-[15px] font-semibold text-kb-ink/85">{g.label}</span>
        </div>

        {s.peer_median != null && (
          <p className="mt-1.5 text-center text-[13.5px] leading-snug text-kb-ink/78">
            전국 3,450개 동네 중 딱 중간이 {s.peer_median}점
            <span className={s.total_score >= s.peer_median
              ? ' text-emerald-700' : ' text-amber-800'}>
              {' · '}{s.total_score >= s.peer_median ? '중간 이상' : '중간 이하'}
            </span>
          </p>
        )}
      </div>

      {/* 서울이면 실측 유동인구가 붙습니다 — "없다"던 칸이 채워지는 자리.
          점수에는 안 넣습니다(서울만 있는 값이라 전국 비교가 깨집니다). */}
      {s.living_pop && (
        <div className="mt-4 rounded-xl bg-kb-ink/[.04] px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] text-kb-ink/82">이 동네에 실제로 있는 사람</span>
            <span className="text-[17px] font-bold text-kb-ink
                             [font-variant-numeric:tabular-nums]">
              일평균 {s.living_pop.avg.toLocaleString()}명
            </span>
          </div>
          {/* 하루 곡선 — 이 동네가 '언제 사는' 동네인지. 카페엔 오전이,
              술집엔 저녁이 중요합니다. */}
          <div className="mt-2 flex h-[34px] items-end gap-[2px]">
            {s.living_pop.curve.map((v, h) => (
              <span key={h}
                title={`${h}시`}
                className={`flex-1 rounded-t-[2px] ${
                  h === s.living_pop!.peak_hour ? 'bg-kb-yellow' : 'bg-kb-ink/20'}`}
                style={{ height: `${Math.max(8, v * 100)}%` }} />
            ))}
          </div>
          <p className="mt-1.5 flex justify-between text-[12px] text-kb-ink/62">
            <span>0시</span>
            <span className="font-semibold text-kb-amber">
              피크 {s.living_pop.peak_hour}시 · {s.living_pop.peak.toLocaleString()}명
            </span>
            <span>23시</span>
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-kb-ink/55">
            {s.living_pop.source} · 점수에는 넣지 않았습니다
          </p>
        </div>
      )}

      {s.industry === '업종 미지정' && (
        <IndustryChips region={s.region_name} />
      )}

      {s.same_industry_count != null && (
        <div className="mt-4 flex items-center justify-between rounded-xl
                        bg-kb-ink/[.05] px-3.5 py-3">
          <span className="text-[14px] text-kb-ink/82">이 동네 {s.industry}</span>
          <span className="text-[18px] font-bold text-kb-ink
                           [font-variant-numeric:tabular-nums]">
            {s.same_industry_count.toLocaleString()}곳
          </span>
        </div>
      )}

      {/* 표본으로 낸 점수를 실측처럼 보이게 두지 않습니다 */}
      <p className={`mt-3 rounded-lg px-2.5 py-2 text-[13px] leading-relaxed ${
        s.data_source === 'public_api'
          ? 'bg-emerald-400/10 text-emerald-700'
          : 'bg-amber-400/10 text-amber-800'}`}>
        {s.note}
      </p>
    </div>
  );
}

/** 업종을 안 말했을 때 — 고르면 그 업종 기준으로 다시 잽니다.
    경쟁·집적 요인은 업종이 있어야 계산되므로, 이 칩이 곧 "더 정확한
    진단으로 가는 문"입니다. */
function IndustryChips({ region }: { region: string }) {
  const [items, setItems] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/v1/industries').then((r) => r.json())
      .then((d) => setItems((d.items ?? []).slice(0, 8)))
      .catch(() => {});
  }, []);
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <p className="text-[13px] text-kb-ink/72">
        업종을 고르시면 경쟁까지 재 드려요
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <button key={i.code}
            onClick={() => window.dispatchEvent(new CustomEvent('kkulbee:ask',
              { detail: `${region} ${i.name} 상권 어때?` }))}
            className="rounded-full border border-kb-ink/[.14] px-2.5 py-1 text-[13px]
                       text-kb-ink/85 transition hover:border-kb-yellow/50
                       hover:text-kb-amber">
            {i.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── 요인 기여 (SHAP 방식) ─────────────────────────────────────────────── */
function FactorsCard({ base, factors }: { base: number; factors: FactorContribution[] }) {
  const max = Math.max(...factors.map((f) => Math.abs(f.contribution)), 1);
  const total = base + factors.reduce((a, f) => a + f.contribution, 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[13px] text-kb-ink/72">
        <span>기준 {base}점</span>
        <span className="flex-1 border-t border-dashed border-kb-ink/[.14]" />
        <span className="font-semibold text-kb-ink/80">
          최종 {total.toFixed(1)}점
        </span>
      </div>

      <ul className="space-y-2.5">
        {factors.map((f) => {
          const w = (Math.abs(f.contribution) / max) * 46;
          const up = f.contribution > 0;
          return (
            <li key={f.key}>
              <div className="flex items-baseline gap-2 text-[14px]">
                <span className="w-[86px] shrink-0 text-kb-ink/80">{f.label}</span>

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
                                  ${up ? 'text-kb-amber' : 'text-rose-700'}`}>
                  {f.contribution > 0 ? '+' : ''}{f.contribution.toFixed(1)}
                </span>
              </div>
              <p className="ml-[94px] mt-0.5 text-[13px] leading-snug text-kb-ink/68">
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
      <div className="mt-3.5 rounded-lg bg-white/70 px-3 py-2.5 ring-1 ring-kb-ink/[.1]">
        <p className="text-[12.5px] font-semibold text-kb-ink/78">
          점수에 넣지 않은 것
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-kb-ink/68">
          유동인구 · 매출 · 폐업률 · 임대료 — 상가정보 자료에 없습니다.
          추정해 채우지 않았습니다.
        </p>
      </div>
    </div>
  );
}

/* ── 이 동네에 덜 나온 업종 ────────────────────────────────────────────
 *
 * "카페가 204개라 경쟁이 세다"까지는 말했는데, 그럼 무엇을 하라는 것인지는
 * 답하지 않고 있었습니다. 입지 상담의 절반은 "여기서 뭘 하면 되나"입니다.
 *
 * 다만 '기회'라고 단정하지 않습니다. 적은 데는 이유가 있을 수 있습니다.
 * 사실(몇 곳 있고 비슷한 규모 동네는 평균 몇 곳)만 놓고 판단은 맡깁니다.
 */
function GapsCard({ gaps, crowded, region }: {
  gaps: IndustryGap[]; crowded: IndustryGap[]; region?: string;
}) {
  const Row = ({ g, kind }: { g: IndustryGap; kind: 'gap' | 'crowd' }) => {
    // 막대는 '기대 대비 몇 배'를 보여 줍니다. 2배까지를 폭 100%로 잡아
    // 부족(왼쪽 짧음)과 과밀(오른쪽 김)이 같은 자로 읽히게 했습니다.
    const w = Math.min(100, (g.ratio / 2) * 100);
    return (
      <li>
      {/* 행이 곧 질문입니다 — "약국이 부족하다"를 본 다음 궁금한 것은
          "그럼 여기서 약국을 하면 어떤가"입니다. 누르면 바로 물어봅니다. */}
      <button
        onClick={() => region && window.dispatchEvent(
          new CustomEvent('kkulbee:ask',
            { detail: `${region} ${g.name} 상권 어때?` }))}
        className="group flex w-full items-center gap-2.5 rounded-lg px-1.5
                   py-[5px] text-left transition hover:bg-white/70"
      >
        <span className="w-[124px] shrink-0 truncate text-[14px] text-kb-ink/90
                         group-hover:text-kb-ink">
          {g.name}
        </span>
        <div className="relative h-[6px] flex-1 rounded-full bg-kb-ink/[.05]">
          <div className={`absolute inset-y-0 left-0 rounded-full ${
            kind === 'gap' ? 'bg-emerald-400/75' : 'bg-rose-400/75'}`}
               style={{ width: `${Math.max(4, w)}%` }} />
          {/* 기대치(1배) 자리 눈금 */}
          <span className="absolute inset-y-[-3px] w-px bg-white/30" style={{ left: '50%' }} />
        </div>
        <span className="w-[92px] shrink-0 whitespace-nowrap text-right text-[13px]
                         text-kb-ink/78 [font-variant-numeric:tabular-nums]">
          <b className="text-kb-ink/90">{g.here}</b>
          <span className="text-kb-ink/62"> / </span>{g.expected}
        </span>
      </button>
      </li>
    );
  };

  return (
    <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
      <div>
        <p className="mb-1.5 text-[14px] font-bold text-emerald-700">
          비슷한 규모 동네보다 적은 업종
          <span className="ml-1.5 font-normal text-kb-ink/62">이 동네 / 평균</span>
        </p>
        {gaps.length ? (
          <ul>{gaps.slice(0, 5).map((g) => <Row key={g.code} g={g} kind="gap" />)}</ul>
        ) : (
          <p className="py-3 text-[14px] leading-relaxed text-kb-ink/72">
            눈에 띄게 적은 업종이 없습니다. 웬만한 업종이 이미 다 들어와 있는
            상권입니다.
          </p>
        )}
      </div>
      <div>
        <p className="mb-1.5 text-[14px] font-bold text-rose-700">
          이미 많이 들어와 있는 업종
          <span className="ml-1.5 font-normal text-kb-ink/62">이 동네 / 평균</span>
        </p>
        {crowded.length ? (
          <ul>{crowded.slice(0, 5).map((g) => <Row key={g.code} g={g} kind="crowd" />)}</ul>
        ) : (
          <p className="py-3 text-[14px] text-kb-ink/72">특별히 몰린 업종이 없습니다.</p>
        )}
      </div>

      <p className="text-[13px] leading-relaxed text-kb-ink/68 md:col-span-2">
        규모가 비슷한 전국 동네들과 비교한 것입니다. 적다고 무조건 기회는
        아니에요 — 임대료나 동네 특성 때문일 수도 있으니, 무엇을 알아볼지
        정하는 출발점으로 봐 주세요.
      </p>
    </div>
  );
}

/* ── 닮은 상권 ─────────────────────────────────────────────────────────
 *
 * 동네 하나를 업종 247차원의 벡터로 보고 코사인 유사도로 찾은 것입니다.
 * 연남동을 조회하면 광안리·서교동·망원동이 나옵니다 — 멀리 떨어져 있어도
 * 상권의 '성격'이 닮은 곳들. 2호점을 알아보거나, 닮은 동네에서 내 업종이
 * 어떤지 되물어 검증하는 자입니다. 행을 누르면 그 동네를 바로 물어봅니다.
 */
interface SimilarDong { code: string; name: string; sim: number;
                        stores: number; shared: string[] }

function SimilarCard({ items, industry }: { items: SimilarDong[]; industry?: string }) {
  const askAbout = (name: string) => {
    // 전역 입력을 거치지 않고 커스텀 이벤트로 질문을 흘립니다.
    window.dispatchEvent(new CustomEvent('kkulbee:ask', {
      detail: `${name} ${industry && industry !== '업종 미지정' ? industry + ' ' : ''}상권 어때?` }));
  };
  return (
    <div>
      <ul className="space-y-1.5">
        {items.map((d, i) => (
          <li key={d.code}>
            <button onClick={() => askAbout(d.name)}
              className="group flex w-full items-center gap-3 rounded-xl border
                         border-transparent px-3 py-2.5 text-left transition
                         hover:border-kb-ink/[.14] hover:bg-white/70">
              <span className="w-5 shrink-0 text-[14px] font-bold text-kb-ink/55">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-kb-ink/90
                                 group-hover:text-kb-ink">{d.name}</span>
                <span className="block truncate text-[12.5px] text-kb-ink/68">
                  둘 다 많은: {d.shared.slice(0, 3).join(' · ')}
                </span>
              </span>
              <span className="w-[74px] shrink-0">
                <span className="block text-right text-[14px] font-bold text-kb-amber
                                 [font-variant-numeric:tabular-nums]">
                  {(d.sim * 100).toFixed(0)}%
                </span>
                <span className="mt-0.5 block h-[3px] rounded-full bg-kb-ink/[.05]">
                  <span className="block h-full rounded-full bg-kb-yellow"
                        style={{ width: `${d.sim * 100}%` }} />
                </span>
              </span>
              <span className="shrink-0 text-[13px] text-kb-ink/50 transition
                               group-hover:text-kb-amber">물어보기 →</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-kb-ink/68">
        가게 구성이 비슷한 동네끼리 묶은 것입니다. 옆 동네가 아니라 '분위기가
        닮은' 동네가 나와요 — 2호점 자리를 알아볼 때 출발점이 됩니다.
      </p>
    </div>
  );
}

/* ── 은행권 공시 금리 ──────────────────────────────────────────────────
 *
 * 융자·보증·이차보전은 결국 은행 창구에서 실행됩니다. 그 옆에 지금 은행권
 * 공시 금리를 놓으면 사장님이 조건을 가늠할 수 있습니다. 값은 금감원
 * 「금융상품 한눈에」 공시라 우리가 지어낼 여지가 없고, KB국민은행은
 * 실행 창구 안내 흐름이라 따로 표시합니다.
 */
interface BankRates {
  banks: { bank: string; rate_avg: number }[];
  kb: { bank: string; rate_avg: number } | null;
  low: number | null; high: number | null; n_banks: number; note: string;
}

function RatesCard({ d }: { d: BankRates }) {
  const max = Math.max(...d.banks.map((b) => b.rate_avg), 1);
  return (
    <div>
      {d.low != null && (
        <p className="mb-3 text-[15px] text-kb-ink/80">
          은행권 평균 <b className="text-kb-ink">{d.low}% ~ {d.high}%</b>
          <span className="ml-1.5 text-[13px] text-kb-ink/68">({d.n_banks}개 은행)</span>
        </p>
      )}
      <ul className="space-y-1.5">
        {d.banks.map((b) => {
          const isKb = b.bank.includes('국민');
          return (
            <li key={b.bank} className="flex items-center gap-2.5">
              <span className={`w-[96px] shrink-0 truncate text-[14px] ${
                isKb ? 'font-bold text-kb-amber' : 'text-kb-ink/85'}`}>
                {b.bank}
              </span>
              <div className="h-[6px] flex-1 rounded-full bg-kb-ink/[.05]">
                <div className={`h-full rounded-full ${
                  isKb ? 'bg-kb-yellow' : 'bg-white/[.28]'}`}
                     style={{ width: `${(b.rate_avg / max) * 100}%` }} />
              </div>
              <span className={`w-[52px] shrink-0 text-right text-[14px]
                                [font-variant-numeric:tabular-nums] ${
                isKb ? 'font-bold text-kb-amber' : 'text-kb-ink/85'}`}>
                {b.rate_avg}%
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 rounded-lg bg-amber-400/[.08] px-2.5 py-2 text-[12.5px]
                    leading-relaxed text-amber-800">
        {d.note}
      </p>
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
        ? [`마감 ${days}일 전`, 'bg-red-500/[.16] text-red-700 ring-red-400/25']
        : [`${m.apply_deadline}까지`, 'bg-emerald-500/[.14] text-emerald-700 ring-emerald-400/20']
      : m.open_status === 'rolling'
        ? [m.apply_period || '상시 접수', 'bg-sky-500/[.13] text-sky-700 ring-sky-400/20']
        : m.open_status === 'upcoming'
          ? [`${m.apply_period} 예정`, 'bg-amber-500/[.13] text-amber-800 ring-amber-400/20']
          : [m.apply_period || '기간 미기재', 'bg-kb-ink/[.05] text-kb-ink/78 ring-kb-ink/[.12]'];

  return (
    <span className={`rounded-full px-2 py-0.5 text-[12.5px] font-medium ring-1 ${tone}`}>
      {text}
    </span>
  );
}

/** 자금 성격별 색. 빌리는 돈과 주는 돈이 한눈에 갈려야 합니다. */
const FUNDING_TONE: Record<string, string> = {
  '융자': 'bg-sky-500/[.16] text-sky-700 ring-sky-400/25',
  '이차보전': 'bg-indigo-500/[.16] text-indigo-700 ring-indigo-400/25',
  '보증': 'bg-violet-500/[.16] text-violet-700 ring-violet-400/25',
  '보조금': 'bg-emerald-500/[.16] text-emerald-700 ring-emerald-400/25',
  '바우처': 'bg-teal-500/[.16] text-teal-700 ring-teal-400/25',
  '컨설팅·교육': 'bg-amber-500/[.14] text-amber-800 ring-amber-400/22',
  '기타': 'bg-kb-ink/[.05] text-kb-ink/78 ring-kb-ink/[.14]',
};

/* ── 두 동네 비교 ──────────────────────────────────────────────────────── */

interface CompareSide {
  region_name: string; total_score: number; grade: string; industry: string;
  same_industry_count: number | null;
  factors: FactorContribution[];
  living_pop: { avg: number; peak_hour: number } | null;
}

/** "A랑 B 중 어디가 나아?" — 사장님의 실제 고민은 후보 둘 사이에 있습니다.
    같은 자(전국 백분위)로 잰 두 동네를 나란히 놓고, 요인별로 어느 쪽이
    우세한지 화살로 보여 줍니다. */
function CompareCard({ a, b }: { a: CompareSide; b: CompareSide }) {
  const winA = a.total_score >= b.total_score;
  const ask = (name: string) =>
    window.dispatchEvent(new CustomEvent('kkulbee:ask',
      { detail: `${name} ${a.industry} 상권 자세히 알려줘` }));

  const Side = ({ s, win }: { s: CompareSide; win: boolean }) => (
    <div className={`rounded-xl p-4 ring-1 transition ${win
      ? 'bg-kb-yellow/[.1] ring-kb-yellow/40'
      : 'bg-kb-ink/[.03] ring-kb-ink/[.08]'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[15px] font-bold text-kb-ink">
          {s.region_name}
        </p>
        {win && <span className="shrink-0 rounded-full bg-kb-yellow px-2 py-0.5
                                 text-[12px] font-bold text-kb-ink">우세</span>}
      </div>
      <p className="mt-2 text-[34px] font-extrabold leading-none text-kb-ink
                    [font-variant-numeric:tabular-nums]">
        <CountUp value={s.total_score} />
        <span className="ml-1.5 text-[17px] font-bold text-kb-amber">{s.grade}</span>
      </p>
      <dl className="mt-3 space-y-1 text-[13.5px] text-kb-ink/82">
        <div className="flex justify-between">
          <dt>이 동네 {s.industry}</dt>
          <dd className="font-semibold text-kb-ink">
            {s.same_industry_count?.toLocaleString() ?? '—'}곳
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>실제로 있는 사람</dt>
          <dd className="font-semibold text-kb-ink">
            {s.living_pop ? `일평균 ${s.living_pop.avg.toLocaleString()}명` : '서울만 제공'}
          </dd>
        </div>
      </dl>
      <button onClick={() => ask(s.region_name)}
        className="mt-3 w-full rounded-lg bg-kb-ink/[.05] py-1.5 text-[13px]
                   font-semibold text-kb-ink/82 transition hover:bg-kb-ink/[.09]
                   hover:text-kb-ink">
        이 동네 자세히 →
      </button>
    </div>
  );

  // 요인별 승부 — 이름을 가운데 두고 우세한 쪽으로 화살표
  const rows = a.factors.map((fa) => {
    const fb = b.factors.find((f) => f.label === fa.label);
    return { label: fa.label, va: fa.contribution, vb: fb?.contribution ?? 0 };
  });

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Side s={a} win={winA} />
        <Side s={b} win={!winA} />
      </div>
      <ul className="mt-4 space-y-1.5">
        {rows.map((r) => {
          const d = r.va - r.vb;
          const even = Math.abs(d) < 0.8;
          return (
            <li key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center
                                         gap-2 text-[13.5px]">
              <span className={`text-right [font-variant-numeric:tabular-nums] ${
                !even && d > 0 ? 'font-bold text-kb-amber' : 'text-kb-ink/62'}`}>
                {r.va > 0 ? '+' : ''}{r.va.toFixed(1)}
                {!even && d > 0 && ' ◀'}
              </span>
              <span className="w-24 text-center text-[13px] text-kb-ink/78 sm:w-28">
                {r.label}
              </span>
              <span className={`[font-variant-numeric:tabular-nums] ${
                !even && d < 0 ? 'font-bold text-kb-amber' : 'text-kb-ink/62'}`}>
                {!even && d < 0 && '▶ '}
                {r.vb > 0 ? '+' : ''}{r.vb.toFixed(1)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 rounded-lg bg-kb-ink/[.04] px-2.5 py-2 text-[12.5px]
                    leading-relaxed text-kb-ink/72">
        점수는 참고용입니다 — 임대료·권리금은 자료에 없어 반영되지 않았어요.
        발품 전에 후보를 좁히는 용도로 봐 주세요.
      </p>
    </div>
  );
}

/** 점수가 0에서 차오릅니다 — "점수를 받았다"는 감각은 이런 1초가 만듭니다.
    최종 숫자는 물론 실제 값 그대로. 연출은 도착 과정에만 있습니다. */
function CountUp({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 950);
      setV(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v.toFixed(1)}</>;
}

/** 찜 별 — 누르면 브라우저에 담기고, 상단 '내 찜'에서 D-day 순으로 모입니다. */
function SaveStar({ m }: { m: PolicyMatch }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSaved(isSaved(m.program_id));
    return onSavedChange(() => setSaved(isSaved(m.program_id)));
  }, [m.program_id]);
  return (
    <button
      onClick={() => toggleSaved({
        id: m.program_id, name: m.name, provider: m.provider,
        funding_type: m.funding_type, deadline: m.apply_deadline ?? null,
        apply_period: m.apply_period ?? '',
        url: m.source_url || m.apply_url || '',
      })}
      title={saved ? '찜 해제' : '찜해 두고 마감 챙기기'}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[17px]
                  transition ${saved
        ? 'text-kb-amber' : 'text-kb-ink/25 hover:text-kb-amber/70'}`}
    >
      {saved ? '★' : '☆'}
    </button>
  );
}

function PolicyCard({ items }: { items: PolicyMatch[] }) {
  // 자금 성격 필터 — 결과 안에서 "주는 돈만" 골라 보는 가장 빠른 길.
  // 재검색 없이 화면에서 거릅니다.
  const kinds = Array.from(new Set(items.map((m) => m.funding_type)));
  const [kind, setKind] = useState<string | null>(null);
  const shown = kind ? items.filter((m) => m.funding_type === kind) : items;
  const won = (v: number) =>
    v >= 100_000_000
      ? `${(v / 100_000_000).toFixed(v % 100_000_000 ? 1 : 0)}억원`
      : v >= 10_000_000
        ? `${Math.round(v / 10_000_000)}천만원`
        : `${Math.round(v / 10_000).toLocaleString()}만원`;

  return (
    <div>
      {kinds.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button onClick={() => setKind(null)}
            className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ring-1
                        transition ${kind === null
              ? 'bg-kb-ink/[.08] text-kb-ink ring-kb-ink/[.2]'
              : 'text-kb-ink/78 ring-kb-ink/[.14] hover:text-kb-ink'}`}>
            전체 {items.length}
          </button>
          {kinds.map((k) => (
            <button key={k} onClick={() => setKind(k === kind ? null : k)}
              className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ring-1
                          transition ${kind === k
                ? FUNDING_TONE[k] ?? FUNDING_TONE['기타']
                : 'text-kb-ink/78 ring-kb-ink/[.14] hover:text-kb-ink'}`}>
              {k} {items.filter((m) => m.funding_type === k).length}
            </button>
          ))}
        </div>
      )}
    <ul className="space-y-3">
      {shown.map((m) => (
        <li key={m.program_id}
            className="rounded-xl bg-kb-ink/[.05] p-3.5 ring-1 ring-kb-ink/[.1]
                       transition hover:ring-kb-ink/[.14]">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-semibold leading-snug text-kb-ink">{m.name}</p>
              <p className="mt-1 text-[13px] text-kb-ink/78">
                {m.provider} · {m.category}
                {m.regions.length > 0 ? ` · ${m.regions.join('·')}` : ' · 전국'}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-kb-yellow/[.15] px-2 py-0.5
                             text-[13px] font-bold text-kb-amber
                             [font-variant-numeric:tabular-nums]">
              {m.match_score.toFixed(0)}점
            </span>
            <SaveStar m={m} />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5
                          text-[13.5px] text-kb-ink/88">
            {/* 주는 돈인지 빌리는 돈인지를 맨 앞에 둡니다. 5천만원 융자를
                보조금으로 알고 신청하는 일이 실제로 생깁니다. */}
            <span className={`rounded-full px-2 py-0.5 text-[12.5px] font-bold
                              ring-1 ${FUNDING_TONE[m.funding_type] ?? FUNDING_TONE['기타']}`}>
              {m.funding_type}
            </span>
            <StatusChip m={m} />
            {/* 금액은 근거가 있을 때만 씁니다. 예전에는 본문에서 찾은 가장 큰
                금액을 '한도'라고 적어 총사업비가 한도로 둔갑했습니다. */}
            {m.limit_krw != null && (
              <span>
                {m.amount_basis ?? '금액'} <b className="text-kb-ink">{won(m.limit_krw)}</b>
              </span>
            )}
            {m.rate_pct != null && (
              <span>금리 <b className="text-kb-ink">{m.rate_pct}%</b></span>
            )}
          </div>

          {m.funding_note && (
            <p className="mt-2 text-[13px] leading-snug text-kb-ink/78">
              {m.funding_note}
            </p>
          )}

          {/* 공고가 밝힌 지원대상·지원내용. 예전에는 이 칸이 늘 비어 있었습니다
              — 900건 전부에 ☞로 적혀 있는데 뽑아 쓰지 않았습니다. */}
          {(m.eligibility.length > 0 || m.required_docs.length > 0) && (
            <dl className="mt-2.5 space-y-1.5 rounded-lg bg-kb-ink/[.05] px-3 py-2.5">
              {m.eligibility.length > 0 && (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-[12.5px] font-bold text-kb-ink/72">대상</dt>
                  <dd className="text-[13.5px] leading-snug text-kb-ink/85">
                    {m.eligibility[0]}
                  </dd>
                </div>
              )}
              {m.required_docs.slice(0, 2).map((d, i) => (
                <div key={i} className="flex gap-2">
                  <dt className="shrink-0 text-[12.5px] font-bold text-kb-ink/72">
                    {i === 0 ? '내용' : '\u00a0\u00a0\u00a0\u00a0'}
                  </dt>
                  <dd className="text-[13.5px] leading-snug text-kb-ink/85">{d}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* 추천 이유 — 왜 이걸 골랐는지 밝히지 않으면 근거가 없습니다 */}
          {m.match_reasons.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {m.match_reasons.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-[13px] leading-snug text-kb-ink/78">
                  <span className="text-kb-amber/80">·</span>{r}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2.5 flex items-center gap-3">
            {m.apply_url && (
              <a href={m.apply_url} target="_blank" rel="noreferrer"
                 className="text-[13px] font-semibold text-kb-amber
                            underline-offset-2 hover:underline">
                신청 안내 보기 →
              </a>
            )}
            {/* 원문 링크는 반드시 둡니다. 우리가 요약한 것을 사장님이
                직접 대조하실 수 있어야 합니다. */}
            {m.source_url && m.source_url !== m.apply_url && (
              <a href={m.source_url} target="_blank" rel="noreferrer"
                 className="text-[13px] text-kb-ink/72 underline-offset-2 hover:underline">
                기업마당 공고 원문
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
    </div>
  );
}

/* ── 쉬운 용어 ─────────────────────────────────────────────────────────── */
function TermsCard({ terms }: { terms: TermEntry[] }) {
  return (
    <ul className="space-y-3">
      {terms.map((t) => (
        <li key={t.term}>
          <p className="text-[14.5px] font-semibold text-kb-amber">{t.term}</p>
          <p className="mt-0.5 text-[14px] leading-relaxed text-kb-ink/80">{t.easy}</p>
          {t.caution && (
            <p className="mt-1 text-[13px] leading-snug text-rose-700/[.65]">
              주의 — {t.caution}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── 분쟁 절차 ─────────────────────────────────────────────────────────── */
function ProcedureCard({ steps, rules, checklist, question }:
  { steps: ProcedureStep[]; rules: string[]; checklist: string[];
    question?: string }) {
  // 절차의 끝은 '서류를 쓰는 일'입니다. 그 첫 문장을 대신 써 줍니다.
  const [draftOpen, setDraftOpen] = useState(false);
  return (
    <div>
      <ol className="relative space-y-4 border-l border-kb-ink/[.14] pl-5">
        {steps.map((s) => (
          <li key={s.step} className="relative">
            <span className="absolute -left-[26px] grid h-5 w-5 place-items-center
                             rounded-full bg-kb-yellow text-[13px] font-bold text-kb-ink">
              {s.step}
            </span>
            <p className="text-[15px] font-semibold text-kb-ink">{s.title}</p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-kb-ink/82">
              {s.description}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-kb-ink/68">
              {s.duration && <span>소요 {s.duration}</span>}
              {s.contact && <span>{s.contact}</span>}
            </div>
          </li>
        ))}
      </ol>

      {rules?.length > 0 && (
        <div className="mt-4 rounded-lg bg-kb-ink/[.05] px-3 py-2.5">
          <p className="text-[13px] font-semibold text-kb-ink/82">근거 규정</p>
          <ul className="mt-1 space-y-0.5">
            {rules.map((r) => (
              <li key={r} className="text-[13px] text-kb-ink/78">· {r}</li>
            ))}
          </ul>
        </div>
      )}

      {checklist?.length > 0 && (
        <div className="mt-2.5">
          <p className="mb-1.5 text-[13px] font-semibold text-kb-ink/82">준비 서류</p>
          <div className="flex flex-wrap gap-1.5">
            {checklist.map((d) => (
              <span key={d} className="rounded-md bg-kb-ink/[.05] px-2 py-1
                                       text-[13px] text-kb-ink/88">{d}</span>
            ))}
          </div>
        </div>
      )}

      {question && (
        <>
          <button onClick={() => setDraftOpen(true)}
                  className="mt-4 w-full rounded-xl border border-kb-yellow/[.4]
                             bg-kb-yellow/[.08] py-2.5 text-[15px] font-bold
                             text-kb-amber transition hover:bg-kb-yellow/[.15]">
            ✍ 이 내용으로 민원서 초안 만들기
          </button>
          <DraftModal open={draftOpen} onClose={() => setDraftOpen(false)}
                      situation={question} />
        </>
      )}
    </div>
  );
}

/* ── 가드레일 알림 ─────────────────────────────────────────────────────── */
function NoticeCard({ r }: { r: GuardrailReport }) {
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-kb-ink/80">
        금융소비자보호법에 따라 단정적인 표현을 안전한 표현으로 바꿨습니다.
      </p>
      <ul className="mt-2.5 space-y-1">
        {r.violations.map((v, i) => (
          <li key={i} className="flex gap-1.5 text-[13.5px] text-rose-700">
            <span>·</span>{v}
          </li>
        ))}
      </ul>
      {r.original_excerpt && (
        <p className="mt-2.5 rounded-md bg-kb-ink/[.05] px-2.5 py-2 text-[13px]
                      leading-snug text-kb-ink/68 line-through">
          {r.original_excerpt}
        </p>
      )}
    </div>
  );
}
