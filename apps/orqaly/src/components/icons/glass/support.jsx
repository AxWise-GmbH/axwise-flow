import * as React from 'react';
import { forwardRef } from 'react';
const LgSupport = ({ title, titleId, ...props }, ref) => (
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
      x1={5.742}
      x2={16.354}
      y1={7.646}
      y2={18.258}
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
      d="M21.797 7.777c-.172-.718-1.079-.959-1.601-.437l-2.928 2.928a2.5 2.5 0 0 1-3.709-.192c-.828-1.012-.651-2.52.274-3.445l2.826-2.826c.522-.522.282-1.43-.436-1.602a7.5 7.5 0 0 0-3.349-.027c-2.911.632-5.231 3.016-5.752 5.949a7.6 7.6 0 0 0 .259 3.734l-4.392 4.379a3.375 3.375 0 0 0 4.773 4.773l4.398-4.385a7.6 7.6 0 0 0 3.714.251c2.934-.521 5.318-2.84 5.949-5.752a7.5 7.5 0 0 0-.026-3.348"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={5.742}
      x2={16.354}
      y1={7.646}
      y2={18.258}
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
      d="M14.5 2.5c.541 0 1.081.064 1.607.19a.43.43 0 0 1 .315.308.46.46 0 0 1-.116.455L13.48 6.279c-1.133 1.133-1.268 2.94-.307 4.115a3 3 0 0 0 4.449.228l.565-.565 2.363-2.363a.45.45 0 0 1 .322-.134.44.44 0 0 1 .439.334 7 7 0 0 1 .025 3.127c-.591 2.725-2.821 4.882-5.548 5.366a7.4 7.4 0 0 1-1.284.114 7 7 0 0 1-2.187-.348l-.292-.096-.217.217-4.399 4.385a2.86 2.86 0 0 1-2.034.841c-.768 0-1.49-.299-2.033-.842a2.86 2.86 0 0 1-.842-2.033c0-.768.299-1.49.842-2.032l4.392-4.379.219-.218-.097-.293a7.05 7.05 0 0 1-.241-3.49c.484-2.727 2.64-4.957 5.366-5.548A7.2 7.2 0 0 1 14.5 2.5m0-.5q-.796-.001-1.626.176c-2.911.632-5.231 3.016-5.752 5.949a7.6 7.6 0 0 0 .259 3.734l-4.392 4.379a3.375 3.375 0 0 0 4.773 4.773l4.398-4.385a7.5 7.5 0 0 0 2.343.374q.674.001 1.371-.122c2.934-.521 5.318-2.84 5.949-5.752a7.5 7.5 0 0 0-.027-3.349.94.94 0 0 0-.925-.718.95.95 0 0 0-.676.281l-2.928 2.928A2.5 2.5 0 0 1 15.5 11a2.5 2.5 0 0 1-1.941-.924c-.828-1.012-.651-2.52.274-3.445l2.826-2.826c.522-.522.282-1.43-.436-1.602A7.4 7.4 0 0 0 14.5 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={4.439}
      x2={6.561}
      y1={17.439}
      y2={19.561}
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
      cx={5.5}
      cy={18.5}
      r={1.5}
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgSupport);
export default ForwardRef;
