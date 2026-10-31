import { useEffect, useRef, useState } from 'react';
import { mountMotion } from './motion';
export function MotionCanvas({
  preset,
  speed,
  interactive,
}: {
  preset: string;
  speed?: number;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(
    () =>
      ref.current ? mountMotion(ref.current, { preset, speed, interactive }) : undefined,
    [preset, speed, interactive],
  );
  return <canvas ref={ref} aria-hidden="true" />;
}

export function VideoContent({
  src,
  poster,
  autoplayMuted,
}: {
  src: string;
  poster?: string;
  autoplayMuted?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed)
    return (
      <video
        controls
        src={src}
        poster={poster || undefined}
        autoPlay={autoplayMuted}
        muted={autoplayMuted}
        playsInline
        onError={() => setFailed(true)}
      />
    );
  return (
    <>
      <MotionCanvas preset="reel" />
      <div className="mw-reel-controls">
        <button type="button" data-reel-toggle>
          Pause
        </button>
        <input
          type="range"
          min="0"
          max="100"
          defaultValue="0"
          aria-label="Reel position"
          data-reel-scrub
        />
      </div>
      {failed && <span role="status">Video unavailable; showing a procedural reel.</span>}
    </>
  );
}
