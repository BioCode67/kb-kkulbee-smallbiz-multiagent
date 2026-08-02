'use client';

/**
 * 상단바 — 핵심 기능 다섯만.
 *
 * 처음에는 '데이터 출처·소비자 보호·GitHub'가 이 자리에 있었습니다.
 * 신뢰 정보는 필요하지만 **매일 쓰는 것은 아닙니다** — 그건 푸터의
 * 일이고, 늘 보이는 상단에는 사장님이 실제로 누르는 다섯 갈래만
 * 둡니다. 누르면 그 갈래가 열린 첫 화면으로 갑니다.
 */

import { useEffect, useState } from 'react';
import ProtectionDrawer from './ProtectionDrawer';
import SavedDrawer from './SavedDrawer';
import { loadSaved, onSavedChange } from '@/lib/saved';

/** page.tsx의 MODES 순서 그대로 — 인덱스로 통신합니다 */
const NAV = ['입지 진단', '기회 업종', '자금 찾기', '권리 지키기', '한 번에'];

export default function TopBar() {
  const [stat, setStat] = useState<{ stores?: number; docs?: number }>({});
  const [drawer, setDrawer] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedN, setSavedN] = useState(0);

  useEffect(() => {
    const load = () => setSavedN(loadSaved().length);
    load();
    const offSaved = onSavedChange(load);
    // 푸터 등 다른 곳에서 소비자 보호 도구를 열 수 있게
    const openProtection = () => setDrawer(true);
    window.addEventListener('kkulbee:protection', openProtection);
    fetch('/api/v1/sources')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setStat({ stores: s.market?.stores, docs: s.policy?.docs }))
      .catch(() => {/* 출처를 못 받아도 화면은 떠야 합니다 */});
    return () => {
      offSaved();
      window.removeEventListener('kkulbee:protection', openProtection);
    };
  }, []);

  const go = (i: number) =>
    window.dispatchEvent(new CustomEvent('kkulbee:mode', { detail: i }));

  return (
    <header className="print:hidden sticky top-0 z-40 border-b border-kb-ink/[.1]
                       bg-kb-cream/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center px-5 lg:px-8">
        <a href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kkulbee.svg" alt="" width={24} height={28} className="shrink-0" />
          <span className="text-[17px] font-bold tracking-tight text-kb-ink">꿀비</span>
        </a>

        {/* 핵심 기능 다섯 — 누르면 그 갈래가 선택된 첫 화면으로 */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5
                        md:flex">
          {NAV.map((label, i) => (
            <button key={label} onClick={() => go(i)}
                    className="rounded-lg px-3 py-1.5 text-[15px] text-kb-ink/65
                               transition hover:bg-kb-ink/[.04] hover:text-kb-ink">
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {stat.stores && stat.docs && (
            <span className="hidden items-center gap-1.5 text-[13.5px] text-kb-ink/55
                             lg:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {(stat.stores / 10000).toFixed(0)}만 점포 · {stat.docs}건 실측
            </span>
          )}
          {/* 찜한 공고 — 담긴 게 있을 때만 숫자를 보입니다 */}
          <button onClick={() => setSavedOpen(true)}
                  title="찜한 지원사업 — 마감 가까운 순"
                  className="relative rounded-lg px-2 py-1.5 text-[17px] text-kb-ink/55
                             transition hover:text-kb-amber">
            ☆
            {savedN > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4
                               place-items-center rounded-full bg-kb-yellow px-1
                               text-[10.5px] font-bold text-kb-ink">
                {savedN}
              </span>
            )}
          </button>
          {/* 주 CTA — 입력창으로 데려갑니다 */}
          <button
            onClick={() => document.querySelector<HTMLInputElement>('input')?.focus()}
            className="rounded-full bg-kb-yellow px-4 py-1.5 text-[15px] font-bold
                       text-kb-ink transition hover:brightness-105"
          >
            물어보기
          </button>
        </div>
      </div>

      <ProtectionDrawer open={drawer} onClose={() => setDrawer(false)} />
      <SavedDrawer open={savedOpen} onClose={() => setSavedOpen(false)} />
    </header>
  );
}
