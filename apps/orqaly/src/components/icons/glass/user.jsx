import * as React from 'react';
import { forwardRef } from 'react';
const LgUser = ({ title, titleId, ...props }, ref) => (
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
      x1={8.464}
      x2={15.536}
      y1={3.465}
      y2={10.536}
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
    <circle
      cx={12}
      cy={7}
      r={5}
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={7} x2={17} y1={7} y2={7} gradientUnits="userSpaceOnUse">
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
      d="M12 2.5c2.481 0 4.5 2.019 4.5 4.5s-2.019 4.5-4.5 4.5S7.5 9.481 7.5 7 9.519 2.5 12 2.5m0-.5a5 5 0 1 0 .001 10.001A5 5 0 0 0 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={6.879}
      x2={17.121}
      y1={12.879}
      y2={23.121}
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
      d="M18 15H6a3 3 0 1 0 0 6h12a3 3 0 1 0 0-6"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient id="d" x1={3} x2={21} y1={18} y2={18} gradientUnits="userSpaceOnUse">
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
      d="M18 15.5c1.378 0 2.5 1.121 2.5 2.5s-1.122 2.5-2.5 2.5H6c-1.379 0-2.5-1.121-2.5-2.5s1.121-2.5 2.5-2.5zm0-.5H6a3 3 0 1 0 0 6h12a3 3 0 1 0 0-6"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgUser);
export default ForwardRef;
