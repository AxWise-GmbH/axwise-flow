import * as React from 'react';
import { forwardRef } from 'react';
const LgBack = ({ title, titleId, ...props }, ref) => (
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
      x1={9.379}
      x2={20.621}
      y1={6.379}
      y2={17.621}
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
      d="m12.243 12 4.879-4.879a3 3 0 1 0-4.243-4.243l-7 7a3.003 3.003 0 0 0 0 4.243l7 7a3 3 0 1 0 4.243-4.243c-.38-.378-2.951-2.949-4.879-4.878"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={9.379}
      x2={20.621}
      y1={6.379}
      y2={17.621}
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
      d="M15 2.5c.668 0 1.296.26 1.768.732S17.5 4.332 17.5 5s-.26 1.296-.732 1.768l-4.879 4.879-.353.353.354.354 4.879 4.879c.471.471.731 1.099.731 1.767s-.26 1.296-.732 1.768-1.1.732-1.768.732-1.296-.26-1.768-.732l-6.06-6.06-.94-.94a2.49 2.49 0 0 1 0-3.536l7-7A2.48 2.48 0 0 1 15 2.5m0-.5c-.768 0-1.536.293-2.121.879l-7 7a3.003 3.003 0 0 0 0 4.243l7 7c.585.585 1.353.878 2.121.878s1.536-.293 2.121-.879a3 3 0 0 0 0-4.243l-4.879-4.879 4.879-4.879A3 3 0 0 0 15 2"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgBack);
export default ForwardRef;
