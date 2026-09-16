import * as React from 'react';
import { forwardRef } from 'react';
const LgUnlock = ({ title, titleId, ...props }, ref) => (
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
      x1={4.565}
      x2={19.429}
      y1={5.95}
      y2={20.814}
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
      d="M18 7H8a4 4 0 0 1 4-4c1.02 0 1.949.384 2.654 1.013.388.346.964.369 1.331.001l.08-.08a.94.94 0 0 0-.015-1.354A5.96 5.96 0 0 0 12 1a6 6 0 0 0-6 6 3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.565}
      x2={19.429}
      y1={5.95}
      y2={20.814}
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
      d="M12 1.5c1.378 0 2.696.514 3.713 1.448.083.076.13.183.132.3a.46.46 0 0 1-.133.332l-.08.08c-.1.1-.214.121-.293.121a.53.53 0 0 1-.352-.142A4.5 4.5 0 0 0 12 2.5 4.505 4.505 0 0 0 7.5 7v.5H18c1.378 0 2.5 1.122 2.5 2.5v8c0 1.378-1.122 2.5-2.5 2.5H6A2.503 2.503 0 0 1 3.5 18v-8c0-1.378 1.122-2.5 2.5-2.5h.5V7c0-3.033 2.467-5.5 5.5-5.5m0-.5a6 6 0 0 0-6 6 3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3H8a4 4 0 0 1 4-4c1.02 0 1.949.384 2.654 1.013.197.176.443.268.685.268a.9.9 0 0 0 .646-.267l.08-.08a.94.94 0 0 0-.015-1.354A5.96 5.96 0 0 0 12 1"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
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
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={8.375}
      x2={13.118}
      y1={2.139}
      y2={6.882}
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
      d="m15.986 4.014.08-.08a.94.94 0 0 0-.015-1.354A5.97 5.97 0 0 0 12 1a6 6 0 0 0-6 6h2a4 4 0 0 1 4-4c1.02 0 1.949.384 2.654 1.013.388.346.964.369 1.332.001"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgUnlock);
export default ForwardRef;
