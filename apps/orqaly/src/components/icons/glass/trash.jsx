import * as React from 'react';
import { forwardRef } from 'react';
const LgTrash = ({ title, titleId, ...props }, ref) => (
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
      x1={3.732}
      x2={20.268}
      y1={3.439}
      y2={19.975}
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
      d="M21 5a2 2 0 0 0-2-2h-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1H5a1.994 1.994 0 0 0-1 3.723V19a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V6.723c.595-.347 1-.985 1-1.723"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.732}
      x2={20.268}
      y1={3.439}
      y2={19.975}
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
      d="M15 2.5a.5.5 0 0 1 .5.5v.5H19c.827 0 1.5.673 1.5 1.5 0 .534-.281 1.017-.751 1.29l-.249.145V19c0 1.379-1.122 2.5-2.5 2.5H7A2.5 2.5 0 0 1 4.5 19V6.435l-.248-.145A1.48 1.48 0 0 1 3.5 5c0-.827.673-1.5 1.5-1.5h3.5V3a.5.5 0 0 1 .5-.5zm0-.5H9a1 1 0 0 0-1 1H5a1.994 1.994 0 0 0-1 3.723V19a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V6.723A1.994 1.994 0 0 0 19 3h-3a1 1 0 0 0-1-1"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={7.086}
      x2={16.914}
      y1={0.086}
      y2={9.914}
      gradientUnits="userSpaceOnUse"
    >
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
      d="M19 3h-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1H5a2 2 0 1 0 0 4h14a2 2 0 1 0 0-4"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgTrash);
export default ForwardRef;
