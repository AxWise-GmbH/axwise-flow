import * as React from 'react';
import { forwardRef } from 'react';
const LgRestart = ({ title, titleId, ...props }, ref) => (
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
      x1={5.516}
      x2={19.658}
      y1={4.342}
      y2={18.484}
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
      d="M19.741 12c-.914 0-1.703.622-1.932 1.506A6.001 6.001 0 0 1 6 12a6 6 0 0 1 6-6c1.598 0 3.042.632 4.116 1.652l-.859.858c-.55.55-.16 1.49.617 1.49h3.707C20.365 10 21 9.365 21 8.582V4.874c0-.777-.94-1.167-1.49-.617l-.568.568A9.94 9.94 0 0 0 12 2C6.477 2 2 6.477 2 12s4.477 10 10 10c4.638 0 8.538-3.157 9.669-7.44.341-1.288-.595-2.56-1.928-2.56"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={5.516}
      x2={19.658}
      y1={4.342}
      y2={18.484}
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
      d="M12 2.5c2.466 0 4.809.953 6.595 2.684l.353.343.348-.348.568-.568a.35.35 0 0 1 .257-.111c.157 0 .379.116.379.374v3.707a.92.92 0 0 1-.918.918h-3.707a.36.36 0 0 1-.344-.23.36.36 0 0 1 .081-.406l.859-.859.363-.363-.374-.352A6.46 6.46 0 0 0 12 5.5c-3.584 0-6.5 2.916-6.5 6.5s2.916 6.5 6.5 6.5a6.5 6.5 0 0 0 6.293-4.869 1.5 1.5 0 0 1 1.448-1.131c.465 0 .894.211 1.177.578.296.384.393.878.267 1.354A9.5 9.5 0 0 1 12 21.5c-5.238 0-9.5-4.262-9.5-9.5S6.762 2.5 12 2.5m0-.5C6.477 2 2 6.477 2 12s4.477 10 10 10c4.638 0 8.538-3.157 9.669-7.44.34-1.289-.595-2.56-1.928-2.56-.914 0-1.703.622-1.932 1.506A6.001 6.001 0 0 1 6 12a6 6 0 0 1 6-6c1.598 0 3.042.632 4.116 1.652l-.859.858c-.55.55-.16 1.49.617 1.49h3.707C20.365 10 21 9.365 21 8.582V4.874a.871.871 0 0 0-1.49-.617l-.568.568A9.94 9.94 0 0 0 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgRestart);
export default ForwardRef;
