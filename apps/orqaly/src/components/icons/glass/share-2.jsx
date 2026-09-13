import * as React from 'react';
import { forwardRef } from 'react';
const LgShare2 = ({ title, titleId, ...props }, ref) => (
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
      x1={7.172}
      x2={22.828}
      y1={4.172}
      y2={19.828}
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
      d="M18 15c-.128 0-.248.026-.373.038L15.458 12l2.17-3.038c.124.012.244.038.372.038a4 4 0 1 0-4-4c0 .59.135 1.145.364 1.649L11.971 10H8.445C7.752 8.809 6.477 8 5 8a4 4 0 0 0 0 8c1.477 0 2.753-.81 3.445-2h3.526l2.393 3.351A4 4 0 0 0 14 19a4 4 0 1 0 4-4"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={7.172}
      x2={22.828}
      y1={4.172}
      y2={19.828}
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
      d="M18 1.5c1.93 0 3.5 1.57 3.5 3.5S19.93 8.5 18 8.5c-.06 0-.117-.009-.174-.017a3 3 0 0 0-.152-.018l-.286-.027-.168.234-2.17 3.038-.207.29.208.291 2.17 3.037.167.234.286-.027q.076-.008.152-.018c.057-.008.114-.017.174-.017 1.93 0 3.5 1.57 3.5 3.5s-1.57 3.5-3.5 3.5-3.5-1.57-3.5-3.5c0-.491.108-.976.32-1.442l.119-.263-.168-.235-2.393-3.351-.15-.209h-4.07l-.145.248C7.375 14.845 6.248 15.5 5 15.5c-1.93 0-3.5-1.57-3.5-3.5S3.07 8.5 5 8.5c1.248 0 2.375.655 3.013 1.751l.145.249h4.071l.15-.209 2.394-3.351.168-.235-.121-.263A3.5 3.5 0 0 1 14.5 5c0-1.93 1.57-3.5 3.5-3.5m0-.5a4 4 0 0 0-4 4c0 .59.135 1.145.364 1.649L11.971 10H8.445C7.752 8.809 6.477 8 5 8a4 4 0 0 0 0 8c1.477 0 2.752-.809 3.445-2h3.526l2.393 3.351A4 4 0 0 0 14 19a4 4 0 1 0 4-4c-.128 0-.248.026-.373.038L15.458 12l2.17-3.038c.124.012.244.038.372.038a4 4 0 0 0 0-8"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={2.172}
      x2={7.828}
      y1={9.172}
      y2={14.828}
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
      d="M5 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={15.172}
      x2={20.828}
      y1={16.172}
      y2={21.828}
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
      d="M22 19a4 4 0 1 0-8 0 4 4 0 0 0 8 0"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={15.172}
      x2={20.828}
      y1={2.172}
      y2={7.828}
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
      d="M22 5a4 4 0 1 0-8 0 4 4 0 0 0 8 0"
      style={{
        fill: 'url(#e)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgShare2);
export default ForwardRef;
