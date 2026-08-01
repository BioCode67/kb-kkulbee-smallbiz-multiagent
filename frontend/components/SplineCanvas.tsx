'use client';

/**
 * 3D 꿀비 — Spline 씬을 직접 띄웁니다.
 *
 * @splinetool/react-spline 대신 runtime을 useEffect 안에서 직접 씁니다.
 * 이유가 둘입니다.
 *
 *   하나. React 래퍼는 서버에서 한 번 그려 보려다 window가 없어 깨집니다.
 *         useEffect 안이면 브라우저에서만 돌아 하이드레이션과 부딪히지
 *         않습니다.
 *   둘.   Application 객체를 직접 쥐고 있어야 emitEvent로 애니메이션 상태를
 *         바꿀 수 있습니다. 래퍼를 거치면 그 손잡이가 가려집니다.
 *
 * 씬 파일이 없을 때도 화면이 비지 않아야 합니다. 심사 시연 도중 네트워크가
 * 막히거나 파일이 빠져 있으면 마스코트 자리가 통째로 비는데, 그러면 서비스가
 * 고장 난 것처럼 보입니다. 그래서 CSS로 그린 꿀비를 대비책으로 둡니다.
 */

import { useEffect, useRef, useState } from 'react';
import type { CharacterMotion } from '@/lib/types';

/** 씬 URL. public/bee.splinecode 를 두거나 환경변수로 넘깁니다. */
const SCENE_URL =
  process.env.NEXT_PUBLIC_SPLINE_SCENE || '/bee.splinecode';

interface Props {
  motion: CharacterMotion;
  className?: string;
}

export default function SplineCanvas({ motion, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<{ emitEvent: (t: string, n: string) => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let app: { dispose?: () => void } | null = null;

    (async () => {
      try {
        const { Application } = await import('@splinetool/runtime');
        if (disposed || !canvasRef.current) return;

        const instance = new Application(canvasRef.current);
        app = instance as unknown as { dispose?: () => void };
        await instance.load(SCENE_URL);
        if (disposed) return;

        appRef.current = instance as unknown as typeof appRef.current;
        setReady(true);
      } catch {
        // 씬을 못 불러도 화면은 살아야 합니다. 아래 CSS 꿀비로 넘어갑니다.
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      app?.dispose?.();
      appRef.current = null;
    };
  }, []);

  /** 동작 상태가 바뀔 때마다 씬에 알립니다. */
  useEffect(() => {
    if (!ready || !appRef.current) return;
    try {
      appRef.current.emitEvent('keyDown', motion);
    } catch {
      // 씬에 해당 이벤트가 없을 수 있습니다. 조용히 넘어갑니다.
    }
  }, [motion, ready]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className={`h-full w-full transition-opacity duration-500 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
        aria-label="3D 마스코트 꿀비"
      />
      {!ready && <FallbackBee motion={motion} failed={failed} />}
    </div>
  );
}

/**
 * 씬이 없을 때 대신 서는 꿀비.
 *
 * 로딩 중에도 이걸 보여 줍니다. 빈 사각형보다 낫고, 동작 상태에 따라
 * 움직임이 달라져 3D가 붙었을 때와 같은 언어를 씁니다.
 */
function FallbackBee({ motion, failed }: { motion: CharacterMotion; failed: boolean }) {
  const anim =
    motion === 'fly_happy' ? 'animate-[rise_.6s_ease-out] translate-y-0'
    : motion === 'thinking' ? 'opacity-80'
    : '';

  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className={`relative transition-all duration-500 ${anim}`}>
        {/* 날갯짓 — 생각 중일 때만 천천히 */}
        <div
          className="absolute -top-2 left-1/2 h-10 w-16 -translate-x-1/2 rounded-full
                     bg-white/25 blur-[2px]"
          style={{
            animation: motion === 'thinking'
              ? 'pulse 2.4s ease-in-out infinite'
              : 'pulse 0.6s ease-in-out infinite',
          }}
        />
        {/* 몸통 */}
        <div className="relative h-20 w-20 rounded-full bg-kb-yellow shadow-glow">
          <div className="absolute inset-x-0 top-6 h-2.5 bg-kb-brown/[.85]" />
          <div className="absolute inset-x-0 top-11 h-2.5 bg-kb-brown/[.85]" />
          {/* 눈 */}
          <div className="absolute left-4 top-3 h-2.5 w-2.5 rounded-full bg-kb-ink" />
          <div className="absolute right-4 top-3 h-2.5 w-2.5 rounded-full bg-kb-ink" />
        </div>
        {/* 상태 말풍선 */}
        <p className="mt-3 text-center text-[11px] tracking-wide text-white/[.55]">
          {failed ? '꿀비 (2D)' :
            motion === 'thinking' ? '생각하는 중…' :
            motion === 'fly_happy' ? '좋은 소식이에요!' : '설명해 드릴게요'}
        </p>
      </div>
    </div>
  );
}
