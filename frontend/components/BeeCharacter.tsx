'use client';

/**
 * 꿀비 — 벌 후드를 쓴 3D 마스코트
 *
 * **왜 Spline이 아니라 SVG인가.** 3D 씬 파일 하나에 화면의 첫인상이 통째로
 * 걸려 있으면 시연이 위태롭습니다. 씬은 수 MB이고 외부에서 받아 옵니다.
 * 심사 현장에서 네트워크가 느리면 마스코트가 없는 화면을 보여 주게 됩니다.
 * 그리고 Render 무료 등급 512MB 안에서 굳이 3D 런타임을 얹을 이유도 없습니다.
 *
 * 그래서 입체감을 **그림자와 광택으로** 만듭니다. 방향광 하나를 왼쪽 위에
 * 놓았다고 치고, 밝은 면·어두운 면·바닥 반사광을 그라디언트로 깔았습니다.
 * 여기에 마우스를 따라 몸이 기울고(perspective + rotate) 눈동자가 따라오면
 * 실제로 3D처럼 읽힙니다. 파일 하나 받지 않고, 자바스크립트 몇 줄로 됩니다.
 *
 * 움직임은 셋으로 나눕니다.
 *   fly_happy  — 크게 통통 튀고 눈이 반달, 입이 벌어집니다
 *   thinking   — 천천히 흔들리고 눈이 감기며 물음표가 떠오릅니다
 *   explaining — 살짝 기울여 가리키는 자세, 눈은 뜬 채
 *
 * **프레임마다 리액트를 다시 그리지 않습니다.** 날개 떨림은 CSS가 맡고,
 * 마우스 추적은 ref로 DOM 스타일을 직접 건드립니다. 상태로 관리하면 초당
 * 60번 렌더가 돌아 대화 목록까지 같이 다시 그려집니다.
 */

import { useEffect, useRef } from 'react';
import type { CharacterMotion } from '@/lib/types';

interface Props {
  motion: CharacterMotion;
  /** 픽셀 단위 지름. 히어로에서는 크게, 동행 모드에서는 작게 */
  size?: number;
  /** 마우스를 따라 기울일지. 작게 줄어든 동행 모드에서는 끄는 편이 낫습니다 */
  interactive?: boolean;
  className?: string;
}

