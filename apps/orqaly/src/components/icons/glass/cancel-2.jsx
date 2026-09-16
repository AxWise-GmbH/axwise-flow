import * as React from 'react';
import { forwardRef } from 'react';
const LgCancel2 = ({ title, titleId, ...props }, ref) => (
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
      x1={4.929}
      x2={19.071}
      y1={4.929}
      y2={19.071}
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
      d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2m0 16a6 6 0 0 1-6-6c0-.977.238-1.896.652-2.711l8.058 8.058A5.95 5.95 0 0 1 12 18m5.348-3.289L9.289 6.652A6 6 0 0 1 12 6a6 6 0 0 1 6 6c0 .977-.238 1.896-.652 2.711"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.929}
      x2={19.071}
      y1={4.929}
      y2={19.071}
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
      d="M12 2.5c5.238 0 9.5 4.262 9.5 9.5s-4.262 9.5-9.5 9.5-9.5-4.262-9.5-9.5S6.762 2.5 12 2.5m5.482 13.051.312-.614A6.44 6.44 0 0 0 18.5 12c0-3.584-2.916-6.5-6.5-6.5a6.44 6.44 0 0 0-2.937.706l-.614.312.487.487 8.058 8.058zM12 18.5a6.44 6.44 0 0 0 2.937-.706l.614-.312-.487-.487-8.058-8.059-.488-.487-.312.614A6.44 6.44 0 0 0 5.5 12c0 3.584 2.916 6.5 6.5 6.5M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2m5.348 12.711L9.289 6.652A6 6 0 0 1 12 6a6 6 0 0 1 6 6c0 .977-.238 1.896-.652 2.711M12 18a6 6 0 0 1-6-6c0-.977.238-1.896.652-2.711l8.058 8.058A5.95 5.95 0 0 1 12 18"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgCancel2);
export default ForwardRef;
