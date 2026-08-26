import { useCallback, useId, useState } from 'preact/hooks';

type TermProps = {
  pl: string;
  ru: string;
  note?: string;
};

/**
 * Польский термин остаётся на месте, русский открывается по нажатию.
 * Замена термина переводом лишила бы смысла всю затею: ученик должен узнавать
 * слово `sprawdzian` на уроке, а не его русский эквивалент.
 */
export default function Term({ pl, ru, note }: TermProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const speak = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(pl);
    utterance.lang = 'pl-PL';
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [pl]);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="term"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {pl}
      </button>
      {open ? (
        <span
          id={panelId}
          role="note"
          className="absolute left-0 top-full z-20 mt-1 block w-64 rounded-lg border border-[var(--color-line)] bg-[var(--color-ink-soft)] p-3 text-sm text-[var(--color-paper)] shadow-lg"
        >
          <span className="block font-medium">{ru}</span>
          {note !== undefined ? (
            <span className="mt-1 block opacity-80">{note}</span>
          ) : null}
          <button
            type="button"
            onClick={speak}
            className="mt-2 rounded border border-[var(--color-line)] px-2 py-1 text-xs"
          >
            Wymowa
          </button>
        </span>
      ) : null}
    </span>
  );
}
