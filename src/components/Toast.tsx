import { useAppStore } from '../store/appStore';

export default function Toast() {
  const toast = useAppStore((s) => s.toast);
  const dismiss = useAppStore((s) => s.dismissToast);
  if (!toast) return null;
  return (
    <button
      type="button"
      className={`toast tone-${toast.tone}`}
      onClick={dismiss}
      style={{ border: 0, cursor: 'pointer' }}
    >
      {toast.text}
    </button>
  );
}
