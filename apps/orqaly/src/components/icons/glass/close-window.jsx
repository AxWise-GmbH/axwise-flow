import * as React from 'react';
import { forwardRef } from 'react';
const LgCloseWindow = ({ title, titleId, ...props }, ref) => (
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
      d="M18 21H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3"
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
      d="M18 3.5c1.378 0 2.5 1.121 2.5 2.5v12c0 1.379-1.122 2.5-2.5 2.5H6A2.503 2.503 0 0 1 3.5 18V6c0-1.379 1.122-2.5 2.5-2.5zm0-.5H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
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
      d="M18 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3m-1.439 13.561a1.5 1.5 0 0 1-2.121 0l-2.439-2.439-2.439 2.439a1.5 1.5 0 1 1-2.121-2.121c.071-.073 1.15-1.152 2.438-2.44L7.44 9.561A1.5 1.5 0 1 1 9.561 7.44L12 9.879l2.439-2.439a1.5 1.5 0 1 1 2.121 2.121L14.121 12l2.439 2.439c.586.586.586 1.536.001 2.122"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
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
      d="M18 3.5c1.378 0 2.5 1.121 2.5 2.5v12c0 1.379-1.122 2.5-2.5 2.5H6A2.503 2.503 0 0 1 3.5 18V6c0-1.379 1.122-2.5 2.5-2.5zM9.172 12l-2.086 2.086A2.001 2.001 0 0 0 8.5 17.5c.534 0 1.036-.208 1.414-.586l.134-.134L12 14.828l1.77 1.77.316.316c.378.378.88.586 1.414.586s1.036-.208 1.414-.586c.78-.78.78-2.049 0-2.828L14.828 12l1.938-1.938.148-.147A2.001 2.001 0 0 0 15.5 6.5c-.534 0-1.036.208-1.414.586L12 9.172l-1.938-1.938-.148-.148A1.99 1.99 0 0 0 8.5 6.5a2.001 2.001 0 0 0-1.414 3.414zM18 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3M8.5 17a1.5 1.5 0 0 1-1.061-2.56L9.879 12 7.44 9.561a1.5 1.5 0 1 1 2.121-2.122L12 9.879l2.439-2.439c.293-.294.677-.44 1.061-.44s.768.146 1.061.439a1.5 1.5 0 0 1 0 2.121l-2.439 2.439 2.439 2.439A1.5 1.5 0 0 1 15.5 17c-.384 0-.768-.146-1.061-.439L12 14.122l-2.439 2.439A1.5 1.5 0 0 1 8.5 17"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgCloseWindow);
export default ForwardRef;
