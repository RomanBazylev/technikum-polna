import { useCallback, useState } from 'preact/hooks';

type SpeakProps = { pl: string };

/**
 * Произношение польского слова средствами браузера. Единственная часть
 * термина, которой нужен JavaScript, поэтому она и вынесена отдельно:
 * перевод показывается и без неё.
 */
export default function Speak({ pl }: SpeakProps) {
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  );

  const speak = useCallback(() => {
    const utterance = new SpeechSynthesisUtterance(pl);
    utterance.lang = 'pl-PL';
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [pl]);

  if (!supported) return null;

  return (
    <button type="button" onClick={speak} class="term-speak">
      Wymowa
    </button>
  );
}
