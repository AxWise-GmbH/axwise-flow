import * as React from 'react';
import { forwardRef } from 'react';
const LgYoutubePlay = ({ title, titleId, ...props }, ref) => (
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
      x1={3.363}
      x2={20.637}
      y1={3.363}
      y2={20.637}
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
      d="M19.503 3.421C17.662 3.2 15.131 3 12 3s-5.662.2-7.503.421C2.496 3.661 1 5.374 1 7.39v9.221c0 2.015 1.496 3.728 3.497 3.969C6.338 20.8 8.869 21 12 21s5.662-.2 7.503-.421C21.504 20.338 23 18.626 23 16.61V7.39c0-2.016-1.496-3.729-3.497-3.969"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.363}
      x2={20.637}
      y1={3.363}
      y2={20.637}
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
      d="M12 3.5c2.632 0 5.136.141 7.443.418C21.186 4.127 22.5 5.62 22.5 7.39v9.221c0 1.77-1.314 3.263-3.057 3.472-2.307.276-4.811.417-7.443.417s-5.136-.141-7.443-.418C2.814 19.873 1.5 18.38 1.5 16.61V7.39c0-1.77 1.314-3.263 3.057-3.472C6.864 3.641 9.368 3.5 12 3.5m0-.5c-3.131 0-5.662.2-7.503.421C2.496 3.661 1 5.374 1 7.39v9.221c0 2.015 1.496 3.728 3.497 3.969C6.338 20.8 8.869 21 12 21s5.662-.2 7.503-.421C21.504 20.338 23 18.626 23 16.61V7.39c0-2.015-1.496-3.728-3.497-3.969C17.662 3.2 15.131 3 12 3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={8.104}
      x2={13.665}
      y1={9.219}
      y2={14.781}
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
      d="m15.52 11.104-4.846-3.231A1.076 1.076 0 0 0 9 8.769v6.462a1.078 1.078 0 0 0 1.674.896l4.846-3.231a1.077 1.077 0 0 0 0-1.792"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgYoutubePlay);
export default ForwardRef;
