'use client';

/**
 * 꿀비 3D — Three.js로 세운 실제 3차원 마스코트
 *
 * SVG로도 입체감을 흉내 낼 수는 있지만, 광택 위치가 고정이라 어느 각도에서도
 * 같은 그림입니다. 진짜 3D는 빛과 면의 관계가 각도에 따라 바뀝니다. 마우스를
 * 따라 고개를 돌릴 때 볼의 하이라이트가 같이 움직여야 살아 있어 보입니다.
 *
 * **외부 파일을 하나도 받지 않습니다.** 모델을 코드로 짓습니다(절차적 생성).
 * .glb나 Spline 씬을 쓰면 수 MB를 네트워크로 받아야 하고, 심사 현장에서
 * 그게 늦으면 마스코트 없는 화면을 보여 주게 됩니다. 구体 몇 개와 캔버스로
 * 그린 텍스처면 충분합니다.
 *
 * 얼굴은 캔버스에 그려 텍스처로 입히고, **눈만 진짜 3D 구체**로 둡니다.
 * 눈이 평면이면 아무리 잘 그려도 스티커처럼 보입니다. 구체로 두면 조명이
 * 만드는 하이라이트가 고개를 돌릴 때 함께 움직입니다.
 *
 * 동작 상태 셋:
 *   fly_happy  — 크게 통통 튀고 눈을 반달로, 날개가 빨라집니다
 *   thinking   — 천천히 흔들리고 눈을 감으며 고개를 갸웃합니다
 *   explaining — 앞으로 살짝 기울여 설명하는 자세
 *
 * WebGL이 없거나 실패하면 SVG 꿀비로 물러섭니다. 3D는 더 나은 쪽이지
 * 없으면 안 되는 쪽이 아닙니다.
 */

import { useEffect, useRef, useState } from 'react';
import type { CharacterMotion } from '@/lib/types';
import BeeCharacter from './BeeCharacter';

interface Props {
  motion: CharacterMotion;
  size?: number;
  interactive?: boolean;
  className?: string;
}

const YELLOW = 0xffc22e;
const YELLOW_LIT = 0xffe08a;
const DARK = 0x33251a;
const CREAM = 0xfbe6c9;

