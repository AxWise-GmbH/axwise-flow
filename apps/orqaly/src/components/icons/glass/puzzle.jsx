import * as React from 'react';
import { forwardRef } from 'react';
const LgPuzzle = ({ title, titleId, ...props }, ref) => (
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
      x1={3.379}
      x2={20.621}
      y1={3.379}
      y2={20.621}
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
      d="M19 3H5a3 3 0 0 0-3 3v2.369c0 .76.758 1.278 1.471 1.016C4.032 9.179 4.626 9 5 9a3 3 0 1 1 0 6c-.374 0-.968-.179-1.529-.385A1.09 1.09 0 0 0 2 15.631V18a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.379}
      x2={20.621}
      y1={3.379}
      y2={20.621}
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
      d="M19 3.5c1.378 0 2.5 1.122 2.5 2.5v12c0 1.378-1.122 2.5-2.5 2.5H5A2.503 2.503 0 0 1 2.5 18v-2.369c0-.205.095-.34.175-.417a.6.6 0 0 1 .623-.13c.761.28 1.318.416 1.702.416 1.93 0 3.5-1.57 3.5-3.5S6.93 8.5 5 8.5c-.384 0-.941.136-1.702.416a.588.588 0 0 1-.798-.547V6c0-1.378 1.122-2.5 2.5-2.5zm0-.5H5a3 3 0 0 0-3 3v2.369a1.085 1.085 0 0 0 1.471 1.016C4.032 9.179 4.626 9 5 9a3 3 0 1 1 0 6c-.374 0-.968-.179-1.529-.385A1.085 1.085 0 0 0 2 15.631V18a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={11.061}
      x2={23.182}
      y1={5.939}
      y2={18.061}
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
      d="M19 3h-5a3 3 0 0 1 3 3v2.369c0 .76-.758 1.278-1.471 1.016C14.968 9.179 14.374 9 14 9a3 3 0 1 0 0 6c.374 0 .968-.179 1.529-.385A1.09 1.09 0 0 1 17 15.631V18a3 3 0 0 1-3 3h5a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgPuzzle);
export default ForwardRef;
