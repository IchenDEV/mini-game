import { useCallback, useEffect, useState } from "react";
import { App as StarweaverApp } from "../App";
import { Hub } from "./Hub";
import { PlayView } from "./PlayView";
import { GAMES } from "./games/catalog";
import "./styles.css";

function readRoute(): { name: "hub" | "play" | "legacy"; id: string | null } {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "starweaver") return { name: "legacy", id: null };
  if (hash.startsWith("play/")) {
    const id = decodeURIComponent(hash.slice("play/".length));
    return { name: "play", id };
  }
  return { name: "hub", id: null };
}

export function ArcadeApp() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const navigate = useCallback((hash: string) => {
    window.location.hash = hash;
  }, []);

  if (route.name === "legacy") {
    return <StarweaverApp />;
  }

  const game = route.id ? GAMES.find((g) => g.id === route.id) : undefined;
  if (route.name === "play" && game) {
    return (
      <PlayView
        key={game.id}
        def={game}
        onExit={() => navigate("/")}
      />
    );
  }

  if (route.name === "play" && !game) {
    return (
      <main className="hub">
        <div className="play-panel">
          <h1>机台不见了</h1>
          <p className="play-panel-tagline">这个编号没有对应游戏。</p>
          <button type="button" className="play-panel-start" onClick={() => navigate("/")}>
            返回大厅
          </button>
        </div>
      </main>
    );
  }

  return (
    <Hub
      games={GAMES}
      onPlay={(id) => navigate(`/play/${id}`)}
      onLegacy={() => navigate("/starweaver")}
    />
  );
}
