'use client';

/**
 * 상단바 — 이 화면이 무엇인지, 숫자가 어디서 왔는지를 늘 보이는 자리에.
 *
 * 처음에는 상단바가 없었습니다. 그러니 화면이 데모처럼 보였습니다. 서비스는
 * 어디서든 "지금 무엇을 쓰고 있는지"와 "이 숫자를 믿어도 되는지"를 알 수
 * 있어야 합니다. 심사위원이 스크롤을 어디까지 내렸든 출처가 한 번의 클릭
 * 안에 있어야 합니다.
 */

import { useEffect, useState } from 'react';
import ProtectionDrawer from './ProtectionDrawer';

interface Sources {
  market?: { stores?: number; dongs_kept?: number; source?: string; source_url?: string };
  policy?: { docs?: number; source?: string; collected_at?: string };
}

export default function TopBar() {
  const [src, setSrc] = useState<Sources | null>(null);
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    fetch('/api/v1/sources')
      .then((r) => (r.ok ? r.json() : null))
      .then(setSrc)
      .catch(() => {/* 출처를 못 받아도 화면은 떠야 합니다 */});
  }, []);

  const stores = src?.market?.stores;
  const docs = src?.policy?.docs;

  return (
    <header className="sticky top-0 z-40 border-b border-white/[.06]
                       bg-kb-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-5 lg:px-8">
        <a href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kkulbee.svg" alt="" width={26} height={30} className="shrink-0" />
          <span className="text-[15px] font-extrabold tracking-tight text-white">꿀비</span>
          <span className="hidden text-[12px] text-white/40 sm:inline">
            사장님 곁의 AI 비서
          </span>
        </a>

        <div className="ml-auto flex items-center gap-2">
          {stores && docs && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="hidden items-center gap-2 rounded-full bg-white/[.06] px-3 py-1.5
                         text-[11.5px] text-white/60 ring-1 ring-white/[.09] transition
                         hover:bg-white/[.11] hover:text-white md:flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              실측 자료 {(stores / 10000).toFixed(0)}만 점포 · 공고 {docs}건
              <span className="text-white/30">{open ? '▲' : '▼'}</span>
            </button>
          )}
          {/* Pick 4를 직접 눌러 볼 자리 — 용어 사전과 진짜 가드레일 검사기 */}
          <button
            onClick={() => setDrawer(true)}
            className="rounded-full bg-white/[.06] px-3 py-1.5 text-[11.5px]
                       text-white/60 ring-1 ring-white/[.09] transition
                       hover:bg-white/[.11] hover:text-white"
          >
            🛡 소비자 보호
          </button>
          <a
            href="https://github.com/BioCode67/kb-kkulbee-smallbiz-multiagent"
            target="_blank" rel="noreferrer"
            className="rounded-full px-3 py-1.5 text-[11.5px] text-white/45
                       transition hover:text-white"
          >
            소스코드
          </a>
        </div>
      </div>

      {open && src && (
        <div className="mx-auto max-w-[1240px] px-5 pb-4 lg:px-8">
          <div className="surface-1 grid gap-3 p-4 text-[12px] sm:grid-cols-2">
            <div>
              <p className="font-semibold text-white/80">상권</p>
              <p className="mt-1 leading-relaxed text-white/45">
                {src.market?.source}
                <br />
                점포 {src.market?.stores?.toLocaleString()}개 ·
                행정동 {src.market?.dongs_kept?.toLocaleString()}곳
              </p>
              <p className="mt-1.5 text-[11px] text-amber-200/60">
                유동인구·매출·폐업률은 이 자료에 없어 점수에 넣지 않았습니다.
              </p>
            </div>
            <div>
              <p className="font-semibold text-white/80">지원사업</p>
              <p className="mt-1 leading-relaxed text-white/45">
                {src.policy?.source}
                <br />
                공고 {src.policy?.docs}건 · 수집 {src.policy?.collected_at?.slice(0, 10)}
              </p>
              <p className="mt-1.5 text-[11px] text-white/35">
                추천마다 기업마당 원문 주소를 함께 보내 드립니다.
              </p>
            </div>
          </div>
        </div>
      )}
      <ProtectionDrawer open={drawer} onClose={() => setDrawer(false)} />
    </header>
  );
}
