// Rampa de color TURBO (Google, 2019): secuencial, muy discriminable (tono+brillo varían a la vez) y con los EXTREMOS
// bien separados (índigo oscuro ↔ rojo oscuro). Sustituye al verde→rojo HSL en el histograma, el modo color «gen» y su leyenda.
// turboCss → string CSS (histograma/leyenda). turboHsl → {h,s,l} vía LUT, SIN asignaciones (bucle caliente del render).

const TURBO = [[48, 18, 59], [64, 91, 217], [35, 168, 224], [27, 229, 164], [132, 254, 75], [225, 210, 49], [251, 128, 33], [122, 4, 3]];
const lerp = (a, b, t) => a + (b - a) * t;

export function turboRGB(t) {
  const x = (t < 0 ? 0 : t > 1 ? 1 : t) * (TURBO.length - 1);
  const i = Math.min(TURBO.length - 2, Math.floor(x)), f = x - i, a = TURBO[i], b = TURBO[i + 1];
  return [Math.round(lerp(a[0], b[0], f)), Math.round(lerp(a[1], b[1], f)), Math.round(lerp(a[2], b[2], f))];
}

export function turboCss(t) { const c = turboRGB(t); return `rgb(${c[0]},${c[1]},${c[2]})`; }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d > 1e-9) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

// LUT HSL precalculada → el render (modo «gen») la indexa sin convertir RGB→HSL por agente/frame.
const LUT_N = 64, _lut = new Float32Array(LUT_N * 3);
for (let i = 0; i < LUT_N; i++) { const [r, g, b] = turboRGB(i / (LUT_N - 1)); const [h, s, l] = rgbToHsl(r, g, b); _lut[i * 3] = h; _lut[i * 3 + 1] = s; _lut[i * 3 + 2] = l; }
const _scr = [0, 0, 0];
// Devuelve un scratch [h,s,l] COMPARTIDO (léelo de inmediato; monohilo, sin reentrada) → cero asignaciones en el bucle caliente.
export function turboHsl(t) {
  let k = ((t < 0 ? 0 : t > 1 ? 1 : t) * (LUT_N - 1) + 0.5) | 0; if (k >= LUT_N) k = LUT_N - 1;
  const b = k * 3; _scr[0] = _lut[b]; _scr[1] = _lut[b + 1]; _scr[2] = _lut[b + 2]; return _scr;
}
