import { ArrowUpRight, Github, Keyboard, Sparkles } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { MusewareLogo } from '../../components/MusewareLogo';
import { useUi } from '../../store/useUi';

export function AboutModal({ onClose }: { onClose: () => void }) {
  const setModal = useUi((s) => s.setModal);

  return (
    <Modal
      title="About Museware"
      onClose={onClose}
      size="md"
      className="about-modal"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClose();
              setModal('shortcutsOpen', true);
            }}
          >
            <Keyboard size={14} /> Keyboard shortcuts
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mw-space-4)', padding: 'var(--mw-space-2) 0' }}>
        {/* Brand Hero */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--mw-space-3)' }}>
          <MusewareLogo size={42} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--mw-space-2)' }}>
              <span style={{ fontSize: 'var(--mw-fs-20)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--mw-ink)' }}>
                museware<em style={{ fontStyle: 'normal', color: 'var(--mw-accent)' }}>.</em>
              </span>
              <span
                style={{
                  fontSize: 'var(--mw-fs-10)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 8px',
                  borderRadius: 'var(--mw-radius-pill)',
                  background: 'var(--mw-accent-subtle)',
                  color: 'var(--mw-accent)',
                  border: '1px solid color-mix(in srgb, var(--mw-accent) 40%, transparent)',
                }}
              >
                v1.0
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--mw-fs-13)', color: 'var(--mw-ink-2)' }}>
              The visual AI-powered building environment where you and Muse build on one shared component tree.
            </p>
          </div>
        </div>

        {/* Core Manifesto Box */}
        <div
          style={{
            background: 'var(--mw-surface)',
            border: '1px solid var(--mw-border)',
            borderRadius: 'var(--mw-radius-md)',
            padding: 'var(--mw-space-3) var(--mw-space-4)',
            fontSize: 'var(--mw-fs-13)',
            lineHeight: 1.6,
            color: 'var(--mw-ink-2)',
          }}
        >
          <strong style={{ display: 'block', color: 'var(--mw-ink)', marginBottom: 'var(--mw-space-1)' }}>
            The Canvas That Builds With You
          </strong>
          Describe what you want to create, review and approve the blueprint, watch Muse generate real responsive
          elements, then restyle or refine anything directly by hand. One tree, one shared undo.
        </div>

        {/* Feature Highlights Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 'var(--mw-space-2)',
          }}
        >
          <div
            style={{
              padding: 'var(--mw-space-2-5)',
              background: 'var(--mw-surface-2)',
              borderRadius: 'var(--mw-radius-sm)',
              border: '1px solid var(--mw-border)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 'var(--mw-fs-12)', color: 'var(--mw-ink)', marginBottom: 2 }}>
              Meta Muse Model Family
            </div>
            <div style={{ fontSize: 'var(--mw-fs-11)', color: 'var(--mw-ink-3)', lineHeight: 1.4 }}>
              Powered by Meta&apos;s models across visual canvas planning, layout compilation, and vision inspection.
            </div>
          </div>
          <div
            style={{
              padding: 'var(--mw-space-2-5)',
              background: 'var(--mw-surface-2)',
              borderRadius: 'var(--mw-radius-sm)',
              border: '1px solid var(--mw-border)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 'var(--mw-fs-12)', color: 'var(--mw-ink)', marginBottom: 2 }}>
              3-Breakpoint Fluid Responsive
            </div>
            <div style={{ fontSize: 'var(--mw-fs-11)', color: 'var(--mw-ink-3)', lineHeight: 1.4 }}>
              Compact (390px), Medium (768px), and Expanded (1280px) live previews with container query isolation.
            </div>
          </div>
        </div>

        {/* Document & Team Credits */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--mw-space-1)',
            paddingTop: 'var(--mw-space-2)',
            borderTop: '1px solid var(--mw-border)',
            fontSize: 'var(--mw-fs-12)',
            color: 'var(--mw-ink-3)',
          }}
        >
          <div>
            <strong style={{ color: 'var(--mw-ink-2)' }}>Built by:</strong> Osasumwen Ngozi Scott (Product Lead) & Miracle Aigbomian (Developer)
          </div>
          <div>
            <strong style={{ color: 'var(--mw-ink-2)' }}>Hackathon Track:</strong> Meta Global AI Developer Hackathon (Cerebral Valley), Indie Track
          </div>
          <div style={{ marginTop: 'var(--mw-space-1)', display: 'flex', gap: 'var(--mw-space-3)' }}>
            <a
              href="https://github.com/miracles2motion/museware"
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--mw-accent)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Github size={13} /> Source repository <ArrowUpRight size={11} />
            </a>
            <a
              href="https://museware.vercel.app"
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--mw-accent)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Sparkles size={13} /> Live application <ArrowUpRight size={11} />
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
}
