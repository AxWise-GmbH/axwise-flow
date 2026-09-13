import * as React from 'react';
import { forwardRef } from 'react';
const LgGroups = ({ title, titleId, ...props }, ref) => (
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
      x1={3.189}
      x2={8.811}
      y1={16.689}
      y2={22.311}
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
      d="M9.5 18h-7a1.5 1.5 0 0 0 0 3h7a1.5 1.5 0 0 0 0-3"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.189}
      x2={8.811}
      y1={16.689}
      y2={22.311}
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
      d="M9.5 18.5c.551 0 1 .449 1 1s-.449 1-1 1h-7c-.551 0-1-.449-1-1s.449-1 1-1zm0-.5h-7a1.5 1.5 0 0 0 0 3h7a1.5 1.5 0 0 0 0-3"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={15.189}
      x2={20.811}
      y1={16.689}
      y2={22.311}
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
      d="M21.5 18h-7a1.5 1.5 0 0 0 0 3h7a1.5 1.5 0 0 0 0-3"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={15.189}
      x2={20.811}
      y1={16.689}
      y2={22.311}
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
      d="M21.5 18.5c.551 0 1 .449 1 1s-.449 1-1 1h-7c-.551 0-1-.449-1-1s.449-1 1-1zm0-.5h-7a1.5 1.5 0 0 0 0 3h7a1.5 1.5 0 0 0 0-3"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={3.879}
      x2={8.121}
      y1={10.879}
      y2={15.121}
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
    <circle
      cx={6}
      cy={13}
      r={3}
      style={{
        fill: 'url(#e)',
      }}
    />
    <linearGradient
      id="f"
      x1={3.879}
      x2={8.121}
      y1={10.879}
      y2={15.121}
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
      d="M6 10.5c1.378 0 2.5 1.121 2.5 2.5S7.378 15.5 6 15.5 3.5 14.379 3.5 13s1.122-2.5 2.5-2.5m0-.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6"
      style={{
        fill: 'url(#f)',
      }}
    />
    <linearGradient
      id="g"
      x1={15.879}
      x2={20.121}
      y1={10.879}
      y2={15.121}
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
    <circle
      cx={18}
      cy={13}
      r={3}
      style={{
        fill: 'url(#g)',
      }}
    />
    <linearGradient
      id="h"
      x1={15.879}
      x2={20.121}
      y1={10.879}
      y2={15.121}
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
      d="M18 10.5c1.378 0 2.5 1.121 2.5 2.5s-1.122 2.5-2.5 2.5-2.5-1.121-2.5-2.5 1.122-2.5 2.5-2.5m0-.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6"
      style={{
        fill: 'url(#h)',
      }}
    />
    <linearGradient
      id="i"
      x1={10.232}
      x2={13.768}
      y1={5.732}
      y2={9.268}
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
    <circle
      cx={12}
      cy={7.5}
      r={2.5}
      style={{
        fill: 'url(#i)',
      }}
    />
    <linearGradient
      id="j"
      x1={10.232}
      x2={13.768}
      y1={5.732}
      y2={9.268}
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
      d="M12 5.5c1.103 0 2 .897 2 2s-.897 2-2 2-2-.897-2-2 .897-2 2-2m0-.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5"
      style={{
        fill: 'url(#j)',
      }}
    />
    <linearGradient
      id="k"
      x1={3.732}
      x2={7.268}
      y1={3.732}
      y2={7.268}
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
    <circle
      cx={5.5}
      cy={5.5}
      r={2.5}
      style={{
        fill: 'url(#k)',
      }}
    />
    <linearGradient
      id="l"
      x1={3.732}
      x2={7.268}
      y1={3.732}
      y2={7.268}
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
      d="M5.5 3.5c1.103 0 2 .897 2 2s-.897 2-2 2-2-.897-2-2 .897-2 2-2m0-.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5"
      style={{
        fill: 'url(#l)',
      }}
    />
    <linearGradient
      id="m"
      x1={16.732}
      x2={20.268}
      y1={3.732}
      y2={7.268}
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
    <circle
      cx={18.5}
      cy={5.5}
      r={2.5}
      style={{
        fill: 'url(#m)',
      }}
    />
    <linearGradient
      id="n"
      x1={16.732}
      x2={20.268}
      y1={3.732}
      y2={7.268}
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
      d="M18.5 3.5c1.103 0 2 .897 2 2s-.897 2-2 2-2-.897-2-2 .897-2 2-2m0-.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5"
      style={{
        fill: 'url(#n)',
      }}
    />
    <linearGradient
      id="o"
      x1={3.189}
      x2={8.811}
      y1={16.689}
      y2={22.311}
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
      d="M9.5 18h-7a1.5 1.5 0 0 0 0 3h7a1.5 1.5 0 0 0 0-3"
      style={{
        fill: 'url(#o)',
      }}
    />
    <linearGradient
      id="p"
      x1={15.189}
      x2={20.811}
      y1={16.689}
      y2={22.311}
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
      d="M21.5 18h-7a1.5 1.5 0 0 0 0 3h7a1.5 1.5 0 0 0 0-3"
      style={{
        fill: 'url(#p)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgGroups);
export default ForwardRef;
