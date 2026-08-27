import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  browserStorage,
  defaultState,
  loadState,
  saveState,
  type AppState,
  type LoadOutcome,
} from './appState';

/**
 * Единственная точка доступа островов к состоянию. Прямого обращения к
 * localStorage в компонентах нет: иначе шесть подсистем разъедутся по своим
 * ключам и экспорт перестанет что-либо значить.
 */
export function useAppState(): {
  state: AppState;
  ready: boolean;
  recovered: Extract<LoadOutcome, { kind: 'recovered' }> | null;
  update: (patch: (state: AppState) => AppState) => void;
} {
  const [state, setState] = useState<AppState>(defaultState);
  const [ready, setReady] = useState(false);
  const [recovered, setRecovered] = useState<Extract<
    LoadOutcome,
    { kind: 'recovered' }
  > | null>(null);

  useEffect(() => {
    const storage = browserStorage();
    if (storage === null) return;
    const outcome = loadState(storage);
    setState(outcome.state);
    if (outcome.kind === 'recovered') setRecovered(outcome);
    setReady(true);
  }, []);

  const update = useCallback((patch: (state: AppState) => AppState) => {
    setState((previous) => {
      const next = patch(previous);
      const storage = browserStorage();
      if (storage !== null) saveState(storage, next);
      return next;
    });
  }, []);

  return { state, ready, recovered, update };
}
