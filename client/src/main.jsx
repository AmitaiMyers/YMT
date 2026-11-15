import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/heebo';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { ThemeProvider, OnlineProvider } from './ui/index.js';
import './app/pwa.js';
import { App } from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <OnlineProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </OnlineProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
