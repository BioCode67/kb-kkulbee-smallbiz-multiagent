'use client';

/**
 * 자금 설계사 — "5천만원이 필요한데, 어떻게 만들죠?"
 *
 * 공고 나열이 아니라 조달 설계입니다. 실제 접수 중인 공고로
 * 주는 돈(보조금) → 보증·이자지원 → 빌리는 돈 순서로 쌓아
 * 갚을 돈을 최소화하고, 융자분은 월 상환액까지 계산합니다.
 * 모든 칸에 공고 원문 링크 — 지어낸 숫자가 없습니다.
 */

import { useState } from 'react';

interface Step {
  name: string; funding_type: string; bucket: 'grant' | 'guar' | 'loan';
  alloc_krw: number; cap_krw: number; amount_basis: string | null;
  rate_pct: number | null; monthly_krw: number; rate_assumed: boolean;
  reason: string; provider: string | null; url: string;
}
interface Plan {
  ok: boolean; reason?: string; target_krw: number; covered_krw: number;
  gap_krw: number; grant_krw: number; monthly_total_krw: number;
  benchmark: { rate_pct: number; assumed: boolean; monthly_krw: number;
               total_krw: number; plan_total_krw: number; save_krw: number } | null;
  steps: Step[]; extras: { name: string; funding_type: string; url: string }[];
  note: string;
}

const BUCKET = {
  grant: { label: '주는 돈', bar: 'bg-emerald-500', chip: 'bg-emerald-500/[.14] text-emerald-700' },
  guar: { label: '보증·이자지원', bar: 'bg-violet-500', chip: 'bg-violet-500/[.14] text-violet-700' },
  loan: { label: '빌리는 돈', bar: 'bg-sky-500', chip: 'bg-sky-500/[.14] text-sky-700' },
} as const;

const won = (v: number) =>
  v >= 100_000_000 ? `${(v / 100_000_000).toFixed(1)}억원`
    : `${Math.round(v / 10_000).toLocaleString()}만원`;

