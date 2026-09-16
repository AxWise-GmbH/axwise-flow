import { Box, useTheme } from '@mui/material';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import { resolveModelBrand, HUGGINGFACE_BRAND } from '../../config/modelBrands';

// Keep a brand colour readable on the neutral glass tile: lift near-black
// marks (OpenAI, Ollama, Anthropic) in dark mode, and darken near-white marks
// in light mode. Other brand colours pass through unchanged.
function readableColor(hex, isDark) {
  const c = (hex || '#888888').replace('#', '');
  if (c.length !== 6) return `#${c}`;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (isDark && lum < 0.22) return '#EDEDED';
  if (!isDark && lum > 0.85) return '#222222';
  return `#${c}`;
}

/**
 * Renders a model maker's brand logo at a uniform size. Drops into the model
 * card's existing 42x42 header tile. Unknown makers fall back to a generic
 * server icon so every card keeps a same-size glyph.
 */
export default function ModelBrandIcon({ model, size = 22 }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // HF-sourced models fall back to the Hugging Face glyph (not the generic
  // server icon) so every Download card keeps a recognisable logo.
  const brand =
    resolveModelBrand(model) || (model?.source === 'huggingface' ? HUGGINGFACE_BRAND : null);

  if (!brand) {
    return <DnsOutlinedIcon sx={{ fontSize: size, color: 'text.secondary' }} />;
  }

  const label = `${brand.title} logo`;

  // Multi-colour mark (Microsoft): render each path with its own fill.
  if (brand.paths) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={label}
        style={{ display: 'block' }}
      >
        {brand.paths.map((p) => (
          <path key={p.d} d={p.d} fill={p.fill} />
        ))}
      </svg>
    );
  }

  // Single-colour glyph (simple-icons + OpenAI).
  if (brand.path) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={label}
        style={{ display: 'block' }}
      >
        <path d={brand.path} fill={readableColor(brand.hex, isDark)} />
      </svg>
    );
  }

  // Monogram fallback for brands with no vector (Cohere).
  return (
    <Box
      aria-label={label}
      sx={{
        width: size,
        height: size,
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: brand.hex,
        color: '#fff',
        fontSize: size * 0.58,
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      {brand.mono}
    </Box>
  );
}
