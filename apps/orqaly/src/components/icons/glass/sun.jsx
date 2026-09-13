import * as React from 'react';
import { forwardRef } from 'react';
const LgSun = ({ title, titleId, ...props }, ref) => (
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
      x1={3.868}
      x2={20.132}
      y1={3.868}
      y2={20.132}
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
      d="M10.925 1.193a1.18 1.18 0 0 1 2.15 0l1.167 2.578a1.574 1.574 0 0 0 1.992.825l2.648-.997a1.179 1.179 0 0 1 1.52 1.52l-.997 2.648a1.58 1.58 0 0 0 .825 1.992l2.578 1.167a1.178 1.178 0 0 1-.001 2.149l-2.578 1.167a1.574 1.574 0 0 0-.825 1.992l.997 2.648a1.179 1.179 0 0 1-1.52 1.52l-2.648-.997a1.58 1.58 0 0 0-1.992.825l-1.167 2.578a1.178 1.178 0 0 1-2.149-.001l-1.167-2.578a1.574 1.574 0 0 0-1.992-.825l-2.648.997a1.179 1.179 0 0 1-1.52-1.52l.997-2.648a1.58 1.58 0 0 0-.825-1.992l-2.578-1.167a1.178 1.178 0 0 1 .001-2.149l2.578-1.167a1.574 1.574 0 0 0 .825-1.992l-.998-2.648a1.179 1.179 0 0 1 1.52-1.52l2.648.997a1.573 1.573 0 0 0 1.992-.824z"
      style={{
        fillRule: 'evenodd',
        clipRule: 'evenodd',
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={0.5} x2={23.5} y1={12} y2={12} gradientUnits="userSpaceOnUse">
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
      d="M12 1a.68.68 0 0 1 .619.399l1.167 2.578a2.07 2.07 0 0 0 1.892 1.22q.378 0 .732-.133l2.648-.997a.679.679 0 0 1 .876.875l-.998 2.648a2.07 2.07 0 0 0 .025 1.526c.202.489.579.878 1.062 1.097l2.578 1.167a.68.68 0 0 1 0 1.239l-2.578 1.167a2.07 2.07 0 0 0-1.062 1.097 2.07 2.07 0 0 0-.025 1.526l.997 2.648a.68.68 0 0 1-.876.875l-2.648-.997a2.08 2.08 0 0 0-2.624 1.087L12.618 22.6a.678.678 0 0 1-1.237.001l-1.167-2.578a2.07 2.07 0 0 0-1.892-1.22 2.1 2.1 0 0 0-.732.133l-2.648.997a.679.679 0 0 1-.876-.875l.997-2.648a2.07 2.07 0 0 0-.025-1.526 2.07 2.07 0 0 0-1.062-1.097L1.398 12.62a.68.68 0 0 1 .001-1.239l2.578-1.167A2.076 2.076 0 0 0 5.064 7.59l-.998-2.648a.68.68 0 0 1 .876-.875l2.648.996a2.08 2.08 0 0 0 2.624-1.087l1.167-2.578A.68.68 0 0 1 12 1m0-.5a1.18 1.18 0 0 0-1.075.693L9.758 3.771a1.577 1.577 0 0 1-1.991.825l-2.649-.998a1.18 1.18 0 0 0-1.52 1.521l.997 2.648a1.57 1.57 0 0 1-.824 1.991l-2.578 1.167a1.18 1.18 0 0 0 0 2.15l2.578 1.167a1.574 1.574 0 0 1 .825 1.992l-.997 2.648a1.179 1.179 0 0 0 1.521 1.52l2.648-.997a1.58 1.58 0 0 1 1.158.019c.37.153.668.441.833.806l1.167 2.578a1.178 1.178 0 0 0 2.149-.001l1.167-2.578a1.574 1.574 0 0 1 1.991-.825l2.648.997a1.18 1.18 0 0 0 1.251-.27 1.18 1.18 0 0 0 .27-1.25l-.997-2.648a1.58 1.58 0 0 1 .825-1.992l2.578-1.167a1.178 1.178 0 0 0-.001-2.149l-2.578-1.167a1.574 1.574 0 0 1-.825-1.992l.997-2.648a1.179 1.179 0 0 0-1.521-1.52l-2.648.997a1.58 1.58 0 0 1-1.158-.019 1.57 1.57 0 0 1-.833-.806l-1.167-2.578A1.18 1.18 0 0 0 12 .5"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={8.471}
      x2={15.542}
      y1={8.473}
      y2={15.544}
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
      d="M17.006 12.008a5 5 0 1 1-10.001-.001 5 5 0 0 1 10.001.001"
      style={{
        fill: 'url(#c)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgSun);
export default ForwardRef;
