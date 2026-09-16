import * as React from 'react';
import { forwardRef } from 'react';
const LgHome = ({ title, titleId, ...props }, ref) => (
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
      x1={4.57}
      x2={19.43}
      y1={5.952}
      y2={20.813}
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
      d="M18 21H6a3 3 0 0 1-3-3V8.765a3 3 0 0 1 1.543-2.622l6-3.333a3 3 0 0 1 2.914 0l6 3.333A3 3 0 0 1 21 8.765V18a3 3 0 0 1-3 3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.57}
      x2={19.43}
      y1={5.952}
      y2={20.813}
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
      d="M12 2.932c.424 0 .844.109 1.214.315l6 3.333A2.5 2.5 0 0 1 20.5 8.765V18c0 1.378-1.122 2.5-2.5 2.5H6A2.503 2.503 0 0 1 3.5 18V8.765A2.5 2.5 0 0 1 4.786 6.58l6-3.333c.37-.206.79-.315 1.214-.315m0-.5c-.502 0-1.004.126-1.457.378l-6 3.333A3 3 0 0 0 3 8.765V18a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V8.765a3 3 0 0 0-1.543-2.622l-6-3.333A3 3 0 0 0 12 2.432"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={8.793}
      x2={15.207}
      y1={14.379}
      y2={20.793}
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
      d="M15 21H9v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2z"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgHome);
export default ForwardRef;
