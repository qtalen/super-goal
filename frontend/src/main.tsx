import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { GameProvider } from './context/GameContext';
import './styles/global.scss';
import './styles/Board.scss';
import './styles/ControlPanel.scss';
import './styles/GameStatus.scss';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found in the DOM');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </React.StrictMode>,
);
