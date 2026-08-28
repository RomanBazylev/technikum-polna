import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { parseLayout } from '../lib/sandbox/layout';
import type { Align, LayoutNode, LayoutParse, Size, Widget } from '../lib/sandbox/layout';
import { GRAVITY_QUIZ, LAYOUT_PRESETS } from '../lib/sandbox/layoutPresets';

type Axis = 'horizontal' | 'vertical' | 'none';

const FIRST_PRESET = LAYOUT_PRESETS[0];

/**
 * Предпросмотр разметки Android XML и XAML. APK в браузере не собирается,
 * но ошибка вёрстки видна и без сборки, а именно на ней ученик теряет баллы,
 * пока эмулятор запускается четыре минуты.
 */
export default function LayoutPreview() {
  const [source, setSource] = useState(FIRST_PRESET?.source ?? '');
  const [answered, setAnswered] = useState<string | null>(null);
  // DOMParser существует только в браузере, а остров попадает и в статический
  // HTML, поэтому разбор откладывается до гидратации.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const parsed = useMemo(() => (mounted ? parseLayout(source) : null), [mounted, source]);

  return (
    <section className="rounded-xl border border-[var(--color-line)] p-4">
      <h2 className="font-medium">Podgląd układu · Предпросмотр разметки</h2>
      <p className="mt-1 text-sm opacity-70">
        Wklej layout z Android Studio albo XAML z Visual Studio i zobacz rozmieszczenie od razu.
        Nic się nie pobiera, wszystko liczy się na urządzeniu.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {LAYOUT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setSource(preset.source)}
            className="rounded-lg border border-[var(--color-line)] px-3 py-1 text-xs"
          >
            {preset.label} <span className="opacity-50">{preset.dialect}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <textarea
          value={source}
          onInput={(event) => setSource((event.currentTarget as HTMLTextAreaElement).value)}
          spellcheck={false}
          rows={18}
          aria-label="Kod układu"
          className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-ink)] p-3 font-mono text-xs text-[var(--color-paper)]"
        />
        <div>
          <div
            data-testid="layout-frame"
            className="mx-auto h-[520px] w-[300px] overflow-hidden rounded-[1.75rem] border-[6px] border-[var(--color-line)] bg-[var(--color-ink)] text-[var(--color-paper)]"
          >
            {parsed === null ? (
              <p className="m-3 text-xs opacity-50">Podgląd rysuje się po wczytaniu strony.</p>
            ) : (
              renderFrame(parsed)
            )}
          </div>
          <p className="mt-2 text-center text-xs opacity-50">Ekran 300 × 520, skala 1 dp = 1 px</p>
        </div>
      </div>

      {parsed !== null && parsed.kind === 'ok' && parsed.warnings.length > 0 ? (
        <ul
          data-testid="layout-warnings"
          className="mt-3 rounded-lg border border-[var(--color-warn)] p-3 text-xs"
        >
          {parsed.warnings.map((warning) => (
            <li key={warning} className="opacity-80">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 rounded-lg border border-[var(--color-warn)] p-3 text-sm">
        <p className="font-medium">{GRAVITY_QUIZ.question}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {GRAVITY_QUIZ.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setAnswered(option.id)}
              className="rounded-lg border border-[var(--color-line)] px-3 py-1 font-mono text-xs"
            >
              {option.label}
            </button>
          ))}
        </div>
        {GRAVITY_QUIZ.options
          .filter((option) => option.id === answered)
          .map((option) => (
            <p
              key={option.id}
              className={`mt-2 border-l-4 pl-3 text-sm ${
                option.correct ? 'border-[var(--color-accent)]' : 'border-[var(--color-bad)]'
              }`}
            >
              <strong>{option.correct ? 'Dobrze.' : 'Nie.'}</strong> {option.why}
            </p>
          ))}
      </div>

      <p className="mt-4 text-xs opacity-70">
        To rysunek rozmieszczenia, nie emulator. Themes, style z <code>res/values</code>, prawdziwe
        ograniczenia ConstraintLayout i cokolwiek z Javy ani Kotlina tu nie działa. Zbudowanie APK
        wymaga Android Studio. · Это схема раскладки, а не эмулятор.
      </p>
    </section>
  );
}

