import * as React from 'react';
import { forwardRef } from 'react';
const LgVisible = ({ title, titleId, ...props }, ref) => (
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
      x1={5.228}
      x2={18.772}
      y1={5.228}
      y2={18.772}
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
      d="M2.269 15.625a5.86 5.86 0 0 1 0-7.251C4.235 5.875 7.479 3 12 3s7.765 2.875 9.731 5.375a5.86 5.86 0 0 1 0 7.251C19.765 18.125 16.521 21 12 21s-7.765-2.875-9.731-5.375"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={5.228}
      x2={18.772}
      y1={5.228}
      y2={18.772}
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
      d="M12 3.5c4.349 0 7.478 2.819 9.338 5.184a5.35 5.35 0 0 1 0 6.633C19.478 17.681 16.349 20.5 12 20.5s-7.478-2.819-9.338-5.184a5.35 5.35 0 0 1 0-6.633C4.522 6.319 7.651 3.5 12 3.5m0-.5C7.479 3 4.235 5.875 2.269 8.375a5.86 5.86 0 0 0 0 7.251C4.235 18.125 7.479 21 12 21s7.765-2.875 9.731-5.375a5.86 5.86 0 0 0 0-7.251C19.765 5.875 16.521 3 12 3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={7.757}
      x2={16.243}
      y1={7.757}
      y2={16.243}
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
      d="M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12m1 7a2 2 0 1 1-.001-3.999A2 2 0 0 1 13 13"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgVisible);
export default ForwardRef;
