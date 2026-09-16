import * as React from 'react';
import { forwardRef } from 'react';
const LgMusic = ({ title, titleId, ...props }, ref) => (
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
    <linearGradient id="a" x1={9.172} x2={17.621} y1={7} y2={15.45} gradientUnits="userSpaceOnUse">
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
      d="M20 3h-6a2 2 0 0 0-2 2v6.422A5 5 0 0 0 10 11a5 5 0 1 0 5 5V8h2a4 4 0 0 0 4-4 1 1 0 0 0-1-1"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={9.172} x2={17.621} y1={7} y2={15.45} gradientUnits="userSpaceOnUse">
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
      d="M20 3.5a.5.5 0 0 1 .5.5c0 1.93-1.57 3.5-3.5 3.5h-2.5V16c0 2.481-2.019 4.5-4.5 4.5S5.5 18.481 5.5 16s2.019-4.5 4.5-4.5c.618 0 1.223.128 1.8.38l.7.307V5c0-.827.673-1.5 1.5-1.5h6m0-.5h-6a2 2 0 0 0-2 2v6.422A5 5 0 0 0 10 11a5 5 0 1 0 5 5V8h2a4 4 0 0 0 4-4 1 1 0 0 0-1-1"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgMusic);
export default ForwardRef;
