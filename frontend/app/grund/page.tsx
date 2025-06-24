'use client'

import { useEffect } from 'react'

export default function GrundPage() {
  useEffect(() => {
    // Redirect to the static HTML file
    window.location.href = '/grund/index.html'
  }, [])

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1>AxWise Gründungsexistenz</h1>
        <p>Weiterleitung zum Businessplan...</p>
      </div>
    </div>
  )
}
