import * as React from 'react';
import { forwardRef } from 'react';
const LgPhone = ({ title, titleId, ...props }, ref) => (
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
      x1={3.207}
      x2={19.029}
      y1={4.971}
      y2={20.793}
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
      d="M19.908 14.64a3.73 3.73 0 0 0-5.271-.003l-.004.002-.929.929-5.274-5.274.93-.928.002-.004a3.73 3.73 0 0 0-5.273-5.273q0 .002-.003.003A3.72 3.72 0 0 0 3.085 7.52c.222 1.653 1.091 5.452 4.517 8.878s7.224 4.295 8.878 4.517a3.72 3.72 0 0 0 3.428-1.001l.002-.004a3.73 3.73 0 0 0-.002-5.27"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={3.207}
      x2={19.029}
      y1={4.971}
      y2={20.793}
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
      d="M6.723 3.5c.862 0 1.673.336 2.283.946a3.235 3.235 0 0 1-.007 4.573l-.016.017-.906.906-.354.354.354.354 5.274 5.274.354.354.354-.354.884-.884.082-.048.028-.059a3.2 3.2 0 0 1 2.22-.884c.862 0 1.673.336 2.283.946a3.23 3.23 0 0 1 .002 4.563l-.047.047a3.2 3.2 0 0 1-2.231.896c-.233 0-.466-.025-.733-.081-1.464-.196-5.232-1.016-8.591-4.375s-4.178-7.127-4.381-8.63a3.22 3.22 0 0 1 .823-2.925l.081-.048.027-.059A3.2 3.2 0 0 1 6.723 3.5m.001-.5a3.72 3.72 0 0 0-2.635 1.089q0 .002-.003.003A3.72 3.72 0 0 0 3.085 7.52c.222 1.653 1.091 5.452 4.517 8.878s7.224 4.295 8.878 4.517q.396.084.799.085a3.7 3.7 0 0 0 2.628-1.086l.002-.004a3.73 3.73 0 0 0-5.274-5.274l-.004.002-.929.929-5.274-5.274.932-.927.002-.004A3.73 3.73 0 0 0 6.724 3"
      style={{
        fill: 'url(#b)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgPhone);
export default ForwardRef;
