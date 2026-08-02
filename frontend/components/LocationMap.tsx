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
import KakaoMap from './KakaoMap';

// 카카오 키가 있으면 카카오 판, 없으면 Leaflet 판 — 같은 데이터입니다.
const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? '';
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

export default function LocationMap(props: Props) {
  const [kakaoFailed, setKakaoFailed] = useState(false);
  if (KAKAO_KEY && !kakaoFailed) {
    return <KakaoMap {...props} onFallback={() => setKakaoFailed(true)} />;
  }
  return <LeafletMap {...props} />;
}

function LeafletMap({
  pins, dongCode, industryCode, industry, sameIndustryCount,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  const [shops, setShops] = useState<{ total: number; shown: number } | null>(null);
  // 점 ↔ 열지도. 점은 "한 곳 한 곳이 어디"를, 열지도는 "어디가 뜨거운가"를
  // 보여 줍니다. 점포가 수백 개면 점만으로는 밀집의 정도가 안 읽힙니다.
  const [heat, setHeat] = useState(false);
  // 시네마틱 투어 — 지도를 보면서 설명을 '듣는' 경험.
  // 카메라가 단계별로 움직이고, 각 단계의 캡션을 꿀비가 읽어 줍니다.
  const [tourStep, setTourStep] = useState<string | null>(null);
  const [touring, setTouring] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);
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
        // 전국 뷰에서 시작해 그 동네로 '날아 들어갑니다'. 어디쯤인지가
        // 몸으로 먼저 이해되고, 화면이 살아 있다는 첫인상을 만듭니다.
        center: [36.4, 127.8],
        zoom: 7,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false,
      });
      mapRef.current = map as unknown as { remove: () => void };
      mapObjRef.current = map;

      // 밝은 타일 — 크림 테마와 한 몸처럼 이어집니다.
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
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

      // 도착 비행 — 전국 → 이 동네. 이후 투어가 이어받습니다.
      map.flyTo([target.latitude, target.longitude], 15,
                { duration: 2.2, easeLinearity: 0.2 });
    })();

    return () => {
      disposed = true;
      heatRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pins, dongCode, industryCode]);

  // ── 시네마틱 투어 ────────────────────────────────────────────────
  const speak = (t: string) => {
    if (!speakOn || typeof speechSynthesis === 'undefined') return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'ko-KR'; u.rate = 1.05;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  };

  const runTour = async () => {
    type FlyMap = { flyTo: (c: [number, number], z: number, o?: object) => void;
                    flyToBounds: (b: [number, number][], o?: object) => void };
    const map = mapObjRef.current as FlyMap | null;
    const target = pins.find((p) => p.is_target) ?? pins[0];
    if (!map || !target || touring) return;
    setTouring(true);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = (label: string) => { setTourStep(label); speak(label); };

    try {
      step(`${target.name}입니다`);
      map.flyTo([target.latitude, target.longitude], 15, { duration: 1.6 });
      await wait(2600);

      if (shops && shops.total > 0) {
        step(`주황 점 하나가 실제 ${industry ?? '동종업종'} 한 곳 — 모두 ${shops.total}곳입니다`);
        map.flyTo([target.latitude, target.longitude], 16, { duration: 1.2 });
        await wait(3000);

        step('열지도로 보면 경쟁이 몰린 골목이 드러납니다');
        setHeat(true);
        await wait(3200);
        setHeat(false);
      }

      if (pins.length > 1) {
        step('옆 동네와 나란히 놓고 봐야 이 점수의 높낮이가 읽힙니다');
        map.flyToBounds(pins.map((p) => [p.latitude, p.longitude] as [number, number]),
                        { padding: [40, 40], duration: 1.6 });
        await wait(3400);
      }

      step('구석구석은 마우스로 직접 움직여 보세요');
      await wait(2200);
    } finally {
      setTourStep(null); setTouring(false);
    }
  };

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
          className="h-[380px] w-full overflow-hidden rounded-xl ring-1 ring-kb-ink/[.1]"
        />
        {/* 투어 캡션 — 지도 아래쪽 자막 */}
        {tourStep && (
          <div className="absolute bottom-3 left-1/2 z-[600] w-[88%] max-w-[420px]
                          -translate-x-1/2 rounded-xl bg-kb-ink/85 px-4 py-2.5
                          text-center text-[12.5px] font-medium text-white
                          shadow-lg backdrop-blur">
            {tourStep}
          </div>
        )}
        <div className="absolute left-2.5 top-2.5 z-[500] flex gap-1.5">
          <button onClick={runTour} disabled={touring}
            className="rounded-lg bg-kb-yellow px-3 py-1.5 text-[11.5px] font-bold
                       text-kb-ink shadow transition hover:brightness-105
                       disabled:opacity-60">
            {touring ? '투어 중…' : '▶ 지도 투어'}
          </button>
          <button onClick={() => setSpeakOn((v) => !v)}
            title="설명을 소리로"
            className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold shadow
                        transition ${speakOn
              ? 'bg-white text-kb-ink' : 'bg-white/70 text-kb-ink/50'}`}>
            {speakOn ? '🔊' : '🔇'}
          </button>
        </div>
        {shops && shops.total > 0 && (
          <div className="absolute right-2.5 top-2.5 z-[500] flex overflow-hidden
                          rounded-lg ring-1 ring-kb-ink/[.14]">
            {([['점', false], ['열지도', true]] as const).map(([label, v]) => (
              <button key={label}
                onClick={() => setHeat(v)}
                className={`px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  heat === v
                    ? 'bg-kb-yellow text-kb-ink'
                    : 'bg-white/90 text-kb-ink/70 hover:text-kb-ink'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 색이 무엇을 뜻하는지 밝히지 않으면 지도가 장식이 됩니다 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5
                      text-[11px] text-kb-ink/60">
        {shops && shops.total > 0 && (
          <span className="inline-flex items-center gap-1.5 font-medium text-kb-ink/80">
            <i className="h-2 w-2 rounded-full" style={{ background: '#FF7A59' }} />
            {industry ?? '동종업종'} {shops.total.toLocaleString()}곳
            {shops.shown < shops.total && (
              <span className="text-kb-ink/50">
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
        <p className="mt-2 text-[11.5px] leading-relaxed text-kb-ink/60">
          주황 점 하나가 실제 {industry ?? '동종업종'} 점포 한 곳입니다.
          몰려 있는 골목이 보이면 그곳이 이 동네의 경쟁 중심입니다.
        </p>
      )}
    </div>
  );
}
