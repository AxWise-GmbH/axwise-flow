/**
 * J&P logo – SVG from logo 2.svg. Renders inside a circular container (provided by parent).
 * Uses currentColor for theme-aware color. Use size prop for icon size (default 24).
 * Set animate=true for a gentle zoom-in / zoom-out pulse inside the circle.
 */
import { Box, keyframes } from '@mui/material';

const logoPulse = keyframes`
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.18); }
`;

export default function Logo({ size = 24, animate = false, sx = {}, ...props }) {
  return (
    <Box
      component="svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 510 498"
      fill="currentColor"
      width={size}
      height={size * (498 / 510)}
      sx={{
        display: 'block',
        color: 'inherit',
        flexShrink: 0,
        transformOrigin: 'center center',
        animation: animate ? `${logoPulse} 2.4s ease-in-out infinite` : 'none',
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none',
        },
        ...sx,
      }}
      {...props}
    >
      <g transform="translate(0,498) scale(0.1,-0.1)">
        <path d="M1120 3785 c-273 -61 -465 -246 -562 -540 -8 -26 -13 -92 -13 -185 0 -153 14 -219 67 -324 32 -63 89 -146 100 -146 6 0 40 20 77 43 36 24 97 58 134 76 l68 32 -39 47 c-147 175 -131 430 35 582 213 195 547 135 671 -120 61 -126 61 -247 1 -376 -16 -34 -29 -65 -29 -68 0 -3 305 -6 678 -6 l678 0 44 86 c25 47 69 115 98 151 30 35 51 68 47 71 -4 4 -261 8 -572 9 -310 1 -571 4 -579 7 -8 3 -14 19 -14 38 0 40 -14 95 -42 168 -86 220 -281 391 -513 450 -92 23 -246 25 -335 5z" />
        <path d="M3670 3205 c-231 -53 -412 -193 -518 -400 -61 -122 -90 -294 -70 -420 l13 -80 154 -3 c85 -1 158 1 163 6 4 4 1 30 -7 58 -49 163 24 364 169 463 100 68 254 91 370 56 194 -59 331 -276 295 -467 -44 -237 -237 -385 -469 -362 -70 7 -154 40 -206 79 l-33 25 -778 0 -779 0 -38 73 c-20 39 -50 87 -65 106 l-28 35 -51 -37 c-28 -21 -89 -56 -136 -78 -47 -22 -86 -43 -86 -46 0 -3 16 -24 36 -46 50 -55 76 -116 94 -227 l16 -95 860 -3 859 -2 52 -26 c105 -51 205 -73 330 -74 205 0 371 68 519 215 154 153 216 303 217 525 0 103 -4 138 -23 200 -87 278 -292 466 -571 525 -86 18 -211 18 -289 0z" />
        <path d="M1398 2648 c-13 -3 -54 -6 -92 -7 -315 -5 -570 -163 -700 -435 -52 -107 -70 -211 -62 -361 6 -127 16 -163 77 -288 78 -162 260 -317 429 -366 25 -7 58 -17 74 -22 44 -14 264 -10 326 5 221 55 402 204 499 411 13 28 28 60 33 72 19 39 5 43 -162 43 l-158 0 -22 -35 c-11 -19 -44 -55 -72 -80 -83 -75 -144 -102 -253 -111 -137 -12 -250 31 -343 130 -62 67 -87 110 -108 191 -47 176 37 374 202 470 65 38 129 55 214 55 69 0 160 15 236 38 100 31 232 119 311 207 32 36 58 70 58 77 0 9 -59 12 -232 12 -127 1 -242 -2 -255 -6z" />
      </g>
    </Box>
  );
}
