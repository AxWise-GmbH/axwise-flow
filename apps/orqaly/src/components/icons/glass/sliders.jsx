import * as React from 'react';
import { forwardRef } from 'react';
const LgSliders = ({ title, titleId, ...props }, ref) => (
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
    <linearGradient id="a" x1={3} x2={21} y1={3} y2={21} gradientUnits="userSpaceOnUse">
      <stop
        offset={0}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.55,
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
    <linearGradient id="b" x1={3} x2={21} y1={3} y2={21} gradientUnits="userSpaceOnUse">
      <stop
        offset={0}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.75,
        }}
      />
      <stop
        offset={1}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.45,
        }}
      />
    </linearGradient>
    <rect
      x={3}
      y={5.1}
      width={18}
      height={1.8}
      rx={0.9}
      style={{
        fill: 'url(#a)',
      }}
    />
    <rect
      x={3}
      y={11.1}
      width={18}
      height={1.8}
      rx={0.9}
      style={{
        fill: 'url(#a)',
      }}
    />
    <rect
      x={3}
      y={17.1}
      width={18}
      height={1.8}
      rx={0.9}
      style={{
        fill: 'url(#a)',
      }}
    />
    <circle
      cx={8}
      cy={6}
      r={2.6}
      style={{
        fill: 'url(#b)',
      }}
    />
    <circle
      cx={16}
      cy={12}
      r={2.6}
      style={{
        fill: 'url(#b)',
      }}
    />
    <circle
      cx={11}
      cy={18}
      r={2.6}
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgSliders);
export default ForwardRef;
