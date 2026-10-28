import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './design/mw.css';
import './design/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
