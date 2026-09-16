import * as React from 'react';
import { forwardRef } from 'react';
const LgMailboxClosedFlagDown = ({ title, titleId, ...props }, ref) => (
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
      x1={3.555}
      x2={20.475}
      y1={4.434}
      y2={21.354}
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
      d="m18 4-12.002.003q-.241-.001-.489.02C2.909 4.271 1 6.603 1 9.215V18a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V9a5 5 0 0 0-5-5"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.555}
      x2={20.475}
      y1={4.434}
      y2={21.354}
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
      d="M18 4.5c2.481 0 4.5 2.019 4.5 4.5v9c0 .827-.673 1.5-1.5 1.5H3c-.827 0-1.5-.673-1.5-1.5V9.215c0-2.415 1.782-4.477 4.056-4.694a5 5 0 0 1 .441-.018zm0-.5-12.002.003q-.241-.001-.489.02C2.909 4.271 1 6.603 1 9.215V18a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V9a5 5 0 0 0-5-5"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={15.543}
      x2={20.957}
      y1={9.043}
      y2={14.457}
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
      d="M20 10h-5a1 1 0 0 0 0 2h2v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={0.555}
      x2={11.475}
      y1={7.434}
      y2={18.354}
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
      d="M5.509 4.023C2.909 4.271 1 6.603 1 9.215V18a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a5 5 0 0 0-5.491-4.977M7 10H5a1 1 0 0 1 0-2h2a1 1 0 0 1 0 2"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgMailboxClosedFlagDown);
export default ForwardRef;
