import * as React from 'react';
import { forwardRef } from 'react';
const LgForward = ({ title, titleId, ...props }, ref) => (
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
      x1={3.379}
      x2={14.621}
      y1={6.379}
      y2={17.621}
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
      d="M18.506 10.349a3 3 0 0 0-.384-.471l-7-7a3 3 0 1 0-4.243 4.243L11.757 12l-4.879 4.879a3 3 0 1 0 4.243 4.243l7-7q.22-.22.384-.471c.66-.998.66-2.304.001-3.302"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.379}
      x2={14.621}
      y1={6.379}
      y2={17.621}
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
      d="M9 2.5c.668 0 1.296.26 1.768.732l7 7q.18.18.321.393a2.49 2.49 0 0 1-.321 3.143l-.94.94-6.06 6.06c-.472.472-1.1.732-1.768.732s-1.296-.26-1.768-.732S6.5 19.668 6.5 19s.26-1.296.732-1.768l4.879-4.879.353-.353-.354-.354-4.878-4.878A2.48 2.48 0 0 1 6.5 5c0-.668.26-1.296.732-1.768A2.48 2.48 0 0 1 9 2.5M9 2a3 3 0 0 0-2.121 5.122L11.757 12l-4.879 4.879a3 3 0 1 0 4.243 4.242l7-7q.22-.22.384-.471a3 3 0 0 0-.384-3.772l-7-7A3 3 0 0 0 9 2"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgForward);
export default ForwardRef;
