import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { crewStore } from './store';
import { setupNotifications } from '../services/notifications';

const CrewContext = createContext(crewStore);

export function CrewProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void setupNotifications();
    void crewStore.hydrate();
  }, []);

  return <CrewContext.Provider value={crewStore}>{children}</CrewContext.Provider>;
}

export function useCrew() {
  const store = useContext(CrewContext);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { store, state };
}

export { crewStore };
