import * as React from 'react';
import { forwardRef } from 'react';
const LgRefresh = ({ title, titleId, ...props }, ref) => (
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
      x1={4.503}
      x2={19.497}
      y1={4.503}
      y2={19.497}
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
      d="m22.785 16.178-3.075 3.104a1 1 0 0 1-1.421 0l-3.075-3.104A.692.692 0 0 1 15.706 15H17v-5a3 3 0 0 0-3-3h-1a3 3 0 0 1-3-3 1 1 0 0 1 1-1h3a7 7 0 0 1 7 7v5h1.294c.614 0 .924.742.491 1.178M11 17h-1a3 3 0 0 1-3-3V9h1.294a.691.691 0 0 0 .491-1.178L5.71 4.717a1 1 0 0 0-1.421 0L1.215 7.822A.691.691 0 0 0 1.706 9H3v5a7 7 0 0 0 7 7h3a1 1 0 0 0 1-1 3 3 0 0 0-3-3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.503}
      x2={19.497}
      y1={4.503}
      y2={19.497}
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
      d="M14 3.5c3.584 0 6.5 2.916 6.5 6.5v5.5h1.794c.111 0 .159.074.177.118a.18.18 0 0 1-.041.209l-3.075 3.104a.498.498 0 0 1-.71 0l-3.075-3.104a.18.18 0 0 1-.041-.209.18.18 0 0 1 .177-.118H17.5V10c0-1.93-1.57-3.5-3.5-3.5h-1A2.503 2.503 0 0 1 10.5 4a.5.5 0 0 1 .5-.5zM5 4.921c.134 0 .261.053.355.148L8.43 8.173a.18.18 0 0 1 .041.209.18.18 0 0 1-.177.118H6.5V14c0 1.93 1.57 3.5 3.5 3.5h1c1.378 0 2.5 1.122 2.5 2.5a.5.5 0 0 1-.5.5h-3A6.51 6.51 0 0 1 3.5 14V8.5H1.706a.18.18 0 0 1-.177-.118.18.18 0 0 1 .041-.209l3.075-3.104A.5.5 0 0 1 5 4.921M14 3h-3a1 1 0 0 0-1 1 3 3 0 0 0 3 3h1a3 3 0 0 1 3 3v5h-1.294a.691.691 0 0 0-.491 1.178l3.075 3.104a.997.997 0 0 0 1.42 0l3.075-3.104A.691.691 0 0 0 22.294 15H21v-5a7 7 0 0 0-7-7M5 4.421a1 1 0 0 0-.71.296L1.215 7.822A.691.691 0 0 0 1.706 9H3v5a7 7 0 0 0 7 7h3a1 1 0 0 0 1-1 3 3 0 0 0-3-3h-1a3 3 0 0 1-3-3V9h1.294a.691.691 0 0 0 .491-1.178L5.71 4.717A1 1 0 0 0 5 4.421"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgRefresh);
export default ForwardRef;
