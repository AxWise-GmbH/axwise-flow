import * as React from 'react';
import { forwardRef } from 'react';
const LgDelete = ({ title, titleId, ...props }, ref) => (
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
      x1={4.144}
      x2={19.856}
      y1={3.027}
      y2={18.739}
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
      d="M21 5a2 2 0 0 0-2-2h-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1H5a1.993 1.993 0 0 0-.903 3.775l1.575 12.597A3 3 0 0 0 8.648 22h6.703a3 3 0 0 0 2.977-2.628l1.575-12.597A1.99 1.99 0 0 0 21 5"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.144}
      x2={19.856}
      y1={3.027}
      y2={18.739}
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
      d="M15 2.5a.5.5 0 0 1 .5.5v.5H19c.827 0 1.5.673 1.5 1.5 0 .561-.316 1.07-.824 1.33l-.236.12-.033.263-1.575 12.597a2.505 2.505 0 0 1-2.481 2.19H8.648a2.504 2.504 0 0 1-2.481-2.19L4.593 6.713 4.56 6.45l-.236-.12A1.49 1.49 0 0 1 3.5 5c0-.827.673-1.5 1.5-1.5h3.5V3a.5.5 0 0 1 .5-.5zm0-.5H9a1 1 0 0 0-1 1H5a1.993 1.993 0 0 0-.903 3.775l1.575 12.597A3 3 0 0 0 8.648 22h6.703a3 3 0 0 0 2.977-2.628l1.575-12.597A1.993 1.993 0 0 0 19 3h-3a1 1 0 0 0-1-1"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={7.086}
      x2={16.914}
      y1={0.086}
      y2={9.914}
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
      d="M19 3h-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1H5a2 2 0 1 0 0 4h14a2 2 0 1 0 0-4"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgDelete);
export default ForwardRef;
