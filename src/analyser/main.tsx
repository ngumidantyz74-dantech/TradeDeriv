import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { AnalyserProvider } from './AnalyserContext';
import { AnalyserApp } from './AnalyserApp';

createRoot(document.getElementById('analyser-root')!).render(
  <StrictMode>
    <AnalyserProvider>
      <AnalyserApp />
    </AnalyserProvider>
  </StrictMode>
);
