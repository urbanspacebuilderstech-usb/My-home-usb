import { useEffect, useRef } from 'react';

// Oct 30 2026 — Diwali celebration on the login page: the 3D helmet mascot
// glides in from the right, two flower pots (anar) light up beside it, four
// rockets burst over the right side, it cheers, and at 13 s it glides back
// out and everything stops. Shown only inside the window HR / Super Admin set
// in HR Portal → Settings → Animation (Login.jsx checks /api/branding).
// Overlay only — the login card underneath is untouched.

const ENTER_MS = 1800;
const LEAVE_AT = 13000;
const LEAVE_MS = 1600;

const PALETTES = [
  ['#f59e0b', '#f97316', '#fbbf24'], ['#ec4899', '#db2777', '#f472b6'],
  ['#0ea5e9', '#06b6d4', '#38bdf8'], ['#8b5cf6', '#a855f7', '#c084fc'],
];
const POT_SPARKS = ['#f59e0b', '#fbbf24', '#f97316', '#ea580c'];
const G = 0.045;

const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeIn = (k) => k * k * k;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export default function LoginCelebration({ cardRef }) {
  const canvasRef = useRef(null);
  const actorRef = useRef(null);
  const spriteRef = useRef(null);
  const shadowRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const fx = canvasRef.current, actor = actorRef.current, sprite = spriteRef.current, shadow = shadowRef.current;
    if (!fx || !actor) return undefined;
    const ctx = fx.getContext('2d');
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0, MW = 150, BOTTOM = 36;
    const isPhone = () => W < 760;
    const cardRect = () => cardRef?.current?.getBoundingClientRect() || { right: W / 2 };

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      fx.width = W * DPR; fx.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      MW = isPhone() ? 84 : Math.max(110, Math.min(160, W * 0.1));
      BOTTOM = isPhone() ? 12 : 36;
      actor.style.width = `${MW}px`;
      actor.style.bottom = `${BOTTOM}px`;
    };
    window.addEventListener('resize', resize);
    resize();

    const standX = () => (isPhone() ? W - MW - 28 : (cardRect().right + W - MW) / 2);
    const offX = () => W + 30;

    const rockets = [], sparks = [];
    const timers = [];
    const launch = (i) => {
      const left = isPhone() ? W * 0.1 : cardRect().right + 30, right = isPhone() ? W * 0.9 : W - 30;
      const x = left + (right - left) * (0.12 + 0.25 * i);
      const ty = isPhone() ? H * (0.06 + Math.random() * 0.1) : H * (0.12 + Math.random() * 0.25);
      rockets.push({ x, y: H + 10, vx: (Math.random() - 0.5) * 0.8, vy: -Math.sqrt(2 * 0.06 * (H - ty)), ty, pal: PALETTES[i % PALETTES.length] });
    };
    const burst = (r) => {
      const kind = Math.random(), n = isPhone() ? 80 : 130, speed = 2.8 + Math.random() * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.05;
        let s = speed * (kind < 0.4 ? 1 : (0.35 + Math.random() * 0.75));
        if (kind > 0.8) s *= (i % 2 ? 1 : 0.55);
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.009 + Math.random() * 0.009,
          color: r.pal[Math.random() * r.pal.length | 0], size: 1.8 + Math.random() * 1.6, twinkle: Math.random() < 0.35, willow: kind > 0.6 && kind <= 0.8 });
      }
    };

    let potsOn = false, potAlpha = 0;
    const potOrigins = () => {
      const x = standX(), y = H - BOTTOM - 2, gap = isPhone() ? 12 : 26;
      return [{ x: x - gap, y }, { x: x + MW + gap, y }];
    };
    const emitFountain = (o) => {
      for (let i = 0; i < (isPhone() ? 3 : 5); i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.55;
        const s = (isPhone() ? 2.4 : 3) + Math.random() * 3.2;
        sparks.push({ x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.018 + Math.random() * 0.02,
          color: POT_SPARKS[Math.random() * 4 | 0], size: 1.4 + Math.random() * 1.4, twinkle: true });
      }
    };
    const drawPot = (o) => {
      ctx.globalAlpha = potAlpha;
      const g = ctx.createLinearGradient(o.x - 11, 0, o.x + 11, 0);
      g.addColorStop(0, '#7a1f12'); g.addColorStop(0.5, '#d9542b'); g.addColorStop(1, '#7a1f12');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(o.x - 5, o.y); ctx.lineTo(o.x + 5, o.y);
      ctx.lineTo(o.x + 11, o.y + 16); ctx.lineTo(o.x - 11, o.y + 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(o.x - 9, o.y + 7, 18, 2);
      ctx.globalAlpha = 1;
    };

    const t0 = performance.now();
    let arrived = false, jumpT = -1, gone = false, raf = 0;

    const placeMascot = (now) => {
      const e = now - t0, sx = standX();
      let x, lean = 0, hop = 0;
      if (e < ENTER_MS) {
        const k = e / ENTER_MS;
        x = offX() + (sx - offX()) * easeOut(k);
        lean = -7 * (1 - easeInOut(k));
        hop = Math.abs(Math.sin(k * Math.PI * 4)) * 10 * (1 - k);
      } else if (e < LEAVE_AT) {
        x = sx;
        if (!arrived) {
          arrived = true; potsOn = true; jumpT = now + 500;
          for (let i = 0; i < 4; i++) timers.push(setTimeout(() => launch(i), 200 + i * 450));
        }
        hop = Math.sin((e - ENTER_MS) / 380) * 2.5;
      } else if (e < LEAVE_AT + LEAVE_MS) {
        potsOn = false;
        const k = (e - LEAVE_AT) / LEAVE_MS;
        x = sx + (offX() - sx) * easeIn(k);
        lean = 7 * easeInOut(Math.min(1, k * 2));
        hop = Math.abs(Math.sin(k * Math.PI * 4)) * 10 * k;
      } else {
        if (!gone) { gone = true; actor.style.visibility = 'hidden'; }
        return;
      }
      let jy = 0, sq = 0;
      if (jumpT > 0 && now >= jumpT) {
        const k = (now - jumpT) / 850;
        if (k >= 1) jumpT = -1;
        else { jy = Math.sin(Math.PI * k) * 56; sq = k < 0.12 ? (0.12 - k) * 1.4 : (k > 0.88 ? (k - 0.88) * 1.4 : 0); }
      }
      const lift = hop + jy;
      actor.style.visibility = 'visible';
      actor.style.transform = `translate3d(${x}px, 0, 0)`;
      sprite.style.transform = `translateY(${-lift}px) rotate(${lean}deg) scale(${1 + sq}, ${1 - sq})`;
      const s = Math.max(0.55, 1 - lift / 110);
      shadow.style.transform = `scale(${s})`;
      shadow.style.opacity = s;
    };

    const frame = (now) => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.vy += 0.06; r.x += r.vx; r.y += r.vy;
        ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < 2; k++) sparks.push({ x: r.x, y: r.y + 4, vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random(), life: 0.7, decay: 0.05, color: '#fb923c', size: 1.2 });
        if (r.vy >= -0.5 || r.y <= r.ty) { burst(r); rockets.splice(i, 1); }
      }

      potAlpha += ((potsOn ? 1 : 0) - potAlpha) * 0.08;
      const pots = potAlpha > 0.02 ? potOrigins() : [];
      if (potsOn) pots.forEach(emitFountain);

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i], drag = p.willow ? 0.975 : 0.985;
        p.vx *= drag; p.vy = p.vy * drag + (p.willow ? G * 1.3 : G);
        p.x += p.vx; p.y += p.vy; p.life -= p.decay;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.twinkle ? p.life * (0.4 + Math.random() * 0.6) : p.life);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      pots.forEach(drawPot);

      placeMascot(now);
      if (!gone || sparks.length || rockets.length || potAlpha > 0.02) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);

    const onClick = () => {
      const e = performance.now() - t0;
      if (e > ENTER_MS && e < LEAVE_AT && jumpT < 0) jumpT = performance.now();
    };
    actor.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', resize);
      actor.removeEventListener('click', onClick);
    };
  }, [cardRef]);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 w-full h-full pointer-events-none z-20" />
      <div
        ref={actorRef}
        aria-hidden="true"
        className="fixed left-0 z-30 cursor-pointer select-none"
        style={{ visibility: 'hidden', willChange: 'transform' }}
        data-testid="login-celebration-mascot"
      >
        <div
          ref={shadowRef}
          className="absolute left-[7%] -bottom-2.5 w-[86%] h-[18px]"
          style={{ background: 'radial-gradient(closest-side, rgba(15,23,42,0.32), rgba(15,23,42,0))', transformOrigin: '50% 50%' }}
        />
        <div ref={spriteRef} className="relative" style={{ transformOrigin: '50% 100%', willChange: 'transform' }}>
          <img
            src="/usb-mascot.webp"
            alt=""
            draggable={false}
            className="w-full h-auto block pointer-events-none"
            style={{ filter: 'drop-shadow(0 10px 12px rgba(15,23,42,0.22)) drop-shadow(0 2px 2px rgba(15,23,42,0.18))' }}
          />
        </div>
      </div>
    </>
  );
}
