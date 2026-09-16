import * as React from 'react';
import { forwardRef } from 'react';
const LgGmail = ({ title, titleId, ...props }, ref) => (
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
      d="M19 4H5a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3"
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
      d="M19 4.5c1.378 0 2.5 1.121 2.5 2.5v10c0 1.379-1.122 2.5-2.5 2.5H5A2.503 2.503 0 0 1 2.5 17V7c0-1.379 1.122-2.5 2.5-2.5zm0-.5H5a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3"
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
      d="m19 4-7 4.99L5 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3V7.707l7 4.959 7-4.959V20a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient id="d" x1={2} x2={22} y1={12} y2={12} gradientUnits="userSpaceOnUse">
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
      d="M19.153 4.505A2.5 2.5 0 0 1 21.5 7v10c0 1.207-.86 2.217-2 2.45V6.741l-.789.559L12 12.053 5.289 7.299 4.5 6.741V19.45a2.504 2.504 0 0 1-2-2.45V7a2.5 2.5 0 0 1 2.347-2.495l6.863 4.893.29.206.29-.207zM19 4l-7 4.99L5 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3V7.707l7 4.959 7-4.959V20a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgGmail);
export default ForwardRef;
