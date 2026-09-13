import * as React from 'react';
import { forwardRef } from 'react';
const LgIdea = ({ title, titleId, ...props }, ref) => (
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
    <path
      d="M11.329 22"
      style={{
        opacity: 0.35,
      }}
    />
    <linearGradient
      id="a"
      x1={5.443}
      x2={18.557}
      y1={4.243}
      y2={17.357}
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
      d="M12 1a8 8 0 0 0-8 8 7.98 7.98 0 0 0 3.333 6.489L7.976 18l.446 1.744A3 3 0 0 0 11.328 22h1.343a3 3 0 0 0 2.906-2.256L16.024 18l.643-2.511A7.98 7.98 0 0 0 20 9a8 8 0 0 0-8-8"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={5.443}
      x2={18.557}
      y1={4.243}
      y2={17.357}
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
      d="M12 1.5c4.136 0 7.5 3.364 7.5 7.5a7.52 7.52 0 0 1-3.126 6.083l-.147.106-.045.176-.643 2.511-.446 1.744a2.5 2.5 0 0 1-2.422 1.88h-1.343a2.5 2.5 0 0 1-2.421-1.88l-.446-1.744-.643-2.511-.045-.176-.147-.106A7.52 7.52 0 0 1 4.5 9c0-4.136 3.364-7.5 7.5-7.5m0-.5a8 8 0 0 0-8 8 7.98 7.98 0 0 0 3.333 6.489L7.976 18l.446 1.744A3 3 0 0 0 11.328 22h1.343a3 3 0 0 0 2.906-2.256L16.024 18l.643-2.511A7.98 7.98 0 0 0 20 9a8 8 0 0 0-8-8"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={9.516}
      x2={14.484}
      y1={16.461}
      y2={21.43}
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
      d="M15.577 19.744 16.024 18H7.976l.446 1.744A3 3 0 0 0 11.328 22h1.343a3 3 0 0 0 2.906-2.256"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgIdea);
export default ForwardRef;
