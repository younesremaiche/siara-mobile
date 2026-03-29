import { createContext, useContext } from 'react';

export const AdminDrawerContext = createContext(null);

export function useAdminDrawer() {
  return useContext(AdminDrawerContext);
}
