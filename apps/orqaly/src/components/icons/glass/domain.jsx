import * as React from 'react';
import { forwardRef } from 'react';
const LgDomain = ({ title, titleId, ...props }, ref) => (
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
    <circle
      cx={12}
      cy={12}
      r={10}
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
      d="M12 2.5c5.238 0 9.5 4.262 9.5 9.5s-4.262 9.5-9.5 9.5-9.5-4.262-9.5-9.5S6.762 2.5 12 2.5m0-.5C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={9.341}
      x2={14.656}
      y1={8.848}
      y2={14.164}
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
      d="M13.462 15h-.004a.864.864 0 0 1-.851-.709L12 10.975h-.017l-.601 3.315a.865.865 0 0 1-1.7.005l-.854-4.543A.635.635 0 0 1 9.452 9h.069c.314 0 .581.23.628.541l.539 3.636h.034l.551-3.527a.768.768 0 0 1 1.518-.004l.574 3.532h.025l.531-3.635a.634.634 0 1 1 1.25.209l-.86 4.543a.86.86 0 0 1-.849.705"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={16.34}
      x2={21.656}
      y1={8.848}
      y2={14.164}
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
      d="M20.462 15h-.004a.864.864 0 0 1-.851-.709L19 10.975h-.017l-.601 3.315a.865.865 0 0 1-1.7.005l-.853-4.543A.634.634 0 0 1 16.452 9h.069c.314 0 .581.23.628.541l.539 3.636h.034l.551-3.527a.768.768 0 0 1 1.518-.004l.574 3.532h.025l.531-3.635a.634.634 0 1 1 1.25.209l-.86 4.543a.86.86 0 0 1-.849.705"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={2.341}
      x2={7.656}
      y1={8.848}
      y2={14.164}
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
      d="M6.462 15h-.004a.864.864 0 0 1-.851-.709L5 10.975h-.016l-.601 3.315a.865.865 0 0 1-1.701.005l-.854-4.543A.635.635 0 0 1 2.452 9h.069c.314 0 .581.23.628.541l.539 3.636h.034l.55-3.527a.769.769 0 0 1 1.519-.004l.574 3.532h.025l.531-3.635a.634.634 0 1 1 1.25.209l-.86 4.543a.86.86 0 0 1-.849.705"
      style={{
        fill: 'url(#e)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgDomain);
export default ForwardRef;
