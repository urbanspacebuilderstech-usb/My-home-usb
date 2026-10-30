import { useState, useEffect } from 'react';

// Oct 30 2026 — 3D helmet mascot on the Site Engineer dashboard, a trial for
// Sridhar G only. It runs in from the right once per login session, then
// stays parked bottom-right; a click plays a jump + thumbs-up wiggle.
// Add a lower-cased name here to show it to someone else.
const MASCOT_USERS = ['sridhar g'];

const STYLES = `
@keyframes usbMascotRunIn {
  0%   { transform: translateX(160%) translateY(0) rotate(-6deg); }
  10%  { transform: translateX(144%) translateY(-14px) rotate(6deg); }
  20%  { transform: translateX(128%) translateY(0) rotate(-6deg); }
  30%  { transform: translateX(112%) translateY(-14px) rotate(6deg); }
  40%  { transform: translateX(96%) translateY(0) rotate(-6deg); }
  50%  { transform: translateX(80%) translateY(-14px) rotate(6deg); }
  60%  { transform: translateX(64%) translateY(0) rotate(-6deg); }
  70%  { transform: translateX(48%) translateY(-14px) rotate(6deg); }
  80%  { transform: translateX(32%) translateY(0) rotate(-6deg); }
  88%  { transform: translateX(14%) translateY(-10px) rotate(4deg); }
  94%  { transform: translateX(-4%) translateY(0) rotate(-3deg); }
  100% { transform: translateX(0) translateY(0) rotate(0); }
}
@keyframes usbMascotIdle {
  0%, 100% { transform: translateY(0) scale(1, 1); }
  50%      { transform: translateY(-4px) scale(1.02, 0.98); }
}
@keyframes usbMascotJump {
  0%   { transform: translateY(0) scale(1, 1) rotate(0); }
  15%  { transform: translateY(0) scale(1.12, 0.86) rotate(0); }
  45%  { transform: translateY(-34px) scale(0.94, 1.08) rotate(-8deg); }
  65%  { transform: translateY(-34px) scale(0.94, 1.08) rotate(8deg); }
  85%  { transform: translateY(0) scale(1.1, 0.9) rotate(0); }
  100% { transform: translateY(0) scale(1, 1) rotate(0); }
}
@media (prefers-reduced-motion: reduce) {
  .usb-mascot-run, .usb-mascot-idle, .usb-mascot-jump { animation: none !important; }
}
`;

const seenKey = (user) => `usb-mascot-ran:${user.user_id || user.name}`;

export default function DashboardMascot({ user }) {
  const allowed = !!user && MASCOT_USERS.includes((user.name || '').trim().toLowerCase());
  const [phase, setPhase] = useState(null); // 'run' | 'idle' | 'jump'

  useEffect(() => {
    if (!allowed) return;
    let ranThisSession = false;
    try { ranThisSession = sessionStorage.getItem(seenKey(user)) === '1'; } catch { /* storage blocked */ }
    if (ranThisSession) {
      setPhase('idle');
      return;
    }
    try { sessionStorage.setItem(seenKey(user), '1'); } catch { /* storage blocked */ }
    setPhase('run');
  }, [allowed, user]);

  if (!allowed || !phase) return null;

  const anim = {
    run: 'usbMascotRunIn 1.8s ease-out both',
    idle: 'usbMascotIdle 2.4s ease-in-out infinite',
    jump: 'usbMascotJump 0.8s ease-out both',
  }[phase];

  return (
    <>
      <style>{STYLES}</style>
      <button
        type="button"
        aria-label="My Home USB mascot"
        onClick={() => phase !== 'run' && setPhase('jump')}
        onAnimationEnd={() => phase !== 'idle' && setPhase('idle')}
        className={`usb-mascot-${phase} fixed right-3 bottom-20 lg:bottom-6 z-40 w-20 sm:w-24 bg-transparent border-0 p-0 cursor-pointer select-none focus:outline-none`}
        style={{ animation: anim, transformOrigin: '50% 100%' }}
        data-testid="dashboard-mascot"
      >
        <img
          src="/usb-mascot.webp"
          alt=""
          draggable={false}
          className="w-full h-auto pointer-events-none drop-shadow-[0_6px_8px_rgba(0,0,0,0.25)]"
        />
      </button>
    </>
  );
}
