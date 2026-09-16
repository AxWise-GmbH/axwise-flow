import * as React from 'react';
import { forwardRef } from 'react';
const LgUserFemale = ({ title, titleId, ...props }, ref) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    xmlSpace="preserve"
    baseProfile="basic"
    viewBox="0 0 24 24"
    ref={ref}
    aria-labelledby={titleId}
    {...props}
  >
    {title ? <title id={titleId}>{title}</title> : null}
    <linearGradient
      id="a"
      x1={3.904}
      x2={19.389}
      y1={5.368}
      y2={20.854}
      gradientUnits="userSpaceOnUse"
    >
      <stop
        offset={0}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.6,
        }}
      />
      <stop
        offset={1}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.3,
        }}
      />
    </linearGradient>
    <path
      d="M14 4a2 2 0 0 0-2-2h-1a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h3.435c1.046.625 2.257 1 3.565 1s2.519-.375 3.565-1H19a3 3 0 0 0 3-3v-5a8 8 0 0 0-8-8"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={2} x2={22} y1={11.5} y2={11.5} gradientUnits="userSpaceOnUse">
      <stop
        offset={0}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.6,
        }}
      />
      <stop
        offset={0.493}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0,
        }}
      />
      <stop
        offset={0.997}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.3,
        }}
      />
    </linearGradient>
    <path
      d="M12 2.5c.827 0 1.5.673 1.5 1.5v.5h.5c4.135 0 7.5 3.364 7.5 7.5v5c0 1.378-1.121 2.5-2.5 2.5h-3.573l-.118.071c-1.018.608-2.162.929-3.309.929s-2.291-.321-3.308-.929l-.119-.071H5A2.503 2.503 0 0 1 2.5 17v-6c0-4.687 3.813-8.5 8.5-8.5zm0-.5h-1a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h3.435c1.046.625 2.257 1 3.565 1s2.519-.375 3.565-1H19a3 3 0 0 0 3-3v-5a8 8 0 0 0-8-8 2 2 0 0 0-2-2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient id="c" x1={2} x2={22} y1={11} y2={11} gradientUnits="userSpaceOnUse">
      <stop
        offset={0}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.7,
        }}
      />
      <stop
        offset={0.519}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.45,
        }}
      />
      <stop
        offset={1}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.55,
        }}
      />
    </linearGradient>
    <path
      d="M14 4a2 2 0 0 0-2-2h-1a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h3.435a7.02 7.02 0 0 1-2.969-3.503A1.5 1.5 0 0 1 4 15c0-.66.429-1.214 1.021-1.415C5.237 9.913 8 10 8 10h8s2.782.239 2.979 3.585A1.5 1.5 0 0 1 20 15c0 .817-.654 1.478-1.467 1.497A7 7 0 0 1 15.564 20H19a3 3 0 0 0 3-3v-5a8 8 0 0 0-8-8"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgUserFemale);
export default ForwardRef;
