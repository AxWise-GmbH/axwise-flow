import * as React from 'react';
import { forwardRef } from 'react';
const LgOpenedFolder = ({ title, titleId, ...props }, ref) => (
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
      x1={2.358}
      x2={19.849}
      y1={2.813}
      y2={20.303}
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
      d="M22 8.504V8a3 3 0 0 0-3-3h-8l-.544-1.632A2 2 0 0 0 8.558 2H4a2 2 0 0 0-2 2v4.504a2.49 2.49 0 0 0-.965 2.407l1.097 6.582A3 3 0 0 0 5.091 20h13.818a3 3 0 0 0 2.959-2.507l1.097-6.582A2.49 2.49 0 0 0 22 8.504"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={2.358}
      x2={19.849}
      y1={2.813}
      y2={20.303}
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
      d="M8.558 2.5c.647 0 1.219.412 1.423 1.026l.544 1.632.115.342H19c1.379 0 2.5 1.121 2.5 2.5v.753l.199.15c.6.452.896 1.19.773 1.926l-1.097 6.582a2.49 2.49 0 0 1-2.466 2.089H5.091a2.49 2.49 0 0 1-2.466-2.089l-1.097-6.582a2 2 0 0 1 .773-1.926l.199-.15V4c0-.827.673-1.5 1.5-1.5zm0-.5H4a2 2 0 0 0-2 2v4.504a2.49 2.49 0 0 0-.965 2.407l1.097 6.582A3 3 0 0 0 5.091 20h13.818a3 3 0 0 0 2.959-2.507l1.097-6.582A2.49 2.49 0 0 0 22 8.504V8a3 3 0 0 0-3-3h-8l-.544-1.632A2 2 0 0 0 8.558 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={4.771}
      x2={17.437}
      y1={0.401}
      y2={13.067}
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
      d="M3.501 8H20.5c.568 0 1.084.19 1.5.504V8a3 3 0 0 0-3-3h-8l-.544-1.632A2 2 0 0 0 8.558 2H4a2 2 0 0 0-2 2v4.504A2.48 2.48 0 0 1 3.501 8"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgOpenedFolder);
export default ForwardRef;
