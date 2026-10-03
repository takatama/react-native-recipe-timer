export function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = "ja-JP";
  speech.rate = 1.05;
  window.speechSynthesis.speak(speech);
}
let audio: AudioContext | undefined;
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    /* visual alarms always remain available */
  }
}
export function chime() {
  if (audio?.state !== "running") return;
  [660, 880, 660].forEach((frequency, i) => {
    const oscillator = audio!.createOscillator(),
      gain = audio!.createGain();
    oscillator.connect(gain);
    gain.connect(audio!.destination);
    oscillator.frequency.value = frequency;
    const at = audio!.currentTime + i * 0.22;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.14, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
    oscillator.start(at);
    oscillator.stop(at + 0.22);
  });
  navigator.vibrate?.([160, 80, 160]);
}
export async function notify(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration)
      await registration.showNotification(title, {
        body,
        icon: "/icon.svg",
        tag: title,
      });
    else new Notification(title, { body });
  } catch {
    /* on-screen attention is the primary signal */
  }
}
export function recognitionConstructor(): any {
  return (
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
}
