import * as React from 'react';
import { forwardRef } from 'react';
const LgComboChart = ({ title, titleId, ...props }, ref) => (
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
      x1={2.336}
      x2={7.664}
      y1={14.836}
      y2={20.164}
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
      d="M6 21H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={2.336}
      x2={7.664}
      y1={14.836}
      y2={20.164}
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
      d="M6 14.5c.827 0 1.5.673 1.5 1.5v3c0 .827-.673 1.5-1.5 1.5H4c-.827 0-1.5-.673-1.5-1.5v-3c0-.827.673-1.5 1.5-1.5zm0-.5H4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={15.586}
      x2={22.414}
      y1={12.586}
      y2={19.414}
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
      d="M20 21h-2a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={15.586}
      x2={22.414}
      y1={12.586}
      y2={19.414}
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
      d="M20 11.5c.827 0 1.5.673 1.5 1.5v6c0 .827-.673 1.5-1.5 1.5h-2c-.827 0-1.5-.673-1.5-1.5v-6c0-.827.673-1.5 1.5-1.5zm0-.5h-2a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={7.836}
      x2={16.164}
      y1={10.336}
      y2={18.664}
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
      d="M13 21h-2a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2"
      style={{
        fill: 'url(#e)',
      }}
    />
    <linearGradient
      id="f"
      x1={7.836}
      x2={16.164}
      y1={10.336}
      y2={18.664}
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
      d="M13 8.5c.827 0 1.5.673 1.5 1.5v9c0 .827-.673 1.5-1.5 1.5h-2c-.827 0-1.5-.673-1.5-1.5v-9c0-.827.673-1.5 1.5-1.5zm0-.5h-2a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2"
      style={{
        fill: 'url(#f)',
      }}
    />
    <linearGradient
      id="g"
      x1={7.586}
      x2={16.414}
      y1={2.586}
      y2={11.414}
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
      d="M19 4c-.514 0-.978.2-1.333.519l-3.75-1.057A1.994 1.994 0 0 0 12 2a2 2 0 0 0-1.996 1.961L5.999 6.277A2 2 0 0 0 5 6a2 2 0 1 0 1.999 2.009l3.976-2.3a1.98 1.98 0 0 0 2.45-.307l3.622 1.021A1.999 1.999 0 1 0 19 4"
      style={{
        fill: 'url(#g)',
      }}
    />
    <linearGradient id="h" x1={3} x2={21} y1={6} y2={6} gradientUnits="userSpaceOnUse">
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
      d="M12 2.5a1.5 1.5 0 0 1 1.436 1.097l.076.27.27.076L17.532 5l.265.075.205-.184c.279-.252.634-.391.998-.391.827 0 1.5.673 1.5 1.5s-.673 1.5-1.5 1.5a1.51 1.51 0 0 1-1.465-1.183l-.063-.294-.29-.082L13.56 4.92l-.285-.08-.207.211c-.285.29-.664.449-1.068.449q-.402 0-.767-.22l-.253-.151-.255.148-3.976 2.3-.249.143-.001.287A1.503 1.503 0 0 1 5 9.5c-.827 0-1.5-.673-1.5-1.5S4.173 6.5 5 6.5q.388 0 .748.209l.251.146.251-.145 4.005-2.317.244-.141.006-.282c.015-.81.686-1.47 1.495-1.47m0-.5a2 2 0 0 0-1.996 1.961L5.999 6.277A2 2 0 0 0 5 6a2 2 0 1 0 1.999 2.009l3.976-2.3a1.98 1.98 0 0 0 2.45-.307l3.622 1.021A1.999 1.999 0 1 0 19 4c-.514 0-.978.2-1.333.519l-3.75-1.057A1.994 1.994 0 0 0 12 2"
      style={{
        fill: 'url(#h)',
      }}
    />
    <linearGradient
      id="i"
      x1={17.586}
      x2={20.414}
      y1={4.586}
      y2={7.414}
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
    <circle
      cx={19}
      cy={6}
      r={2}
      style={{
        fill: 'url(#i)',
      }}
    />
    <linearGradient
      id="j"
      x1={10.586}
      x2={13.414}
      y1={2.586}
      y2={5.414}
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
    <circle
      cx={12}
      cy={4}
      r={2}
      style={{
        fill: 'url(#j)',
      }}
    />
    <linearGradient
      id="k"
      x1={3.586}
      x2={6.414}
      y1={6.586}
      y2={9.414}
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
    <circle
      cx={5}
      cy={8}
      r={2}
      style={{
        fill: 'url(#k)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgComboChart);
export default ForwardRef;
