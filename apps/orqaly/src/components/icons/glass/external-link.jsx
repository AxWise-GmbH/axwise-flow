import * as React from 'react';
import { forwardRef } from 'react';
const LgExternalLink = ({ title, titleId, ...props }, ref) => (
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
      x1={4.025}
      x2={20.268}
      y1={3.732}
      y2={19.975}
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
      d="M18 21H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h13a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.025}
      x2={20.268}
      y1={3.732}
      y2={19.975}
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
      d="M19 3.5c.827 0 1.5.673 1.5 1.5v13c0 1.378-1.122 2.5-2.5 2.5H6A2.503 2.503 0 0 1 3.5 18V6c0-1.378 1.122-2.5 2.5-2.5zm0-.5H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V5a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={11.816}
      x2={19.135}
      y1={4.865}
      y2={12.184}
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
      d="M19 3h-4.834c-1.037 0-1.556 1.253-.823 1.986l1.54 1.54-4.347 4.347a1.833 1.833 0 0 0 2.591 2.591l4.347-4.347 1.54 1.54c.733.733 1.986.214 1.986-.823V5a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgExternalLink);
export default ForwardRef;
