import * as React from 'react';
import { forwardRef } from 'react';
const LgCalendar = ({ title, titleId, ...props }, ref) => (
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
      x1={3.879}
      x2={20.121}
      y1={3.879}
      y2={20.121}
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
      d="M18 21H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.879}
      x2={20.121}
      y1={3.879}
      y2={20.121}
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
      d="M18 3.5c1.378 0 2.5 1.121 2.5 2.5v12c0 1.379-1.122 2.5-2.5 2.5H6A2.503 2.503 0 0 1 3.5 18V6c0-1.379 1.122-2.5 2.5-2.5zm0-.5H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient id="c" x1={3} x2={21} y1={5} y2={5} gradientUnits="userSpaceOnUse">
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
      d="M18 3H6a3 3 0 0 0-3 3v1h18V6a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={8.293}
      x2={15.707}
      y1={10.293}
      y2={17.707}
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
      d="M15 18a1 1 0 1 1-2 0 1 1 0 0 1 2 0m-5-1a1 1 0 1 0 0 2 1 1 0 0 0 0-2m-4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2m0-4a1 1 0 1 0 0 2 1 1 0 0 0 0-2m4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2m4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2m4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2m0-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2m-4-2a1 1 0 1 0 0 2 1 1 0 0 0 0-2m-4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgCalendar);
export default ForwardRef;
