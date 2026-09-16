import * as React from 'react';
import { forwardRef } from 'react';
const LgKey = ({ title, titleId, ...props }, ref) => (
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
      x1={5.745}
      x2={16.351}
      y1={7.649}
      y2={18.255}
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
      d="M14.5 2a7.5 7.5 0 0 0-6.913 10.413l-5.294 5.294a1 1 0 0 0-.293.707V21a1 1 0 0 0 1 1h2.586c.265 0 .52-.105.707-.293l1.293-1.293c.265-.265.414-.625.414-1C8 18.633 8.633 18 9.414 18c.375 0 .735-.149 1-.414l1.173-1.173A7.5 7.5 0 1 0 14.5 2M17 9a2 2 0 1 1-.001-3.999A2 2 0 0 1 17 9"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={2} x2={22} y1={12} y2={12} gradientUnits="userSpaceOnUse">
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
      d="M14.5 2.5c3.86 0 7 3.14 7 7a7.008 7.008 0 0 1-9.719 6.452l-.31-.131-.238.238-1.173 1.173a.9.9 0 0 1-.646.268A1.917 1.917 0 0 0 7.5 19.414a.9.9 0 0 1-.268.646l-1.293 1.293a.5.5 0 0 1-.353.147H3a.5.5 0 0 1-.5-.5v-2.586a.5.5 0 0 1 .146-.354l5.294-5.294.238-.238-.131-.31A7.008 7.008 0 0 1 14.5 2.5m2.5 7c1.379 0 2.5-1.122 2.5-2.5 0-1.379-1.121-2.5-2.5-2.5S14.5 5.621 14.5 7c0 1.378 1.121 2.5 2.5 2.5M14.5 2a7.5 7.5 0 0 0-6.913 10.413l-5.294 5.294a1 1 0 0 0-.293.707V21a1 1 0 0 0 1 1h2.586c.265 0 .52-.105.707-.293l1.293-1.293c.265-.265.414-.625.414-1C8 18.633 8.633 18 9.414 18c.375 0 .735-.149 1-.414l1.173-1.173A7.5 7.5 0 1 0 14.5 2M17 9a2 2 0 1 1-.001-3.999A2 2 0 0 1 17 9"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgKey);
export default ForwardRef;
