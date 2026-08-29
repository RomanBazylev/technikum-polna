import { useCallback, useEffect, useState } from 'preact/hooks';

type SpeakProps = { pl: string };

export function findPolishVoice<T extends { lang: string }>(voices: readonly T[]): T | undefined {
  return voices.find((voice) => voice.lang.toLowerCase().startsWith('pl'));
}

/**
 * Произношение польского слова средствами браузера. Единственная часть
 * термина, которой нужен JavaScript, поэтому она и вынесена отдельно:
 * перевод показывается и без неё.
 */
export default function Speak({ pl }: SpeakProps) {
  // SSR musi zostawić prawdziwy przycisk. Pusty wynik nie ma rozmiaru, więc
  // client:visible nie dostaje przecięcia i wyspa nigdy się nie hydratowała.
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
  }, []);

  const speak = useCallback(() => {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
    const utterance = new SpeechSynthesisUtterance(pl);
    utterance.lang = 'pl-PL';
    utterance.rate = 0.9;
    const voices =
      typeof window.speechSynthesis.getVoices === 'function'
        ? window.speechSynthesis.getVoices()
        : [];
    const voice = findPolishVoice(voices);
    if (voice !== undefined) utterance.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [pl]);

  if (!supported) return null;

  return (
    <button type="button" onClick={speak} class="term-speak" aria-label={`Wymowa: ${pl}`}>
      Wymowa
    </button>
  );
}
