import { useState } from 'react'
import './App.css'
import { useGameStore } from './store/gameStore'
import TitleScreen from './screens/TitleScreen'
import CityScreen from './screens/CityScreen'
import MarketScreen from './screens/MarketScreen'
import TravelScreen from './screens/TravelScreen'

export type Screen = 'city' | 'market' | 'travel'

function App() {
  const game = useGameStore((s) => s.game)
  const [screen, setScreen] = useState<Screen>('city')

  const activeScreen = !game ? 'title' : screen

  return (
    <div className="app-frame">
      <div className="screen-transition" key={activeScreen}>
        {!game ? (
          <TitleScreen />
        ) : screen === 'market' ? (
          <MarketScreen navigate={setScreen} />
        ) : screen === 'travel' ? (
          <TravelScreen navigate={setScreen} />
        ) : (
          <CityScreen navigate={setScreen} />
        )}
      </div>
    </div>
  )
}

export default App
