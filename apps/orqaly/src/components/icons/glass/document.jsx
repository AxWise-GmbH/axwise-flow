import * as React from 'react';
import { forwardRef } from 'react';
const LgDocument = ({ title, titleId, ...props }, ref) => (
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
      x1={2.818}
      x2={19.061}
      y1={4.939}
      y2={21.182}
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
      d="M4 19V5a3 3 0 0 1 3-3h7l6 6v11a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={2.818}
      x2={19.061}
      y1={4.939}
      y2={21.182}
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
      d="M13.793 2.5 19.5 8.207V19c0 1.379-1.122 2.5-2.5 2.5H7A2.503 2.503 0 0 1 4.5 19V5c0-1.379 1.122-2.5 2.5-2.5zM14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8z"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={12.793}
      x2={18.793}
      y1={3.207}
      y2={9.207}
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
      d="M14 6V2l6 6h-4a2 2 0 0 1-2-2"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={9.793}
      x2={14.207}
      y1={9.793}
      y2={14.207}
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
      d="M15 13H9a1 1 0 1 1 0-2h6a1 1 0 1 1 0 2"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={9.293}
      x2={12.707}
      y1={14.293}
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
      d="M13 17H9a1 1 0 1 1 0-2h4a1 1 0 1 1 0 2"
      style={{
        fill: 'url(#e)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgDocument);
export default ForwardRef;
