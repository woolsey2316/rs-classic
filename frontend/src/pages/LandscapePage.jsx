import { Link } from "react-router-dom";
import Landscape3D from "../components/Landscape3D";

export default function LandscapePage() {
  return (
    <main className="landscape-page">
      <header className="landscape-toolbar">
        <div>
          <p className="brand">RS Classic</p>
          <h1>Lumbridge — 3D landscape</h1>
        </div>
        <div className="landscape-help">
          <span>Drag to orbit · wheel to zoom · right-drag to pan</span>
          <Link className="ghost-btn landscape-back" to="/">
            Back to game
          </Link>
        </div>
      </header>
      <Landscape3D />
    </main>
  );
}
