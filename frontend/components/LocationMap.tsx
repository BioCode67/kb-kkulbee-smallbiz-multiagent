'use client';

/**
 * 상권 지도 — 실제 점포를 찍습니다.
 *
 * 예전에는 비교 상권 다섯 개만 큰 점으로 찍었습니다. "연남동에 카페가
 * 204개 있습니다"라고 말하면서 정작 그 204개가 어디 있는지는 안 보여
 * 줬습니다. 골목 하나에 몰려 있는 것과 동 전체에 흩어져 있는 것은 사장님께
 * 전혀 다른 이야기인데도요.
 *
 * 이제 두 겹으로 그립니다.
 *   ① 동종업종 점포 — 실제 좌표. 경쟁이 어디에 몰려 있는지 눈에 보입니다.
 *   ② 비교 상권 — 옆 동네 점수. 내 자리가 높은지 낮은지 견줄 자입니다.
 *
 * 좌표는 /api/v1/stores가 줍니다. 서버가 272만 개를 메모리에 올리지 않고
 * 그 동네 자리만 파일에서 읽어 옵니다(8KB, 11ms).
 *
 * **지도 제공자에 대해.** 지금은 Leaflet + CARTO 어두운 타일입니다. 키가
 * 필요 없고 어디서든 뜹니다. 국내 상권만 보면 카카오·네이버가 더 상세하고
 * (구글은 지도 데이터 국외반출 규제로 국내 상세도가 낮습니다), 무료 키를
 * 받으면 갈아 끼울 수 있습니다. 점포 좌표는 우리 자료라 어느 지도 위에서도
 * 그대로 찍힙니다 — 제공자를 바꿔도 이 화면의 값어치는 그대로입니다.
 *
 * Leaflet은 import 시점에 window를 만집니다. Next가 서버에서 이 파일을
 * 읽으면 그 자리에서 깨지므로 useEffect 안에서 동적으로 불러옵니다.
 */

import { useEffect, useRef, useState } from 'react';
import type { MapPin } from '@/lib/types';

/** leaflet.heat이 L.heatLayer를 전역 L에 붙입니다. 타입만 선언해 둡니다. */
type HeatLayer = { addTo: (m: unknown) => unknown; remove: () => void };
type LWithHeat = typeof import('leaflet') & {
  heatLayer: (pts: [number, number, number?][], opts?: object) => HeatLayer;
};

interface Props {
  pins: MapPin[];
  dongCode?: string | null;
  industryCode?: string | null;
  industry?: string | null;
  sameIndustryCount?: number | null;
}

/** 점수 → 색. 노랑이 밝을수록 좋은 자리입니다. */
function tone(score: number): { fill: string } {
  if (score >= 72) return { fill: '#FFBC00' };
  if (score >= 58) return { fill: '#FFD35C' };
  if (score >= 45) return { fill: '#B9A88F' };
  return { fill: '#8A7866' };
}

