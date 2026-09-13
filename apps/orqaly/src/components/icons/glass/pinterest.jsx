import * as React from 'react';
import { forwardRef } from 'react';
const LgPinterest = ({ title, titleId, ...props }, ref) => (
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
      x1={4.929}
      x2={19.071}
      y1={4.929}
      y2={19.071}
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
    <circle
      cx={12}
      cy={12}
      r={10}
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.929}
      x2={19.071}
      y1={4.929}
      y2={19.071}
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
      d="M12 2.5c5.238 0 9.5 4.262 9.5 9.5s-4.262 9.5-9.5 9.5-9.5-4.262-9.5-9.5S6.762 2.5 12 2.5m0-.5C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={6.501}
      x2={15.5}
      y1={8.35}
      y2={17.348}
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
      d="M12.222 5.708c-4.316 0-6.608 2.898-6.608 6.052 0 1.467.781 3.292 2.03 3.874.189.088.291.05.334-.133.033-.139.202-.818.278-1.134a.3.3 0 0 0-.069-.287c-.413-.502-.744-1.423-.744-2.282 0-2.206 1.67-4.34 4.515-4.34 2.457 0 4.177 1.674 4.177 4.068 0 2.705-1.366 4.579-3.143 4.579-.982 0-1.717-.812-1.481-1.807.282-1.188.828-2.471.828-3.329 0-.768-.412-1.408-1.265-1.408-1.003 0-1.809 1.037-1.809 2.428 0 .885.299 1.484.299 1.484s-.991 4.191-1.173 4.971c-.201.861-.123 2.071-.036 2.862.226.088.451.177.685.249.408-.664 1.017-1.753 1.243-2.621l.623-2.378c.326.622 1.278 1.148 2.292 1.148 3.016 0 5.189-2.773 5.189-6.22 0-3.304-2.696-5.776-6.165-5.776"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgPinterest);
export default ForwardRef;
