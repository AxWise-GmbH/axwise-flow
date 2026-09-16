import * as React from 'react';
import { forwardRef } from 'react';
const LgCheckmark = ({ title, titleId, ...props }, ref) => (
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
      x1={7.482}
      x2={16.518}
      y1={4.982}
      y2={14.018}
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
      d="M22.268 4.732a2.5 2.5 0 0 0-3.536 0L9 14.464l-3.732-3.732a2.501 2.501 0 0 0-3.536 3.536l4.645 4.645a3.71 3.71 0 0 0 5.246 0L22.268 8.268a2.5 2.5 0 0 0 0-3.536"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={7.482}
      x2={16.518}
      y1={4.982}
      y2={14.018}
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
      d="M20.5 4.5c.534 0 1.036.208 1.414.586s.586.88.586 1.414-.208 1.036-.586 1.414L11.269 18.559c-.606.606-1.412.94-2.269.94s-1.663-.334-2.269-.94l-4.645-4.645A1.99 1.99 0 0 1 1.5 12.5c0-.534.208-1.036.586-1.414s.88-.586 1.414-.586 1.036.208 1.414.586l3.732 3.732.354.354.354-.354 9.732-9.732c.378-.378.88-.586 1.414-.586m0-.5c-.64 0-1.28.244-1.768.732L9 14.464l-3.732-3.732C4.78 10.244 4.14 10 3.5 10s-1.28.244-1.768.732a2.5 2.5 0 0 0 0 3.536l4.645 4.645c.724.724 1.674 1.086 2.623 1.086s1.899-.362 2.623-1.086L22.268 8.268A2.501 2.501 0 0 0 20.5 4"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgCheckmark);
export default ForwardRef;
