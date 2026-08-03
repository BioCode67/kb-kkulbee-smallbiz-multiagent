'use client';

/**
 * 가맹 브랜드 실측 조회 — 서명 전에 공시부터.
 *
 * 프랜차이즈 상담의 첫 숫자는 본사 홍보물이 아니라 공정위 공시여야
 * 합니다. 브랜드 이름을 넣으면 정보공개서 기반 통계(가맹점 수, 1년새
 * 새로 연 곳·닫은 곳, 가맹점 연평균 매출)를 그대로 보여줍니다.
 * 계약서 신호등(조항 검사)과 짝을 이루는, '숫자 쪽' 검사입니다.
 */

import { useState } from 'react';

interface Item {
  brand: string; corp: string; industry: string;
  stores: number; opened: number; closed: number; avg_sales_krw: number;
}
interface Resp { ok: boolean; reason?: string; yr?: string;
                 items?: Item[]; note?: string; }

const won = (v: number) =>
  v >= 100_000_000 ? `${(v / 100_000_000).toFixed(1)}억원`
    : v > 0 ? `${Math.round(v / 10_000).toLocaleString()}만원` : '공시 없음';

export default function FranchiseCheck() {
  const [q, setQ] = useState('');
  const [r, setR] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (name?: string) => {
    const brand = (name ?? q).trim();
    if (!brand || busy) return;
    if (name) setQ(name);
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/franchise?brand=${encodeURIComponent(brand)}`);
      setR(await res.json());
    } catch { setR(null); } finally { setBusy(false); }
  };

  return (
    <section className="mt-6 w-full max-w-[1240px] rounded-2xl border-2
                        border-sky-400/50 bg-white p-6
                        shadow-[0_20px_50px_-20px_rgba(40,110,180,.3)]">
      <h2 className="font-display text-[24px] text-kb-ink">
        🔍 가맹 브랜드 실측 조회 <span className="text-sky-700">— 서명 전에 공시부터</span>
      </h2>
      <p className="mt-1 text-[14.5px] text-kb-ink/70">
        본사 홍보물 말고 <b>공정위에 신고된 숫자</b>로 봅니다 — 가맹점이 몇
        개인지, 1년 새 몇 곳이 닫았는지, 평균매출이 얼마인지.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="브랜드 이름 — 예) 메가커피"
          className="w-64 rounded-xl bg-kb-ink/[.04] px-4 py-2.5 text-[15px]
                     font-semibold text-kb-ink ring-1 ring-kb-ink/[.12]
                     placeholder:font-normal placeholder:text-kb-ink/40
                     focus:outline-none focus:ring-2 focus:ring-sky-400/60" />
        <button onClick={() => run()} disabled={busy || !q.trim()}
          className="rounded-xl bg-sky-600 px-6 py-2.5 text-[15px] font-bold
                     text-white shadow-sm transition hover:brightness-105
                     disabled:opacity-40">
          {busy ? '공시 찾는 중…' : '공시 확인하기'}
        </button>
        {['메가커피', '교촌', '파리바게뜨'].map((s) => (
          <button key={s} onClick={() => run(s)}
            className="rounded-full px-3.5 py-2 text-[13.5px] font-semibold
                       text-kb-ink/62 ring-1 ring-kb-ink/[.14] hover:text-kb-ink">
            {s}
          </button>
        ))}
      </div>

      {r && !r.ok && (
        <p className="mt-4 rounded-xl bg-kb-ink/[.05] px-4 py-3 text-[14px]
                      text-kb-ink/70">{r.reason}</p>
      )}

      {r?.ok && (
        <div className="mt-5">
          {(r.items?.length ?? 0) === 0 && (
            <p className="rounded-xl bg-kb-ink/[.05] px-4 py-3 text-[14px]
                          text-kb-ink/70">
              {r.yr}년 공시에서 그 이름을 못 찾았습니다 — 정보공개서의 정식
              브랜드명으로 다시 찾아보세요.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {(r.items ?? []).map((b) => (
              <div key={b.brand + b.corp}
                   className="rounded-xl bg-sky-500/[.05] p-4 ring-1
                              ring-sky-400/40">
                <p className="text-[16.5px] font-bold text-kb-ink">{b.brand}</p>
                <p className="mt-0.5 text-[12.5px] text-kb-ink/62">
                  {b.corp} · {b.industry}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {([['가맹점', `${b.stores.toLocaleString()}개`, ''],
                     ['1년새 새로 열음', `${b.opened}곳`, 'text-emerald-700'],
                     ['1년새 닫음', `${b.closed}곳`,
                      b.closed > b.opened ? 'text-rose-600' : ''],
                     ['가맹점 연평균 매출', won(b.avg_sales_krw), ''],
                  ] as [string, string, string][]).map(([l, v, tone]) => (
                    <div key={l} className="rounded-lg bg-white px-2.5 py-2
                                            ring-1 ring-kb-ink/[.06]">
                      <p className="text-[11.5px] font-bold text-kb-ink/55">{l}</p>
                      <p className={`text-[16px] font-extrabold
                                     [font-variant-numeric:tabular-nums]
                                     ${tone || 'text-kb-ink'}`}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {r.note && (
            <p className="mt-3 rounded-lg bg-kb-ink/[.04] px-3 py-2.5
                          text-[12.5px] leading-relaxed text-kb-ink/60">
              {r.note}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
