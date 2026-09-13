import * as React from 'react';
import { forwardRef } from 'react';
const LgSpeechBubble = ({ title, titleId, ...props }, ref) => (
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
      x1={3.648}
      x2={17.79}
      y1={6.21}
      y2={20.352}
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
      d="M12 2C6.477 2 2 6.477 2 12a9.95 9.95 0 0 0 1.043 4.427l-1.005 4.019a1.25 1.25 0 0 0 1.516 1.516l4.019-1.005A9.95 9.95 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.648}
      x2={17.79}
      y1={6.21}
      y2={20.352}
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
      d="M12 2.5c5.238 0 9.5 4.262 9.5 9.5s-4.262 9.5-9.5 9.5a9.4 9.4 0 0 1-4.205-.991l-.165-.082-.178.045-4.019 1.005a.743.743 0 0 1-.775-.269.74.74 0 0 1-.135-.641l1.005-4.019.045-.178-.082-.165A9.4 9.4 0 0 1 2.5 12c0-5.238 4.262-9.5 9.5-9.5m0-.5C6.477 2 2 6.477 2 12a9.95 9.95 0 0 0 1.043 4.427l-1.005 4.019a1.252 1.252 0 0 0 1.517 1.516l4.019-1.005A9.94 9.94 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgSpeechBubble);
export default ForwardRef;