export default function LocationMap({
  pins, dongCode, industryCode, industry, sameIndustryCount,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  const [shops, setShops] = useState<{ total: number; shown: number } | null>(null);
  // 점 ↔ 열지도. 점은 "한 곳 한 곳이 어디"를, 열지도는 "어디가 뜨거운가"를
  // 보여 줍니다. 점포가 수백 개면 점만으로는 밀집의 정도가 안 읽힙니다.
  const [heat, setHeat] = useState(false);
  const heatRef = useRef<HeatLayer | null>(null);
  const pointsRef = useRef<[number, number][]>([]);
  const LRef = useRef<LWithHeat | null>(null);
  const mapObjRef = useRef<unknown>(null);

  useEffect(() => {
    if (!boxRef.current || !pins?.length) return;
    let disposed = false;

    (async () => {
      const L = (await import('leaflet')).default as unknown as LWithHeat;
      // 열지도 플러그인(MIT). L 전역에 heatLayer를 붙입니다.
      await import('leaflet.heat');
      LRef.current = L;
      if (disposed || !boxRef.current) return;

      // 같은 노드에 두 번 붙지 않게 합니다 (StrictMode에서 두 번 돕니다)
      mapRef.current?.remove();

      const target = pins.find((p) => p.is_target) ?? pins[0];
      const map = L.map(boxRef.current, {
        center: [target.latitude, target.longitude],
        zoom: 14,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false,
      });
      mapRef.current = map as unknown as { remove: () => void };
      mapObjRef.current = map;

      // 어두운 타일을 씁니다. 밝은 지도 위에서는 노란 마커가 묻힙니다.
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 19 },
      ).addTo(map);

      // ── ① 동종업종 실제 점포 ────────────────────────────────────────
      //
      // 먼저 그립니다. 뒤에 그리면 비교 상권의 큰 점을 덮어 버립니다.
      let fitted: [number, number][] = [];
      if (dongCode) {
        try {
          const q = new URLSearchParams({ dong: dongCode });
          if (industryCode) q.set('industry', industryCode);
          const r = await fetch(`/api/v1/stores?${q}`);
          if (r.ok && !disposed) {
            const data = await r.json();
            setShops({ total: data.total, shown: data.shown });
            const layer = L.layerGroup().addTo(map);
            (data.points as [number, number][]).forEach(([la, lo]) => {
              L.circleMarker([la, lo], {
                radius: 3.4,
                fillColor: '#FF7A59',
                fillOpacity: 0.72,
                weight: 0,
                // 점이 수백 개라 이벤트를 달면 스크롤이 무거워집니다
                interactive: false,
              }).addTo(layer);
            });
            if (data.points.length) fitted = data.points as [number, number][];
            pointsRef.current = data.points as [number, number][];
          }
        } catch {
          // 점포를 못 받아도 비교 상권 지도는 떠야 합니다
        }
      }

      // ── ② 비교 상권 ────────────────────────────────────────────────
      pins.forEach((p) => {
        const t = tone(p.score);
        const r = p.is_target ? 14 : 9;
        const marker = L.circleMarker([p.latitude, p.longitude], {
          radius: r,
          fillColor: t.fill,
          fillOpacity: p.is_target ? 0.95 : 0.62,
          color: p.is_target ? '#fff' : t.fill,
          weight: p.is_target ? 2.5 : 1,
        }).addTo(map);

        marker.bindTooltip(
          `<b>${p.name}</b><br/>${p.score.toFixed(1)}점 · ${p.grade}등급`,
          { direction: 'top', offset: [0, -r], className: 'kb-tip' },
        );
        if (p.is_target) marker.openTooltip();
      });

      // 점포가 있으면 그 범위에 맞춥니다. 조회한 동네를 꽉 채워 보여 주는
      // 편이, 옆 동네까지 다 들어오게 축소하는 것보다 쓸모 있습니다.
      if (fitted.length > 2) {
        map.fitBounds(fitted, { padding: [26, 26], maxZoom: 16 });
      } else if (pins.length > 1) {
        map.fitBounds(pins.map((p) => [p.latitude, p.longitude] as [number, number]),
                      { padding: [36, 36] });
      }
    })();

    return () => {
      disposed = true;
      heatRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pins, dongCode, industryCode]);

  // 열지도 켜고 끄기 — 지도를 다시 만들지 않고 층만 얹고 뗍니다.
  useEffect(() => {
    const L = LRef.current;
    const map = mapObjRef.current;
    if (!L || !map) return;
    if (heat && pointsRef.current.length) {
      heatRef.current = L.heatLayer(
        pointsRef.current.map(([la, lo]) => [la, lo, 0.55]),
        { radius: 22, blur: 26, maxZoom: 17,
          gradient: { 0.3: '#3b2a12', 0.55: '#8a5a00', 0.75: '#ffbc00', 1: '#fff2c4' } });
      heatRef.current.addTo(map);
    } else {
      heatRef.current?.remove();
      heatRef.current = null;
    }
  }, [heat]);

  return (
    <div className="relative">
      <div className="relative">
        <div
          ref={boxRef}
          className="h-[320px] w-full overflow-hidden rounded-xl ring-1 ring-white/[.08]"
        />
        {shops && shops.total > 0 && (
          <div className="absolute right-2.5 top-2.5 z-[500] flex overflow-hidden
                          rounded-lg ring-1 ring-white/[.14]">
            {([['점', false], ['열지도', true]] as const).map(([label, v]) => (
              <button key={label}
                onClick={() => setHeat(v)}
                className={`px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  heat === v
                    ? 'bg-kb-yellow text-kb-ink'
                    : 'bg-kb-ink/85 text-white/60 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 색이 무엇을 뜻하는지 밝히지 않으면 지도가 장식이 됩니다 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5
                      text-[11px] text-white/45">
        {shops && shops.total > 0 && (
          <span className="inline-flex items-center gap-1.5 font-medium text-white/75">
            <i className="h-2 w-2 rounded-full" style={{ background: '#FF7A59' }} />
            {industry ?? '동종업종'} {shops.total.toLocaleString()}곳
            {shops.shown < shops.total && (
              <span className="text-white/35">
                ({shops.shown.toLocaleString()}곳만 표시)
              </span>
            )}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full ring-2 ring-white"
             style={{ background: '#FFBC00' }} />
          조회한 상권
        </span>
        {[['#FFD35C', '58~72점'], ['#B9A88F', '45~58'], ['#8A7866', '45 미만']]
          .map(([c, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full" style={{ background: c }} />
              {label}
            </span>
          ))}
      </div>

      {shops && shops.total > 0 && sameIndustryCount != null && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-white/50">
          주황 점 하나가 실제 {industry ?? '동종업종'} 점포 한 곳입니다.
          몰려 있는 골목이 보이면 그곳이 이 동네의 경쟁 중심입니다.
        </p>
      )}
    </div>
  );
}
