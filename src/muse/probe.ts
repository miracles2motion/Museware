/**
 * Per-model probes (§6.1). One cheap 1-token ping per TEXT role at key setup —
 * the point is an HONEST chip: green only when the model really answered, red
 * with the upstream's own words when it did not.
 *
 * Image, SAM and voice are billed per call, so they are never pinged behind the
 * visitor's back; the UI says so instead of faking a green.
 */
import { probeModel } from './client';
import { useAgent, type ModelMatrix } from '../store/useAgent';

export const TEXT_ROLES = ['builder', 'architect', 'chat'] as const;
export const MEDIA_ROLES = ['image', 'sam', 'voice'] as const;

export type ProbeRole = (typeof TEXT_ROLES)[number] | (typeof MEDIA_ROLES)[number];

export async function probeTextRoles(models?: ModelMatrix | null): Promise<void> {
  const matrix = models || useAgent.getState().models;
  if (!matrix) return;
  useAgent.getState().setProbing(true);
  try {
    // Parallel: these are independent 1-token pings, and the chips should all
    // land within a second of each other.
    await Promise.all(
      TEXT_ROLES.map(async (role) => {
        const model = matrix[role].id;
        const result = await probeModel(model);
        useAgent.getState().setProbe({ ...result, model });
      }),
    );
  } finally {
    useAgent.getState().setProbing(false);
  }
}
