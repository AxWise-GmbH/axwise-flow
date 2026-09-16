import * as React from 'react';
import { forwardRef } from 'react';
const LgSearch = ({ title, titleId, ...props }, ref) => (
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
      x1={4.696}
      x2={21.274}
      y1={4.696}
      y2={21.274}
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
      d="m21.414 18.586-2.801-2.801A8.95 8.95 0 0 0 20 11c0-4.971-4.029-9-9-9s-9 4.029-9 9a9 9 0 0 0 9 9 8.94 8.94 0 0 0 4.785-1.387l2.801 2.801a2 2 0 1 0 2.828-2.828M11 16a5 5 0 1 1 .001-10.001A5 5 0 0 1 11 16"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.636}
      x2={21.414}
      y1={4.636}
      y2={21.414}
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
      d="M11 2.5c4.687 0 8.5 3.813 8.5 8.5a8.47 8.47 0 0 1-1.31 4.518l-.213.338.282.282 2.801 2.801c.284.284.44.66.44 1.061s-.156.777-.439 1.061-.66.439-1.061.439-.777-.156-1.061-.439l-2.801-2.801-.282-.282-.338.213A8.5 8.5 0 0 1 11 19.5c-4.687 0-8.5-3.813-8.5-8.5S6.313 2.5 11 2.5m0 14c3.033 0 5.5-2.467 5.5-5.5S14.033 5.5 11 5.5 5.5 7.967 5.5 11s2.467 5.5 5.5 5.5M11 2a9 9 0 0 0-9 9 9 9 0 0 0 9 9 8.94 8.94 0 0 0 4.785-1.387l2.801 2.801c.39.391.902.586 1.414.586a2 2 0 0 0 1.414-3.414l-2.801-2.801A8.95 8.95 0 0 0 20 11a9 9 0 0 0-9-9m0 14a5 5 0 1 1 .001-10.001A5 5 0 0 1 11 16"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgSearch);
export default ForwardRef;