export default function BeeCharacter3D({
  motion, size = 240, interactive = true, className = '',
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // 동작 상태를 ref로 들고 갑니다. 애니메이션 루프가 매 프레임 읽는 값을
  // state로 두면 상태가 바뀔 때마다 씬을 통째로 다시 짓게 됩니다.
  const motionRef = useRef<CharacterMotion>(motion);
  motionRef.current = motion;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      let THREE: typeof import('three');
      try {
        THREE = await import('three');
      } catch (e) {
        console.error('[bee3d] three import 실패', e);
        setFailed(true);
        return;
      }
      if (disposed || !hostRef.current) return;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch (e) {
        console.error('[bee3d] WebGLRenderer 생성 실패', e);
        setFailed(true);          // WebGL이 없는 환경
        return;
      }

      // ── 무대 ─────────────────────────────────────────────────────────
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      // '보이지 않는 박스'를 아예 없앱니다 — 무대가 화면 전체입니다.
      // 캔버스를 화면에 고정(fixed)하고 클릭은 통과, 벌은 레이아웃 속
      // 앵커(host)의 위치를 매 프레임 따라갑니다. 드래그하면 화면
      // 어디로든 가고, 놓으면 스프링이 제자리로 데려옵니다.
      let winW = window.innerWidth, winH = window.innerHeight;
      let beeRootRef: import('three').Group | null = null;
      // 탄도 상태를 스크롤 핸들러와 공유 (탄도 중엔 접착 끔 — 자유 비행)
      const ballRef = { on: false, vx: 0, vy: 0 };
      renderer.setSize(winW, winH);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      document.body.appendChild(renderer.domElement);
      Object.assign(renderer.domElement.style, {
        position: 'fixed', inset: '0', zIndex: '55',
        pointerEvents: 'none', display: 'block',
      });
      // 스크롤은 '이동'이 아니라 '세상이 움직인 것' — 러프 없이 즉시
      // 따라붙어야 벌이 자리에 붙어 있는 것처럼 보입니다. (비행 러프는
      // flyto·드래그 복귀에만 남습니다)
      let lastScrollY = window.scrollY;
      const onScroll = () => {
        const dy = window.scrollY - lastScrollY;
        lastScrollY = window.scrollY;
        if (!ballRef.on) beeRootRef?.position && (beeRootRef.position.y += dy * wpp());
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      const onResize = () => {
        winW = window.innerWidth; winH = window.innerHeight;
        renderer.setSize(winW, winH);
        camera.aspect = winW / winH;
        camera.updateProjectionMatrix();
      };
      window.addEventListener('resize', onResize);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, winW / winH, 0.1, 100);
      camera.position.set(0, 0, 20);
      camera.lookAt(0, 0, 0);
      // 세계 1단위 = 화면 몇 px — 앵커 좌표·크기 환산의 기준
      const worldH = 2 * Math.tan((32 * Math.PI) / 360) * 20;
      const wpp = () => worldH / winH;

      // ── 빛 ───────────────────────────────────────────────────────────
      //
      // 셋을 씁니다. 주광 하나만 두면 그늘이 새까맣게 죽어 평평해 보이고,
      // 환경광만 두면 입체가 사라집니다. 뒤쪽 림라이트가 윤곽을 떼어 놓아야
      // 어두운 배경에서 형태가 읽힙니다.
      scene.add(new THREE.AmbientLight(0xfff4e0, 0.75));

      const key = new THREE.DirectionalLight(0xffffff, 2.1);
      key.position.set(-3.2, 4.4, 4.0);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 20;
      key.shadow.radius = 4;
      scene.add(key);

      const rim = new THREE.DirectionalLight(0xffd98a, 1.25);
      rim.position.set(3.0, 1.4, -3.2);
      scene.add(rim);

      const bounce = new THREE.DirectionalLight(0xffc98a, 0.5);
      bounce.position.set(0, -3, 1.5);
      scene.add(bounce);

      // ── 재질 ─────────────────────────────────────────────────────────
      const stripeTex = makeStripeTexture(THREE);

      const hoodMat = new THREE.MeshStandardMaterial({
        map: makeHeadTexture(THREE), roughness: 0.5, metalness: 0.02,
      });
      const bodyMat = new THREE.MeshStandardMaterial({
        map: stripeTex, roughness: 0.42, metalness: 0.02,
      });
      const eyeMat = new THREE.MeshPhysicalMaterial({
        color: 0x1a1209, roughness: 0.08, metalness: 0.0,
        clearcoat: 1.0, clearcoatRoughness: 0.05,
      });
      const darkMat = new THREE.MeshStandardMaterial({
        color: DARK, roughness: 0.55,
      });
      // 날개는 비쳐야 하지만 어두운 배경에서는 반투명이 그냥 사라집니다.
      // 스스로 조금 빛나게 두어야 윤곽이 남습니다.
      // 날개는 비쳐야 하지만 어두운 배경에서 반투명 회색은 그냥 노가 됩니다.
      // 흰빛을 스스로 조금 내게 두면 얇은 막처럼 읽힙니다.
      const wingMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, transparent: true, opacity: 0.4,
        roughness: 0.08, metalness: 0, side: THREE.DoubleSide,
        depthWrite: false, emissive: 0xcfe4ff, emissiveIntensity: 0.5,
      });

      // ── 몸 ───────────────────────────────────────────────────────────
      // beeRoot가 앵커 위치·크기(k)를 맡고, bee(자식)는 기존 애니메이션
      // 좌표계를 그대로 씁니다.
      const beeRoot = new THREE.Group();
      beeRootRef = beeRoot;
      scene.add(beeRoot);
      const bee = new THREE.Group();
      beeRoot.add(bee);

      // 머리 — 후드. 살짝 눌러 둥글넓적하게 두어야 귀엽습니다.
      const head = new THREE.Group();
      head.position.y = 0.72;
      bee.add(head);

      const hood = new THREE.Mesh(new THREE.SphereGeometry(1.28, 64, 48), hoodMat);
      hood.scale.set(1.0, 0.96, 0.94);
      // SphereGeometry의 u=0.5는 +x(옆면)를 봅니다. 텍스처의 얼굴 패치가
      // 정면(+z)에 오도록 구체만 -90° 돌립니다. 띠는 균일해서 무관.
      hood.rotation.y = -Math.PI / 2;
      hood.castShadow = true;
      head.add(hood);

      // 얼굴 — 크림색 구체를 머리 앞으로 밀어 넣습니다.
      //
      // 처음에는 머리 표면에 얼굴 그림을 텍스처로 입혔습니다. 그런데 구체의
      // UV는 극좌표라 정사각형 그림이 통째로 늘어나 얼굴이 머리 전체를
      // 덮어 버렸습니다. 후드 줄무늬가 안 보이게 됐습니다.
      //
      // 레퍼런스를 다시 보니 얼굴은 후드 안에 **끼워 넣은 별개의 덩어리**
      // 입니다. 그러면 텍스처가 필요 없습니다. 구체 하나를 앞으로 밀면
      // 그 모양이 그대로 나오고, 조명도 얼굴과 후드에 각각 맞게 떨어집니다.
      // 얼굴은 머리 텍스처에 그려져 있습니다 — 별도 구체·테 없음.
      // (구체 두 개를 겹치면 이음새 굴곡이 '두 턱'처럼 보였습니다)

      // 눈 — 얼굴 표면에 붙는 구체. 이것 하나로 '3D인가 그림인가'가 갈립니다.
      const eyes: import('three').Mesh[] = [];
      for (const sx of [-1, 1]) {
        // '징그럽다'는 피드백의 주범은 과대한 눈 + 이중 광점이었습니다.
        // 눈을 한 단계 줄이고 광점을 하나만 둡니다 — 또렷함은 남고 부담이 빠집니다.
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), eyeMat);
        eye.position.set(sx * 0.29, 0.08, 1.18);
        eye.scale.set(1, 1.18, 0.6);
        head.add(eye);
        eyes.push(eye);

        // 캐치라이트 — 조명만으로 생기는 반사는 각도에 따라 사라집니다.
        // 눈빛은 늘 있어야 하므로 스스로 빛나는 작은 구슬을 하나 박습니다.
        const spark = new THREE.Mesh(
          new THREE.SphereGeometry(0.075, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0xffffff }));
        spark.position.set(sx * 0.29 - 0.06, 0.15, 1.31);
        head.add(spark);

        // 보조 광점 — 반짝임은 둘일 때 산다 ('예전이 낫다'는 피드백으로 복원)
        const spark2 = new THREE.Mesh(
          new THREE.SphereGeometry(0.03, 12, 10),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
        spark2.position.set(sx * 0.29 + 0.07, 0.0, 1.31);
        head.add(spark2);

        // 볼터치 — 얼굴 구체 표면에 정확히 얹습니다.
        //
        // 처음엔 눈대중으로 놓았더니 왼쪽 볼이 얼굴을 벗어나 후드(노란 면)에
        // 찍혔습니다. 얼굴이 중심에서 살짝 오른쪽으로 밀려 있어 좌우가
        // 대칭이 아니기 때문입니다. 구체 방정식으로 표면 z를 구해 얹습니다.
        const blush = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 20, 14),
          new THREE.MeshBasicMaterial({
            color: 0xffa39b, transparent: true, opacity: 0.32 }));
        blush.position.set(sx * 0.48, -0.18, 1.13);
        blush.scale.set(1.05, 0.62, 0.2);
        head.add(blush);
      }

      // 입 — 벌어진 웃음. 납작한 구체를 눌러 만듭니다.
      // 입 — 작은 미소 곡선 하나면 됩니다. 전에는 빨간 타원을 붙였는데
      // 광대 코처럼 읽혀 얼굴 전체가 이상해졌습니다. 마스코트의 입은
      // 작을수록 눈이 커 보입니다.
      const smile = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.028, 12, 24, Math.PI * 0.8),
        new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.6 }));
      smile.position.set(0, -0.27, 1.25);
      smile.rotation.z = Math.PI + Math.PI * 0.1;
      head.add(smile);


      // 더듬이 — 짧고 통통해야 아기 같습니다. 길고 곧으면 곤충 표본이
      // 됩니다. 끝 구슬을 큼직하고 반질하게(클리어코트) — '방울' 느낌.
      const antennae: import('three').Group[] = [];
      const ballMat = new THREE.MeshPhysicalMaterial({
        color: DARK, roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.2 });
      for (const sx of [-1, 1]) {
        const g = new THREE.Group();
        const stalk = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.05, 0.42, 4, 12), darkMat);
        stalk.position.set(sx * 0.4, 1.32, 0.05);
        stalk.rotation.z = sx * 0.3;
        g.add(stalk);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 18), ballMat);
        ball.position.set(sx * 0.56, 1.58, 0.05);
        ball.castShadow = true;
        g.add(ball);
        // 방울 위 작은 광점 — 눈처럼 살아 있게
        const glint = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
        glint.position.set(sx * 0.52, 1.64, 0.18);
        g.add(glint);
        head.add(g);
        antennae.push(g);
      }

      // 몸통
      // 몸통을 한 단계 크게 — 머리:몸 비율이 벌보다 올챙이에 가까웠다
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 48, 36), bodyMat);
      body.position.y = -0.74;
      body.scale.set(1.0, 0.94, 0.92);
      body.castShadow = true;
      bee.add(body);

      // 팔·다리
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.22, 4, 12), darkMat);
        arm.position.set(sx * 0.96, -0.66, 0.1);
        arm.rotation.z = sx * 0.5;
        arm.castShadow = true;
        bee.add(arm);

        const leg = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14), darkMat);
        leg.position.set(sx * 0.34, -1.62, 0.12);
        leg.scale.set(1.15, 0.72, 1.35);
        leg.castShadow = true;
        bee.add(leg);
      }

      // 날개 — 뒤쪽 위. 퍼덕임은 이 그룹을 회전시켜 만듭니다.
      const wings: import('three').Group[] = [];
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.52, 0.02, -0.36);
        const w = new THREE.Mesh(new THREE.CircleGeometry(0.88, 32), wingMat);
        w.position.set(sx * 0.84, 0.3, -0.06);
        w.scale.set(1.05, 0.52, 1);
        w.rotation.z = sx * 0.52;
        pivot.add(w);
        bee.add(pivot);
        wings.push(pivot);
      }

      // 바닥 그림자만 받는 판. 보이지는 않고 그림자만 남깁니다 —
      // 그림자가 없으면 캐릭터가 공중에 붕 떠서 어디 있는지 모릅니다.
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 9),
        new THREE.ShadowMaterial({ opacity: 0.3 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -2.05;
      floor.receiveShadow = true;
      beeRoot.add(floor);
      // 그림자 카메라도 로밍 범위를 덮게
      key.shadow.camera.left = key.shadow.camera.bottom = -16;
      key.shadow.camera.right = key.shadow.camera.top = 16;
      key.shadow.camera.updateProjectionMatrix();

      // ── 마우스 추적 ──────────────────────────────────────────────────
      let tx = 0, ty = 0, cx = 0, cy = 0;
      // ── 쫀득 드래그 — 잡아 늘이면 슬라임처럼 따라오고, 놓으면 출렁이며
      // 돌아옵니다. 핵심은 저감쇠 스프링: 놓았을 때 한 번에 서지 않고
      // 두어 번 출렁여야 '쫀득'이 됩니다.
      let dragging = false, grabX = 0, grabY = 0, grabT = 0;
      // 던지기 — 놓기 직전 속도를 기억했다가 포물선으로 날립니다
      const trail: { x: number; y: number; t: number }[] = [];
      const ball = ballRef;
      let pullX = 0, pullY = 0;           // 목표(당긴 만큼)
      let jx = 0, jy = 0, jvx = 0, jvy = 0; // 스프링 상태
      let spinFrom = -10;                  // 클릭 리액션(한 바퀴) 시작 시각
      let flyOverride: { x: number; y: number } | null = null;  // 투어 목적지
      let placed = false;
      const onFlyTo = (e: Event) => {
        flyOverride = (e as CustomEvent<{ x: number; y: number }>).detail;
      };
      const onFlyHome = () => { flyOverride = null; };
      let flipFrom = -10;                  // 축하 백덤블링 시작 시각
      const onCelebrate = () => { flipFrom = clock.getElapsedTime(); jvy += 0.4; };
      window.addEventListener('kkulbee:celebrate', onCelebrate);
      window.addEventListener('kkulbee:flyto', onFlyTo);
      window.addEventListener('kkulbee:flyhome', onFlyHome);
      let dizzyFrom = -10;                 // 연타 이스터에그(어지럼) 시작 시각
      const pokes: number[] = [];          // 최근 찌른 시각들

      // 통통 소리 — 에셋 없이 오실레이터로 만듭니다. 놓는 순간의 '보잉'이
      // 쫀득함을 귀로도 완성합니다. 사용자 제스처 뒤에만 생성(브라우저 정책).
      let audio: AudioContext | null = null;
      const boing = (strength: number) => {
        try {
          audio ??= new (window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const o = audio.createOscillator();
          const g = audio.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(260 + strength * 160, audio.currentTime);
          o.frequency.exponentialRampToValueAtTime(85, audio.currentTime + 0.16);
          g.gain.setValueAtTime(Math.min(0.055, 0.02 + strength * 0.04), audio.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.2);
          o.connect(g).connect(audio.destination);
          o.start(); o.stop(audio.currentTime + 0.22);
        } catch {/* 소리가 없어도 쫀득함은 눈으로 */}
      };
      const onMove = (e: PointerEvent) => {
        tx = Math.max(-1, Math.min(1,
          (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2)));
        ty = Math.max(-1, Math.min(1,
          (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2)));
        if (dragging) {
          // 픽셀 이동량 → 벌 좌표계 1:1. 화면 어디까지든 따라옵니다.
          const kk = beeRoot.scale.x || 1;
          const f = wpp() / kk / 0.75;
          pullX = (e.clientX - grabX) * f;
          pullY = -(e.clientY - grabY) * f;
          trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
          while (trail.length && performance.now() - trail[0].t > 90) trail.shift();
        }
      };
      const onDown = (e: PointerEvent) => {
        dragging = true;
        grabX = e.clientX; grabY = e.clientY; grabT = performance.now();
        document.body.style.cursor = 'grabbing';
      };
      const onUp = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        const moved = Math.hypot(e.clientX - grabX, e.clientY - grabY);
        const held = performance.now() - grabT;
        const stretch = Math.hypot(pullX, pullY);
        // 세게 던졌으면 스프링 복귀 대신 포물선으로 날아갑니다
        if (trail.length >= 2) {
          const a = trail[0], z = trail[trail.length - 1];
          const dt = Math.max(16, z.t - a.t);
          const pvx = (z.x - a.x) / dt * 1000;   // px/s
          const pvy = (z.y - a.y) / dt * 1000;
          const sp = Math.hypot(pvx, pvy);
          if (sp > 900) {
            ball.on = true;
            ball.vx = pvx * wpp() / 60;          // world/frame(60fps 기준)
            ball.vy = -pvy * wpp() / 60;
            boing(Math.min(1, sp / 4000));
          }
        }
        trail.length = 0;
        pullX = 0; pullY = 0;             // 스프링이 출렁이며 제자리로
        document.body.style.cursor = '';
        if (moved < 6 && held < 350) {
          // 드래그가 아니라 콕 찌른 것 — 한 바퀴 돌고 폴짝 뛰며 한마디
          const now = clock.getElapsedTime();
          spinFrom = now;
          jvy += 0.32;
          boing(0.4);
          // 3초 안에 4번 연타하면 어지러워합니다 — 발견한 사람만 아는 재미
          pokes.push(now);
          while (pokes.length && now - pokes[0] > 3) pokes.shift();
          if (pokes.length >= 4) {
            dizzyFrom = now;
            pokes.length = 0;
            window.dispatchEvent(new CustomEvent('kkulbee:dizzy'));
          } else {
            window.dispatchEvent(new CustomEvent('kkulbee:poked'));
          }
        } else if (stretch > 0.25) {
          boing(Math.min(1, stretch));    // 늘였다 놓은 만큼 낮게 '보잉'
        }
      };
      // 무대가 넓어지면서 투명 캔버스가 아래 UI를 덮어 클릭을 막았습니다
      // ('아랫부분이 화면을 가린다'). 캔버스는 클릭을 통과시키고,
      // 레이캐스트로 벌 몸에 실제로 닿았을 때만 잡히게 합니다.
      renderer.domElement.style.pointerEvents = 'none';
      const raycaster = new THREE.Raycaster();
      const hitsBee = (e: PointerEvent | MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right ||
            e.clientY < rect.top || e.clientY > rect.bottom) return false;
        raycaster.setFromCamera(new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
        return raycaster.intersectObject(bee, true).length > 0;
      };
      const onHover = (e: PointerEvent) => {
        if (dragging) return;
        document.body.style.cursor = hitsBee(e) ? 'grab' : '';
      };
      const onDownGlobal = (e: PointerEvent) => {
        if (!hitsBee(e)) return;
        onDown(e);
      };
      if (interactive) {
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointermove', onHover, { passive: true });
        window.addEventListener('pointerdown', onDownGlobal);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      }

      // ── 애니메이션 ───────────────────────────────────────────────────
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      let raf = 0;
      let blinkAt = 1.4 + Math.random() * 2.4;
      let lidT = 0;                       // 0=뜸 1=감음
      const clock = new THREE.Clock();

      const tick = () => {
        raf = requestAnimationFrame(tick);
        const t = clock.getElapsedTime();

        // 앵커(레이아웃 속 자리)를 따라갑니다 — 스크롤·리사이즈에도 정확히.
        // 투어 중에는 flyto 오버라이드 지점으로 '날아서' 이동합니다(러프).
        const rect = host.getBoundingClientRect();
        const k = (size * wpp()) / 5.0;
        beeRoot.scale.setScalar(k);
        const px = flyOverride ? flyOverride.x : rect.left + rect.width / 2;
        const py = flyOverride ? flyOverride.y : rect.top + rect.height / 2;
        const txw = (px - winW / 2) * wpp();
        const tyw = (winH / 2 - py) * wpp();
        if (ball.on) {
          // 포물선 — 중력이 당기고 벽이 되받아칩니다. 부딪힐 때마다
          // '보잉'과 함께 찌그러졌다 펴집니다. 힘이 빠지면 스스로 귀가.
          ball.vy -= 0.035;
          beeRoot.position.x += ball.vx;
          beeRoot.position.y += ball.vy;
          const hw = (winW / 2) * wpp() - 1.2 * k * 5 * 0.35;
          const hh = (winH / 2) * wpp() - 1.2 * k * 5 * 0.35;
          if (beeRoot.position.x > hw || beeRoot.position.x < -hw) {
            beeRoot.position.x = Math.max(-hw, Math.min(hw, beeRoot.position.x));
            ball.vx *= -0.72; jvx += ball.vx * 0.6;
            boing(Math.min(1, Math.abs(ball.vx) * 2));
          }
          if (beeRoot.position.y < -hh || beeRoot.position.y > hh) {
            beeRoot.position.y = Math.max(-hh, Math.min(hh, beeRoot.position.y));
            ball.vy *= -0.68; ball.vx *= 0.9; jvy += ball.vy * 0.7;
            boing(Math.min(1, Math.abs(ball.vy) * 2));
          }
          beeRoot.rotation.z = Math.max(-0.5, Math.min(0.5, -ball.vx * 1.4));
          if (Math.hypot(ball.vx, ball.vy) < 0.06 && Math.abs(beeRoot.position.y + hh) < 1) {
            ball.on = false;              // 힘이 다했다 — 집으로
          }
        } else if (!placed) {
          beeRoot.position.set(txw, tyw, 0);
          placed = true;
        } else {
          // 관성 비행 — 순간이동이 아니라 날아갑니다. 멀수록 빠르게.
          beeRoot.position.x += (txw - beeRoot.position.x) * 0.085;
          beeRoot.position.y += (tyw - beeRoot.position.y) * 0.085;
        }
        // 비행 방향으로 살짝 기울기 — 이동감 (탄도 중엔 탄도가 기울기 결정)
        if (!ball.on) {
          const vx = txw - beeRoot.position.x;
          beeRoot.rotation.z = Math.max(-0.3, Math.min(0.3, -vx * 0.12));
        }
        const m = motionRef.current;
        const happy = m === 'fly_happy';
        const thinking = m === 'thinking';
        const sad = m === 'consoling';

        // 뜨는 높이와 주기가 기분을 만듭니다
        const period = happy ? 1.05 : thinking ? 3.0 : sad ? 3.6 : 2.1;
        const rise = happy ? 0.22 : thinking ? 0.08 : sad ? 0.04 : 0.13;
        const phase = (t / period) * Math.PI * 2;
        bee.position.y = reduce ? 0 : Math.sin(phase) * rise;

        // 통통 튈 때 살짝 눌렸다 늘어납니다(스쿼시·스트레치). 이게 없으면
        // 딱딱한 물체가 위아래로 움직이는 것처럼 보입니다.
        const squash = reduce ? 1 : 1 + Math.sin(phase - Math.PI / 2) * (happy ? 0.05 : 0.022);

        // 쫀득 스프링 — 잡는 동안은 무겁게 따라오고(감쇠 큼), 놓으면
        // 감쇠를 확 줄여 두어 번 출렁이고 멈춥니다.
        const damp = dragging ? 0.45 : 0.1;
        jvx += (pullX - jx) * 0.14 - jvx * damp;
        jvy += (pullY - jy) * 0.14 - jvy * damp;
        jx += jvx; jy += jvy;
        const len = Math.hypot(jx, jy);
        const s = Math.min(len * 0.42, 0.62);          // 늘어나는 정도
        const uy = len > 0.01 ? Math.abs(jy) / len : 0.5;
        // 당긴 방향 성분만큼 그쪽으로 길어지고, 부피 보존하듯 나머지가 줄어듭니다
        const stretchY = 1 + s * (0.35 + 0.65 * uy);
        const shrink = 1 / Math.sqrt(stretchY);
        bee.scale.set((2 - squash) * shrink * (1 + s * (1 - uy) * 0.55),
                      squash * stretchY,
                      (2 - squash) * shrink);
        bee.position.x = jx * 0.75;
        bee.position.y += jy * 0.75;
        bee.rotation.z = -jx * 0.3;                     // 당긴 쪽으로 기울어짐

        // 콕 찌르면 한 바퀴 — easeOut으로 빠르게 돌기 시작해 사뿐히 멈춥니다
        const sp = (t - spinFrom) / 0.85;
        const spin = sp >= 0 && sp < 1 ? (1 - Math.pow(1 - sp, 3)) * Math.PI * 2 : 0;

        // 연타 어지럼 — 1.8초 동안 흔들리다 서서히 멈춥니다
        const dz = (t - dizzyFrom) / 1.8;
        const dizzy = dz >= 0 && dz < 1 ? (1 - dz) : 0;
        if (dizzy > 0) bee.rotation.z += Math.sin(t * 16) * 0.14 * dizzy;

        // 마우스를 향해 천천히 고개를 돌립니다
        cx += (tx - cx) * 0.07;
        cy += (ty - cy) * 0.07;
        head.rotation.y = cx * 0.42 + (thinking ? Math.sin(t * 0.7) * 0.12 : 0);
        // 위로 모드 — 고개를 숙이고 아주 천천히 끄덕입니다. 밝은 몸짓이
        // 실례인 순간이 있습니다.
        head.rotation.x = cy * 0.26 + (sad ? 0.34 + Math.sin(t * 0.9) * 0.04 : 0);
        head.rotation.z = thinking ? 0.16 + Math.sin(t * 0.5) * 0.05 : cx * -0.08;
        bee.rotation.y = cx * 0.2 + spin;
        // 축하 백덤블링 — 뒤로 한 바퀴 (S·A등급 콘페티와 함께)
        const fp = (t - flipFrom) / 1.0;
        const flip = fp >= 0 && fp < 1 ? -(1 - Math.pow(1 - fp, 3)) * Math.PI * 2 : 0;
        bee.rotation.x = (m === 'explaining' ? 0.1 : 0) + flip;

        // 날개 — 초당 여러 번 퍼덕여야 벌입니다
        const flap = reduce ? 0
          : Math.sin(t * (happy ? 46 : sad ? 16 : 34)) * (happy ? 0.85 : sad ? 0.3 : 0.62);
        wings[0].rotation.y = -flap;
        wings[1].rotation.y = flap;

        // 더듬이는 몸보다 늦게 따라옵니다. 관성이 있어야 매달린 것처럼 보입니다.
        antennae[0].rotation.z = Math.sin(t * 1.6) * 0.09 - cx * 0.1;
        antennae[1].rotation.z = Math.sin(t * 1.6 + 0.4) * 0.09 - cx * 0.1;

        // 눈 — 생각 중엔 계속 감고, 아니면 가끔 깜빡입니다
        if (thinking) {
          lidT += (1 - lidT) * 0.12;
        } else {
          if (t > blinkAt) {
            lidT += (1 - lidT) * 0.45;
            if (lidT > 0.92) {
              blinkAt = t + 2.0 + Math.random() * 3.6;
              lidT = 1;
            }
          } else {
            lidT += (0 - lidT) * 0.35;
          }
        }
        // 깜빡임은 눈알을 위아래로 눌러 만듭니다. 눈꺼풀을 따로 두었더니
        // 평소에도 이마에 크림색 혹이 떠 있는 것처럼 보였습니다.
        eyes.forEach((eye) => {
          // 어지러울 때는 눈이 가늘어집니다 (@_@ 의 3D식 표현)
          eye.scale.y = 1.18 * Math.max(0.06, 1 - lidT) * (dizzy > 0 ? 0.4 : 1);
        });

        renderer.render(scene, camera);
      };
      tick();

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointermove', onHover);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('pointerdown', onDownGlobal);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('kkulbee:flyto', onFlyTo);
        window.removeEventListener('kkulbee:flyhome', onFlyHome);
        window.removeEventListener('kkulbee:celebrate', onCelebrate);
        renderer.domElement.remove();
        document.body.style.cursor = '';
        // WebGL 자원은 가비지 컬렉터가 안 걷어 갑니다. 화면을 오갈 때마다
        // 텍스처와 버퍼가 GPU에 쌓이면 결국 탭이 죽습니다.
        scene.traverse((o) => {
          const mesh = o as import('three').Mesh;
          mesh.geometry?.dispose?.();
          const mat = mesh.material as import('three').Material | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose?.();
        });
        stripeTex.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => { disposed = true; cleanup?.(); };
  }, [size, interactive]);

  if (failed) {
    // WebGL이 없으면 SVG 꿀비가 자리를 지킵니다.
    return <BeeCharacter motion={motion} size={size} className={className} />;
  }

  return (
    <div
      ref={hostRef}
      className={`relative select-none ${className}`}
      // 무대(캔버스)는 가로 1.7배로 넓지만 차지하는 자리는 size 기준 —
      // 음수 마진으로 겹치게 두어 레이아웃을 밀지 않습니다.
      style={{ width: size, height: size }}
      aria-label="마스코트 꿀비"
      role="img"
    />
  );
}

