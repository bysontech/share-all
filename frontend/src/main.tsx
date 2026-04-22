import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';
import AdminPage from './pages/AdminPage';
import SlideshowPage from './pages/SlideshowPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/room/:roomId/slideshow" element={<SlideshowPage />} />
        <Route path="/admin/:roomId" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
