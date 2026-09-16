import * as React from 'react';
import { forwardRef } from 'react';
const LgHandCursor = ({ title, titleId, ...props }, ref) => (
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
      x1={3.106}
      x2={19.581}
      y1={6.066}
      y2={22.541}
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
      d="M19.965 19.081c.018-.115.035-.231.035-.351v-6.689a3 3 0 0 0-2.507-2.959L11 8V3a2 2 0 0 0-4 0v10.064l-.186-.186a3 3 0 0 0-4.243 0l-.279.279a1 1 0 0 0 0 1.414l4.573 4.573A1.5 1.5 0 0 0 6 20.5 1.5 1.5 0 0 0 7.5 22h12a1.495 1.495 0 0 0 .465-2.919"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={2} x2={21} y1={11.5} y2={11.5} gradientUnits="userSpaceOnUse">
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
      d="M9 1.5c.827 0 1.5.673 1.5 1.5v5.424l.418.07 6.493 1.082a2.49 2.49 0 0 1 2.089 2.466v6.689c0 .094-.015.184-.029.274l-.066.42.404.132a.995.995 0 0 1-.309 1.944h-12c-.551 0-1-.449-1-1a.99.99 0 0 1 .578-.902l.645-.303-.503-.505-4.573-4.573a.501.501 0 0 1-.001-.707l.279-.279a2.48 2.48 0 0 1 1.768-.732c.668 0 1.296.26 1.768.732l.186.186.853.853V3c0-.827.673-1.5 1.5-1.5M9 1a2 2 0 0 0-2 2v10.064l-.186-.186C6.229 12.293 5.461 12 4.693 12s-1.536.293-2.121.879l-.279.279a1 1 0 0 0 0 1.414l4.573 4.573A1.497 1.497 0 0 0 7.5 22h12a1.495 1.495 0 0 0 .465-2.919c.018-.115.035-.231.035-.351v-6.689a3 3 0 0 0-2.507-2.959L11 8V3a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={9.439}
      x2={17.561}
      y1={16.439}
      y2={24.561}
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
      d="M19.5 19h-12a1.5 1.5 0 0 0 0 3h12a1.5 1.5 0 0 0 0-3"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgHandCursor);
export default ForwardRef;
