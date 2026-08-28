import { useCallback, useRef, useState } from 'preact/hooks';

type Loaded = {
  name: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
};

/**
 * Подготовка изображений под практическую часть INF.03: задание требует
 * привести картинку к заданной ширине с сохранением пропорций. Canvas делает
 * это на устройстве и не весит ничего, а тренажёра под эту часть экзамена нет
 * ни у кого.
 */
export default function ImageTool() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [targetWidth, setTargetWidth] = useState(300);
  const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const open = useCallback(async (file: File) => {
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      setLoaded({ name: file.name, width: bitmap.width, height: bitmap.height, bitmap });
    } catch {
      setError('Nie udało się otworzyć pliku jako obrazu.');
    }
  }, []);

  const targetHeight =
    loaded === null ? 0 : Math.round((targetWidth * loaded.height) / loaded.width);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null || loaded === null) return;
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (context === null) return;
    context.imageSmoothingQuality = 'high';
    context.drawImage(loaded.bitmap, 0, 0, targetWidth, targetHeight);
  }, [loaded, targetWidth, targetHeight]);

  const download = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null || loaded === null) return;
    const extension = format.split('/')[1] ?? 'jpg';
    canvas.toBlob((blob) => {
      if (blob === null) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${loaded.name.replace(/\.[^.]+$/, '')}-${targetWidth}.${extension}`;
      link.click();
      URL.revokeObjectURL(url);
    }, format);
  }, [format, loaded, targetWidth]);

  return (
    <section className="rounded-card border border-[var(--color-line)] p-4">
      <h2 className="font-medium">Przygotowanie obrazu · Подготовка изображения</h2>
      <p className="mt-1 text-label text-[var(--color-muted)]">
        Skalowanie do zadanej szerokości z zachowaniem proporcji, jak w zadaniu praktycznym INF.03.
        Plik nie opuszcza urządzenia.
      </p>

      <label className="mt-4 inline-block cursor-pointer rounded-lg border border-[var(--color-line)] px-3 py-2 text-label">
        Wybierz obraz
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = (event.currentTarget as HTMLInputElement).files?.[0];
            if (file !== undefined) void open(file);
          }}
        />
      </label>

      {error === null ? null : (
        <p className="mt-3 rounded-lg border-l-4 border-[var(--color-bad)] p-3 text-label">{error}</p>
      )}

      {loaded === null ? null : (
        <>
          <p className="mt-3 text-label text-[var(--color-muted)]">
            {loaded.name}: {loaded.width} × {loaded.height} px
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 text-label">
            <label className="block">
              <span className="text-[var(--color-muted)]">Szerokość docelowa, px</span>
              <input
                type="number"
                min={1}
                max={4000}
                value={targetWidth}
                onInput={(event) =>
                  setTargetWidth(
                    Math.max(1, Number((event.currentTarget as HTMLInputElement).value) || 1),
                  )
                }
                className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
              />
            </label>
            <label className="block">
              <span className="text-[var(--color-muted)]">Format</span>
              <select
                value={format}
                onChange={(event) =>
                  setFormat(
                    (event.currentTarget as HTMLSelectElement).value as typeof format,
                  )
                }
                className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-transparent p-2"
              >
                <option value="image/jpeg">JPEG</option>
                <option value="image/png">PNG</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>
          </div>

          <p className="mt-2 text-label">
            Wynik: <strong>{targetWidth} × {targetHeight} px</strong>
            <span className="text-[var(--color-faint)]"> — proporcje zachowane automatycznie</span>
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={render}
              className="rounded-lg border border-[var(--color-accent)] px-3 py-2 text-label text-[var(--color-accent)]"
            >
              Przeskaluj
            </button>
            <button
              type="button"
              onClick={download}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-label"
            >
              Pobierz
            </button>
          </div>

          <canvas
            ref={canvasRef}
            className="mt-3 max-w-full rounded-lg border border-[var(--color-line)]"
          />
        </>
      )}
    </section>
  );
}
