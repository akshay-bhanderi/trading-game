/**
 * Reusable PixiJS <canvas> mount point (T069). Owns the Application
 * lifecycle only — scene contents are built by whatever `onReady` callback
 * the caller supplies, keeping this component scene-agnostic and reusable
 * beyond the hub (e.g. Warehouse's building elevation later).
 */

import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'

interface PixiStageProps {
  width: number
  height: number
  /** Called once the Application has initialized. Return an optional
   * cleanup function to tear down whatever scene objects were created. */
  onReady: (app: Application) => void | (() => void)
  className?: string
}

export default function PixiStage({ width, height, onReady, className }: PixiStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let cleanupScene: (() => void) | void
    const app = new Application()

    app
      .init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      })
      .then(() => {
        if (cancelled) {
          app.destroy(true, { children: true })
          return
        }
        app.canvas.style.imageRendering = 'pixelated'
        app.canvas.style.width = '100%'
        app.canvas.style.height = '100%'
        app.canvas.style.display = 'block'
        container.appendChild(app.canvas)
        cleanupScene = onReadyRef.current(app)
      })

    return () => {
      cancelled = true
      cleanupScene?.()
      if (app.renderer) {
        app.destroy(true, { children: true })
      }
    }
    // Mount once — width/height are the fixed 360x740 design frame and
    // never change after first mount in this app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}
