import * as React from 'react';
import { forwardRef } from 'react';
const LgUpload2 = ({ title, titleId, ...props }, ref) => (
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
      x1={4.697}
      x2={19.095}
      y1={6.993}
      y2={21.391}
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
      d="M19.483 8.192C18.345 5.161 15.429 3 12 3a8 8 0 0 0-7.945 7.095A4.997 4.997 0 0 0 5 20h13a5.998 5.998 0 0 0 1.483-11.808"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={0} x2={24} y1={11.5} y2={11.5} gradientUnits="userSpaceOnUse">
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
      d="M12 3.5c3.103 0 5.922 1.956 7.015 4.868l.092.244.253.064a5.49 5.49 0 0 1 4.14 5.323c0 3.033-2.467 5.5-5.5 5.5H5a4.505 4.505 0 0 1-4.5-4.5 4.5 4.5 0 0 1 3.649-4.414l.361-.069.041-.366A7.49 7.49 0 0 1 12 3.5m0-.5a8 8 0 0 0-7.945 7.095A4.997 4.997 0 0 0 5 20h13a5.998 5.998 0 0 0 1.483-11.808C18.345 5.161 15.429 3 12 3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={9.398}
      x2={14.602}
      y1={9.767}
      y2={14.97}
      gradientTransform="matrix(-1 0 0 -1 24 25.579)"
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
      d="M8.706 13H11v4a1 1 0 0 0 2 0v-4h2.294a.691.691 0 0 0 .491-1.178L12.71 8.717a1 1 0 0 0-1.421 0l-3.075 3.104A.692.692 0 0 0 8.706 13"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgUpload2);
export default ForwardRef;
