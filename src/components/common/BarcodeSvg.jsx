import { useMemo } from 'react';

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

export function encodeCode128B(text) {
  if (!text) return null;
  const clean = String(text).trim();
  if (!clean) return null;

  const codes = [104]; // Start B
  let checkSum = 104;

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i) - 32;
    if (code < 0 || code > 95) return null; // ASCII 32 to 127 supported in Code 128B
    codes.push(code);
    checkSum += code * (i + 1);
  }

  codes.push(checkSum % 103);
  codes.push(106); // Stop

  const bars = [];
  let x = 10; // Quiet zone
  const quietZone = 10;

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) return null;

    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j], 10);
      const isBar = j % 2 === 0;
      if (isBar) {
        bars.push({ x, width });
      }
      x += width;
    }
  }

  const totalWidth = x + quietZone;
  return { bars, totalWidth, text: clean };
}

export function BarcodeSvg({
  value,
  height = 42,
  showText = true,
  className = '',
  barColor = '#111827',
}) {
  const result = useMemo(() => encodeCode128B(value), [value]);

  if (!result) {
    return (
      <div className={`barcode-fallback mono ${className}`}>
        {value || 'NO BARCODE'}
      </div>
    );
  }

  const svgHeight = showText ? height + 16 : height;

  return (
    <div className={`barcode-container ${className}`}>
      <svg
        viewBox={`0 0 ${result.totalWidth} ${svgHeight}`}
        className="barcode-svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Barcode: ${result.text}`}
      >
        <rect width="100%" height="100%" fill="transparent" />
        {result.bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={2}
            width={bar.width}
            height={height}
            fill={barColor}
          />
        ))}
        {showText && (
          <text
            x={result.totalWidth / 2}
            y={height + 13}
            textAnchor="middle"
            fill={barColor}
            fontSize="10"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            letterSpacing="1"
          >
            {result.text}
          </text>
        )}
      </svg>
    </div>
  );
}
