import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { LiveStateProvider } from './LiveState.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LiveStateProvider>
        <App />
      </LiveStateProvider>
    </BrowserRouter>
  </StrictMode>,
);
