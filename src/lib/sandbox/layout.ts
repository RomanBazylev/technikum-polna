/**
 * Разбор макетов Android XML и XAML в модель, из которой рисуется предпросмотр.
 * APK в браузере не собрать, а вот увидеть, куда уедет кнопка при
 * layout_gravity, можно, и именно на этом ученики теряют баллы в INF.04.
 *
 * DOMParser живёт только в браузере, поэтому разбор разрезан надвое:
 * parseLayout() трогает DOM, buildLayout() чистая и покрыта юнит-тестами.
 */

export type Dialect = 'android' | 'xaml';

export type Size = { kind: 'match' } | { kind: 'wrap' } | { kind: 'fixed'; dp: number };

export type Horizontal = 'start' | 'center' | 'end';
export type Vertical = 'top' | 'center' | 'bottom';
export type Align = { horizontal: Horizontal | null; vertical: Vertical | null };
export type Edges = { top: number; right: number; bottom: number; left: number };

export type Box = {
  width: Size;
  height: Size;
  weight: number;
  /** Как виджет раскладывает содержимое внутри себя. */
  gravity: Align;
  /** Как родитель ставит сам виджет. Ученики путают это с gravity. */
  layoutGravity: Align;
  padding: Edges;
  margin: Edges;
  background: string | null;
  textSize: number | null;
};

export type Widget =
  | { kind: 'linear'; orientation: 'horizontal' | 'vertical' }
  | { kind: 'constraint' }
  | { kind: 'grid'; columns: number }
  | { kind: 'text'; text: string }
  | { kind: 'button'; text: string }
  | { kind: 'field'; hint: string; text: string }
  | { kind: 'image'; source: string }
  | { kind: 'unknown'; tag: string };

export type LayoutNode = {
  widget: Widget;
  box: Box;
  children: LayoutNode[];
};

/**
 * Промежуточное дерево между DOM и моделью, чтобы логика не зависела от DOM.
 * Имена атрибутов лежат как написаны: приведение к нижнему регистру и снятие
 * префикса делает разбор, а не адаптер, иначе смысл размазался бы по двум
 * местам и юнит-тест проверял бы не то, что работает в браузере.
 */
export type RawNode = {
  tag: string;
  attrs: Readonly<Record<string, string>>;
  children: RawNode[];
};

export type LayoutParse =
  | { kind: 'ok'; dialect: Dialect; root: LayoutNode; warnings: string[] }
  | { kind: 'error'; message: string };

const NO_EDGES: Edges = { top: 0, right: 0, bottom: 0, left: 0 };

const ANDROID_TAGS = new Set([
  'linearlayout',
  'constraintlayout',
  'androidx.constraintlayout.widget.constraintlayout',
  'relativelayout',
  'framelayout',
  'textview',
  'button',
  'edittext',
  'imageview',
]);

const XAML_TAGS = new Set([
  'stacklayout',
  'verticalstacklayout',
  'horizontalstacklayout',
  'grid',
  'label',
  'entry',
  'image',
  'contentpage',
]);

/**
 * Атрибуты, которые ученик пишет чаще всего, а предпросмотр не воспроизводит.
 * Молчаливое игнорирование хуже отсутствия предпросмотра: ученик решит, что
 * его правило работает, и принесёт это заблуждение на экзамен.
 */
const IGNORED_ANDROID = new Map<string, string>([
  ['layout_constrainttop_totopof', 'Реальные ограничения ConstraintLayout не считаются'],
  ['layout_constraintbottom_tobottomof', 'Реальные ограничения ConstraintLayout не считаются'],
  ['layout_constraintstart_tostartof', 'Реальные ограничения ConstraintLayout не считаются'],
  ['layout_constraintend_toendof', 'Реальные ограничения ConstraintLayout не считаются'],
  ['layout_below', 'RelativeLayout показан как вертикальный стек'],
  ['layout_torightof', 'RelativeLayout показан как вертикальный стек'],
  ['elevation', 'Тени и высота не рисуются'],
  ['style', 'Темы и стили из resources недоступны'],
]);

export function parseLayout(source: string): LayoutParse {
  const text = source.trim();
  if (text === '') return { kind: 'error', message: 'Pusty dokument. Wklej XML albo XAML.' };

  const document = new DOMParser().parseFromString(text, 'application/xml');
  const failure = document.querySelector('parsererror');
  if (failure !== null) {
    return { kind: 'error', message: readableParseError(failure.textContent ?? '') };
  }

  const root = document.documentElement;
  if (root === null) {
    return { kind: 'error', message: 'Brak elementu głównego. Cały układ musi mieć jeden korzeń.' };
  }

  return buildLayout(toRawNode(root));
}

function toRawNode(element: Element): RawNode {
  const attrs: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) attrs[attribute.name] = attribute.value;
  return {
    tag: element.tagName,
    attrs,
    children: Array.from(element.children).map(toRawNode),
  };
}

