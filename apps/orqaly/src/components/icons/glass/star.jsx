import * as React from 'react';
import { forwardRef } from 'react';
const LgStar = ({ title, titleId, ...props }, ref) => (
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
      x1={4.697}
      x2={19.303}
      y1={6.242}
      y2={20.849}
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
      d="M10.702 2.781a1.47 1.47 0 0 1 2.596 0l2.463 4.645a.4.4 0 0 0 .284.206l5.178.907a1.47 1.47 0 0 1 .802 2.469l-3.656 3.778a.406.406 0 0 0-.109.334l.737 5.205a1.47 1.47 0 0 1-2.1 1.526l-4.722-2.31a.39.39 0 0 0-.351-.001l-4.722 2.31a1.47 1.47 0 0 1-2.1-1.526l.737-5.205a.4.4 0 0 0-.109-.334l-3.656-3.778a1.47 1.47 0 0 1 .802-2.469l5.178-.907a.396.396 0 0 0 .284-.206z"
      style={{
        fillRule: 'evenodd',
        clipRule: 'evenodd',
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.697}
      x2={19.303}
      y1={6.242}
      y2={20.849}
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
      d="M12 2.5c.36 0 .688.197.856.515l2.462 4.643a.91.91 0 0 0 .64.466l5.178.907a.969.969 0 0 1 .529 1.629l-3.655 3.777a.9.9 0 0 0-.245.753l.737 5.205a.969.969 0 0 1-1.386 1.006l-4.723-2.31a.9.9 0 0 0-.788 0l-4.722 2.31a.98.98 0 0 1-.997-.086.97.97 0 0 1-.39-.92l.737-5.204a.915.915 0 0 0-.244-.753L2.334 10.66a.97.97 0 0 1-.225-.974.97.97 0 0 1 .754-.655l5.179-.907a.9.9 0 0 0 .639-.464l2.463-4.645A.97.97 0 0 1 12 2.5m0-.5a1.47 1.47 0 0 0-1.298.781L8.239 7.425a.4.4 0 0 1-.284.206l-5.178.908a1.47 1.47 0 0 0-.802 2.469l3.656 3.778a.406.406 0 0 1 .109.334l-.737 5.205a1.468 1.468 0 0 0 2.098 1.526l4.722-2.31a.4.4 0 0 1 .352 0l4.722 2.31a1.47 1.47 0 0 0 1.508-.131c.44-.32.667-.856.591-1.395l-.737-5.205a.4.4 0 0 1 .109-.334l3.656-3.778a1.47 1.47 0 0 0-.802-2.469l-5.178-.907q-.091-.017-.166-.07c-.075-.053-.09-.082-.118-.136l-2.463-4.645A1.47 1.47 0 0 0 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgStar);
export default ForwardRef;
