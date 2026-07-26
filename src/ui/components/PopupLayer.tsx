/**
 * Generic modal/panel layer (T035) — renders arbitrary content in a card
 * over the persistent hub scene, instead of the old full-page screen swap.
 * The scene underneath stays mounted; only this layer shows/hides.
 */

import type { ReactNode } from 'react'

interface PopupLayerProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export default function PopupLayer({ title, onClose, children }: PopupLayerProps) {
  return (
    <div className="popup-backdrop" onClick={onClose}>
      <div className="popup-card" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h1>{title}</h1>
          <button className="secondary popup-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="popup-body">{children}</div>
      </div>
    </div>
  )
}
