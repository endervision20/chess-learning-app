import { formatClock } from "../chessLogic";

interface PlayerBarProps {
  name: string;
  captured: string;
  diff: number;
  clockMs: number;
  timed: boolean;
  active: boolean;
}

export function PlayerBar(props: PlayerBarProps) {
  return (
    <div className={`player-bar ${props.active ? "active" : ""}`}>
      <div className="player-info">
        <span className="player-name">{props.name}</span>
        <span className="captured">
          {props.captured}
          {props.diff > 0 && <span className="adv"> +{props.diff}</span>}
        </span>
      </div>
      {props.timed && (
        <div className={`clock ${props.clockMs < 20000 ? "low" : ""}`}>
          {formatClock(props.clockMs)}
        </div>
      )}
    </div>
  );
}