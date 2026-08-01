'use client';

/**
 * 상권 지도 — Leaflet
 *
 * Leaflet은 import 시점에 window를 만집니다. Next.js가 서버에서 이 파일을
 * 읽으면 그 자리에서 깨지므로, useEffect 안에서 동적으로 불러옵니다.
 *
 * 점수를 색으로 바꿔 찍습니다. 숫자만 늘어놓으면 "72점이 높은 건가"를
 * 알 수 없는데, 옆 동네와 색으로 나란히 놓으면 한눈에 들어옵니다.
 */

import { useEffect, useRef } from 'react';
import type { MapPin } from '@/lib/types';

/** 점수 → 색. 노랑이 밝을수록 좋은 자리입니다. */
function tone(score: number): { fill: string; ring: string } {
  if (score >= 72) return { fill: '#FFBC00', ring: 'rgba(255,188,0,.45)' };
  if (score >= 58) return { fill: '#FFD35C', ring: 'rgba(255,211,92,.35)' };
  if (score >= 45) return { fill: '#B9A88F', ring: 'rgba(185,168,143,.3)' };
  return { fill: '#8A7866', ring: 'rgba(138,120,102,.28)' };
}

export default function LocationMap({ pins }: { pins: MapPin[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!boxRef.current || !pins?.length) return;
    let disposed = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (disposed || !boxRef.current) return;

      // 같은 노드에 두 번 붙지 않게 합니다 (StrictMode에서 두 번 돕니다)
      mapRef.current?.remove();

      const target = pins.find((p) => p.is_target) ?? pins[0];
      const map = L.map(boxRef.current, {
        center: [target.latitude, target.longitude],
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      });
      mapRef.current = map as unknown as { remove: () => void };

      // 어두운 타일을 씁니다. 밝은 지도 위에서는 노란 마커가 묻힙니다.
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 19 },
      ).addTo(map);

      const group: unknown[] = [];
      pins.forEach((p) => {
        const t = tone(p.score);
        const r = p.is_target ? 15 : 10;
        const marker = L.circleMarker([p.latitude, p.longitude], {
          radius: r,
          fillColor: t.fill,
          fillOpacity: p.is_target ? 0.95 : 0.7,
          color: p.is_target ? '#fff' : t.fill,
          weight: p.is_target ? 2.5 : 1,
        }).addTo(map);

        marker.bindTooltip(
          `<b>${p.name}</b><br/>${p.score.toFixed(1)}점 · ${p.grade}등급`,
          { direction: 'top', offset: [0, -r], className: 'kb-tip' },
        );
        if (p.is_target) marker.openTooltip();
        group.push([p.latitude, p.longitude]);
      });

      if (group.length > 1) {
        map.fitBounds(group as [number, number][], { padding: [36, 36] });
      }
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pins]);

  return (
    <div className="relative">
      <div
        ref={boxRef}
        className="h-[260px] w-full overflow-hidden rounded-xl ring-1 ring-white/[.08]"
      />
      {/* 색이 무엇을 뜻하는지 밝히지 않으면 지도가 장식이 됩니다 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1
                      text-[11px] text-white/40">
        {[['#FFBC00', '72점 이상'], ['#FFD35C', '58~72'],
          ['#B9A88F', '45~58'], ['#8A7866', '45 미만']].map(([c, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full" style={{ background: c }} />
            {label}
          </span>
        ))}
        <span className="ml-auto">흰 테두리가 조회하신 상권입니다</span>
      </div>
    </div>
  );
}
