import * as React from 'react';
import { forwardRef } from 'react';
const LgAddUserMale = ({ title, titleId, ...props }, ref) => (
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
      x1={8.464}
      x2={15.536}
      y1={3.465}
      y2={10.536}
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
      cy={7}
      r={5}
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={7} x2={17} y1={7} y2={7} gradientUnits="userSpaceOnUse">
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
      d="M12 2.5c2.481 0 4.5 2.019 4.5 4.5s-2.019 4.5-4.5 4.5S7.5 9.481 7.5 7 9.519 2.5 12 2.5m0-.5a5 5 0 1 0 .001 10.001A5 5 0 0 0 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={6.299}
      x2={14.402}
      y1={13.458}
      y2={21.56}
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
      d="M14.54 19c0-1.643.742-3.022 2.386-4H6a3 3 0 1 0 0 6h8.962a5 5 0 0 1-.422-2"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient id="d" x1={3} x2={16.926} y1={18} y2={18} gradientUnits="userSpaceOnUse">
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
      d="M15.454 15.5c-.94.936-1.415 2.108-1.415 3.5 0 .509.071 1.012.211 1.5H6c-1.379 0-2.5-1.121-2.5-2.5s1.121-2.5 2.5-2.5zm1.472-.5H6a3 3 0 1 0 0 6h8.962a5 5 0 0 1-.422-2c0-1.643.742-3.022 2.386-4"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={15.464}
      x2={22.535}
      y1={15.464}
      y2={22.535}
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
      cx={19}
      cy={19}
      r={5}
      style={{
        fill: 'url(#e)',
      }}
    />
    <linearGradient
      id="f"
      x1={15.464}
      x2={22.535}
      y1={15.464}
      y2={22.535}
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
      d="M19 14.5c2.481 0 4.5 2.019 4.5 4.5s-2.019 4.5-4.5 4.5-4.5-2.019-4.5-4.5 2.019-4.5 4.5-4.5m0-.5a5 5 0 1 0 .001 10.001A5 5 0 0 0 19 14"
      style={{
        fill: 'url(#f)',
      }}
    />
    <linearGradient id="g" x1={15.5} x2={22.5} y1={19} y2={19} gradientUnits="userSpaceOnUse">
      <stop
        offset={0}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.4,
        }}
      />
      <stop
        offset={0.997}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.2,
        }}
      />
    </linearGradient>
    <path
      d="M21.5 18H20v-1.5a1 1 0 0 0-2 0V18h-1.5a1 1 0 0 0 0 2H18v1.5a1 1 0 0 0 2 0V20h1.5a1 1 0 0 0 0-2"
      style={{
        fill: 'url(#g)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgAddUserMale);
export default ForwardRef;
