import { useEffect, useRef } from 'react';
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
