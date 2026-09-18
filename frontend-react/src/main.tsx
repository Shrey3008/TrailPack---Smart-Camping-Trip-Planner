import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/tokens.css';
import './styles/app.css';
import './styles/auth.css';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing its #root element.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
