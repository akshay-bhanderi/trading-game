/**
 * Newspaper screen (T039) — full-screen paper, 2-4 discretionary stories
 * plus any pending resolution stories (always pinned first, per §7's
 * non-negotiable "next day's paper always runs a resolution story"
 * requirement — `generateDailyPaper`, T018, already returns them in that
 * order, this screen just renders array order as-is). Distinct visual
 * styling for 'wire' vs 'gossip' source style, and resolution stories get
 * their own treatment entirely.
 */

import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { isInformantAvailable } from '../../engine/informant'
import InformantModal from './InformantModal'

export default function NewspaperScreen() {
  const game = useGameStore((s) => s.game)
  const refreshNewspaper = useGameStore((s) => s.refreshNewspaper)
  const [showInformant, setShowInformant] = useState(false)

  useEffect(() => {
    refreshNewspaper()
    // Only ever needs to run once per popup-open — `refreshNewspaper`
    // itself is idempotent for the rest of today, see its own doc comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!game) return null

  if (showInformant) {
    return <InformantModal onClose={() => setShowInformant(false)} />
  }

  const stories = game.currentNewspaper

  return (
    <div className="newspaper">
      {isInformantAvailable(game) && (
        <button className="secondary newspaper-informant-btn" onClick={() => setShowInformant(true)}>
          🕵 Visit Informant
        </button>
      )}

      {stories.length === 0 && <p className="muted">No news today.</p>}

      {stories.map((story) => (
        <div
          key={story.id}
          className={
            story.isResolution
              ? 'newspaper-story newspaper-story--resolution'
              : `newspaper-story newspaper-story--${story.sourceStyle}`
          }
        >
          <div className="newspaper-story-source">
            {story.isResolution ? 'RESOLVED' : story.sourceStyle === 'wire' ? 'WIRE REPORT' : 'BAZAAR GOSSIP'}
          </div>
          <div className="newspaper-story-headline">{story.headline}</div>
          <p className="newspaper-story-body">{story.body}</p>
        </div>
      ))}
    </div>
  )
}
