import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
// tokens.css MUST load before styles.css. Both define --muted and --ring,
// with different meanings: styles.css uses --muted as a text colour (87
// uses) and --ring as a box-shadow (14 uses), while the token layer uses
// them as a surface and a colour. Loading tokens last would blank every
// focus ring and wash out every muted label.
import './styles/tokens.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
