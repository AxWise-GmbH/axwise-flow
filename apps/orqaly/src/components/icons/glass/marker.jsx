import * as React from 'react';
import { forwardRef } from 'react';
const LgMarker = ({ title, titleId, ...props }, ref) => (
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
      x1={5.95}
      x2={18.05}
      y1={4.736}
      y2={16.837}
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
      d="M4 10a8 8 0 0 1 16 0c0 3.564-4.064 8.652-6.399 11.28a2.143 2.143 0 0 1-3.202 0C8.064 18.652 4 13.564 4 10"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={5.95}
      x2={18.05}
      y1={4.736}
      y2={16.837}
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
      d="M12 2.5c4.136 0 7.5 3.364 7.5 7.5 0 3.507-4.387 8.825-6.273 10.948a1.642 1.642 0 0 1-2.454 0C8.887 18.825 4.5 13.507 4.5 10c0-4.136 3.364-7.5 7.5-7.5m0-.5a8 8 0 0 0-8 8c0 3.564 4.064 8.652 6.399 11.28.426.479 1.013.719 1.601.719s1.175-.24 1.601-.719C15.936 18.652 20 13.564 20 10a8 8 0 0 0-8-8"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={9.879}
      x2={14.121}
      y1={7.879}
      y2={12.121}
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
    <circle
      cx={12}
      cy={10}
      r={3}
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgMarker);
export default ForwardRef;
