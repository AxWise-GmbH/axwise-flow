import * as React from 'react';
import { forwardRef } from 'react';
const LgAppointmentReminders = ({ title, titleId, ...props }, ref) => (
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
      x1={4.58}
      x2={19.37}
      y1={6.521}
      y2={21.311}
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
      d="m21.55 16.4-1.15-1.533a7 7 0 0 1-1.4-4.2V9.294c0-3.833-2.953-7.175-6.785-7.29A7 7 0 0 0 5 9v1.667a7 7 0 0 1-1.4 4.2L2.45 16.4a2.25 2.25 0 0 0 1.8 3.6H9a3 3 0 1 0 6 0h4.75a2.25 2.25 0 0 0 1.8-3.6"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.58}
      x2={19.37}
      y1={6.521}
      y2={21.311}
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
      d="M12 2.5q.1 0 .2.003c3.474.104 6.3 3.15 6.3 6.79v1.373a7.55 7.55 0 0 0 1.5 4.5l1.15 1.533a1.752 1.752 0 0 1-1.4 2.8H14.5V20c0 1.379-1.122 2.5-2.5 2.5S9.5 21.379 9.5 20v-.5H4.25a1.752 1.752 0 0 1-1.4-2.8L4 15.167a7.55 7.55 0 0 0 1.5-4.5V9c0-3.584 2.916-6.5 6.5-6.5m0-.5a7 7 0 0 0-7 7v1.667a7 7 0 0 1-1.4 4.2L2.45 16.4a2.25 2.25 0 0 0 1.8 3.6H9a3 3 0 1 0 6 0h4.75a2.25 2.25 0 0 0 1.8-3.6l-1.15-1.533a7 7 0 0 1-1.4-4.2V9.294c0-3.833-2.953-7.175-6.785-7.29A5 5 0 0 0 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={10.189}
      x2={13.811}
      y1={18.811}
      y2={22.432}
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
      d="M9 20a3 3 0 1 0 6 0z"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgAppointmentReminders);
export default ForwardRef;
