import * as React from 'react';
import { forwardRef } from 'react';
const LgBookmarkRibbon = ({ title, titleId, ...props }, ref) => (
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
      x1={3.473}
      x2={20.527}
      y1={3.406}
      y2={20.459}
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
      d="M21 4.5A1.5 1.5 0 0 0 19.5 3h-15A1.495 1.495 0 0 0 4 5.908V20.27a1.728 1.728 0 0 0 2.501 1.546L12 19.066l5.499 2.75A1.73 1.73 0 0 0 20 20.27V5.908c.581-.206 1-.756 1-1.408"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.473}
      x2={20.527}
      y1={3.406}
      y2={20.46}
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
      d="M19.5 3.5c.551 0 1 .449 1 1a1 1 0 0 1-.667.937l-.333.118V20.27c0 .76-.638 1.23-1.229 1.23q-.284 0-.549-.132l-5.499-2.75-.223-.111-.224.112-5.499 2.75a1.2 1.2 0 0 1-.548.131c-.591 0-1.229-.47-1.229-1.23V5.555l-.333-.118A1 1 0 0 1 3.5 4.5c0-.551.449-1 1-1zm0-.5h-15A1.495 1.495 0 0 0 4 5.908V20.27A1.73 1.73 0 0 0 5.729 22c.256 0 .519-.058.772-.185L12 19.066l5.499 2.75A1.725 1.725 0 0 0 20 20.27V5.908A1.496 1.496 0 0 0 19.5 3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={7.189}
      x2={16.811}
      y1={-0.311}
      y2={9.311}
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
      d="M19.5 3h-15a1.5 1.5 0 0 0 0 3h15a1.5 1.5 0 0 0 0-3"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgBookmarkRibbon);
export default ForwardRef;
