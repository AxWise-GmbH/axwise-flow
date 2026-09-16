import * as React from 'react';
import { forwardRef } from 'react';
const LgImageFile = ({ title, titleId, ...props }, ref) => (
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
      d="M13.793 2.5 19.5 8.207V19c0 1.378-1.121 2.5-2.5 2.5H7A2.503 2.503 0 0 1 4.5 19V5c0-1.378 1.122-2.5 2.5-2.5zM14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8z"
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
      x1={13.439}
      x2={15.561}
      y1={10.439}
      y2={12.561}
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
    <circle
      cx={14.5}
      cy={11.5}
      r={1.5}
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={8.367}
      x2={15.105}
      y1={13.793}
      y2={20.53}
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
      d="M7 18.375c0 .342.28.625.625.625h8.75a.624.624 0 0 0 .625-.625c0-.852-.472-3.375-1.5-3.375-.507 0-1.295 1-2 1-1.4 0-2.75-3-4-3S7 16.726 7 18.375"
      style={{
        fill: 'url(#e)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgImageFile);
export default ForwardRef;
