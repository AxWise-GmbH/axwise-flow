import * as React from 'react';
import { forwardRef } from 'react';
const LgGoogleLogo = ({ title, titleId, ...props }, ref) => (
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
      x1={4.808}
      x2={18.939}
      y1={5.056}
      y2={19.187}
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
      d="m21.805 10.042-.01-.042H14a2 2 0 1 0 0 4h3.651a6 6 0 0 1-2.067 2.799A5.95 5.95 0 0 1 12 18a6 6 0 0 1-5.647-3.989A5.95 5.95 0 0 1 6.458 9.7 6 6 0 0 1 12 6c1 0 1.941.247 2.769.681.79.414 1.75.301 2.381-.33.945-.945.72-2.545-.459-3.176A9.9 9.9 0 0 0 12 2a10 10 0 0 0-8.843 5.337 9.95 9.95 0 0 0-.053 9.217C4.762 19.784 8.119 22 12 22a9.95 9.95 0 0 0 6.695-2.587 9.96 9.96 0 0 0 3.11-9.371"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={4.808}
      x2={18.939}
      y1={5.056}
      y2={19.187}
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
      d="M12 2.5c1.551 0 3.092.386 4.454 1.115.417.223.696.622.766 1.093.071.478-.084.948-.425 1.288a1.47 1.47 0 0 1-1.045.428 1.6 1.6 0 0 1-.75-.187 6.5 6.5 0 0 0-3-.737 6.48 6.48 0 0 0-6.003 4.009 6.45 6.45 0 0 0-.115 4.67A6.51 6.51 0 0 0 12 18.5c1.407 0 2.75-.45 3.884-1.301a6.5 6.5 0 0 0 2.238-3.032l.236-.667H14c-.827 0-1.5-.673-1.5-1.5s.673-1.5 1.5-1.5h7.38c.08.501.12 1.004.12 1.5a9.52 9.52 0 0 1-3.14 7.042 9.475 9.475 0 0 1-14.811-2.717A9.4 9.4 0 0 1 2.5 12c0-1.559.37-3.049 1.099-4.43A9.49 9.49 0 0 1 12 2.5m0-.5a10 10 0 0 0-8.843 5.337 9.95 9.95 0 0 0-.053 9.217C4.762 19.784 8.119 22 12 22a9.95 9.95 0 0 0 6.695-2.587 9.96 9.96 0 0 0 3.11-9.371l-.01-.042H14a2 2 0 1 0 0 4h3.651a6 6 0 0 1-2.067 2.799A5.95 5.95 0 0 1 12 18a6 6 0 0 1-5.647-3.989A5.95 5.95 0 0 1 6.458 9.7 6 6 0 0 1 12 6c1 0 1.941.247 2.769.681.311.163.649.244.982.244.513 0 1.016-.192 1.399-.575.945-.945.72-2.545-.459-3.176A9.9 9.9 0 0 0 12 2"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={1.074}
      x2={6.009}
      y1={9.42}
      y2={14.355}
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
      d="M6 12c0-.815.164-1.591.458-2.3L3.157 7.337a9.95 9.95 0 0 0-.053 9.217l3.248-2.542A6 6 0 0 1 6 12"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={14.231}
      x2={21.708}
      y1={8.941}
      y2={16.418}
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
      d="M22 12c0-.671-.069-1.325-.195-1.958l-.01-.042H14a2 2 0 1 0 0 4h3.651a6 6 0 0 1-2.067 2.799l3.111 2.614A9.96 9.96 0 0 0 22 12"
      style={{
        fill: 'url(#d)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgGoogleLogo);
export default ForwardRef;
