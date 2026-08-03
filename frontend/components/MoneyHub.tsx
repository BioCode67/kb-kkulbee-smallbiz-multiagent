'use client';

/**
 * 자금 허브 — 설계사 아래에 상시로 깔리는 '돈이 되는 목록들'.
 *
 * ① 지금 접수 중·마감 임박 공고 — 기업마당 실공고, D-day 순
 * ② 여유자금 굴릴 자리 — 예·적금 12개월 최고우대금리 공시(KB 별도)
 * ③ KB 창구 바로가기
 * 전부 실공시·실공고이며, 항목마다 원문 링크가 붙습니다.
 */

import { useEffect, useState } from 'react';

interface Soon { title: string; deadline: string; days_left: number; url: string; }
interface DepRow { bank: string; product: string; rate: number; }
interface Deps {
  ok: boolean;
  deposit?: { top: DepRow[]; kb: DepRow | null };
  saving?: { top: DepRow[]; kb: DepRow | null };
  note?: string;
}

function Dday({ d }: { d: number }) {
  const tone = d <= 3 ? 'bg-rose-500/[.12] text-rose-700'
    : d <= 7 ? 'bg-amber-400/[.18] text-amber-800'
      : 'bg-kb-ink/[.06] text-kb-ink/72';
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[12.5px] font-bold
                      [font-variant-numeric:tabular-nums] ${tone}`}>
      {d === 0 ? '오늘 마감' : `D-${d}`}
    </span>
  );
}

export default function MoneyHub() {
  const [soon, setSoon] = useState<Soon[] | null>(null);
  const [deps, setDeps] = useState<Deps | null>(null);

  useEffect(() => {
    fetch('/api/v1/closing-soon')
      .then((r) => r.json())
      .then((d) => setSoon(d.items ?? []))
      .catch(() => setSoon([]));
    fetch('/api/v1/deposits').then((r) => r.json()).then(setDeps)
      .catch(() => {});
  }, []);

  return (
    <div className="mt-6 grid w-full max-w-[1240px] gap-5 lg:grid-cols-2">
      {/* ① 마감 임박 공고 */}
      <section className="rounded-2xl border-2 border-kb-yellow/50 bg-white p-6
                          shadow-[0_20px_50px_-20px_rgba(224,144,0,.3)]">
        <h2 className="font-display text-[21px] text-kb-ink">
          지금 접수 중 <span className="text-kb-amber">— 마감 가까운 순</span>
        </h2>
        <p className="mt-1 text-[13.5px] text-kb-ink/70">
          기업마당 실제 공고입니다. 조건에 맞는 것만 골라 받으려면 위
          질문창에 상황을 말씀해 주세요.
        </p>
        {!soon && <p className="mt-4 text-[13.5px] text-kb-ink/55">불러오는 중입니다…</p>}
        <ul className="mt-3.5 space-y-2">
          {(soon ?? []).slice(0, 6).map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer"
                 className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5
                            transition hover:bg-kb-yellow/[.08]">
                <Dday d={s.days_left} />
                <span className="min-w-0 flex-1 truncate text-[14px]
                                 text-kb-ink/85 group-hover:text-kb-ink">
                  {s.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* ② 예·적금 + KB 바로가기 */}
      <section className="rounded-2xl border-2 border-kb-yellow/50 bg-white p-6
                          shadow-[0_20px_50px_-20px_rgba(224,144,0,.3)]">
        <h2 className="font-display text-[21px] text-kb-ink">
          여유자금 굴릴 자리 <span className="text-kb-amber">— 예·적금 공시 Top</span>
        </h2>
        <p className="mt-1 text-[13.5px] text-kb-ink/70">
          12개월·최고우대금리 기준 금융감독원 공시입니다.
        </p>
        {deps?.ok ? (
          <div className="mt-3.5 grid gap-4 sm:grid-cols-2">
            {([['정기예금', deps.deposit], ['적금', deps.saving]] as
              [string, Deps['deposit']][]).map(([label, d]) => (
              <div key={label}>
                <p className="text-[13px] font-bold text-kb-ink/62">{label}</p>
                <ul className="mt-1.5 space-y-1.5">
                  {(d?.top ?? []).slice(0, 4).map((r) => (
                    <li key={r.bank + r.product}
                        className="flex items-baseline gap-2 text-[13.5px]">
                      <span className="min-w-0 flex-1 truncate text-kb-ink/82">
                        {r.bank.replace('주식회사 ', '')}{' '}
                        <span className="text-kb-ink/55">
                          {r.product.replace(/\s+/g, ' ').slice(0, 14)}
                        </span>
                      </span>
                      <b className="shrink-0 text-kb-amber
                                    [font-variant-numeric:tabular-nums]">
                        {r.rate}%
                      </b>
                    </li>
                  ))}
                  {d?.kb && !d.top.slice(0, 4).some((r) => r.bank.includes('국민')) && (
                    <li className="flex items-baseline gap-2 rounded-md
                                   bg-kb-yellow/[.12] px-1.5 py-1 text-[13.5px]">
                      <span className="min-w-0 flex-1 truncate font-semibold
                                       text-kb-ink">
                        KB {d.kb.product.replace(/\s+/g, ' ').slice(0, 14)}
                      </span>
                      <b className="shrink-0 text-kb-amber">{d.kb.rate}%</b>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[13.5px] text-kb-ink/55">
            {deps ? '공시 연결 대기 중입니다' : '불러오는 중입니다…'}
          </p>
        )}
        <a href="https://obank.kbstar.com/quics?page=C019327"
           target="_blank" rel="noreferrer"
           className="mt-4 inline-block rounded-xl bg-kb-yellow px-4 py-2
                      text-[13.5px] font-bold text-kb-ink transition
                      hover:brightness-105">
          KB 사업자 대출 상담 창구 바로가기
        </a>
        {deps?.note && (
          <p className="mt-3 rounded-lg bg-kb-ink/[.04] px-3 py-2 text-[12px]
                        leading-relaxed text-kb-ink/60">
            {deps.note}
          </p>
        )}
      </section>
    </div>
  );
}
