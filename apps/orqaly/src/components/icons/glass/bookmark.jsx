import * as React from 'react';
import { forwardRef } from 'react';
const LgBookmark = ({ title, titleId, ...props }, ref) => (
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
    <linearGradient id="a" x1={3} x2={19.828} y1={3.586} y2={20.414} gradientUnits="userSpaceOnUse">
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
      d="M4 21V3a1 1 0 0 1 1-1h12a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a1 1 0 0 1-1-1"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={3} x2={19.828} y1={3.586} y2={20.414} gradientUnits="userSpaceOnUse">
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
      d="M17 2.5c1.379 0 2.5 1.122 2.5 2.5v14c0 1.378-1.121 2.5-2.5 2.5H5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5zm0-.5H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h12a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={6.615}
      x2={14.385}
      y1={3.385}
      y2={11.156}
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
      d="M13 2H8v10.216a.782.782 0 0 0 1.271.611l1.229-.983 1.229.983A.782.782 0 0 0 13 12.216z"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgBookmark);
export default ForwardRef;