function renderFrame(parsed: LayoutParse): JSX.Element {
  switch (parsed.kind) {
    case 'error':
      return (
        <p
          data-testid="layout-error"
          className="m-3 rounded-lg border-l-4 border-[var(--color-bad)] p-3 text-xs"
        >
          {parsed.message}
        </p>
      );
    case 'ok':
      return renderNode(parsed.root, 'none', 0);
    default: {
      const exhaustive: never = parsed;
      throw new Error(`Необработанный разбор: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function renderNode(node: LayoutNode, parentAxis: Axis, key: number): JSX.Element {
  const ownAxis = axisOf(node.widget);
  return (
    <div key={key} style={toStyle(node, parentAxis)} data-widget={node.widget.kind}>
      {renderWidget(node.widget)}
      {node.children.map((child, index) => renderNode(child, ownAxis, index))}
    </div>
  );
}

function renderWidget(widget: Widget): JSX.Element | null {
  switch (widget.kind) {
    case 'linear':
    case 'constraint':
    case 'grid':
      return null;
    case 'text':
      return <>{widget.text}</>;
    case 'button':
      return (
        <span className="rounded bg-[var(--color-accent)] px-3 py-1 text-xs text-[var(--color-ink)]">
          {widget.text}
        </span>
      );
    case 'field':
      return (
        <span className="block w-full border-b border-current pb-1 text-xs opacity-60">
          {widget.text === '' ? widget.hint : widget.text}
        </span>
      );
    case 'image':
      return (
        <span className="grid h-16 w-16 place-items-center border border-dashed border-current text-[10px] opacity-60">
          {widget.source === '' ? 'obraz' : widget.source}
        </span>
      );
    case 'unknown':
      return <span className="text-[10px] opacity-60">nieznany element {widget.tag}</span>;
    default: {
      const exhaustive: never = widget;
      throw new Error(`Необработанный виджет: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function axisOf(widget: Widget): Axis {
  switch (widget.kind) {
    case 'linear':
      return widget.orientation;
    case 'constraint':
      return 'vertical';
    case 'grid':
    case 'text':
    case 'button':
    case 'field':
    case 'image':
    case 'unknown':
      return 'none';
    default: {
      const exhaustive: never = widget;
      throw new Error(`Необработанная ось: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function toStyle(node: LayoutNode, parentAxis: Axis): JSX.CSSProperties {
  const { box, widget } = node;
  const ownAxis = axisOf(widget);
  const style: JSX.CSSProperties = {
    display: widget.kind === 'grid' ? 'grid' : 'flex',
    flexDirection: ownAxis === 'horizontal' ? 'row' : 'column',
    boxSizing: 'border-box',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    paddingTop: `${box.padding.top}px`,
    paddingRight: `${box.padding.right}px`,
    paddingBottom: `${box.padding.bottom}px`,
    paddingLeft: `${box.padding.left}px`,
    marginTop: `${box.margin.top}px`,
    marginRight: `${box.margin.right}px`,
    marginBottom: `${box.margin.bottom}px`,
    marginLeft: `${box.margin.left}px`,
  };

  if (widget.kind === 'grid') style.gridTemplateColumns = `repeat(${widget.columns}, 1fr)`;
  if (box.background !== null && /^#[0-9a-f]{3,8}$/i.test(box.background)) {
    style.background = box.background;
  }
  if (box.textSize !== null) style.fontSize = `${box.textSize}px`;

  style.width = extent(box.width);
  style.height = extent(box.height);

  // match_parent вдоль главной оси родителя означает «занять остаток места»,
  // а не сто процентов: сто процентов вытолкнули бы соседей за экран.
  if (parentAxis === 'horizontal' && box.width.kind === 'match') {
    style.flexGrow = 1;
    style.width = 'auto';
  }
  if (parentAxis === 'vertical' && box.height.kind === 'match') {
    style.flexGrow = 1;
    style.height = 'auto';
  }

  if (box.weight > 0) {
    style.flexGrow = box.weight;
    style.flexBasis = 0;
    if (parentAxis === 'horizontal') style.width = 'auto';
    if (parentAxis === 'vertical') style.height = 'auto';
  }

  applyGravity(style, box.gravity, ownAxis);
  const selfAlign = crossAlign(box.layoutGravity, parentAxis);
  if (selfAlign !== undefined) style.alignSelf = selfAlign;

  return style;
}

function extent(size: Size): string {
  switch (size.kind) {
    case 'match':
      return '100%';
    case 'wrap':
      return 'auto';
    case 'fixed':
      return size.dp === 0 ? 'auto' : `${size.dp}px`;
    default: {
      const exhaustive: never = size;
      throw new Error(`Необработанный размер: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function applyGravity(style: JSX.CSSProperties, gravity: Align, ownAxis: Axis): void {
  const horizontal = mapHorizontal(gravity.horizontal);
  const vertical = mapVertical(gravity.vertical);
  if (ownAxis === 'horizontal') {
    if (horizontal !== undefined) style.justifyContent = horizontal;
    if (vertical !== undefined) style.alignItems = vertical;
    return;
  }
  if (vertical !== undefined) style.justifyContent = vertical;
  if (horizontal !== undefined) style.alignItems = horizontal;
}

function crossAlign(layoutGravity: Align, parentAxis: Axis): string | undefined {
  switch (parentAxis) {
    case 'vertical':
      return mapHorizontal(layoutGravity.horizontal);
    case 'horizontal':
      return mapVertical(layoutGravity.vertical);
    case 'none':
      return undefined;
    default: {
      const exhaustive: never = parentAxis;
      throw new Error(`Необработанная ось родителя: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function mapHorizontal(value: Align['horizontal']): string | undefined {
  if (value === null) return undefined;
  return value === 'start' ? 'flex-start' : value === 'end' ? 'flex-end' : 'center';
}

function mapVertical(value: Align['vertical']): string | undefined {
  if (value === null) return undefined;
  return value === 'top' ? 'flex-start' : value === 'bottom' ? 'flex-end' : 'center';
}
