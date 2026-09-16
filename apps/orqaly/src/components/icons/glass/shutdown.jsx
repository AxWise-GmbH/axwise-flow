import * as React from 'react';
import { forwardRef } from 'react';
const LgShutdown = ({ title, titleId, ...props }, ref) => (
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
      x1={9.793}
      x2={14.207}
      y1={6.793}
      y2={11.207}
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
      d="M12 13a1 1 0 0 1-1-1V6a1 1 0 1 1 2 0v6a1 1 0 0 1-1 1"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={7.054}
      x2={16.946}
      y1={7.056}
      y2={16.948}
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
      d="M12 19c-3.859 0-7-3.141-7-7 0-1.979.85-3.878 2.332-5.207a.999.999 0 1 1 1.336 1.488A5 5 0 0 0 7 12c0 2.757 2.243 5 5 5s5-2.243 5-5a5 5 0 0 0-1.668-3.719 1 1 0 1 1 1.336-1.488A7 7 0 0 1 19 12c0 3.859-3.141 7-7 7"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgShutdown);
export default ForwardRef;
