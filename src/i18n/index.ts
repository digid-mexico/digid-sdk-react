import { createContext, useContext } from 'react';
import { es, type Strings } from './es';

const I18nContext = createContext<Strings>(es);
export const I18nProvider = I18nContext.Provider;
export const useStrings = () => useContext(I18nContext);
export { es };
