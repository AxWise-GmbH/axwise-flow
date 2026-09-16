import * as React from 'react';
import { forwardRef } from 'react';
const LgGeminiAi = ({ title, titleId, ...props }, ref) => (
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
      x1={5.786}
      x2={14.214}
      y1={5.857}
      y2={14.285}
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
      d="m11.612 15.61-.809 1.852a.872.872 0 0 1-1.607 0l-.808-1.852a7.14 7.14 0 0 0-3.631-3.678l-2.226-.988c-.708-.314-.708-1.344 0-1.658l2.156-.957A7.14 7.14 0 0 0 8.37 4.528l.82-1.974a.872.872 0 0 1 1.62 0l.819 1.974a7.14 7.14 0 0 0 3.683 3.801l2.156.957c.708.314.708 1.344 0 1.658l-2.226.988a7.13 7.13 0 0 0-3.63 3.678"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={5.786}
      x2={14.214}
      y1={5.857}
      y2={14.285}
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
      d="M10 2.504c.075 0 .258.023.348.241l.819 1.974a7.6 7.6 0 0 0 3.942 4.066l2.157.957a.4.4 0 0 1 .234.372.4.4 0 0 1-.234.372l-2.226.988a7.6 7.6 0 0 0-3.886 3.935l-.809 1.852a.37.37 0 0 1-.345.234.37.37 0 0 1-.345-.234l-.809-1.852a7.62 7.62 0 0 0-3.886-3.935l-2.226-.988a.4.4 0 0 1-.234-.371.4.4 0 0 1 .234-.372l2.156-.957a7.6 7.6 0 0 0 3.943-4.067l.819-1.974A.37.37 0 0 1 10 2.504m0-.5a.87.87 0 0 0-.81.549l-.819 1.975a7.14 7.14 0 0 1-3.684 3.801l-2.156.957c-.708.314-.708 1.344 0 1.658l2.226.988a7.13 7.13 0 0 1 3.631 3.678l.809 1.852a.87.87 0 0 0 .803.534.87.87 0 0 0 .803-.534l.809-1.852a7.14 7.14 0 0 1 3.631-3.678l2.226-.988c.708-.314.708-1.344 0-1.658l-2.156-.957a7.14 7.14 0 0 1-3.683-3.801l-.82-1.974a.87.87 0 0 0-.81-.55"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={15.878}
      x2={20.122}
      y1={15.916}
      y2={20.159}
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
      d="m18.713 21.125-.247.565a.506.506 0 0 1-.934 0l-.247-.565a4.36 4.36 0 0 0-2.219-2.249l-.76-.337a.53.53 0 0 1 0-.962l.717-.319a4.36 4.36 0 0 0 2.251-2.324l.253-.611a.506.506 0 0 1 .941 0l.253.611a4.36 4.36 0 0 0 2.251 2.324l.717.319a.53.53 0 0 1 0 .962l-.76.337a4.37 4.37 0 0 0-2.216 2.249"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={15.878}
      x2={20.122}
      y1={15.916}
      y2={20.159}
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
      d="m18 14.504.009.011.253.611a4.84 4.84 0 0 0 2.51 2.589l.717.367-.76.337a4.85 4.85 0 0 0-2.474 2.506l-.264.565-.247-.565a4.85 4.85 0 0 0-2.474-2.506l-.76-.386.717-.319a4.84 4.84 0 0 0 2.51-2.589l.258-.621zm0-.5a.505.505 0 0 0-.471.319l-.253.611a4.36 4.36 0 0 1-2.251 2.324l-.717.319a.53.53 0 0 0 0 .962l.76.337a4.36 4.36 0 0 1 2.219 2.249l.247.565c.089.207.278.31.466.31a.5.5 0 0 0 .467-.31l.247-.565a4.36 4.36 0 0 1 2.219-2.249l.76-.337a.53.53 0 0 0 0-.962l-.717-.319a4.36 4.36 0 0 1-2.251-2.324l-.253-.611a.51.51 0 0 0-.472-.319"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={15.878}
      x2={20.122}
      y1={15.916}
      y2={20.159}
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
      d="m18.713 21.125-.247.565a.506.506 0 0 1-.934 0l-.247-.565a4.36 4.36 0 0 0-2.219-2.249l-.76-.337a.53.53 0 0 1 0-.962l.717-.319a4.36 4.36 0 0 0 2.251-2.324l.253-.611a.506.506 0 0 1 .941 0l.253.611a4.36 4.36 0 0 0 2.251 2.324l.717.319a.53.53 0 0 1 0 .962l-.76.337a4.37 4.37 0 0 0-2.216 2.249"
      style={{
        fill: 'url(#e)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgGeminiAi);
export default ForwardRef;