/* ── 텍스처 ──────────────────────────────────────────────────────────────
 *
 * 캔버스에 그려 구체에 입힙니다. 이미지 파일을 받지 않아도 되고, 색이나
 * 줄무늬 굵기를 코드에서 바로 조절할 수 있습니다.
 */

/** 후드·몸통의 노란 바탕과 진갈색 줄무늬 */
// 머리 텍스처 — 한 구체 위에 전부 그립니다: 꿀색 바탕, 위를 두르는
// 검은 띠(벌다움), 앞면의 크림 얼굴 패치. 얼굴을 별도 구체로 끼우면
// 이음새 굴곡이 생겨 '턱이 두 개'처럼 읽힙니다. 표면이 하나면 머리는
// 완전한 공입니다.
function makeHeadTexture(THREE: typeof import('three')) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#FFD96B');
  grad.addColorStop(0.55, '#FFC42E');
  grad.addColorStop(1, '#E89B04');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  // 위 가로 띠는 뺐습니다 — 얼굴 둘레 띠와 겹치니 과했습니다.
  // 머리의 '벌다움'은 얼굴을 두르는 링 하나가 담당합니다.
  // 얼굴 패치 — 앞면 가득한 크림 타원. 가장자리에 살짝 진한 테를 둘러
  // 후드 안에 얼굴이 들어앉은 깊이감을 만듭니다.
  // 얼굴은 조금 작게, 둘레에는 검은 띠 — 얼굴을 두르는 이 띠가
  // '벌 후드'를 완성합니다 (위 가로 띠와 한 세트로 읽힘)
  const cx = 512, cy = 306, rx = 188, ry = 152;
  g.fillStyle = '#33251A';
  g.beginPath(); g.ellipse(cx, cy, rx + 30, ry + 26, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#FDEED6';
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeStripeTexture(THREE: typeof import('three')) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d')!;

  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#FFE9A8');
  grad.addColorStop(0.45, '#FFC62E');
  grad.addColorStop(1, '#E09000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);

  // 가로 줄무늬. 구체 UV에서 v가 위아래이므로 가로줄이 몸을 감습니다.
  g.fillStyle = '#33251A';
  // 띠를 한 단계 굵게 — 멀리서도 '벌'로 읽히는 것은 결국 이 줄무늬입니다
  for (const [y, h] of [[46, 38], [124, 42], [204, 34]] as const) {
    g.fillRect(0, y, 512, h);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
