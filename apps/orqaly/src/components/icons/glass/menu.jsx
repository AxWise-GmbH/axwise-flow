import * as React from 'react';
import { forwardRef } from 'react';
const LgMenu = ({ title, titleId, ...props }, ref) => (
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
      x1={3.086}
      x2={20.914}
      y1={3.086}
      y2={20.914}
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
      d="M22 12a2 2 0 0 1-2 2H4a2 2 0 1 1 0-4h16a2 2 0 0 1 2 2M4 7h16a2 2 0 1 0 0-4H4a2 2 0 1 0 0 4m16 10H4a2 2 0 1 0 0 4h16a2 2 0 1 0 0-4"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.086}
      x2={20.914}
      y1={3.086}
      y2={20.914}
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
      d="M20 3.5c.827 0 1.5.673 1.5 1.5s-.673 1.5-1.5 1.5H4c-.827 0-1.5-.673-1.5-1.5S3.173 3.5 4 3.5zm0 7c.827 0 1.5.673 1.5 1.5s-.673 1.5-1.5 1.5H4c-.827 0-1.5-.673-1.5-1.5s.673-1.5 1.5-1.5zm0 7c.827 0 1.5.673 1.5 1.5s-.673 1.5-1.5 1.5H4c-.827 0-1.5-.673-1.5-1.5s.673-1.5 1.5-1.5zM20 3H4a2 2 0 1 0 0 4h16a2 2 0 1 0 0-4m0 7H4a2 2 0 1 0 0 4h16a2 2 0 1 0 0-4m0 7H4a2 2 0 1 0 0 4h16a2 2 0 1 0 0-4"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgMenu);
export default ForwardRef;
