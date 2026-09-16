import * as React from 'react';
import { forwardRef } from 'react';
const LgCursor = ({ title, titleId, ...props }, ref) => (
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
      x1={2.592}
      x2={16.864}
      y1={6.124}
      y2={20.395}
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
      d="M18.584 12.854 8.091 2.361C7.319 1.59 6 2.136 6 3.227v15.044a1.256 1.256 0 0 0 1.939 1.054l3.1-2.008 1.911 3.72a1.77 1.77 0 1 0 3.151-1.618l-1.878-3.651 3.735-.797a1.256 1.256 0 0 0 .626-2.117"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={2.592}
      x2={16.864}
      y1={6.124}
      y2={20.395}
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
      d="M7.234 2.5a.7.7 0 0 1 .504.215l10.493 10.493c.199.199.27.479.19.749a.75.75 0 0 1-.567.525l-3.735.797-.639.136.299.581 1.878 3.651a1.272 1.272 0 0 1-2.261 1.161l-1.911-3.72-.253-.492-.464.301-3.1 2.008a.74.74 0 0 1-.408.125.76.76 0 0 1-.76-.758V3.227c0-.455.373-.727.734-.727m0-.5C6.604 2 6 2.489 6 3.227v15.044a1.258 1.258 0 0 0 1.94 1.054l3.1-2.008 1.911 3.72a1.77 1.77 0 0 0 2.384.767 1.77 1.77 0 0 0 .766-2.384l-1.878-3.651 3.735-.797a1.257 1.257 0 0 0 .626-2.117L8.091 2.361A1.2 1.2 0 0 0 7.234 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={11.74}
      x2={16.191}
      y1={16.617}
      y2={21.068}
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
      d="m11.039 17.318 1.911 3.72a1.77 1.77 0 1 0 3.151-1.618l-1.878-3.651"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgCursor);
export default ForwardRef;
