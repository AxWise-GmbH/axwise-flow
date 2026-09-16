import * as React from 'react';
import { forwardRef } from 'react';
const LgEmptyTrush = ({ title, titleId, ...props }, ref) => (
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
      x1={4.478}
      x2={19.522}
      y1={3.108}
      y2={18.152}
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
      d="M19 3H5a1 1 0 0 0-.994 1.11L5.55 18l.037.331A3 3 0 0 0 8.568 21h6.864a3 3 0 0 0 2.982-2.669L18.45 18l1.543-13.89A1 1 0 0 0 19 3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.478}
      x2={19.522}
      y1={3.108}
      y2={18.152}
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
      d="M19 3.5c.144 0 .276.059.373.167.096.107.14.245.124.389l-1.543 13.89-.037.331a2.497 2.497 0 0 1-2.485 2.224H8.568a2.497 2.497 0 0 1-2.485-2.224l-.037-.331L4.503 4.055a.5.5 0 0 1 .125-.388A.5.5 0 0 1 5 3.5zm0-.5H5a1 1 0 0 0-.994 1.11L5.55 18l.037.331A3 3 0 0 0 8.568 21h6.864a3 3 0 0 0 2.982-2.669L18.45 18l1.543-13.89A1 1 0 0 0 19 3"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgEmptyTrush);
export default ForwardRef;
