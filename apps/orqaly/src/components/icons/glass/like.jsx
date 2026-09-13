import * as React from 'react';
import { forwardRef } from 'react';
const LgLike = ({ title, titleId, ...props }, ref) => (
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
      x1={5.247}
      x2={18.753}
      y1={3.297}
      y2={16.803}
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
      d="M16.95 4a6.03 6.03 0 0 0-4.278 1.772 6 6 0 0 0-.672.823 6 6 0 0 0-.672-.823A6.03 6.03 0 0 0 7.05 4a6.05 6.05 0 0 0-4.278 10.328c1.027 1.027 7.241 6.196 7.672 6.627.43.43.993.644 1.556.644s1.126-.215 1.556-.644c.432-.431 6.646-5.601 7.672-6.627A6.05 6.05 0 0 0 16.95 4"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={5.247}
      x2={18.753}
      y1={3.297}
      y2={16.803}
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
      d="M16.95 4.5c1.482 0 2.876.577 3.924 1.625A5.51 5.51 0 0 1 22.5 10.05a5.5 5.5 0 0 1-1.626 3.924c-.609.609-3.216 2.82-5.119 4.434-1.513 1.283-2.377 2.018-2.553 2.193A1.69 1.69 0 0 1 12 21.1a1.7 1.7 0 0 1-1.202-.498c-.175-.175-1.039-.909-2.551-2.191-1.904-1.615-4.512-3.827-5.121-4.436a5.556 5.556 0 0 1 0-7.849A5.5 5.5 0 0 1 7.05 4.5c1.482 0 2.876.577 3.924 1.625.201.201.391.434.616.756l.41.586.41-.586c.225-.322.415-.555.616-.756A5.51 5.51 0 0 1 16.95 4.5m0-.5a6.03 6.03 0 0 0-4.278 1.772 6 6 0 0 0-.672.823 6 6 0 0 0-.672-.823A6.03 6.03 0 0 0 7.05 4a6.05 6.05 0 0 0-4.278 10.328c1.027 1.027 7.241 6.196 7.672 6.627.43.43.993.644 1.556.644s1.126-.215 1.556-.644c.432-.431 6.646-5.601 7.672-6.627A6.05 6.05 0 0 0 16.95 4"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgLike);
export default ForwardRef;
