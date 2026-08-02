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
import SavedDrawer from './SavedDrawer';
import { loadSaved, onSavedChange } from '@/lib/saved';

interface Sources {
  market?: { stores?: number; dongs_kept?: number; source?: string; source_url?: string };
  policy?: { docs?: number; source?: string; collected_at?: string };
}

export default function TopBar() {
  const [src, setSrc] = useState<Sources | null>(null);
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedN, setSavedN] = useState(0);

  useEffect(() => {
    const load = () => setSavedN(loadSaved().length);
    load();
    return onSavedChange(load);
  }, []);

  useEffect(() => {
    fetch('/api/v1/sources')
      .then((r) => (r.ok ? r.json() : null))
      .then(setSrc)
      .catch(() => {/* 출처를 못 받아도 화면은 떠야 합니다 */});
  }, []);

  const stores = src?.market?.stores;
  const docs = src?.policy?.docs;

  return (
    <header className="sticky top-0 z-40 border-b border-kb-ink/[.1]
                       bg-kb-cream/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center px-5 lg:px-8">
        <a href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kkulbee.svg" alt="" width={24} height={28} className="shrink-0" />
          <span className="text-[15px] font-bold tracking-tight text-kb-ink">꿀비</span>
        </a>

        {/* 가운데 링크 — v0 네비의 문법. 링크는 셋이면 충분합니다. */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1
                        md:flex">
          <button onClick={() => setOpen((v) => !v)}
                  className="rounded-lg px-3 py-1.5 text-[13px] text-kb-ink/65
                             transition hover:text-kb-ink">
            데이터 출처
          </button>
          <button onClick={() => setDrawer(true)}
                  className="rounded-lg px-3 py-1.5 text-[13px] text-kb-ink/65
                             transition hover:text-kb-ink">
            소비자 보호
          </button>
          <a href="https://github.com/BioCode67/kb-kkulbee-smallbiz-multiagent"
             target="_blank" rel="noreferrer"
             className="rounded-lg px-3 py-1.5 text-[13px] text-kb-ink/65
                        transition hover:text-kb-ink">
            GitHub
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {/* 찜한 공고 — 담긴 게 있을 때만 숫자를 보입니다 */}
          <button onClick={() => setSavedOpen(true)}
                  title="찜한 지원사업 — 마감 가까운 순"
                  className="relative rounded-lg px-2 py-1.5 text-[15px] text-kb-ink/55
                             transition hover:text-kb-amber">
            ☆
            {savedN > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4
                               place-items-center rounded-full bg-kb-yellow px-1
                               text-[9.5px] font-bold text-kb-ink">
                {savedN}
              </span>
            )}
          </button>
          {stores && docs && (
            <span className="hidden items-center gap-1.5 text-[11.5px] text-kb-ink/55
                             lg:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {(stores / 10000).toFixed(0)}만 점포 · {docs}건 실측
            </span>
          )}
          {/* 주 CTA — 입력창으로 데려갑니다 */}
          <button
            onClick={() => document.querySelector<HTMLInputElement>('input')?.focus()}
            className="rounded-full bg-kb-yellow px-4 py-1.5 text-[13px] font-bold
                       text-kb-ink transition hover:brightness-105"
          >
            물어보기
          </button>
        </div>
      </div>

      {open && src && (
        <div className="mx-auto max-w-[1240px] px-5 pb-4 lg:px-8">
          <div className="surface-1 grid gap-3 p-4 text-[12px] sm:grid-cols-2">
            <div>
              <p className="font-semibold text-kb-ink/85">상권</p>
              <p className="mt-1 leading-relaxed text-kb-ink/60">
                {src.market?.source}
                <br />
                점포 {src.market?.stores?.toLocaleString()}개 ·
                행정동 {src.market?.dongs_kept?.toLocaleString()}곳
              </p>
              <p className="mt-1.5 text-[11px] text-amber-800">
                유동인구·매출·폐업률은 이 자료에 없어 점수에 넣지 않았습니다.
              </p>
            </div>
            <div>
              <p className="font-semibold text-kb-ink/85">지원사업</p>
              <p className="mt-1 leading-relaxed text-kb-ink/60">
                {src.policy?.source}
                <br />
                공고 {src.policy?.docs}건 · 수집 {src.policy?.collected_at?.slice(0, 10)}
              </p>
              <p className="mt-1.5 text-[11px] text-kb-ink/50">
                추천마다 기업마당 원문 주소를 함께 보내 드립니다.
              </p>
            </div>
          </div>
        </div>
      )}
      <ProtectionDrawer open={drawer} onClose={() => setDrawer(false)} />
      <SavedDrawer open={savedOpen} onClose={() => setSavedOpen(false)} />
    </header>
  );
}
