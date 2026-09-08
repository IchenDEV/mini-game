import { loadBest } from "./kit/storage";
import type { GameDefinition } from "./kit/types";

function formatBest(best: number): string {
  return best > 0 ? `最高 ${best.toLocaleString("zh-CN")}` : "暂无纪录";
}

interface HubProps {
  games: GameDefinition[];
  onPlay: (id: string) => void;
  onLegacy: () => void;
}

export function Hub({ games, onPlay, onLegacy }: HubProps) {
  const categories = ["全部", ...new Set(games.map((g) => g.category))];
  // Simple category filter via data attribute + CSS is overkill; render all
  // sections by category so the grid reads like a hall of cabinets.
  const byCategory = new Map<string, GameDefinition[]>();
  for (const game of games) {
    const list = byCategory.get(game.category) ?? [];
    list.push(game);
    byCategory.set(game.category, list);
  }

  return (
    <main className="hub">
      <header className="hub-header">
        <p className="hub-eyebrow">ARCADE 3D · 50 款小游戏</p>
        <h1 className="hub-title">星港街机</h1>
        <p className="hub-sub">
          50 款同一水准的 3D 街机小游戏：键盘、鼠标、触屏皆可游玩，最高分保存在本机。
        </p>
        <nav className="hub-cats" aria-label="分类导航">
          {categories.map((cat) => (
            <a key={cat} href={`#${catAnchor(cat)}`} className="hub-cat-chip">
              {cat}
            </a>
          ))}
        </nav>
      </header>

      <section className="hub-section" aria-labelledby="six-hearts-title">
        <a className="hub-card hub-adventure" href={`${import.meta.env.BASE_URL}games/brasshaven/`}>
          <span className="hub-card-no">探索冒险 · 六座机械之城</span>
          <strong className="hub-card-name" id="six-hearts-title">六城之心</strong>
          <span className="hub-card-tagline">穿过晨光、蒸汽与云海，找回动力组件，乘飞艇唤醒六座城市。</span>
          <span className="hub-card-meta"><span>等距 3D · 原创音乐 · 自动存档</span><span>启程 →</span></span>
        </a>
      </section>

      {[...byCategory.entries()].map(([category, list]) => (
        <section key={category} className="hub-section" id={catAnchor(category)}>
          <h2 className="hub-section-title">
            {category}
            <span>{list.length} 款</span>
          </h2>
          <div className="hub-grid">
            {list.map((game) => {
              const best = loadBest(game.id);
              return (
                <button
                  key={game.id}
                  type="button"
                  className="hub-card"
                  style={{ ["--accent" as string]: game.accent }}
                  onClick={() => onPlay(game.id)}
                >
                  <span className="hub-card-no">{String(game.no).padStart(2, "0")}</span>
                  <strong className="hub-card-name">{game.name}</strong>
                  <span className="hub-card-tagline">{game.tagline}</span>
                  <span className="hub-card-controls">{game.controls}</span>
                  <span className="hub-card-meta">
                    <span>{formatBest(best)}</span>
                    <span>开始 →</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <footer className="hub-footer">
        <button type="button" className="hub-legacy-link" onClick={onLegacy}>
          街机创始作 · 星轨织者 →
        </button>
      </footer>
    </main>
  );
}

function catAnchor(category: string): string {
  return `cat-${encodeURIComponent(category)}`;
}

export { catAnchor };
