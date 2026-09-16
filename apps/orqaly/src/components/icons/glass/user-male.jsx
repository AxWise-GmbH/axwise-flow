import * as React from 'react';
import { forwardRef } from 'react';
const LgUserMale = ({ title, titleId, ...props }, ref) => (
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
      x1={5.079}
      x2={18.754}
      y1={5.193}
      y2={18.868}
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
      d="M21 14v-3c0-7-6-7-6-7a2 2 0 0 0-2-2h-1a9 9 0 0 0-9 9v3c0 .383.222.704.538.872A1.48 1.48 0 0 0 3 16a1.5 1.5 0 0 0 1.8 1.47C6.093 20.148 8.827 22 12 22s5.907-1.852 7.2-4.53q.146.03.3.03A1.5 1.5 0 0 0 21 16c0-.457-.215-.854-.538-1.128A.99.99 0 0 0 21 14"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={5.079}
      x2={18.754}
      y1={5.193}
      y2={18.868}
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
      d="M13 2.5c.827 0 1.5.673 1.5 1.5l.001.498.498.002c.224.001 5.501.1 5.501 6.5v3c0 .179-.102.34-.273.431l-.652.347.564.476A.97.97 0 0 1 20.5 16a1.002 1.002 0 0 1-1.201.98l-.381-.077-.169.35C17.484 19.872 14.898 21.5 12 21.5s-5.484-1.628-6.75-4.248l-.169-.35-.38.078Q4.603 17 4.5 17c-.551 0-1-.449-1-1a.97.97 0 0 1 .361-.746l.564-.476-.652-.347A.49.49 0 0 1 3.5 14v-3c0-4.687 3.813-8.5 8.5-8.5zm0-.5h-1a9 9 0 0 0-9 9v3c0 .383.222.704.538.872A1.48 1.48 0 0 0 3 16a1.5 1.5 0 0 0 1.8 1.47C6.093 20.148 8.827 22 12 22s5.907-1.852 7.2-4.53q.146.03.3.03A1.5 1.5 0 0 0 21 16c0-.457-.215-.854-.538-1.128A.99.99 0 0 0 21 14v-3c0-7-6-7-6-7a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient id="c" x1={3} x2={21} y1={8.5} y2={8.5} gradientUnits="userSpaceOnUse">
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
      d="M15 4a2 2 0 0 0-2-2h-1a9 9 0 0 0-9 9v3c0 .552.448 1 1 1s1-.293 1-1c0-1.64 1.343-3 3-3h8a3 3 0 0 1 3 3c0 .584.448 1 1 1s1-.448 1-1v-3c0-7-6-7-6-7"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgUserMale);
export default ForwardRef;
