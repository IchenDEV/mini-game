import type { GameDefinition } from "../kit/types";
import g01 from "./g01-asteroid-corridor";
import g02 from "./g02-neon-stack";
import g03 from "./g03-tunnel-rush";
import g04 from "./g04-helix-drop";
import g05 from "./g05-star-gates";
import g06 from "./g06-brick-nova";
import g07 from "./g07-lightwall-pong";
import g08 from "./g08-snake-field";
import g09 from "./g09-meteor-gunner";
import g10 from "./g10-lane-dash";
import g11 from "./g11-coin-storm";
import g12 from "./g12-slope-marble";
import g13 from "./g13-cloud-hop";
import g14 from "./g14-rocket-lander";
import g15 from "./g15-ring-racer";
import g16 from "./g16-meteor-watch";
import g17 from "./g17-color-gates";
import g18 from "./g18-beam-balance";
import g19 from "./g19-slalom-rush";
import g20 from "./g20-vine-swing";
import g21 from "./g21-hoop-timing";
import g22 from "./g22-archer-range";
import g23 from "./g23-cannon-blitz";
import g24 from "./g24-strike-bowling";
import g25 from "./g25-putt-cave";
import g26 from "./g26-dart-night";
import g27 from "./g27-keepy-ups";
import g28 from "./g28-balloon-pop";
import g29 from "./g29-mole-patrol";
import g30 from "./g30-cube-memory";
import g31 from "./g31-slide-puzzle";
import g32 from "./g32-lights-grid";
import g33 from "./g33-echo-tones";
import g34 from "./g34-beat-taps";
import g35 from "./g35-wire-loop";
import g36 from "./g36-crane-grab";
import g37 from "./g37-crossy-flow";
import g38 from "./g38-ice-push";
import g39 from "./g39-ghost-escape";
import g40 from "./g40-debris-sweeper";
import g41 from "./g41-bounce-ascent";
import g42 from "./g42-magnet-hoard";
import g43 from "./g43-deflect-shield";
import g44 from "./g44-laser-align";
import g45 from "./g45-block-match";
import g46 from "./g46-merge-cubes";
import g47 from "./g47-mine-sweep";
import g48 from "./g48-cup-shuffle";
import g49 from "./g49-pinch-pinball";
import g50 from "./g50-bullet-bloom";

/**
 * The arcade floor: every 3D game cabinet, in order. Add new games here and
 * they appear in the hub automatically.
 */
export const GAMES: GameDefinition[] = [
  g01, g02, g03, g04, g05, g06, g07, g08, g09, g10,
  g11, g12, g13, g14, g15, g16, g17, g18, g19, g20,
  g21, g22, g23, g24, g25, g26, g27, g28, g29, g30,
  g31, g32, g33, g34, g35, g36, g37, g38, g39, g40,
  g41, g42, g43, g44, g45, g46, g47, g48, g49, g50,
];
