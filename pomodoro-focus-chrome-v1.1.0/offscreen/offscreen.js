//offscreen js for audio playback

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PLAY_CHIME') {
    playChime(msg.volume, msg.goingToBreak);
  }
});

function playChime(vol, goingToBreak) {
  try {
    const ctx = new AudioContext();
    const freqs = goingToBreak ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const t = ctx.currentTime + i * 0.28;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      
      osc.start(t);
      osc.stop(t + 0.95);
    });
  } catch (e) {
    console.warn('offscreen audio failed:', e);
  }
}
