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

/** page.tsx의 MODES와 이름·순서 동일(사용자 피드백: 상·하단 통일).
 *  '한 번에'만 상단에서 제외 — 홈 배너에 이미 있습니다. */
const NAV = ['입지 진단', '기회 업종', '자금 설계', '권리 지키기', '경기·트렌드'];

export default function TopBar() {
  // 큰글씨 모드 — 소상공인의 큰 축은 중장년입니다. 돋보기 없이 읽히는
  // 것도 접근성입니다. (html[data-big]에 CSS가 반응)
  const [big, setBig] = useState(false);
  useEffect(() => {
    const on = localStorage.getItem('kkulbee:big') === '1';
    setBig(on);
    document.documentElement.toggleAttribute('data-big', on);
  }, []);
  const toggleBig = () => {
    const on = !big;
    setBig(on);
    document.documentElement.toggleAttribute('data-big', on);
    localStorage.setItem('kkulbee:big', on ? '1' : '0');
  };
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
    // 다크 헤더 — 크림색 본문과 확실히 구별됩니다(사용자 피드백).
    // 노란 배지·CTA가 잉크 위에서 제일 잘 삽니다.
    <header className="print:hidden sticky top-0 z-40 border-b border-white/10
                       bg-kb-ink/[.97] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1760px] items-center px-5 lg:px-12">
        {/* 로고 — KB 노랑 배지 + 꿀비 워드마크. 좁은 배지 안 꿀벌은
            뭉개져 보였고, 출품작 이름이 KB-kkulbee이니 배지는 KB가
            맞습니다. 클릭은 진짜 첫 화면으로(지난 상담 복원에 덮이지 않게
            리로드 대신 이벤트로). */}
        <a href="/" className="group flex items-center gap-2.5"
           onClick={(e) => {
             e.preventDefault();
             window.dispatchEvent(new CustomEvent('kkulbee:home'));
           }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kb-badge.svg" alt="" width={36} height={36}
               className="shrink-0 rounded-[10px]
                          shadow-[0_6px_14px_-4px_rgba(224,144,0,.5)]
                          transition group-hover:scale-105" />
          <span className="leading-none">
            <span className="block text-[19px] font-black tracking-[-0.02em] text-white">
              꿀비
            </span>
            <span className="mt-[3px] block text-[10px] font-bold tracking-[0.02em]
                             text-kb-amber">
              사장님 곁의 AI
            </span>
          </span>
        </a>

        {/* 핵심 기능 다섯 — 누르면 그 갈래가 선택된 첫 화면으로 */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5
                        md:flex">
          {NAV.map((label, i) => (
            <button key={label} onClick={() => go(i)}
                    className="rounded-lg px-3 py-1.5 text-[15px] text-white/80
                               transition hover:bg-white/[.08] hover:text-kb-yellow">
              {label}
            </button>
          ))}

        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {stat.stores && stat.docs && (
            <span className="hidden items-center gap-1.5 text-[13.5px] text-white/65
                             lg:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {(stat.stores / 10000).toFixed(0)}만 점포 · {stat.docs}건 실측
            </span>
          )}
          {/* 큰글씨 — 누르면 화면 전체가 한 단계 커집니다 */}
          <button onClick={toggleBig}
                  title={big ? '기본 글씨로' : '큰글씨로 보기'}
                  className={`rounded-lg px-2 py-1 text-[15px] font-bold transition ${
                    big ? 'bg-kb-yellow/[.25] text-kb-yellow'
                        : 'text-white/55 hover:text-white'}`}>
            가+
          </button>
          {/* 금소법 검사기 — 상시 접근은 유지하되 보조 자리로 */}
          <button onClick={() => setDrawer(true)}
                  title="소비자 보호 도구 — 금소법 표현 검사기·쉬운 용어"
                  className="rounded-lg px-2 py-1.5 text-white/70 transition
                             hover:text-kb-yellow">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
                 strokeLinejoin="round" aria-hidden>
              <path d="M12 3.5 5 6v5.2c0 4.3 2.9 7.6 7 9.3 4.1-1.7 7-5 7-9.3V6Z" />
              <path d="m8.8 12 2.2 2.2 4.2-4.4" />
            </svg>
          </button>
          {/* 찜한 공고 — 담긴 게 있을 때만 숫자를 보입니다 */}
          <button onClick={() => setSavedOpen(true)}
                  title="찜한 지원사업 — 마감 가까운 순"
                  className="relative rounded-lg px-2 py-1.5 text-[17px] text-white/70
                             transition hover:text-kb-yellow">
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
