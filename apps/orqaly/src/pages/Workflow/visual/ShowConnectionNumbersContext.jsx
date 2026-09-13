import { createContext, useContext } from 'react';

const ShowConnectionNumbersContext = createContext({
  showAll: false,
  setShowAll: () => {},
});

export function useShowConnectionNumbers() {
  return useContext(ShowConnectionNumbersContext);
}

export default ShowConnectionNumbersContext;
