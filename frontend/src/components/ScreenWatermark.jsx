import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Sep 29 2026 — A web page can't block screenshots or screen recording (OS
// shortcuts, phone buttons and recorder apps never reach the browser). So
// every signed-in screen except Super Admin's carries a faint watermark with
// the viewer's name, phone (or email) and the current time: any capture shows
// who took it and when. Rendered into <body> above everything (dialogs,
// sheets, toasts) and click-through, so it never gets in the way.

const TILE_W = 380;
const TILE_H = 220;

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// One tile of diagonal text as an SVG data URI, repeated across the screen.
function tileImage(lines) {
  const text = lines
    .map((line, i) => `<text x="0" y="${(i - (lines.length - 1) / 2) * 18}">${escapeXml(line)}</text>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}">` +
    `<g transform="translate(${TILE_W / 2} ${TILE_H / 2}) rotate(-24)" text-anchor="middle" ` +
    `font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="13" fill="#64748b" fill-opacity="0.18">` +
    `${text}</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

export default function ScreenWatermark({ user }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  if (!user || user.role === 'super_admin') return null;

  const contact = user.phone || user.email || '';
  const lines = [[user.name, contact].filter(Boolean).join(' · '), stamp(now)];

  return createPortal(
    <div
      aria-hidden="true"
      data-testid="screen-watermark"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2147483000,
        backgroundImage: tileImage(lines),
        backgroundRepeat: 'repeat',
      }}
    />,
    document.body
  );
}