export default function BeeCharacter({
  motion, size = 220, interactive = true, className = '',
}: Props) {
  const happy = motion === 'fly_happy';
  const thinking = motion === 'thinking';
  const explaining = motion === 'explaining';

  const tiltRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const lidRef = useRef<SVGGElement>(null);

  // ── 마우스를 따라 기울기 ─────────────────────────────────────────────
  //
  // 화면 전체에서 포인터를 받습니다. 마스코트 위에 올렸을 때만 반응하면
  // 대부분의 시간 동안 굳어 있게 됩니다. 멀리서 움직여도 이쪽을 쳐다보는
  // 편이 살아 있어 보입니다.
  useEffect(() => {
    if (!interactive) return;
    const el = tiltRef.current;
    if (!el) return;

    let raf = 0;
    let tx = 0, ty = 0;      // 목표
    let cx = 0, cy = 0;      // 지금

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
      tx = Math.max(-1, Math.min(1, dx));
      ty = Math.max(-1, Math.min(1, dy));
    };

    const tick = () => {
      // 목표를 향해 천천히 따라갑니다. 곧장 붙이면 마우스에 딱 붙어
      // 기계처럼 보입니다. 0.08씩 좁히면 살짝 늦게 따라오는 무게가 생깁니다.
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;

      el.style.transform =
        `perspective(760px) rotateY(${cx * 13}deg) rotateX(${-cy * 9}deg)`;

      if (eyesRef.current) {
        eyesRef.current.style.transform = `translate(${cx * 4.2}px, ${cy * 3.4}px)`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [interactive]);

  // ── 눈 깜빡임 ────────────────────────────────────────────────────────
  //
  // 일정한 간격으로 깜빡이면 시계처럼 보입니다. 사람은 2~6초 사이 불규칙하게
  // 깜빡이고, 가끔 두 번 연달아 깜빡입니다. 그 불규칙함이 살아 있다는
  // 인상을 만듭니다.
  useEffect(() => {
    if (thinking) return;          // 생각 중에는 이미 눈을 감고 있습니다
    let timer: ReturnType<typeof setTimeout>;

    const blink = () => {
      const lid = lidRef.current;
      if (lid) {
        lid.style.transform = 'scaleY(1)';
        setTimeout(() => { if (lid) lid.style.transform = 'scaleY(0)'; }, 120);
        if (Math.random() < 0.25) {
          setTimeout(() => { if (lid) lid.style.transform = 'scaleY(1)'; }, 260);
          setTimeout(() => { if (lid) lid.style.transform = 'scaleY(0)'; }, 380);
        }
      }
      timer = setTimeout(blink, 2200 + Math.random() * 3800);
    };

    timer = setTimeout(blink, 1200 + Math.random() * 2000);
    return () => clearTimeout(timer);
  }, [thinking]);

  const beat = happy ? 1.05 : thinking ? 3.2 : 2.3;

  // 키프레임은 globals.css에 전역으로 있고, 동작마다 달라지는 값만 CSS
  // 변수로 넣습니다. 상태마다 키프레임을 새로 만들면 규칙이 세 벌이 됩니다.
  const vars = {
    '--bee-rise': `${happy ? -15 : thinking ? -6 : -9}px`,
    '--bee-tilt': `${explaining ? -4 : happy ? 2 : 0}deg`,
    '--bee-shrink': happy ? 0.7 : 0.86,
  } as React.CSSProperties;

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width: size, height: size, ...vars }}
      aria-label="마스코트 꿀비"
      role="img"
    >
      {/* 바닥 그림자 — 떠 있다는 느낌은 그림자가 만듭니다.
          위로 뜰수록 작고 옅어져야 높이가 읽힙니다. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/45 blur-[6px]"
        style={{
          bottom: size * 0.015,
          width: size * 0.40,
          height: size * 0.055,
          animation: `bee-shadow ${beat}s ease-in-out infinite`,
        }}
      />

      <div ref={tiltRef} className="absolute inset-0" style={{ willChange: 'transform' }}>
        <div
          className="absolute inset-0"
          style={{
            animation: `bee-float ${beat}s ease-in-out infinite`,
            transformOrigin: '50% 70%',
          }}
        >
          <svg viewBox="0 0 220 240" className="h-full w-full overflow-visible">
            <defs>
              {/* 후드 — 왼쪽 위에서 빛이 온다고 보고 밝은 면을 그쪽에 둡니다 */}
              <radialGradient id="hoodG" cx="34%" cy="26%" r="78%">
                <stop offset="0%" stopColor="#FFE9A8" />
                <stop offset="42%" stopColor="#FFC62E" />
                <stop offset="100%" stopColor="#E09000" />
              </radialGradient>
              {/* 얼굴 — 후드 안쪽이라 위가 조금 어둡습니다 */}
              <radialGradient id="faceG" cx="46%" cy="62%" r="72%">
                <stop offset="0%" stopColor="#FFF6E7" />
                <stop offset="70%" stopColor="#FBE6C9" />
                <stop offset="100%" stopColor="#EFD0AC" />
              </radialGradient>
              <radialGradient id="bodyG" cx="36%" cy="24%" r="82%">
                <stop offset="0%" stopColor="#FFE297" />
                <stop offset="45%" stopColor="#FFC22E" />
                <stop offset="100%" stopColor="#DC8C00" />
              </radialGradient>
              {/* 어두운 배경에서 반투명 흰색은 그냥 회색으로 읽힙니다.
                  뿌리를 충분히 밝게 잡아야 날개로 보입니다. */}
              <linearGradient id="wingG" x1="0.1" y1="0" x2="0.9" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity=".95" />
                <stop offset="55%" stopColor="#F2F8FF" stopOpacity=".62" />
                <stop offset="100%" stopColor="#DCEBFF" stopOpacity=".28" />
              </linearGradient>
              <radialGradient id="eyeG" cx="38%" cy="32%" r="80%">
                <stop offset="0%" stopColor="#4A3A2E" />
                <stop offset="55%" stopColor="#241A13" />
                <stop offset="100%" stopColor="#120C08" />
              </radialGradient>
              <radialGradient id="blushG" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FF8E86" stopOpacity=".62" />
                <stop offset="100%" stopColor="#FF8E86" stopOpacity="0" />
              </radialGradient>
              <filter id="glow" x="-45%" y="-45%" width="190%" height="190%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
              {/* 후드 줄무늬가 얼굴 위로 넘어가지 않게 잘라 냅니다 */}
              <clipPath id="hoodClip">
                <ellipse cx="110" cy="86" rx="72" ry="70" />
              </clipPath>
              <clipPath id="bodyClip">
                <ellipse cx="110" cy="186" rx="46" ry="42" />
              </clipPath>
            </defs>

            {/* 후광 */}
            <ellipse cx="110" cy="120" rx="86" ry="94" fill="#FFC22E"
                     opacity=".14" filter="url(#glow)" />

            {/* ── 더듬이 ─────────────────────────────────────────────── */}
            <g style={{ transformOrigin: '110px 40px',
                        animation: `antenna ${beat * 1.6}s ease-in-out infinite` }}>
              <g stroke="#2A1E16" strokeWidth="4" strokeLinecap="round" fill="none">
                <path d="M88 34 C 80 16, 70 8, 63 5" />
                <path d="M132 34 C 140 16, 150 8, 157 5" />
              </g>
              <circle cx="62" cy="4" r="8.5" fill="#2A1E16" />
              <circle cx="158" cy="4" r="8.5" fill="#2A1E16" />
              <circle cx="59.5" cy="1.5" r="2.6" fill="#fff" opacity=".45" />
              <circle cx="155.5" cy="1.5" r="2.6" fill="#fff" opacity=".45" />
            </g>

            {/* ── 날개 ───────────────────────────────────────────────── */}
            {/* 머리와 몸이 만나는 자리에 답니다. 옆구리에 붙이면 팔처럼,
                아래로 내리면 노처럼 보입니다. */}
            <g style={{ transformOrigin: '84px 150px',
                        animation: 'wing-l .13s ease-in-out infinite alternate' }}>
              <g transform="rotate(-34 84 150)">
                <ellipse cx="60" cy="150" rx="27" ry="13" fill="url(#wingG)"
                         stroke="#fff" strokeOpacity=".8" strokeWidth="1.3" />
                <g stroke="#fff" strokeOpacity=".5" strokeWidth=".9" fill="none">
                  <path d="M38 150 Q58 143 84 148" />
                  <path d="M38 150 Q58 157 84 152" />
                </g>
              </g>
            </g>
            <g style={{ transformOrigin: '136px 150px',
                        animation: 'wing-r .13s ease-in-out infinite alternate' }}>
              <g transform="rotate(34 136 150)">
                <ellipse cx="160" cy="150" rx="27" ry="13" fill="url(#wingG)"
                         stroke="#fff" strokeOpacity=".8" strokeWidth="1.3" />
                <g stroke="#fff" strokeOpacity=".5" strokeWidth=".9" fill="none">
                  <path d="M182 150 Q162 143 136 148" />
                  <path d="M182 150 Q162 157 136 152" />
                </g>
              </g>
            </g>

            {/* ── 몸통 ───────────────────────────────────────────────── */}
            <ellipse cx="110" cy="186" rx="46" ry="42" fill="url(#bodyG)" />
            <g clipPath="url(#bodyClip)" fill="#33251A">
              <path d="M58 168 Q110 180 162 168 L162 182 Q110 194 58 182 Z" opacity=".95" />
              <path d="M62 200 Q110 212 158 200 L158 214 Q110 226 62 214 Z" opacity=".95" />
            </g>
            {/* 몸통 아래 반사광 — 바닥에서 튕겨 올라온 빛. 이게 있어야
                아래가 새까맣게 죽지 않고 둥글게 읽힙니다. */}
            <ellipse cx="110" cy="216" rx="30" ry="8" fill="#FFD97A" opacity=".2" />

            {/* 팔·다리 */}
            <g fill="#2A1E16">
              <ellipse cx="66" cy="184" rx="9" ry="13" transform="rotate(-18 66 184)" />
              <ellipse cx="154" cy="184" rx="9" ry="13" transform="rotate(18 154 184)" />
              <ellipse cx="94" cy="228" rx="11" ry="8" />
              <ellipse cx="126" cy="228" rx="11" ry="8" />
            </g>

            {/* ── 머리(후드) ─────────────────────────────────────────── */}
            <ellipse cx="110" cy="86" rx="72" ry="70" fill="url(#hoodG)" />
            <g clipPath="url(#hoodClip)" fill="#33251A" opacity=".95">
              {/* 줄무늬는 구면을 따라 휘어야 붙어 보입니다. 직선으로 그으면
                  머리에 테이프를 붙인 것처럼 떠 보입니다. */}
              <path d="M38 34 Q60 18 96 14 L104 26 Q66 32 48 50 Z" />
              <path d="M38 74 Q54 60 78 54 L82 68 Q58 76 44 90 Z" />
              <path d="M42 112 Q56 102 74 98 L78 110 Q60 118 50 128 Z" />
            </g>
            {/* 후드 광택 */}
            <ellipse cx="76" cy="44" rx="26" ry="16" fill="#fff" opacity=".26"
                     transform="rotate(-24 76 44)" />

            {/* ── 얼굴 ───────────────────────────────────────────────── */}
            <ellipse cx="118" cy="92" rx="52" ry="50" fill="url(#faceG)" />
            {/* 후드가 얼굴 위로 드리우는 그늘 */}
            <path d="M66 92 A52 50 0 0 1 170 92 L170 74 A52 50 0 0 0 66 74 Z"
                  fill="#C8A882" opacity=".22" />

            {/* 앞머리 한 가닥. 타원으로 두었더니 이마에 검은 덩어리가
                떠 있는 것처럼 보였습니다. 끝이 가늘어져야 머리카락이 됩니다. */}
            <path d="M104 52 Q114 40 128 44 Q138 47 141 54 Q132 48 122 50 Q112 52 104 52 Z"
                  fill="#2A1E16" />

            {/* ── 눈 ─────────────────────────────────────────────────── */}
            <g ref={eyesRef} style={{ transition: 'transform .05s linear' }}>
              {thinking ? (
                <g stroke="#241A13" strokeWidth="5" strokeLinecap="round" fill="none">
                  <path d="M88 92 q12 9 24 0" />
                  <path d="M128 92 q12 9 24 0" />
                </g>
              ) : (
                <>
                  {/* 큰 눈 두 개. 광택점을 둘 이상 찍어야 유리알처럼 보입니다 —
                      하나만 찍으면 납작한 스티커가 됩니다. */}
                  {[100, 140].map((x) => (
                    <g key={x}>
                      <ellipse cx={x} cy={94} rx="17" ry={happy ? 19 : 18} fill="url(#eyeG)" />
                      <circle cx={x - 5} cy={87} r="6.4" fill="#fff" opacity=".95" />
                      <circle cx={x + 6} cy={99} r="3" fill="#fff" opacity=".55" />
                      <ellipse cx={x} cy={106} rx="8" ry="3.4" fill="#C79A6E" opacity=".45" />
                    </g>
                  ))}
                  {/* 눈꺼풀 — 깜빡임은 이 사각형을 위에서 아래로 눌러 만듭니다.
                      눈을 지웠다 그리면 리액트가 다시 그려야 하지만, 이러면
                      CSS transform 하나로 끝납니다. */}
                  <g ref={lidRef}
                     style={{ transformOrigin: '120px 76px', transform: 'scaleY(0)',
                              transition: 'transform .07s ease-out' }}>
                    <rect x="78" y="72" width="84" height="34" fill="url(#faceG)" />
                  </g>
                </>
              )}
            </g>

            {/* 볼터치 */}
            <ellipse cx="84" cy="112" rx="13" ry="9" fill="url(#blushG)" />
            <ellipse cx="156" cy="112" rx="13" ry="9" fill="url(#blushG)" />

            {/* ── 입 ─────────────────────────────────────────────────── */}
            {happy ? (
              <g>
                <path d="M108 112 q16 24 33 2 q-17 10 -33 -2 Z" fill="#B0453E" />
                <path d="M114 120 q12 10 22 1 q-11 5 -22 -1 Z" fill="#FF8D84" />
              </g>
            ) : explaining ? (
              <path d="M114 114 q12 11 22 1" stroke="#241A13" strokeWidth="4"
                    fill="none" strokeLinecap="round" />
            ) : (
              <ellipse cx="124" cy="116" rx="7" ry="5.5" fill="#B0453E" />
            )}

            {/* 생각 중일 때 떠오르는 물음표 */}
            {thinking && (
              <g style={{ animation: 'q-pop 2.4s ease-in-out infinite' }}>
                <circle cx="186" cy="30" r="16" fill="#fff" opacity=".95" />
                <text x="186" y="38" textAnchor="middle" fontSize="22"
                      fontWeight="800" fill="#544438">?</text>
              </g>
            )}
          </svg>
        </div>
      </div>

    </div>
  );
}
