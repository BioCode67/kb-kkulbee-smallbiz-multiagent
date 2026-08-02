'use client';

/**
 * 손익분기 계산기 — "하루 몇 명이 와야 본전인가"
 *
 * 상권 점수는 '자리'를 말해 주지만, 사장님의 진짜 질문은 "그래서 하루
 * 몇 명이면 버티나"입니다. 고정비(월세·인건비·기타)와 객단가·원가율을
 * 넣으면 하루 손익분기 손님 수가 바로 나옵니다.
 *
 * 이 계산기는 답변의 동네·업종 맥락 위에 앉습니다 — 같은 화면의 경쟁
 * 가게 수, 피크 시간대(서울)가 참고선으로 함께 보입니다. 숫자는 전부
 * 사장님이 넣은 값으로만 계산하고, 우리는 공식과 맥락만 제공합니다.
 * 수익을 예측하거나 보장하지 않습니다 — 그건 금소법 이전에 정직의 문제.
 */

import { useState } from 'react';
import type { LocationScore } from '@/lib/types';

const won = (n: number) => n.toLocaleString('ko-KR');

export default function BreakEven({ loc }: { loc: LocationScore }) {
  const [open, setOpen] = useState(false);
  // 기본값은 '입력 예시'일 뿐입니다. 화면에 그렇게 적습니다.
  const [rent, setRent] = useState(2_000_000);
  const [labor, setLabor] = useState(2_200_000);
  const [etc, setEtc] = useState(600_000);
  const [ticket, setTicket] = useState(9_000);
  const [costRate, setCostRate] = useState(35);
  const [days, setDays] = useState(26);

  const fixed = rent + labor + etc;
  const margin = ticket * (1 - costRate / 100);
  const perDay = margin > 0 && days > 0 ? Math.ceil(fixed / margin / days) : 0;
  const perMonth = margin > 0 ? Math.ceil(fixed / margin) : 0;

  const Num = ({ v, set, step, suffix }: {
    v: number; set: (n: number) => void; step: number; suffix: string;
  }) => (
    <span className="flex items-center gap-1">
      <button onClick={() => set(Math.max(0, v - step))}
        className="grid h-7 w-7 place-items-center rounded-lg border
                   border-kb-ink/[.14] text-kb-ink/78 hover:border-kb-yellow">−</button>
      <span className="min-w-[86px] text-center text-[15.5px] font-bold text-kb-ink
                       [font-variant-numeric:tabular-nums]">
        {won(v)}{suffix}
      </span>
      <button onClick={() => set(v + step)}
        className="grid h-7 w-7 place-items-center rounded-lg border
                   border-kb-ink/[.14] text-kb-ink/78 hover:border-kb-yellow">+</button>
    </span>
  );

  return (
    <section className="surface-1 relative overflow-hidden p-5">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]
                                   bg-gradient-to-r from-kb-yellow to-kb-yellow/20" />
      <button onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left">
        <div>
          <h3 className="font-display text-[18px] font-bold text-kb-ink">
            하루 몇 명이면 본전일까
          </h3>
          <p className="mt-0.5 text-[14px] text-kb-ink/68">
            월세·인건비를 넣으면 손익분기 손님 수를 계산해 드립니다
          </p>
        </div>
        <span className="text-[15px] text-kb-ink/55">{open ? '접기 ▲' : '계산해 보기 ▼'}</span>
      </button>

      {open && (
        <div className="mt-4 grid gap-5 md:grid-cols-[1fr_240px]">
          <div className="space-y-3">
            {([
              ['월세', rent, setRent, 100_000, '원'],
              ['인건비(본인 포함)', labor, setLabor, 100_000, '원'],
              ['기타 고정비(공과금·보험 등)', etc, setEtc, 50_000, '원'],
              ['손님 1명 평균 결제액', ticket, setTicket, 500, '원'],
              ['재료비 비율', costRate, setCostRate, 5, '%'],
              ['한 달 영업일', days, setDays, 1, '일'],
            ] as const).map(([label, v, set, step, suffix]) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-[14.5px] text-kb-ink/85">{label}</span>
                <Num v={v} set={set} step={step} suffix={suffix} />
              </div>
            ))}
            <p className="text-[12.5px] leading-relaxed text-kb-ink/55">
              처음 보이는 숫자는 입력 예시일 뿐입니다. 사장님 상황에 맞게
              바꿔 주세요. 계산은 이 화면에서만 하고 어디에도 저장하지 않아요.
            </p>
          </div>

          <div className="flex flex-col justify-center rounded-xl bg-kb-yellow/[.1]
                          px-4 py-5 text-center ring-1 ring-kb-yellow/40">
            <p className="text-[14px] text-kb-ink/78">하루에</p>
            <p className="my-1 text-[40px] font-extrabold leading-none text-kb-ink
                          [font-variant-numeric:tabular-nums]">
              {perDay > 0 ? `${won(perDay)}명` : '—'}
            </p>
            <p className="text-[14px] text-kb-ink/78">
              오시면 본전입니다
              <br />
              <span className="text-[13px] text-kb-ink/62">
                (한 달 {perMonth > 0 ? won(perMonth) : '—'}명 · 고정비 {won(fixed)}원)
              </span>
            </p>
            <div className="mt-3 border-t border-kb-yellow/30 pt-2.5 text-left">
              <p className="text-[12.5px] leading-relaxed text-kb-ink/72">
                참고 — 이 동네 {loc.industry !== '업종 미지정' ? loc.industry : '같은 업종'}
                {loc.same_industry_count != null ? ` ${loc.same_industry_count}곳과 나눠 받게 됩니다` : ''}
                {loc.living_pop ? `. 사람이 가장 많은 시간은 ${loc.living_pop.peak_hour}시예요` : ''}.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
