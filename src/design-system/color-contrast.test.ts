import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';

import { describe, expect, it } from 'vitest';

type Oklch = readonly [lightness: number, chroma: number, hue: number];

function rootTheme(source: string): string {
  const match = source.match(/:root\s*\{([\s\S]*?)\}/);
  if (!match) throw new Error('Light theme variables were not found.');
  return match[1];
}

function oklchVariable(theme: string, name: string): Oklch {
  const match = theme.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+);`));
  if (!match) throw new Error(`Color variable --${name} was not found.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function linearSrgb([lightness, chroma, hue]: Oklch): readonly [number, number, number] {
  const hueRadians = hue * Math.PI / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const l = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l ** 3;
  const m3 = m ** 3;
  const s3 = s ** 3;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

function relativeLuminance(color: Oklch): number {
  const [red, green, blue] = linearSrgb(color).map((channel) => (
    Math.min(1, Math.max(0, channel))
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: Oklch, second: Oklch): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    Math.max(firstLuminance, secondLuminance) + 0.05
  ) / (
    Math.min(firstLuminance, secondLuminance) + 0.05
  );
}

describe('light theme color contrast', () => {
  it.each(['background-50', 'background-100'])(
    'keeps small foreground-400 text WCAG AA compliant on %s',
    (backgroundName) => {
      const source = readFileSync(join(cwd(), 'src/index.css'), 'utf8');
      const theme = rootTheme(source);
      const foreground = oklchVariable(theme, 'foreground-400');
      const background = oklchVariable(theme, backgroundName);

      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
