import * as React from 'react';
import { forwardRef } from 'react';
const LgSave = ({ title, titleId, ...props }, ref) => (
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
      x1={3.568}
      x2={19.811}
      y1={4.189}
      y2={20.432}
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
      d="M18 21H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h10.757c.796 0 1.559.316 2.121.879l1.243 1.243c.563.562.879 1.325.879 2.121V18a3 3 0 0 1-3 3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.568}
      x2={19.811}
      y1={4.189}
      y2={20.432}
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
      d="M16.757 3.5c.668 0 1.296.26 1.768.732l1.243 1.243c.472.472.732 1.1.732 1.768V18c0 1.379-1.121 2.5-2.5 2.5H6A2.503 2.503 0 0 1 3.5 18V6c0-1.379 1.122-2.5 2.5-2.5zm0-.5H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7.243c0-.796-.316-1.559-.879-2.121l-1.243-1.243A3 3 0 0 0 16.757 3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={8.793}
      x2={15.207}
      y1={2.793}
      y2={9.207}
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
      d="M15 3a1 1 0 0 0-1 1v2a1 1 0 0 1-2 0V4a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={7.043}
      x2={16.957}
      y1={12.129}
      y2={22.043}
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
      d="M18 14a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v7h12z"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={7.043}
      x2={16.957}
      y1={12.129}
      y2={22.043}
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
      d="M16 12.5c.827 0 1.5.673 1.5 1.5v6.5h-11V14c0-.827.673-1.5 1.5-1.5zm0-.5H8a2 2 0 0 0-2 2v7h12v-7a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#e)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgSave);
export default ForwardRef;
