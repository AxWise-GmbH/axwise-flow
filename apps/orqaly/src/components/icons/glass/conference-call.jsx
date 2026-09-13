import * as React from 'react';
import { forwardRef } from 'react';
const LgConferenceCall = ({ title, titleId, ...props }, ref) => (
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
      x1={5.982}
      x2={18.018}
      y1={11.482}
      y2={23.518}
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
      d="M20.5 15h-1.85a3.49 3.49 0 0 0-3.15-2h-7a3.49 3.49 0 0 0-3.15 2H3.5a2.5 2.5 0 1 0 0 5h17a2.5 2.5 0 1 0 0-5"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={5.982}
      x2={18.018}
      y1={11.482}
      y2={23.518}
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
      d="M15.5 13.5c1.16 0 2.194.657 2.699 1.715l.136.285H20.5c1.103 0 2 .897 2 2s-.897 2-2 2h-17c-1.103 0-2-.897-2-2s.897-2 2-2h2.165l.136-.285A2.97 2.97 0 0 1 8.5 13.5zm0-.5h-7a3.49 3.49 0 0 0-3.15 2H3.5a2.5 2.5 0 1 0 0 5h17a2.5 2.5 0 1 0 0-5h-1.85a3.49 3.49 0 0 0-3.15-2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={5.982}
      x2={18.018}
      y1={11.482}
      y2={23.518}
      gradientUnits="userSpaceOnUse"
    >
      <stop
        offset={0}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.4,
        }}
      />
      <stop
        offset={0.997}
        style={{
          stopColor: 'currentColor',
          stopOpacity: 0.2,
        }}
      />
    </linearGradient>
    <path
      d="M20.5 15h-1.85a3.49 3.49 0 0 0-3.15-2h-7a3.49 3.49 0 0 0-3.15 2H3.5a2.5 2.5 0 1 0 0 5h17a2.5 2.5 0 1 0 0-5"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={9.172}
      x2={14.828}
      y1={4.172}
      y2={9.828}
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
    <circle
      cx={12}
      cy={7}
      r={4}
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={9.172}
      x2={14.828}
      y1={4.172}
      y2={9.828}
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
      d="M12 3.5c1.93 0 3.5 1.57 3.5 3.5s-1.57 3.5-3.5 3.5S8.5 8.93 8.5 7s1.57-3.5 3.5-3.5m0-.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8"
      style={{
        fill: 'url(#e)',
      }}
    />
    <linearGradient
      id="f"
      x1={17.879}
      x2={22.121}
      y1={6.879}
      y2={11.121}
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
    <circle
      cx={20}
      cy={9}
      r={3}
      style={{
        fill: 'url(#f)',
      }}
    />
    <linearGradient
      id="g"
      x1={17.879}
      x2={22.121}
      y1={6.879}
      y2={11.121}
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
      d="M20 6.5c1.379 0 2.5 1.121 2.5 2.5s-1.121 2.5-2.5 2.5-2.5-1.121-2.5-2.5 1.121-2.5 2.5-2.5m0-.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6"
      style={{
        fill: 'url(#g)',
      }}
    />
    <linearGradient
      id="h"
      x1={1.879}
      x2={6.121}
      y1={6.879}
      y2={11.121}
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
    <circle
      cx={4}
      cy={9}
      r={3}
      style={{
        fill: 'url(#h)',
      }}
    />
    <linearGradient
      id="i"
      x1={1.879}
      x2={6.121}
      y1={6.879}
      y2={11.121}
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
      d="M4 6.5c1.379 0 2.5 1.121 2.5 2.5S5.379 11.5 4 11.5 1.5 10.379 1.5 9 2.621 6.5 4 6.5M4 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6"
      style={{
        fill: 'url(#i)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgConferenceCall);
export default ForwardRef;
