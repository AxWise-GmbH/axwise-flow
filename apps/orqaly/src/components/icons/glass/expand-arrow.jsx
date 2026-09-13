import * as React from 'react';
import { forwardRef } from 'react';
const LgExpandArrow = ({ title, titleId, ...props }, ref) => (
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
      x1={6.379}
      x2={17.621}
      y1={3.379}
      y2={14.621}
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
      d="M21.121 6.879a3 3 0 0 0-4.243 0L12 11.757 7.121 6.878a3 3 0 1 0-4.243 4.243l7 7a2.99 2.99 0 0 0 4.031.173c.07-.058.146-.107.212-.173l7-7a3 3 0 0 0 0-4.242"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={6.379}
      x2={17.621}
      y1={3.379}
      y2={14.621}
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
      d="M5 6.5c.668 0 1.296.26 1.768.732l4.879 4.879.353.354.354-.354 4.879-4.879C17.704 6.76 18.332 6.5 19 6.5s1.296.26 1.768.732a2.503 2.503 0 0 1 0 3.536l-5.587 5.587-1.413 1.413c-.026.026-.055.046-.083.068l-.095.075a2.52 2.52 0 0 1-1.608.583 2.46 2.46 0 0 1-1.75-.725l-7-7C2.76 10.296 2.5 9.668 2.5 9s.26-1.296.732-1.768A2.48 2.48 0 0 1 5 6.5M5 6a3 3 0 0 0-2.121 5.122l7 7a2.96 2.96 0 0 0 2.103.871 3 3 0 0 0 1.928-.699c.07-.058.146-.107.212-.173l7-7a3 3 0 1 0-4.243-4.242L12 11.757 7.121 6.878A3 3 0 0 0 5 6"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgExpandArrow);
export default ForwardRef;
