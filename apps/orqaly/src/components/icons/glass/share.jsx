import * as React from 'react';
import { forwardRef } from 'react';
const LgShare = ({ title, titleId, ...props }, ref) => (
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
      x1={6.922}
      x2={22.078}
      y1={4.422}
      y2={19.578}
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
      d="M18 14a3.97 3.97 0 0 0-2.728 1.089l-6.29-2.903C8.984 12.123 9 12.064 9 12s-.016-.123-.019-.186l6.29-2.903A3.98 3.98 0 0 0 18 10a4 4 0 1 0-4-4c0 .064.016.123.019.186l-6.29 2.903A3.98 3.98 0 0 0 5 8a4 4 0 0 0 0 8 3.97 3.97 0 0 0 2.728-1.089l6.29 2.903c-.002.063-.018.122-.018.186a4 4 0 1 0 4-4m-3.221-5.647-.008-.009zM8.228 9.656l-.008-.009zm0 4.688-.008.01zm6.551 1.303-.008.009z"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient id="b" x1={1} x2={22} y1={12} y2={12} gradientUnits="userSpaceOnUse">
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
      d="M18 2.5c1.93 0 3.5 1.57 3.5 3.5S19.93 9.5 18 9.5c-.883 0-1.73-.339-2.386-.954l-.246-.23-.306.141-6.29 2.903-.306.141.016.336q.003.066.014.13v.064a2 2 0 0 0-.014.13l-.016.336.306.141 6.29 2.903.306.141.246-.23A3.5 3.5 0 0 1 18 14.5c1.93 0 3.5 1.57 3.5 3.5s-1.57 3.5-3.5 3.5-3.5-1.57-3.495-3.532q.01-.064.014-.13l.016-.336-.306-.141-6.29-2.903-.306-.141-.246.23A3.5 3.5 0 0 1 5 15.5c-1.93 0-3.5-1.57-3.5-3.5S3.07 8.5 5 8.5c.883 0 1.73.339 2.386.954l.246.23.306-.141 6.29-2.903.306-.141-.016-.336A2 2 0 0 0 14.5 6c0-1.93 1.57-3.5 3.5-3.5M8.6 14.678l.021-.024.015-.021-.786-.616-.021.025-.015.021zm6.55 1.305.022-.025.016-.022-.788-.615-.02.023-.014.02zM18 2a4 4 0 0 0-4 4c0 .064.016.123.019.186l-6.29 2.903A3.98 3.98 0 0 0 5 8a4 4 0 0 0 0 8 3.97 3.97 0 0 0 2.728-1.089l6.29 2.903c-.002.063-.018.122-.018.186a4 4 0 1 0 4-4 3.97 3.97 0 0 0-2.728 1.089l-6.29-2.903C8.984 12.123 9 12.064 9 12s-.016-.123-.019-.185l6.29-2.903A3.98 3.98 0 0 0 18 10a4 4 0 0 0 0-8m-3.221 6.353-.008-.009zM8.224 9.652l-.004-.005zl.004.005zm.004 4.692-.004.005-.004.005.004-.005zm6.551 1.303-.008.009z"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={2.172}
      x2={7.828}
      y1={9.172}
      y2={14.828}
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
      d="M5 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={15.172}
      x2={20.828}
      y1={3.172}
      y2={8.828}
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
      d="M18 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={15.172}
      x2={20.828}
      y1={15.172}
      y2={20.828}
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
      d="M18 14a4 4 0 1 0 0 8 4 4 0 0 0 0-8"
      style={{
        fill: 'url(#e)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgShare);
export default ForwardRef;
