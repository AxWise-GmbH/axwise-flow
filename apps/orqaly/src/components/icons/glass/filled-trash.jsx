import * as React from 'react';
import { forwardRef } from 'react';
const LgFilledTrash = ({ title, titleId, ...props }, ref) => (
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
      x1={4.478}
      x2={19.522}
      y1={3.108}
      y2={18.152}
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
      d="M19 3H5a1 1 0 0 0-.994 1.11L5.55 18l.037.331A3 3 0 0 0 8.568 21h6.864a3 3 0 0 0 2.982-2.669L18.45 18l1.543-13.89A1 1 0 0 0 19 3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.478}
      x2={19.522}
      y1={3.108}
      y2={18.152}
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
      d="M19 3.5c.144 0 .276.059.373.167s.14.245.124.389l-1.543 13.89-.037.331a2.497 2.497 0 0 1-2.485 2.224H8.568a2.497 2.497 0 0 1-2.485-2.224l-.037-.331L4.503 4.055c-.016-.143.028-.281.125-.388S4.856 3.5 5 3.5zm0-.5H5a1 1 0 0 0-.994 1.11L5.55 18l.037.331A3 3 0 0 0 8.568 21h6.864a3 3 0 0 0 2.982-2.669L18.45 18l1.543-13.89A1 1 0 0 0 19 3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={9.079}
      x2={14.874}
      y1={9.921}
      y2={15.716}
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
      d="m8.547 15.095-1.019-2.039a1.64 1.64 0 0 1 .307-1.891l2.562-2.562a.7.7 0 0 1 1.077.107l1.059 1.589c.292.438.783.701 1.309.701h1.85a.7.7 0 0 1 .582 1.088l-1.094 1.641c-.117.177-.18.384-.18.597v.974a.7.7 0 0 1-.7.7h-4.288a1.64 1.64 0 0 1-1.465-.905"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={13.457}
      x2={16.398}
      y1={5.781}
      y2={8.721}
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
      d="m12.883 7.325.697 1.046c.263.393.704.629 1.176.629h1.036a.79.79 0 0 0 .776-.646l.207-1.125A1.04 1.04 0 0 0 15.751 6h-2.159a.853.853 0 0 0-.709 1.325"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgFilledTrash);
export default ForwardRef;
