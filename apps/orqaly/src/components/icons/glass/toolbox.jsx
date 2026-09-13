import * as React from 'react';
import { forwardRef } from 'react';
const LgToolbox = ({ title, titleId, ...props }, ref) => (
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
      x1={3.482}
      x2={20.518}
      y1={3.689}
      y2={20.725}
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
      d="M20 4h-5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2H4a2 2 0 0 0-2 2v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V6a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.482}
      x2={20.518}
      y1={3.689}
      y2={20.725}
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
      d="M13 2.5c.827 0 1.5.673 1.5 1.5v.5H20c.827 0 1.5.673 1.5 1.5v12c0 1.378-1.121 2.5-2.5 2.5H5A2.503 2.503 0 0 1 2.5 18V6c0-.827.673-1.5 1.5-1.5h5.5V4c0-.827.673-1.5 1.5-1.5zm0-.5h-2a2 2 0 0 0-2 2H4a2 2 0 0 0-2 2v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V6a2 2 0 0 0-2-2h-5a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={6.043}
      x2={17.957}
      y1={1.129}
      y2={13.043}
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
      d="M22 6a2 2 0 0 0-2-2h-5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2H4a2 2 0 0 0-2 2v3h3.092c.207.581.756 1 1.408 1s1.202-.419 1.408-1h8.184c.207.581.756 1 1.408 1s1.202-.419 1.408-1H22z"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgToolbox);
export default ForwardRef;
