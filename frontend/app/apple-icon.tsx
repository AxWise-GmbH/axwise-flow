import { ImageResponse } from 'next/og'

// Image metadata
export const size = {
  width: 180,
  height: 180,
}
export const contentType = 'image/png'

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      // ImageResponse JSX element
      <div
        style={{
          fontSize: 64,
          background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)', // Purple gradient
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          borderRadius: '32px',
          fontWeight: 'bold',
        }}
      >
        Ax
      </div>
    ),
    // ImageResponse options
    {
      ...size,
    }
  )
}
