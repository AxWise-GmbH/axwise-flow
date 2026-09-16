import * as React from 'react';
import { forwardRef } from 'react';
const LgCancel = ({ title, titleId, ...props }, ref) => (
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
      x1={4.929}
      x2={19.071}
      y1={4.929}
      y2={19.071}
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
      cy={12}
      r={10}
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.929}
      x2={19.071}
      y1={4.929}
      y2={19.071}
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
      d="M12 2.5c5.238 0 9.5 4.262 9.5 9.5s-4.262 9.5-9.5 9.5-9.5-4.262-9.5-9.5S6.762 2.5 12 2.5m0-.5C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={7.791}
      x2={16.209}
      y1={7.79}
      y2={16.209}
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
      d="m13.403 12 2.812-2.812a.985.985 0 0 0 0-1.392l-.011-.011a.985.985 0 0 0-1.392 0L12 10.597 9.188 7.785a.985.985 0 0 0-1.392 0l-.011.011a.985.985 0 0 0 0 1.392L10.597 12l-2.812 2.812a.985.985 0 0 0 0 1.392l.011.011a.985.985 0 0 0 1.392 0L12 13.403l2.812 2.812a.985.985 0 0 0 1.392 0l.011-.011a.985.985 0 0 0 0-1.392z"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgCancel);
export default ForwardRef;
