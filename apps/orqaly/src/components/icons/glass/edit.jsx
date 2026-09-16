import * as React from 'react';
import { forwardRef } from 'react';
const LgEdit = ({ title, titleId, ...props }, ref) => (
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
      x1={9.275}
      x2={14.058}
      y1={9.931}
      y2={14.715}
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
      d="M20.011 3.989a3.375 3.375 0 0 0-4.773 0L4.208 14.998a2.07 2.07 0 0 0-.576 1.11l-.615 3.567a1.132 1.132 0 0 0 1.31 1.308l3.525-.613a2.06 2.06 0 0 0 1.104-.573L20.011 8.761a3.37 3.37 0 0 0 0-4.772"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={3} x2={21} y1={12} y2={12} gradientUnits="userSpaceOnUse">
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
      d="M17.625 3.5c.768 0 1.49.299 2.033.842s.842 1.265.842 2.033-.299 1.49-.842 2.033L8.603 19.443a1.56 1.56 0 0 1-.837.434l-3.525.613a.633.633 0 0 1-.732-.73l.615-3.567c.055-.321.206-.611.436-.841l11.031-11.01a2.86 2.86 0 0 1 2.034-.842m0-.5c-.864 0-1.727.33-2.387.989L4.208 14.998a2.07 2.07 0 0 0-.576 1.11l-.615 3.567a1.132 1.132 0 0 0 1.31 1.308l3.525-.613a2.06 2.06 0 0 0 1.104-.573L20.011 8.761A3.375 3.375 0 0 0 17.625 3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={7.999}
      x2={12.775}
      y1={11.221}
      y2={15.997}
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
      d="m19.832 8.94-1.984 1.978-4.773-4.773 1.984-1.978zM3.017 19.675a1.132 1.132 0 0 0 1.31 1.308l2.171-.378L3.392 17.5z"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgEdit);
export default ForwardRef;
