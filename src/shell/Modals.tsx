import { useUi } from '../store/useUi';
import { SettingsModal } from './modals/SettingsModal';
import { ExportModal } from './modals/ExportModal';
import { ReceiptsModal } from './modals/ReceiptsModal';
import { ShortcutsModal } from './modals/ShortcutsModal';
import { OnboardingModal } from './modals/OnboardingModal';
import { BlueprintModal } from './modals/BlueprintModal';

export function Modals() {
  const onboarding = useUi((s) => s.onboardingOpen);
  const settings = useUi((s) => s.settingsOpen);
  const exportOpen = useUi((s) => s.exportOpen);
  const receipts = useUi((s) => s.receiptsOpen);
  const shortcuts = useUi((s) => s.shortcutsOpen);
  const blueprintOpen = useUi((s) => s.blueprintOpen);
  const setModal = useUi((s) => s.setModal);
  const close =
    (
      key:
        | 'onboardingOpen'
        | 'settingsOpen'
        | 'exportOpen'
        | 'receiptsOpen'
        | 'shortcutsOpen'
        | 'blueprintOpen',
    ) =>
    () =>
      setModal(key, false);

  return (
    <>
      {onboarding && <OnboardingModal onClose={close('onboardingOpen')} />}
      {settings && <SettingsModal onClose={close('settingsOpen')} />}
      {exportOpen && <ExportModal onClose={close('exportOpen')} />}
      {receipts && <ReceiptsModal onClose={close('receiptsOpen')} />}
      {shortcuts && <ShortcutsModal onClose={close('shortcutsOpen')} />}
      {blueprintOpen && <BlueprintModal onClose={close('blueprintOpen')} />}
    </>
  );
}