export function buildLayout(raw: RawNode): LayoutParse {
  const dialect = detectDialect(raw);
  if (dialect === null) {
    return {
      kind: 'error',
      message: `Nieznany element główny «${raw.tag}». Obsługiwane są LinearLayout, ConstraintLayout, StackLayout i Grid.`,
    };
  }
  const warnings: string[] = [];
  return { kind: 'ok', dialect, root: toLayoutNode(raw, dialect, warnings), warnings };
}

function detectDialect(raw: RawNode): Dialect | null {
  const tag = raw.tag.toLowerCase();
  if (ANDROID_TAGS.has(tag)) return 'android';
  if (XAML_TAGS.has(tag)) return 'xaml';
  return null;
}

function toLayoutNode(raw: RawNode, dialect: Dialect, warnings: string[]): LayoutNode {
  const attrs = normalizeAttrs(raw.attrs);
  for (const key of Object.keys(attrs)) {
    const reason = IGNORED_ANDROID.get(key);
    if (reason !== undefined && !warnings.includes(reason)) warnings.push(reason);
  }
  return {
    widget: toWidget(raw.tag, attrs),
    box: dialect === 'android' ? readAndroidBox(attrs) : readXamlBox(attrs),
    children: raw.children.map((child) => toLayoutNode(child, dialect, warnings)),
  };
}

/** `android:layout_width` и `WidthRequest` приходят к одному виду ключа. */
function normalizeAttrs(attrs: Readonly<Record<string, string>>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(attrs)) normalized[localName(name)] = value;
  return normalized;
}

function toWidget(tagName: string, attrs: Readonly<Record<string, string>>): Widget {
  const tag = tagName.toLowerCase();
  switch (tag) {
    case 'linearlayout':
      return { kind: 'linear', orientation: readOrientation(attrs['orientation']) };
    case 'stacklayout':
    case 'contentpage':
      return { kind: 'linear', orientation: readOrientation(attrs['orientation']) };
    case 'verticalstacklayout':
      return { kind: 'linear', orientation: 'vertical' };
    case 'horizontalstacklayout':
      return { kind: 'linear', orientation: 'horizontal' };
    case 'relativelayout':
    case 'framelayout':
      return { kind: 'linear', orientation: 'vertical' };
    case 'constraintlayout':
    case 'androidx.constraintlayout.widget.constraintlayout':
      return { kind: 'constraint' };
    case 'grid':
      return { kind: 'grid', columns: countColumns(attrs['columndefinitions']) };
    case 'textview':
    case 'label':
      return { kind: 'text', text: attrs['text'] ?? '' };
    case 'button':
      return { kind: 'button', text: attrs['text'] ?? '' };
    case 'edittext':
      return { kind: 'field', hint: attrs['hint'] ?? '', text: attrs['text'] ?? '' };
    case 'entry':
      return { kind: 'field', hint: attrs['placeholder'] ?? '', text: attrs['text'] ?? '' };
    case 'imageview':
      return { kind: 'image', source: attrs['src'] ?? attrs['srccompat'] ?? '' };
    case 'image':
      return { kind: 'image', source: attrs['source'] ?? '' };
    default:
      return { kind: 'unknown', tag: tagName };
  }
}

function readAndroidBox(attrs: Readonly<Record<string, string>>): Box {
  const padding = readEdges(attrs, 'padding');
  const margin = readEdges(attrs, 'layout_margin');
  return {
    width: readAndroidSize(attrs['layout_width']),
    height: readAndroidSize(attrs['layout_height']),
    weight: readNumber(attrs['layout_weight']) ?? 0,
    gravity: readAndroidGravity(attrs['gravity']),
    layoutGravity: readAndroidGravity(attrs['layout_gravity']),
    padding,
    margin,
    background: attrs['background'] ?? null,
    textSize: readNumber(attrs['textsize']),
  };
}

/**
 * В XAML нет layout_width, размер задаётся через WidthRequest плюс
 * HorizontalOptions. Fill означает растянуться, Center и Start сжимают
 * элемент по содержимому и заодно выравнивают его в родителе.
 */
function readXamlBox(attrs: Readonly<Record<string, string>>): Box {
  const horizontal = readXamlOption(attrs['horizontaloptions']);
  const vertical = readXamlOption(attrs['verticaloptions']);
  return {
    width: readXamlSize(attrs['widthrequest'], horizontal.fills),
    height: readXamlSize(attrs['heightrequest'], vertical.fills),
    weight: readNumber(attrs['flexgrow']) ?? 0,
    gravity: {
      horizontal: readHorizontal(attrs['horizontaltextalignment']),
      vertical: readVertical(attrs['verticaltextalignment']),
    },
    layoutGravity: {
      horizontal: readHorizontal(horizontal.align),
      vertical: readVertical(vertical.align),
    },
    padding: readEdges(attrs, 'padding'),
    margin: readEdges(attrs, 'margin'),
    background: attrs['backgroundcolor'] ?? null,
    textSize: readNumber(attrs['fontsize']),
  };
}

