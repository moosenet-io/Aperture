import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Fonts are BUNDLED, never fetched. @fontsource emits the woff2 files into the build output
// and rewrites the @font-face src to a local asset path; no font host is contacted at runtime.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';

import { App } from './App';
import './styles/base.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Aperture: #root container is missing from the app shell');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