export default function FundingPlan({ region, industry }: {
  region?: string | null; industry?: string | null;
}) {
  const [amt, setAmt] = useState(5000);        // 만원
  const [purpose, setPurpose] = useState('운영');
  const [bench, setBench] = useState(6.5);     // 시중 금리 '가정' — 직접 바꿔 봄
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (benchPct?: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/v1/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_krw: amt * 10_000, purpose,
                              bench_rate_pct: benchPct ?? bench,
                              region: region || null, industry: industry || null }),
      });
      setPlan(await r.json());
    } catch { setPlan(null); } finally { setBusy(false); }
  };

  return (
    <section className="mt-8 w-full max-w-[1240px] rounded-2xl border-2
                        border-kb-yellow/50 bg-white p-6
                        shadow-[0_20px_50px_-20px_rgba(224,144,0,.35)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[24px] text-kb-ink">
            💰 자금 설계사 <span className="text-kb-amber">— 얼마가 필요하세요?</span>
          </h2>
          <p className="mt-1 text-[14.5px] text-kb-ink/70">
            실제 접수 중인 공고로 <b>그냥 받는 돈부터</b> 쌓아 드립니다.
            빌리는 돈은 한 달에 얼마 갚는지까지.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2 rounded-xl bg-kb-ink/[.04] px-3 py-2
                        ring-1 ring-kb-ink/[.12]">
          <input type="number" value={amt} min={100} step={500}
            onChange={(e) => setAmt(Number(e.target.value))}
            className="w-24 bg-transparent text-right text-[17px] font-bold
                       text-kb-ink focus:outline-none" />
          <span className="text-[14px] text-kb-ink/62">만원</span>
        </div>
        {['운영', '창업', '시설'].map((p) => (
          <button key={p} onClick={() => setPurpose(p)}
            className={`rounded-full px-4 py-2 text-[14px] font-bold ring-1 transition ${
              purpose === p ? 'bg-kb-yellow/[.2] text-kb-amber ring-kb-yellow/60'
                : 'text-kb-ink/62 ring-kb-ink/[.14] hover:text-kb-ink'}`}>
            {p}자금
          </button>
        ))}
        <button onClick={() => run()} disabled={busy}
          className="rounded-xl bg-kb-yellow px-6 py-2.5 text-[15px] font-bold
                     text-kb-ink shadow-sm transition hover:brightness-105
                     disabled:opacity-50">
          {busy ? '설계 중…' : '조달 설계하기'}
        </button>
      </div>

      {plan?.ok && (
        <div className="mt-5">
          {/* 요약 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['목표', won(plan.target_krw), 'text-kb-ink'],
              ['조달 가능', won(plan.covered_krw), 'text-kb-amber'],
              ['그냥 받는 돈', won(plan.grant_krw), 'text-emerald-700'],
              ['한 달 갚는 돈', won(plan.monthly_total_krw), 'text-sky-700'],
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-xl bg-kb-ink/[.04] px-3 py-2.5">
                <p className="text-[12px] font-bold text-kb-ink/55">{l}</p>
                <p className={`text-[21px] font-extrabold
                               [font-variant-numeric:tabular-nums] ${c}`}>{v}</p>
              </div>
            ))}
          </div>

          {/* 시중 대출과의 비교 — "AI가 설계하면 얼마가 달라지나"를 숫자로.
              기준 금리는 공시값이 아니라 '가정'이며, 사장님이 직접 바꿔 볼
              수 있습니다. 절감액 = 전액 시중 대출 시 5년 총 상환 − 이 설계의
              융자 상환 총액(보조금 몫은 갚지 않으므로 0). */}
          {plan.benchmark && plan.benchmark.save_krw > 0 && (
            <div className="mt-4 rounded-xl bg-gradient-to-r from-emerald-500/[.1]
                            to-kb-yellow/[.12] p-4 ring-1 ring-emerald-500/30">
              <p className="text-[13px] font-bold text-kb-ink/70">
                같은 돈을 전부 시중 신용대출로 빌렸다면 (연{' '}
                <input type="number" value={bench} min={0.1} max={20} step={0.5}
                  onChange={(e) => setBench(Number(e.target.value))}
                  onBlur={() => run()}
                  className="w-14 rounded-md bg-white px-1.5 py-0.5 text-center
                             text-[13px] font-bold text-kb-ink ring-1
                             ring-kb-ink/[.15] focus:outline-none" />
                % 가정 — 바꿔 보세요)
              </p>
              <p className="mt-1.5 text-[17px] text-kb-ink">
                5년 총 {won(plan.benchmark.total_krw)} 상환 → 이 설계는{' '}
                {won(plan.benchmark.plan_total_krw)} 상환.{' '}
                <b className="text-[21px] font-extrabold text-emerald-700">
                  {won(plan.benchmark.save_krw)} 아낍니다
                </b>
              </p>
            </div>
          )}

          {/* 스택 바 — 무엇으로 채워지는지 한 눈에 */}
          <div className="mt-4 flex h-6 w-full overflow-hidden rounded-full
                          bg-kb-ink/[.08]">
            {plan.steps.map((s, i) => (
              <div key={i} title={`${s.name} ${won(s.alloc_krw)}`}
                className={`${BUCKET[s.bucket].bar} h-full border-r-2 border-white/70`}
                style={{ width: `${(s.alloc_krw / plan.target_krw) * 100}%` }} />
            ))}
          </div>
          <div className="mt-1.5 flex gap-4 text-[12px] font-semibold text-kb-ink/62">
            {(Object.keys(BUCKET) as (keyof typeof BUCKET)[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${BUCKET[k].bar}`} />
                {BUCKET[k].label}
              </span>
            ))}
            {plan.gap_krw > 0 && (
              <span className="text-rose-600">부족 {won(plan.gap_krw)}</span>
            )}
          </div>

          {/* 단계 */}
          <ol className="mt-4 space-y-2.5">
            {plan.steps.map((s, i) => (
              <li key={i} className="rounded-xl bg-kb-ink/[.03] p-3.5 ring-1
                                     ring-kb-ink/[.08]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full
                                   bg-kb-ink text-[12px] font-bold text-kb-yellow">
                    {i + 1}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold
                                    ${BUCKET[s.bucket].chip}`}>
                    {s.funding_type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold
                                   text-kb-ink">{s.name}</span>
                  <span className="text-[16px] font-extrabold text-kb-ink
                                   [font-variant-numeric:tabular-nums]">
                    {won(s.alloc_krw)}
                  </span>
                </div>
                <p className="mt-1.5 pl-8 text-[12.5px] text-kb-ink/68">
                  {s.amount_basis ?? '금액'} {won(s.cap_krw)} 중 배정
                  {s.bucket !== 'grant' && (
                    <> · 월 <b className="text-kb-ink">{won(s.monthly_krw)}</b>씩
                    {s.rate_assumed ? ' (금리 3.5% 가정)' : ` (금리 ${s.rate_pct}%)`}</>
                  )}
                  {s.provider && <> · {s.provider}</>}
                  {'  '}
                  <a href={s.url} target="_blank" rel="noreferrer"
                     className="font-semibold text-kb-amber hover:underline">
                    공고 원문 →
                  </a>
                </p>
              </li>
            ))}
          </ol>

          {plan.extras.length > 0 && (
            <p className="mt-3 text-[12.5px] text-kb-ink/62">
              금액이 공고에 안 적혀 있어 설계에서 뺀 후보:{' '}
              {plan.extras.map((e, i) => (
                <a key={i} href={e.url} target="_blank" rel="noreferrer"
                   className="text-kb-amber hover:underline">
                  {e.name}{i < plan.extras.length - 1 ? ', ' : ''}
                </a>
              ))}
            </p>
          )}
          <p className="mt-3 rounded-lg bg-amber-400/[.1] px-3 py-2.5 text-[12.5px]
                        leading-relaxed text-amber-800">
            {plan.note}
          </p>
        </div>
      )}
      {plan && !plan.ok && (
        <p className="mt-3 text-[13.5px] text-rose-700">{plan.reason}</p>
      )}
    </section>
  );
}
