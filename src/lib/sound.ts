let ctx: AudioContext | null = null;

/** 极简提示音：答对一声清响，答错一声闷响。完全合成，无资源文件。 */
export function playStamp(kind: 'ok' | 'bad' | 'neutral'): void {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === 'ok' ? 'triangle' : 'sine';
    const freq = kind === 'ok' ? 360 : kind === 'bad' ? 150 : 220;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.78, t + 0.11);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(kind === 'ok' ? 0.09 : 0.13, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  } catch {
    /* 音频不可用则静默 */
  }
}
