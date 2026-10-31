// Standalone runtime shared verbatim with exported projects: no application imports.
export function mountMotion(canvas, options = {}) {
  let ctx;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    return () => {};
  }
  if (!ctx) return () => {};
  const reduced =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0,
    time = 0,
    visible = true,
    playing = true,
    tiltX = 0,
    tiltY = 0,
    disposed = false;
  const paint = () => {
    const width = Math.max(1, canvas.clientWidth || 600),
      height = Math.max(1, canvas.clientHeight || 300);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const style = getComputedStyle(canvas);
    const accent = style.getPropertyValue('--openui-accent').trim() || '#6879dc';
    const secondary = style.getPropertyValue('--openui-secondary').trim() || '#db9a87';
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, accent);
    gradient.addColorStop(1, secondary);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = options.preset === 'reel' ? 0.6 : 0.17;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    const cx = width / 2 + tiltX * 20,
      cy = height / 2 + tiltY * 20,
      radius = Math.min(width, height) * 0.36;
    ctx.strokeStyle = accent;
    ctx.fillStyle = secondary;
    ctx.lineWidth = 1.3;
    if (options.preset === 'grid3d') {
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + (i * radius) / 8, cy - radius * 0.6);
        ctx.lineTo(cx + (i * radius) / 3, cy + radius);
        ctx.stroke();
      }
      for (let i = 0; i < 9; i++) {
        const y = cy - radius * 0.6 + i * radius * 0.2;
        ctx.beginPath();
        ctx.moveTo(cx - (radius * (i + 2)) / 5, y);
        ctx.lineTo(cx + (radius * (i + 2)) / 5, y);
        ctx.stroke();
      }
    } else if (options.preset === 'particles' || options.preset === 'reel') {
      for (let i = 0; i < 48; i++) {
        const x = (i * 137.5 + time * ((i % 3) + 1) * 8) % width,
          y = (i * 71.3 + Math.sin(time + i) * 15 + height) % height;
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (options.preset === 'aurora') {
      for (let j = 0; j < 8; j++) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += 8) {
          const y = cy + Math.sin(x / 90 + time + j * 0.6) * radius * 0.35 + (j - 4) * 13;
          if (!x) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else {
      for (let i = 0; i < 16; i++) {
        ctx.beginPath();
        const angle = (i * Math.PI) / 16 + time * 0.18;
        ctx.ellipse(
          cx,
          cy,
          radius * Math.max(0.05, Math.abs(Math.sin(angle))),
          options.preset === 'torus' ? radius * 0.42 : radius,
          angle * 0.2,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      if (options.preset === 'torus') {
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius, radius * 0.22, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  };
  const tick = () => {
    if (disposed || !visible || !playing || reduced) return;
    time += 0.016 * (Number.isFinite(Number(options.speed)) ? Number(options.speed) : 1);
    paint();
    frame = requestAnimationFrame(tick);
  };
  const start = () => {
    cancelAnimationFrame(frame);
    if (!disposed && visible && playing && !reduced) frame = requestAnimationFrame(tick);
  };
  const pointer = (event) => {
    if (!options.interactive) return;
    const rect = canvas.getBoundingClientRect();
    tiltX = (event.clientX - rect.left) / (rect.width || 1) - 0.5;
    tiltY = (event.clientY - rect.top) / (rect.height || 1) - 0.5;
    if (reduced) paint();
  };
  canvas.addEventListener('pointermove', pointer);
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          visible = !!entries[0]?.isIntersecting;
          if (visible) start();
          else cancelAnimationFrame(frame);
        })
      : null;
  observer?.observe(canvas);
  const controls = canvas.parentElement?.querySelector('[data-reel-toggle]');
  const scrubber = canvas.parentElement?.querySelector('[data-reel-scrub]');
  const toggle = () => {
    playing = !playing;
    if (controls) controls.textContent = playing ? 'Pause' : 'Play';
    if (playing) start();
    else cancelAnimationFrame(frame);
  };
  const scrub = () => {
    time = Number(scrubber.value) / 10;
    paint();
  };
  controls?.addEventListener('click', toggle);
  scrubber?.addEventListener('input', scrub);
  paint();
  start();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    canvas.removeEventListener('pointermove', pointer);
    controls?.removeEventListener('click', toggle);
    scrubber?.removeEventListener('input', scrub);
  };
}
