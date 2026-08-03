'use client';

/**
 * 카카오 지도 판 — 같은 데이터, 국내 상세 타일.
 *
 * Leaflet+CARTO 판과 기능이 같습니다(도착 비행·점포 점·비교 상권·투어).
 * 다른 것은 타일뿐입니다 — 건물 이름과 지번이 보이는 국내 지도라, 사장님이
 * "아 저기 스타벅스 옆"을 바로 알아봅니다.
 *
 * NEXT_PUBLIC_KAKAO_MAP_KEY가 있을 때만 이 판이 쓰이고, 없으면 Leaflet
 * 판이 그대로 돕니다. SDK가 못 뜨면(도메인 미등록·차단) Leaflet으로
 * 되돌아갑니다 — 지도가 비는 일은 없어야 합니다.
 *
 * 카카오 SDK는 전역 스크립트라 한 번만 심습니다. autoload=false로 받아
 * kakao.maps.load 콜백에서 시작합니다.
 */

import { useEffect, useRef, useState } from 'react';
import type { MapPin } from '@/lib/types';

const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? '';

interface Props {
  pins: MapPin[];
  dongCode?: string | null;
  industryCode?: string | null;
  industry?: string | null;
  onFallback?: () => void;
}

/* 카카오 SDK 타입 최소 선언 — 전체 타입 패키지는 과합니다 */
type KLatLng = object;
type KMap = { panTo: (c: KLatLng) => void; setLevel: (l: number, o?: object) => void;
              setCenter: (c: KLatLng) => void };
interface KakaoNS {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => KLatLng;
    Map: new (el: HTMLElement, opts: object) => KMap;
    Circle: new (opts: object) => { setMap: (m: KMap | null) => void };
    CustomOverlay: new (opts: object) => { setMap: (m: KMap | null) => void };
  };
}

