import { describe, expect, it } from 'vitest';
import { buildLayout } from './layout';
import type { LayoutNode, RawNode } from './layout';

function node(tag: string, attrs: Record<string, string> = {}, children: RawNode[] = []): RawNode {
  return { tag, attrs, children };
}

function ok(raw: RawNode): { root: LayoutNode; warnings: string[] } {
  const parsed = buildLayout(raw);
  if (parsed.kind !== 'ok') throw new Error(`ожидался разбор, получено: ${parsed.message}`);
  return { root: parsed.root, warnings: parsed.warnings };
}

describe('разбор Android XML', () => {
  it('читает ориентацию и размеры контейнера', () => {
    const { root } = ok(
      node('LinearLayout', {
        orientation: 'horizontal',
        layout_width: 'match_parent',
        layout_height: 'wrap_content',
      }),
    );
    expect(root.widget).toEqual({ kind: 'linear', orientation: 'horizontal' });
    expect(root.box.width).toEqual({ kind: 'match' });
    expect(root.box.height).toEqual({ kind: 'wrap' });
  });

  it('не путает gravity с layout_gravity', () => {
    const { root } = ok(
      node('LinearLayout', {}, [
        node('TextView', { gravity: 'center', text: 'w środku pola' }),
        node('Button', { layout_gravity: 'end', text: 'przy krawędzi' }),
      ]),
    );
    const [text, button] = root.children;
    expect(text?.box.gravity).toEqual({ horizontal: 'center', vertical: 'center' });
    expect(text?.box.layoutGravity).toEqual({ horizontal: null, vertical: null });
    expect(button?.box.layoutGravity).toEqual({ horizontal: 'end', vertical: null });
    expect(button?.box.gravity).toEqual({ horizontal: null, vertical: null });
  });

  it('разбирает составную gravity вида bottom|end', () => {
    const { root } = ok(node('LinearLayout', { gravity: 'bottom|end' }));
    expect(root.box.gravity).toEqual({ horizontal: 'end', vertical: 'bottom' });
  });

  it('читает вес и нулевую ширину, на которых строится пропорция', () => {
    const { root } = ok(
      node('LinearLayout', { orientation: 'horizontal' }, [
        node('Button', { layout_width: '0dp', layout_weight: '2' }),
      ]),
    );
    expect(root.children[0]?.box.weight).toBe(2);
    expect(root.children[0]?.box.width).toEqual({ kind: 'fixed', dp: 0 });
  });

  it('складывает общий padding с отдельной стороной', () => {
    const { root } = ok(node('LinearLayout', { padding: '8', paddingtop: '24' }));
    expect(root.box.padding).toEqual({ top: 24, right: 8, bottom: 8, left: 8 });
  });

  it('переводит виджеты в модель, а не в разметку', () => {
    const { root } = ok(
      node('LinearLayout', {}, [
        node('TextView', { text: 'Logowanie' }),
        node('EditText', { hint: 'Hasło' }),
        node('ImageView', { src: '@drawable/logo' }),
      ]),
    );
    expect(root.children.map((child) => child.widget)).toEqual([
      { kind: 'text', text: 'Logowanie' },
      { kind: 'field', hint: 'Hasło', text: '' },
      { kind: 'image', source: '@drawable/logo' },
    ]);
  });

  it('показывает неизвестный тег вместо пустого места', () => {
    const { root } = ok(node('LinearLayout', {}, [node('Switch', {})]));
    expect(root.children[0]?.widget).toEqual({ kind: 'unknown', tag: 'Switch' });
  });

  it('предупреждает о том, что не воспроизводит', () => {
    const { warnings } = ok(
      node('ConstraintLayout', {}, [node('Button', { layout_constrainttop_totopof: 'parent' })]),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('ConstraintLayout');
  });
});

describe('разбор XAML', () => {
  it('переводит StackLayout, Label и Entry', () => {
    const { root } = ok(
      node('StackLayout', { Orientation: 'Vertical' }, [
        node('Label', { Text: 'Kalkulator' }),
        node('Entry', { Placeholder: 'Podaj ocenę' }),
      ]),
    );
    expect(root.widget).toEqual({ kind: 'linear', orientation: 'vertical' });
    expect(root.children.map((child) => child.widget)).toEqual([
      { kind: 'text', text: 'Kalkulator' },
      { kind: 'field', hint: 'Podaj ocenę', text: '' },
    ]);
  });

  it('читает HorizontalOptions как выравнивание в родителе, а не внутри себя', () => {
    const { root } = ok(node('StackLayout', {}, [node('Button', { HorizontalOptions: 'Center' })]));
    expect(root.children[0]?.box.layoutGravity.horizontal).toBe('center');
    expect(root.children[0]?.box.width).toEqual({ kind: 'wrap' });
  });

  it('раскрывает Margin из четырёх чисел в порядке XAML', () => {
    const { root } = ok(node('StackLayout', { Margin: '4,16,8,2' }));
    expect(root.box.margin).toEqual({ top: 16, right: 8, bottom: 2, left: 4 });
  });

  it('считает колонки Grid по ColumnDefinitions', () => {
    const { root } = ok(node('Grid', { ColumnDefinitions: '*,*,Auto' }));
    expect(root.widget).toEqual({ kind: 'grid', columns: 3 });
  });
});

describe('защита от кривой разметки', () => {
  it('отказывается разбирать неизвестный корень вместо пустого экрана', () => {
    const parsed = buildLayout(node('html'));
    expect(parsed.kind).toBe('error');
    if (parsed.kind === 'error') expect(parsed.message).toContain('html');
  });
});
