import * as React from 'react';
import { forwardRef } from 'react';
const LgPlusMath = ({ title, titleId, ...props }, ref) => (
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
      x1={7.086}
      x2={16.914}
      y1={7.086}
      y2={16.914}
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
      d="M19 10h-5V5a2 2 0 1 0-4 0v5H5a2 2 0 1 0 0 4h5v5a2 2 0 1 0 4 0v-5h5a2 2 0 1 0 0-4"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={3} x2={21} y1={12} y2={12} gradientUnits="userSpaceOnUse">
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
      d="M12 3.5c.827 0 1.5.673 1.5 1.5v5.5H19c.827 0 1.5.673 1.5 1.5s-.673 1.5-1.5 1.5h-5.5V19c0 .827-.673 1.5-1.5 1.5s-1.5-.673-1.5-1.5v-5.5H5c-.827 0-1.5-.673-1.5-1.5s.673-1.5 1.5-1.5h5.5V5c0-.827.673-1.5 1.5-1.5m0-.5a2 2 0 0 0-2 2v5H5a2 2 0 1 0 0 4h5v5a2 2 0 1 0 4 0v-5h5a2 2 0 1 0 0-4h-5V5a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgPlusMath);
export default ForwardRef;
