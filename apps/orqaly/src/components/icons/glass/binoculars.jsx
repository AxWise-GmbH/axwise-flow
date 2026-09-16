import * as React from 'react';
import { forwardRef } from 'react';
const LgBinoculars = ({ title, titleId, ...props }, ref) => (
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
      x1={3.336}
      x2={20.664}
      y1={4.836}
      y2={22.164}
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
      d="M22.984 18.752 22.89 18 21.375 5.876A1 1 0 0 0 20.383 5H20a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2 1 1 0 0 0-1 1v2h-4V6a1 1 0 0 0-1-1 2 2 0 0 0-2-2H6a2 2 0 0 0-2 2h-.383a1 1 0 0 0-.992.876L1.11 18l-.094.752A2 2 0 0 0 3 21h5a2 2 0 0 0 2-2v-4a2 2 0 1 1 4 0v4a2 2 0 0 0 2 2h5a2 2 0 0 0 1.984-2.248"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.336}
      x2={20.664}
      y1={4.836}
      y2={22.164}
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
      d="M18 3.5c.827 0 1.5.673 1.5 1.5v.5h.883a.5.5 0 0 1 .496.438l1.516 12.124.094.752A1.5 1.5 0 0 1 21 20.5h-5c-.827 0-1.5-.673-1.5-1.5v-4c0-1.378-1.121-2.5-2.5-2.5S9.5 13.622 9.5 15v4c0 .827-.673 1.5-1.5 1.5H3a1.5 1.5 0 0 1-1.489-1.686l.094-.752L3.121 5.938a.5.5 0 0 1 .496-.438H4.5V5c0-.827.673-1.5 1.5-1.5h1c.827 0 1.5.673 1.5 1.5v.5H9a.5.5 0 0 1 .5.5v2.5h5V6a.5.5 0 0 1 .5-.5h.5V5c0-.827.673-1.5 1.5-1.5zm0-.5h-1a2 2 0 0 0-2 2 1 1 0 0 0-1 1v2h-4V6a1 1 0 0 0-1-1 2 2 0 0 0-2-2H6a2 2 0 0 0-2 2h-.383a1 1 0 0 0-.992.876L1.11 18l-.094.752A2 2 0 0 0 3 21h5a2 2 0 0 0 2-2v-4a2 2 0 1 1 4 0v4a2 2 0 0 0 2 2h5a2 2 0 0 0 1.985-2.248L22.89 18 21.375 5.876A1 1 0 0 0 20.383 5H20a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient id="c" x1={9.25} x2={14.75} y1={8.75} y2={14.25} gradientUnits="userSpaceOnUse">
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
      d="M10 8v7a2 2 0 1 1 4 0V8z"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={16.043}
      x2={18.957}
      y1={3.129}
      y2={6.043}
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
      d="M20 5h-5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={5.043}
      x2={7.957}
      y1={3.129}
      y2={6.043}
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
      d="M4 5h5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2"
      style={{
        fill: 'url(#e)',
      }}
    />
    <linearGradient
      id="f"
      x1={15.765}
      x2={21.18}
      y1={16.235}
      y2={21.649}
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
      d="M22.984 18.752 22.89 18H14v1a2 2 0 0 0 2 2h5a2 2 0 0 0 1.984-2.248"
      style={{
        fill: 'url(#f)',
      }}
    />
    <linearGradient
      id="g"
      x1={2.848}
      x2={8.207}
      y1={16.262}
      y2={21.621}
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
      d="M1.016 18.752 1.11 18H10v1a2 2 0 0 1-2 2H3a2 2 0 0 1-1.984-2.248"
      style={{
        fill: 'url(#g)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgBinoculars);
export default ForwardRef;
