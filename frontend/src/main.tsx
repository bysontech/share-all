import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AdminLoginPage from './pages/AdminLoginPage';
import RoomPage from './pages/RoomPage';
import AdminPage from './pages/AdminPage';
import SlideshowPage from './pages/SlideshowPage';
import GalleryPage from './pages/GalleryPage';
import PhotosPage from './pages/PhotosPage';
import VideosPage from './pages/VideosPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/room/:roomId/slideshow" element={<SlideshowPage />} />
        <Route path="/room/:roomId/gallery" element={<GalleryPage />} />
        <Route path="/room/:roomId/photos" element={<PhotosPage />} />
        <Route path="/room/:roomId/videos" element={<VideosPage />} />
        <Route path="/admin/:roomId" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