function readAndroidSize(value: string | undefined): Size {
  if (value === undefined) return { kind: 'wrap' };
  const normalized = value.trim().toLowerCase();
  if (normalized === 'match_parent' || normalized === 'fill_parent') return { kind: 'match' };
  if (normalized === 'wrap_content') return { kind: 'wrap' };
  if (normalized === '0dp' || normalized === '0') return { kind: 'fixed', dp: 0 };
  const dp = readNumber(normalized);
  return dp === null ? { kind: 'wrap' } : { kind: 'fixed', dp };
}

function readXamlSize(value: string | undefined, fills: boolean): Size {
  const dp = readNumber(value);
  if (dp !== null) return { kind: 'fixed', dp };
  return fills ? { kind: 'match' } : { kind: 'wrap' };
}

function readXamlOption(value: string | undefined): { fills: boolean; align: string | undefined } {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === '') return { fills: true, align: undefined };
  const fills = normalized.startsWith('fill');
  const align = ['center', 'start', 'end'].find((option) => normalized.startsWith(option));
  return { fills, align };
}

function readOrientation(value: string | undefined): 'horizontal' | 'vertical' {
  return (value ?? '').trim().toLowerCase() === 'horizontal' ? 'horizontal' : 'vertical';
}

function readAndroidGravity(value: string | undefined): Align {
  const parts = (value ?? '').toLowerCase().split('|').map((part) => part.trim());
  let horizontal: Horizontal | null = null;
  let vertical: Vertical | null = null;
  for (const part of parts) {
    if (part === 'center' || part === 'center_horizontal') horizontal = 'center';
    if (part === 'left' || part === 'start') horizontal = 'start';
    if (part === 'right' || part === 'end') horizontal = 'end';
    if (part === 'center' || part === 'center_vertical') vertical = 'center';
    if (part === 'top') vertical = 'top';
    if (part === 'bottom') vertical = 'bottom';
  }
  return { horizontal, vertical };
}

function readHorizontal(value: string | undefined): Horizontal | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'center') return 'center';
  if (normalized === 'start') return 'start';
  if (normalized === 'end') return 'end';
  return null;
}

function readVertical(value: string | undefined): Vertical | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'center') return 'center';
  if (normalized === 'start') return 'top';
  if (normalized === 'end') return 'bottom';
  return null;
}

/** Android пишет отступы четырьмя атрибутами, XAML одним списком чисел. */
function readEdges(attrs: Readonly<Record<string, string>>, prefix: string): Edges {
  const shorthand = attrs[prefix];
  const base = shorthand === undefined ? NO_EDGES : spreadShorthand(shorthand);
  return {
    top: readNumber(attrs[`${prefix}top`]) ?? base.top,
    right: readNumber(attrs[`${prefix}right`]) ?? readNumber(attrs[`${prefix}end`]) ?? base.right,
    bottom: readNumber(attrs[`${prefix}bottom`]) ?? base.bottom,
    left: readNumber(attrs[`${prefix}left`]) ?? readNumber(attrs[`${prefix}start`]) ?? base.left,
  };
}

function spreadShorthand(value: string): Edges {
  const numbers = value
    .split(',')
    .map((part) => readNumber(part))
    .filter((part): part is number => part !== null);
  const [first, second, third, fourth] = numbers;
  if (first === undefined) return NO_EDGES;
  if (second === undefined) return { top: first, right: first, bottom: first, left: first };
  if (third === undefined) return { top: second, right: first, bottom: second, left: first };
  return { top: second, right: third, bottom: fourth ?? second, left: first };
}

function countColumns(value: string | undefined): number {
  if (value === undefined) return 1;
  return Math.max(1, value.split(',').length);
}

function readNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /-?\d+(\.\d+)?/.exec(value);
  if (match === null) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function localName(name: string): string {
  const colon = name.indexOf(':');
  return (colon === -1 ? name : name.slice(colon + 1)).toLowerCase();
}

/**
 * Сообщение Chromium приходит абзацем служебного текста. Ученику нужна строка
 * с ошибкой, а не «This page contains the following errors».
 */
function readableParseError(raw: string): string {
  const line = /line (\d+)/i.exec(raw)?.[1];
  const detail = raw
    .replace(/This page contains the following errors:?/i, '')
    .replace(/Below is a rendering of the page up to the first error\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const where = line === undefined ? '' : ` (linia ${line})`;
  return `Błąd składni XML${where}: ${detail === '' ? 'dokument nie jest poprawnym XML.' : detail}`;
}
