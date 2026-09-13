import * as React from 'react';
import { forwardRef } from 'react';
const LgSynchronize = ({ title, titleId, ...props }, ref) => (
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
      x1={7.24}
      x2={17.396}
      y1={2.618}
      y2={12.773}
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
      d="m19.51 4.257-.568.568A9.95 9.95 0 0 0 12 2a10 10 0 0 0-9.287 6.288C2.193 9.588 3.19 11 4.59 11c.79 0 1.54-.451 1.828-1.186A5.99 5.99 0 0 1 12 6c1.598 0 3.043.632 4.117 1.651l-.86.859c-.55.55-.16 1.49.617 1.49h3.707C20.365 10 21 9.365 21 8.582V4.874c0-.777-.94-1.166-1.49-.617"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={7.24}
      x2={17.396}
      y1={2.618}
      y2={12.773}
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
      d="M12 2.5c2.464 0 4.806.953 6.594 2.685l.353.342.348-.348.568-.568a.35.35 0 0 1 .257-.111c.157 0 .379.116.379.374v3.707a.92.92 0 0 1-.918.918h-3.707a.36.36 0 0 1-.344-.23.36.36 0 0 1 .081-.406l.859-.859.363-.363-.372-.353A6.46 6.46 0 0 0 12 5.5a6.46 6.46 0 0 0-6.048 4.132c-.203.519-.75.868-1.362.868a1.52 1.52 0 0 1-1.26-.672 1.43 1.43 0 0 1-.153-1.355A9.46 9.46 0 0 1 12 2.5m0-.5a10 10 0 0 0-9.287 6.288C2.193 9.588 3.19 11 4.59 11c.79 0 1.54-.451 1.828-1.186A5.99 5.99 0 0 1 12 6c1.598 0 3.043.632 4.117 1.651l-.86.859c-.55.55-.16 1.49.617 1.49h3.707C20.365 10 21 9.365 21 8.582V4.874a.871.871 0 0 0-1.49-.617l-.568.568A9.95 9.95 0 0 0 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={6.604}
      x2={16.76}
      y1={11.227}
      y2={21.382}
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
      d="M19.41 13c-.79 0-1.54.451-1.828 1.186A5.99 5.99 0 0 1 12 18a5.96 5.96 0 0 1-4.117-1.651l.859-.859c.55-.55.161-1.49-.616-1.49H4.418C3.635 14 3 14.635 3 15.418v3.707c0 .777.94 1.167 1.49.617l.568-.568A9.95 9.95 0 0 0 12 22c4.211 0 7.813-2.603 9.287-6.288.52-1.3-.477-2.712-1.877-2.712"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={6.604}
      x2={16.76}
      y1={11.227}
      y2={21.382}
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
      d="M19.41 13.5c.504 0 .976.251 1.26.672.278.41.333.904.153 1.355A9.46 9.46 0 0 1 12 21.5a9.44 9.44 0 0 1-6.594-2.685l-.353-.342-.348.348-.568.568a.36.36 0 0 1-.258.111c-.157 0-.379-.116-.379-.374v-3.707a.92.92 0 0 1 .918-.918h3.707c.225 0 .316.161.344.23a.36.36 0 0 1-.081.406l-.858.858-.363.363.372.353A6.45 6.45 0 0 0 12 18.5a6.46 6.46 0 0 0 6.048-4.132c.203-.519.75-.868 1.362-.868m0-.5c-.79 0-1.54.451-1.828 1.186A5.99 5.99 0 0 1 12 18a5.96 5.96 0 0 1-4.117-1.651l.859-.859c.55-.55.161-1.49-.616-1.49H4.418C3.635 14 3 14.635 3 15.418v3.707a.872.872 0 0 0 1.49.618l.568-.568A9.95 9.95 0 0 0 12 22c4.211 0 7.813-2.603 9.287-6.288.52-1.3-.477-2.712-1.877-2.712"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgSynchronize);
export default ForwardRef;
