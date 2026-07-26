# /src/ui

React components only. Renders `/src/engine` state and dispatches actions
into the engine (via the Zustand store, see `/src/ui/store`) — never
duplicates game logic that belongs in `/src/engine`.
