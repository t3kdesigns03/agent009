import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Screen } from './Screen';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Screen />
  </StrictMode>,
);
