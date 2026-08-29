import { useCallback } from 'preact/hooks';
import { findPolishVoice } from './Speak';

type Term = {
  pl: string;
  ru: string;
  note?: string;
};

type Props = { terms: Term[] };

function speakPolish(text: string): void {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pl-PL';
  utterance.rate = 0.9;
  const voices =
    typeof window.speechSynthesis.getVoices === 'function' ? window.speechSynthesis.getVoices() : [];
  const voice = findPolishVoice(voices);
  if (voice !== undefined) utterance.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/**
 * Один остров на весь словарь: 46 отдельных Speak с client:visible снова
 * не гидратировались вовремя на телефоне, и кнопка Wymowa не успевала ожить.
 */
export default function GlossarySpeak({ terms }: Props) {
  const onSpeak = useCallback((event: Event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLButtonElement)) return;
    speakPolish(target.dataset.pl ?? '');
  }, []);

  return (
    <dl class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {terms.map((term) => (
        <div class="rounded-card border border-[var(--color-line)] p-3">
          <dt class="flex items-start justify-between gap-2 text-body font-semibold">
            <span>{term.pl}</span>
            <button
              type="button"
              class="term-speak mt-0"
              data-pl={term.pl}
              aria-label={`Wymowa: ${term.pl}`}
              onClick={onSpeak}
            >
              Wymowa
            </button>
          </dt>
          <dd class="text-label text-[var(--color-muted)]">{term.ru}</dd>
          {term.note ? <dd class="mt-1 text-micro text-[var(--color-faint)]">{term.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
