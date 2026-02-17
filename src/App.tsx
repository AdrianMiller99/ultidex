import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { LandingPage } from "./pages/LandingPage";
import { PokemonPage } from "./pages/PokemonPage";
import { SearchResolvePage } from "./pages/SearchResolvePage";
import { SearchDetailPage } from "./pages/SearchDetailPage";

export function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/search/:query" element={<SearchResolvePage />} />
          <Route path="/pokemon/:name" element={<PokemonPage />} />
          <Route path="/moves/:name" element={<SearchDetailPage kind="move" />} />
          <Route path="/abilities/:name" element={<SearchDetailPage kind="ability" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
