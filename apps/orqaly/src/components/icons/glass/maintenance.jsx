import * as React from 'react';
import { forwardRef } from 'react';
const LgMaintenance = ({ title, titleId, ...props }, ref) => (
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
      x1={0.923}
      x2={13.073}
      y1={4.599}
      y2={16.749}
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
      d="M12.06 3.781a6 6 0 0 0-1.909-1.878c-.503-.309-1.152.068-1.152.658v3.311a2 2 0 0 1-2.205 1.989c-1.04-.104-1.793-1.057-1.793-2.103V2.563c0-.59-.649-.968-1.152-.659A6 6 0 0 0 1.94 3.782C.651 5.785.687 8.445 2.051 10.398a6.03 6.03 0 0 0 2.956 2.259L5 20.005a1.995 1.995 0 1 0 3.99 0l.007-7.35a6.03 6.03 0 0 0 2.95-2.257c1.366-1.954 1.402-4.613.113-6.617"
      style={{
        fill: 'url(#a)',
      }}
    />
    <linearGradient
      id="b"
      x1={0.923}
      x2={13.073}
      y1={4.599}
      y2={16.749}
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
      d="M9.765 2.293a.23.23 0 0 1 .125.037 5.5 5.5 0 0 1 1.75 1.723c1.185 1.842 1.144 4.276-.101 6.059a5.54 5.54 0 0 1-2.707 2.072l-.333.118v.353l-.007 7.35c0 .825-.671 1.495-1.495 1.495a1.496 1.496 0 0 1-1.495-1.495l.007-7.348v-.355l-.334-.118a5.54 5.54 0 0 1-2.712-2.074c-1.247-1.782-1.287-4.217-.102-6.058A5.5 5.5 0 0 1 4.11 2.329a.23.23 0 0 1 .124-.036c.129 0 .267.108.267.27v3.196c0 1.332.985 2.474 2.243 2.6q.129.012.256.012a2.5 2.5 0 0 0 2.499-2.499V2.561a.27.27 0 0 1 .266-.268m0-.5a.77.77 0 0 0-.766.768v3.311a2 2 0 0 1-2.205 1.989c-1.04-.104-1.793-1.057-1.793-2.103V2.563a.77.77 0 0 0-.767-.77.74.74 0 0 0-.386.11 6 6 0 0 0-1.909 1.878C.65 5.784.686 8.444 2.05 10.397a6.03 6.03 0 0 0 2.956 2.259L5 20.005a1.995 1.995 0 1 0 3.99 0l.007-7.35a6.03 6.03 0 0 0 2.95-2.257c1.364-1.953 1.401-4.613.111-6.616a6 6 0 0 0-1.909-1.878.7.7 0 0 0-.384-.111"
      style={{
        fill: 'url(#b)',
      }}
    />
    <linearGradient
      id="c"
      x1={12.259}
      x2={23.736}
      y1={6.161}
      y2={17.638}
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
      d="M19.748 12.472 19 12.469V5.423l.253-.524c.144-.299.197-.635.15-.964l-.31-2.171A.89.89 0 0 0 18.211 1h-.422a.89.89 0 0 0-.881.764l-.31 2.171a1.67 1.67 0 0 0 .15.964l.252.524v7.036l-.728-.003a1.26 1.26 0 0 0-1.264 1.257L15 19.143a2.996 2.996 0 0 0 5.992 0L21 13.732a1.26 1.26 0 0 0-1.252-1.26"
      style={{
        fill: 'url(#c)',
      }}
    />
    <linearGradient
      id="d"
      x1={12.259}
      x2={23.736}
      y1={6.161}
      y2={17.638}
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
      d="M18.211 1.5c.193 0 .359.144.386.335l.31 2.171c.033.232-.003.465-.105.676l-.252.524-.05.103v7.658l.498.002.748.004a.76.76 0 0 1 .754.759l-.009 5.412a2.5 2.5 0 0 1-2.496 2.496c-.667 0-1.293-.26-1.765-.731a2.48 2.48 0 0 1-.731-1.764l.008-5.431c0-.418.34-.757.762-.757l.728.003.502.002V5.309l-.05-.103-.253-.524a1.17 1.17 0 0 1-.105-.676l.31-2.171a.395.395 0 0 1 .388-.335zm0-.5h-.422a.89.89 0 0 0-.881.764l-.31 2.171a1.67 1.67 0 0 0 .15.964l.252.524v7.036l-.728-.003h-.006c-.694 0-1.257.562-1.258 1.257L15 19.143a2.996 2.996 0 0 0 5.991 0L21 13.732a1.257 1.257 0 0 0-1.252-1.259L19 12.469V5.423l.253-.524c.144-.299.197-.635.15-.964l-.31-2.171A.89.89 0 0 0 18.211 1"
      style={{
        fill: 'url(#d)',
      }}
    />
    <linearGradient
      id="e"
      x1={14.702}
      x2={21.289}
      y1={13.498}
      y2={20.085}
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
      d="M16.272 12.456a1.26 1.26 0 0 0-1.264 1.257L15 19.143a2.996 2.996 0 0 0 5.992 0L21 13.732a1.257 1.257 0 0 0-1.252-1.259z"
      style={{
        fill: 'url(#e)',
      }}
    />
  </svg>
);
const ForwardRef = forwardRef(LgMaintenance);
export default ForwardRef;
