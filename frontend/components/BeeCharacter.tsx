'use client';

/**
 * 꿀비 — SVG로 그린 마스코트
 *
 * Spline 씬이 준비되기 전에도, 못 불러왔을 때도 이 아이가 자리를 지킵니다.
 * 대비책이라기보다 기본값에 가깝습니다. 3D 파일 하나에 화면의 인상이
 * 통째로 걸려 있으면 시연이 위태롭습니다.
 *
 * 동작 상태에 따라 표정과 움직임이 달라집니다.
 *   fly_happy  — 위아래로 통통 튀고 눈이 웃습니다
 *   thinking   — 천천히 흔들리고 눈이 감깁니다. 물음표가 떠오릅니다
 *   explaining — 살짝 기울여 가리키는 자세
 *
 * 날개는 CSS로 떨게 두었습니다. 초당 여러 번 흔들려야 벌처럼 보이는데,
 * 프레임마다 리액트를 다시 그리게 하면 낭비입니다.
 */

import type { CharacterMotion } from '@/lib/types';

interface Props {
  motion: CharacterMotion;
  /** 픽셀 단위 지름. 히어로에서는 크게, 동행 모드에서는 작게 */
  size?: number;
  className?: string;
}

export default function BeeCharacter({ motion, size = 220, className = '' }: Props) {
  const happy = motion === 'fly_happy';
  const thinking = motion === 'thinking';

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width: size, height: size }}
      aria-label="마스코트 꿀비"
      role="img"
    >
      {/* 바닥 그림자 — 떠 있다는 느낌은 그림자가 만듭니다 */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/40 blur-md"
        style={{
          bottom: size * 0.02,
          width: size * 0.42,
          height: size * 0.07,
          animation: `bee-shadow ${happy ? 1.1 : thinking ? 3.2 : 2.2}s ease-in-out infinite`,
        }}
      />

      {/* 몸통 전체가 떠다닙니다 */}
      <div
        className="absolute inset-0"
        style={{
          animation: `bee-float ${happy ? 1.1 : thinking ? 3.2 : 2.2}s ease-in-out infinite`,
          transformOrigin: '50% 60%',
        }}
      >
        <svg viewBox="0 0 200 200" className="h-full w-full overflow-visible">
          <defs>
            <radialGradient id="bodyG" cx="38%" cy="30%">
              <stop offset="0%" stopColor="#FFE08A" />
              <stop offset="55%" stopColor="#FFBC00" />
              <stop offset="100%" stopColor="#E8A200" />
            </radialGradient>
            <linearGradient id="wingG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity=".78" />
              <stop offset="100%" stopColor="#CFE6FF" stopOpacity=".30" />
            </linearGradient>
            <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.2" />
            </filter>
          </defs>

          {/* 후광 */}
          <circle cx="100" cy="104" r="62" fill="#FFBC00" opacity=".16" filter="url(#soft)" />

          {/* 더듬이 */}
          <g stroke="#3B3028" strokeWidth="3.4" strokeLinecap="round" fill="none">
            <path d="M84 52 C 78 36, 68 30, 62 28" />
            <path d="M116 52 C 122 36, 132 30, 138 28" />
          </g>
          <circle cx="61" cy="27" r="6" fill="#3B3028" />
          <circle cx="139" cy="27" r="6" fill="#3B3028" />

          {/* 날개 — 떨림은 CSS가 맡습니다 */}
          <g style={{ transformOrigin: '78px 78px', animation: 'wing-l .16s ease-in-out infinite alternate' }}>
            <ellipse cx="52" cy="72" rx="34" ry="21" fill="url(#wingG)"
                     transform="rotate(-26 52 72)" />
          </g>
          <g style={{ transformOrigin: '122px 78px', animation: 'wing-r .16s ease-in-out infinite alternate' }}>
            <ellipse cx="148" cy="72" rx="34" ry="21" fill="url(#wingG)"
                     transform="rotate(26 148 72)" />
          </g>

          {/* 몸통 */}
          <ellipse cx="100" cy="106" rx="56" ry="52" fill="url(#bodyG)" />

          {/* 줄무늬 — 몸통 곡률을 따라 휘어야 붙어 보입니다 */}
          <g fill="#3B3028" opacity=".92">
            <path d="M62 122 Q100 134 138 122 L138 133 Q100 145 62 133 Z" />
            <path d="M70 146 Q100 156 130 146 L128 154 Q100 163 72 154 Z" />
          </g>

          {/* 눈 */}
          {thinking ? (
            <g stroke="#2A211B" strokeWidth="4.5" strokeLinecap="round" fill="none">
              <path d="M74 96 q10 7 20 0" />
              <path d="M106 96 q10 7 20 0" />
            </g>
          ) : (
            <>
              <ellipse cx="84" cy="96" rx="8" ry={happy ? 9 : 8.5} fill="#2A211B" />
              <ellipse cx="116" cy="96" rx="8" ry={happy ? 9 : 8.5} fill="#2A211B" />
              <circle cx="87" cy="93" r="2.8" fill="#fff" />
              <circle cx="119" cy="93" r="2.8" fill="#fff" />
            </>
          )}

          {/* 볼 */}
          <ellipse cx="66" cy="112" rx="9" ry="6" fill="#FF8A65" opacity=".38" />
          <ellipse cx="134" cy="112" rx="9" ry="6" fill="#FF8A65" opacity=".38" />

          {/* 입 */}
          <path
            d={happy ? 'M88 114 q12 12 24 0' : 'M92 115 q8 6 16 0'}
            stroke="#2A211B" strokeWidth="3.4" fill="none" strokeLinecap="round"
          />

          {/* 생각 중일 때 떠오르는 물음표 */}
          {thinking && (
            <g style={{ animation: 'q-pop 2.4s ease-in-out infinite' }}>
              <circle cx="156" cy="46" r="15" fill="#fff" opacity=".93" />
              <text x="156" y="53" textAnchor="middle" fontSize="20"
                    fontWeight="800" fill="#544438">?</text>
            </g>
          )}
        </svg>
      </div>

      <style jsx>{`
        @keyframes bee-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(${happy ? -14 : thinking ? -5 : -8}px)
                           rotate(${motion === 'explaining' ? -4 : 0}deg); }
        }
        @keyframes bee-shadow {
          0%, 100% { transform: translateX(-50%) scaleX(1); opacity: .4; }
          50% { transform: translateX(-50%) scaleX(${happy ? 0.72 : 0.85}); opacity: .22; }
        }
        @keyframes q-pop {
          0%, 60%, 100% { opacity: 0; transform: translateY(6px); }
          20%, 45% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
