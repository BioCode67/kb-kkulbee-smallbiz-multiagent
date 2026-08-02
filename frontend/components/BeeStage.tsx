'use client';

/**
 * 꿀비 무대 — 3D 씬과 SVG 꿀비를 하나로 묶습니다.
 *
 * Spline 씬이 있으면 그것을, 없으면 SVG 꿀비를 세웁니다. 바깥에서는 어느
 * 쪽인지 신경 쓰지 않아도 되게 감쌌습니다.
 *
 * 말풍선을 함께 둔 이유가 있습니다. 마스코트가 화면 한구석에 서 있기만 하면
 * 장식입니다. 지금 무엇을 하고 있는지, 무엇을 물어봐도 되는지 이 아이가
 * 직접 말해야 안내자가 됩니다.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion as m } from 'framer-motion';
import BeeCharacter3D from './BeeCharacter3D';
import type { CharacterMotion } from '@/lib/types';

const SCENE_URL = process.env.NEXT_PUBLIC_SPLINE_SCENE || '';

interface Props {
  motion: CharacterMotion;
  size: number;
  /** 말풍선에 띄울 말. 비우면 말풍선이 사라집니다 */
  speech?: string;
  className?: string;
}

export default function BeeStage({ motion, size, speech, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<{ emitEvent: (t: string, n: string) => void } | null>(null);
  const [spline, setSpline] = useState(false);

  // 씬 주소가 있을 때만 3D를 시도합니다. 없으면 SVG 꿀비가 기본입니다.
  useEffect(() => {
    if (!SCENE_URL) return;
    let disposed = false;
    let app: { dispose?: () => void } | null = null;

    (async () => {
      try {
        const { Application } = await import('@splinetool/runtime');
        if (disposed || !canvasRef.current) return;
        const inst = new Application(canvasRef.current);
        app = inst as unknown as { dispose?: () => void };
        await inst.load(SCENE_URL);
        if (disposed) return;
        appRef.current = inst as unknown as typeof appRef.current;
        setSpline(true);
      } catch {
        // 씬을 못 불러도 SVG 꿀비가 이미 서 있습니다
      }
    })();

    return () => { disposed = true; app?.dispose?.(); appRef.current = null; };
  }, []);

  useEffect(() => {
    if (!spline || !appRef.current) return;
    try { appRef.current.emitEvent('keyDown', motion); } catch { /* 씬에 없을 수 있음 */ }
  }, [motion, spline]);

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      <AnimatePresence>
        {speech && (
          <m.div
            key={speech}
            initial={{ opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.34, ease: [0.22, 0.9, 0.3, 1] }}
            className="relative z-10 mb-1 max-w-[30ch] rounded-2xl bg-white px-4 py-2.5
                       text-center text-[15px] font-medium leading-relaxed text-kb-brownDeep
                       shadow-[0_10px_30px_rgba(0,0,0,.35)]"
          >
            {speech}
            <span className="absolute -bottom-[7px] left-1/2 h-4 w-4 -translate-x-1/2
                             rotate-45 bg-white" />
          </m.div>
        )}
      </AnimatePresence>

      <div className="relative" style={{ width: size, height: size }}>
        {SCENE_URL && (
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
              spline ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        {!spline && <BeeCharacter3D motion={motion} size={size} />}
      </div>
    </div>
  );
}
