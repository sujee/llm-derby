const COLORS = ['#e63946', '#f6c343', '#1e6fd9', '#2fb344', '#8e44ad', '#ff7eb6', '#ffffff'];

/** Short burst of canvas confetti. Respects reduced-motion preferences. */
export function confetti(durationMs = 4500) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.append(canvas);
  const g = canvas.getContext('2d');
  if (!g) return canvas.remove();
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);

  const parts = Array.from({ length: 220 }, (_, i) => ({
    x: i % 2 ? innerWidth * 0.15 : innerWidth * 0.85,
    y: innerHeight * 0.75,
    vx: (i % 2 ? 1 : -1) * (2 + Math.random() * 7),
    vy: -(9 + Math.random() * 10),
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 5,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: COLORS[i % COLORS.length],
  }));

  const t0 = performance.now();
  const frame = (now: number) => {
    const t = now - t0;
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalAlpha = Math.max(0, Math.min(1, (durationMs - t) / 800));
    for (const p of parts) {
      p.vy += 0.25;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
      g.restore();
    }
    if (t < durationMs) requestAnimationFrame(frame);
    else {
      removeEventListener('resize', resize);
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}
