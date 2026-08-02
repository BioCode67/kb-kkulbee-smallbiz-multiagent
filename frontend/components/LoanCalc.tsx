'use client';

/**
 * 대출 상환 시뮬레이터 — "그래서 한 달에 얼마 갚는데?"
 *
 * 융자 공고를 본 사장님의 다음 질문은 늘 이것입니다. 매칭된 공고의
 * 한도·금리가 자동으로 채워지고, 상환 방식(원리금균등·원금균등·만기일시)을
 * 바꿔 가며 월 부담과 총 이자를 비교합니다 — 용어 사전의 그 세 단어가
 * 여기서 숫자로 만져집니다.
 *
 * 숫자는 공식 그대로의 산수일 뿐입니다. 실제 조건은 심사에 따라 달라진다고
 * 화면에 적습니다 — 계산기가 확약처럼 보이는 순간 금소법 문제가 됩니다.
 */

import { useMemo, useState } from 'react';
import type { PolicyMatch } from '@/lib/types';

type Method = 'annuity' | 'equal' | 'bullet';

const METHOD_LABEL: Record<Method, [string, string]> = {
  annuity: ['원리금균등', '매달 같은 금액'],
  equal: ['원금균등', '처음 많고 점점 줄어요'],
  bullet: ['만기일시', '이자만 내다 마지막에 원금'],
};

function calc(principal: number, annualPct: number, months: number, m: Method) {
  const r = annualPct / 100 / 12;
  if (principal <= 0 || months <= 0) return null;
  if (m === 'annuity') {
    const pay = r === 0 ? principal / months
      : (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
    return { first: pay, last: pay, total: pay * months - principal };
  }
  if (m === 'equal') {
    const base = principal / months;
    const first = base + principal * r;
    const last = base + base * r;
    // 총이자 = r × 원금 × (n+1)/2 × (1/n 균등 상환의 잔액 합)
    const total = principal * r * (months + 1) / 2;
    return { first, last, total };
  }
  return { first: principal * r, last: principal * r + principal,
           total: principal * r * months };
}

const won = (v: number) =>
  v >= 100_000_000 ? `${(v / 100_000_000).toFixed(1)}억원`
    : v >= 10_000 ? `${Math.round(v / 10_000).toLocaleString()}만원`
    : `${Math.round(v).toLocaleString()}원`;

export default function LoanCalc({ policies }: { policies: PolicyMatch[] }) {
  // 융자·이차보전 공고에서 한도·금리를 끌어와 기본값으로
  const loan = policies.find((p) =>
    (p.funding_type === '융자' || p.funding_type === '이차보전') && p.limit_krw);
  const [openCalc, setOpenCalc] = useState(false);
  const [amt, setAmt] = useState(() =>
    Math.min(loan?.limit_krw ?? 30_000_000, 100_000_000) / 10_000);  // 만원
  const [rate, setRate] = useState(() => loan?.rate_pct ?? 3.5);
  const [years, setYears] = useState(5);
  const [method, setMethod] = useState<Method>('annuity');

  const r = useMemo(
    () => calc(amt * 10_000, rate, years * 12, method),
    [amt, rate, years, method]);

  if (!policies.some((p) => p.funding_type === '융자' || p.funding_type === '이차보전')) {
    return null;   // 빌리는 돈이 없는 답변엔 계산기도 없습니다
  }

  return (
    <section className="surface-1 print:hidden overflow-hidden">
      <button onClick={() => setOpenCalc((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div>
          <h3 className="font-display text-[18px] text-kb-ink">이 돈 빌리면 한 달에 얼마 갚을까</h3>
          <p className="mt-0.5 text-[14px] text-kb-ink/78">
            {loan ? `위 공고의 한도·금리(${won((loan.limit_krw!))}·${loan.rate_pct ?? '—'}%)로 채워 뒀어요`
              : '금액·금리·기간을 넣으면 상환 방식별로 비교해 드려요'}
          </p>
        </div>
        <span className="text-[15px] text-kb-ink/55">{openCalc ? '접기 ▲' : '계산해 보기 ▼'}</span>
      </button>

      {openCalc && (
        <div className="border-t border-kb-ink/[.07] px-5 pb-5 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {([['빌리는 돈 (만원)', amt, setAmt, 100],
               ['연 금리 (%)', rate, setRate, 0.1],
               ['갚는 기간 (년)', years, setYears, 1]] as const).map(
              ([label, val, set, step]) => (
              <label key={label} className="block">
                <span className="text-[13px] font-semibold text-kb-ink/72">{label}</span>
                <input type="number" value={val} step={step} min={0}
                  onChange={(e) => (set as (n: number) => void)(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-kb-ink/[.04] px-3 py-2 text-[15.5px]
                             text-kb-ink ring-1 ring-kb-ink/[.12]
                             focus:outline-none focus:ring-kb-yellow/50" />
              </label>
            ))}
          </div>

          <div className="mt-3 flex gap-1.5">
            {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
              <button key={m} onClick={() => setMethod(m)}
                className={`flex-1 rounded-lg px-2 py-2 text-center ring-1 transition ${
                  method === m ? 'bg-kb-yellow/[.18] ring-kb-yellow/50'
                    : 'ring-kb-ink/[.1] hover:ring-kb-ink/[.2]'}`}>
                <span className="block text-[14px] font-bold text-kb-ink">
                  {METHOD_LABEL[m][0]}
                </span>
                <span className="block text-[12px] text-kb-ink/68">
                  {METHOD_LABEL[m][1]}
                </span>
              </button>
            ))}
          </div>

          {r && (
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-kb-ink/[.04] p-4">
              <div>
                <p className="text-[12.5px] font-bold text-kb-ink/68">
                  {method === 'equal' ? '첫 달' : method === 'bullet' ? '매달 이자' : '매달'}
                </p>
                <p className="text-[18px] font-extrabold text-kb-ink
                              [font-variant-numeric:tabular-nums]">{won(r.first)}</p>
              </div>
              <div>
                <p className="text-[12.5px] font-bold text-kb-ink/68">
                  {method === 'equal' ? '마지막 달'
                    : method === 'bullet' ? '만기에' : '마지막 달도'}
                </p>
                <p className="text-[18px] font-extrabold text-kb-ink
                              [font-variant-numeric:tabular-nums]">{won(r.last)}</p>
              </div>
              <div>
                <p className="text-[12.5px] font-bold text-kb-ink/68">총 이자</p>
                <p className="text-[18px] font-extrabold text-kb-amber
                              [font-variant-numeric:tabular-nums]">{won(r.total)}</p>
              </div>
            </div>
          )}

          <p className="mt-3 text-[12.5px] leading-relaxed text-kb-ink/68">
            공식 그대로의 산수입니다. 실제 승인 여부·한도·금리는 심사 결과에 따라
            달라지며, 중도상환수수료·보증료는 들어 있지 않아요.
          </p>
        </div>
      )}
    </section>
  );
}
