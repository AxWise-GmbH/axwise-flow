import * as React from 'react';
import { forwardRef } from 'react';
const LgUncheckAll = ({ title, titleId, ...props }, ref) => (
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
      d="M18.86 5.14A2.99 2.99 0 0 0 16 3H6a3 3 0 0 0-3 3v10a2.99 2.99 0 0 0 2.14 2.86A2.99 2.99 0 0 0 8 21h10a3 3 0 0 0 3-3V8a2.99 2.99 0 0 0-2.14-2.86"
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
      d="M16 3.5c1.103 0 2.06.717 2.381 1.784l.077.257.257.077A2.48 2.48 0 0 1 20.5 8v10c0 1.379-1.121 2.5-2.5 2.5H8a2.48 2.48 0 0 1-2.381-1.784l-.077-.257-.257-.077A2.48 2.48 0 0 1 3.5 16V6c0-1.378 1.121-2.5 2.5-2.5zm0-.5H6a3 3 0 0 0-3 3v10a2.99 2.99 0 0 0 2.14 2.86A2.99 2.99 0 0 0 8 21h10a3 3 0 0 0 3-3V8a2.99 2.99 0 0 0-2.14-2.86A2.99 2.99 0 0 0 16 3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient id="c" x1={12} x2={20.121} y1={12} y2={20.121} gradientUnits="userSpaceOnUse">
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
      d="M18.86 5.14c.082.274.14.559.14.86v10a3 3 0 0 1-3 3H6c-.301 0-.586-.058-.86-.14A2.99 2.99 0 0 0 8 21h10a3 3 0 0 0 3-3V8a2.99 2.99 0 0 0-2.14-2.86"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgUncheckAll);
export default ForwardRef;
