import * as React from 'react';
import { forwardRef } from 'react';
const LgLock = ({ title, titleId, ...props }, ref) => (
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
      x1={4.568}
      x2={19.432}
      y1={5.947}
      y2={20.811}
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
      d="M18 7A6 6 0 1 0 6 7a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3M8 7a4 4 0 0 1 8 0z"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.568}
      x2={19.432}
      y1={5.947}
      y2={20.811}
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
      d="M12 1.5c3.033 0 5.5 2.467 5.5 5.5v.5h.5c1.378 0 2.5 1.121 2.5 2.5v8c0 1.379-1.122 2.5-2.5 2.5H6A2.503 2.503 0 0 1 3.5 18v-8c0-1.379 1.122-2.5 2.5-2.5h.5V7c0-3.033 2.467-5.5 5.5-5.5m-4.5 6h9V7c0-2.481-2.019-4.5-4.5-4.5S7.5 4.519 7.5 7zM12 1a6 6 0 0 0-6 6 3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3 6 6 0 0 0-6-6M8 7a4 4 0 0 1 8 0z"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={8.252}
      x2={15.75}
      y1={2.263}
      y2={9.761}
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
      d="M8 7a4 4 0 0 1 8 0v.506l2 .005V7A6 6 0 1 0 6 7v.506l2 .005z"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={10.586}
      x2={13.414}
      y1={12.586}
      y2={15.414}
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
      d="M12 12a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 12"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgLock);
export default ForwardRef;
