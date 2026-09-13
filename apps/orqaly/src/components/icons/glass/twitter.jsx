import * as React from 'react';
import { forwardRef } from 'react';
const LgTwitter = ({ title, titleId, ...props }, ref) => (
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
      d="M18 21H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3"
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
      d="M18 3.5c1.379 0 2.5 1.122 2.5 2.5v12c0 1.378-1.121 2.5-2.5 2.5H6A2.503 2.503 0 0 1 3.5 18V6c0-1.378 1.121-2.5 2.5-2.5zm0-.5H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={6.771}
      x2={17.148}
      y1={6.953}
      y2={17.329}
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
      d="m17.641 16.351-3.734-5.262 2.905-3.412A.41.41 0 0 0 16.499 7h-1.355a.83.83 0 0 0-.631.291l-1.8 2.115-1.46-2.057A.83.83 0 0 0 10.577 7H6.895a.411.411 0 0 0-.335.649l3.478 4.9-3.213 3.774a.41.41 0 0 0 .313.677h1.355a.83.83 0 0 0 .631-.292l2.108-2.477 1.717 2.419c.155.22.407.35.676.35h3.682a.41.41 0 0 0 .334-.649m-3.67-.851-4.968-7h1.226l4.968 7z"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgTwitter);
export default ForwardRef;
