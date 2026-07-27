import { useRegisterSW } from 'virtual:pwa-register/react'

/** Surfaces a reload prompt once a new service-worker build has been
 * fetched and is waiting to activate — so a deployed update actually
 * reaches players instead of sitting cached until they clear storage. */
export default function UpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Service workers only re-check on navigation/page load by default;
      // an open tab left running for hours would otherwise never notice
      // a new deploy until the player manually reloads.
      setInterval(() => registration.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="update-toast">
      <span>A new version is available.</span>
      <button onClick={() => updateServiceWorker(true)}>Reload</button>
    </div>
  )
}