let sdkPromise: Promise<KakaoNS> | null = null;
function loadSdk(): Promise<KakaoNS> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { kakao?: KakaoNS };
    if (w.kakao?.maps) { w.kakao.maps.load(() => resolve(w.kakao!)); return; }
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&autoload=false`;
    s.onerror = () => reject(new Error('kakao sdk load fail'));
    s.onload = () => {
      const k = (window as unknown as { kakao?: KakaoNS }).kakao;
      if (!k) { reject(new Error('kakao missing')); return; }
      k.maps.load(() => resolve(k));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

const TONE = (score: number) =>
  score >= 72 ? '#FFBC00' : score >= 58 ? '#FFD35C'
  : score >= 45 ? '#B9A88F' : '#8A7866';

export default function KakaoMap({
  pins, dongCode, industryCode, industry, onFallback,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KMap | null>(null);
  const kakaoRef = useRef<KakaoNS | null>(null);
  const [shops, setShops] = useState<{ total: number; shown: number } | null>(null);
  const [tourStep, setTourStep] = useState<string | null>(null);
  const [touring, setTouring] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);

  useEffect(() => {
    if (!boxRef.current || !pins?.length || !KEY) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      let kakao: KakaoNS;
      try { kakao = await loadSdk(); }
      catch { onFallback?.(); return; }
      if (disposed || !boxRef.current) return;
      kakaoRef.current = kakao;

      const target = pins.find((p) => p.is_target) ?? pins[0];
      // 전국 뷰(레벨 13)에서 시작해 동네로 들어갑니다.
      const map = new kakao.maps.Map(boxRef.current, {
        center: new kakao.maps.LatLng(36.4, 127.8), level: 13,
      });
      mapRef.current = map;

      // 점포 점 — Circle은 수백 개도 가볍습니다.
      if (dongCode) {
        try {
          const q = new URLSearchParams({ dong: dongCode });
          if (industryCode) q.set('industry', industryCode);
          const r = await fetch(`/api/v1/stores?${q}`);
          if (r.ok && !disposed) {
            const data = await r.json();
            setShops({ total: data.total, shown: data.shown });
            (data.points as [number, number][]).forEach(([la, lo]) => {
              const c = new kakao.maps.Circle({
                center: new kakao.maps.LatLng(la, lo),
                radius: 7, strokeWeight: 0,
                fillColor: '#FF7A59', fillOpacity: 0.7,
              });
              c.setMap(map);
              cleanups.push(() => c.setMap(null));
            });
          }
        } catch { /* 점포 없이도 지도는 산다 */ }
      }

      // 비교 상권 — 점수 칩 오버레이
      pins.forEach((p) => {
        const el = document.createElement('div');
        el.style.cssText =
          `padding:4px 8px;border-radius:9999px;font-size:11px;font-weight:700;` +
          `background:${p.is_target ? '#FFBC00' : 'rgba(255,255,255,.95)'};` +
          `color:#38322A;border:1.5px solid ${p.is_target ? '#fff' : TONE(p.score)};` +
          `box-shadow:0 2px 8px rgba(56,50,42,.25);white-space:nowrap`;
        el.textContent = `${p.name.split(' ').pop()} ${p.score.toFixed(0)}`;
        const ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(p.latitude, p.longitude),
          content: el, yAnchor: 1.2,
        });
        ov.setMap(map);
        cleanups.push(() => ov.setMap(null));
      });

      // 도착 비행 — 카카오는 flyTo가 없어 panTo + 단계 줌으로 만듭니다.
      const to = new kakao.maps.LatLng(target.latitude, target.longitude);
      setTimeout(() => { map.setCenter(to); map.setLevel(8, { animate: true }); }, 350);
      setTimeout(() => map.setLevel(5, { animate: true }), 1100);
      setTimeout(() => map.setLevel(3, { animate: true }), 1800);
    })();

    return () => { disposed = true; cleanups.forEach((f) => f()); };
  }, [pins, dongCode, industryCode, onFallback]);

  const speak = (t: string) => {
    if (!speakOn || typeof speechSynthesis === 'undefined') return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'ko-KR'; u.rate = 1.05;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  };

  const runTour = async () => {
    const kakao = kakaoRef.current; const map = mapRef.current;
    const target = pins.find((p) => p.is_target) ?? pins[0];
    if (!kakao || !map || !target || touring) return;
    setTouring(true);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = (t: string) => { setTourStep(t); speak(t); };
    try {
      step(`${target.name}입니다`);
      map.setCenter(new kakao.maps.LatLng(target.latitude, target.longitude));
      map.setLevel(3, { animate: true }); await wait(2600);
      if (shops && shops.total > 0) {
        step(`주황 점 하나가 실제 ${industry ?? '동종업종'} 한 곳 — 모두 ${shops.total}곳입니다`);
        map.setLevel(2, { animate: true }); await wait(3000);
      }
      if (pins.length > 1) {
        step('옆 동네와 나란히 놓고 봐야 이 점수의 높낮이가 읽힙니다');
        map.setLevel(6, { animate: true }); await wait(3200);
      }
      step('구석구석은 직접 움직여 보세요 — 건물 이름까지 보입니다');
      await wait(2200);
    } finally { setTourStep(null); setTouring(false); }
  };

  return (
    <div className="relative">
      <div className="relative">
        <div ref={boxRef}
             className="h-[380px] w-full overflow-hidden rounded-xl ring-1 ring-kb-ink/[.14]" />
        {tourStep && (
          <div className="absolute bottom-3 left-1/2 z-[600] w-[88%] max-w-[420px]
                          -translate-x-1/2 rounded-xl bg-kb-ink/85 px-4 py-2.5
                          text-center text-[14.5px] font-medium text-white
                          shadow-lg backdrop-blur">
            {tourStep}
          </div>
        )}
        <div className="absolute left-2.5 top-2.5 z-[500] flex gap-1.5">
          <button onClick={runTour} disabled={touring}
            className="rounded-lg bg-kb-yellow px-3 py-1.5 text-[13.5px] font-bold
                       text-kb-ink shadow transition hover:brightness-105
                       disabled:opacity-60">
            {touring ? '투어 중…' : '▶ 지도 투어'}
          </button>
          <button onClick={() => setSpeakOn((v) => !v)}
            className={`rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold shadow
                        transition ${speakOn ? 'bg-white text-kb-ink'
                                             : 'bg-white/70 text-kb-ink/68'}`}>
            {speakOn ? '소리 켬' : '소리 끔'}
          </button>
        </div>
      </div>
      <p className="mt-2 text-[12.5px] text-kb-ink/55">
        카카오 지도 · 주황 점은 실제 {industry ?? '동종업종'} 점포
        {shops ? ` ${shops.total.toLocaleString()}곳` : ''} · 점수 칩은 비교 상권
      </p>
    </div>
  );
}
