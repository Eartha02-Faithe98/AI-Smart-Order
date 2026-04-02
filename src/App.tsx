import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import SessionOwner from './pages/SessionOwner';
import SessionParticipant from './pages/SessionParticipant';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session/:id/owner/:ownerId" element={<SessionOwner />} />
        <Route path="/session/:id" element={<SessionParticipant />} />
      </Routes>
    </BrowserRouter>
  );
}
