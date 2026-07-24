const PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112",
] as const;

function valuesFor(value: string): number[] {
  const normalized = value.toUpperCase();
  if (![...normalized].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) <= 126)) {
    throw new Error("Code 128 supports printable ASCII characters only.");
  }
  const values = [...normalized].map((character) => character.charCodeAt(0) - 32);
  const checksum = (104 + values.reduce((sum, current, index) => sum + current * (index + 1), 0)) % 103;
  return [104, ...values, checksum, 106];
}

export function code128Bars(value: string, moduleWidth = 2, height = 64): { width: number; height: number; bars: Array<{ x: number; width: number }> } {
  const quiet = 10 * moduleWidth;
  let x = quiet;
  const bars: Array<{ x: number; width: number }> = [];
  for (const code of valuesFor(value)) {
    const pattern = PATTERNS[code];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = Number(pattern[index]) * moduleWidth;
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    }
  }
  return { width: x + quiet, height, bars };
}

export function code128Svg(value: string, moduleWidth = 2, height = 64): string {
  const barcode = code128Bars(value, moduleWidth, height);
  const rectangles = barcode.bars.map((bar) => `<rect x="${bar.x}" y="0" width="${bar.width}" height="${height}" fill="#0D1B2A"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${barcode.width}" height="${height}" viewBox="0 0 ${barcode.width} ${height}">${rectangles}</svg>`;
}
