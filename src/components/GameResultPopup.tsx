import type { GameResult } from "../types";

interface GameResultPopupProps {
  result: GameResult;
  reason: string;
  onRematch: () => void;
  onChangeSettings: () => void;
  onReview: () => void;
  onAnalyse: () => void;
  onHome: () => void;
  onClose: () => void;
}

// "timeout" reads better as "on time"
const byReason = (reason: string) => (reason === "timeout" ? "on time" : `by ${reason}`);

/** Shown over the board when the game ends. */
export function GameResultPopup({
  result,
  reason,
  onRematch,
  onChangeSettings,
  onReview,
  onAnalyse,
  onHome,
  onClose,
}: GameResultPopupProps) {
  const title = result === "win" ? "You win!" : result === "loss" ? "You lose" : "Draw";
  return (
    <div className="result-overlay">
      <div className={`result-card ${result}`}>
        <div className="result-card-title">{title}</div>
        <div className="result-card-reason">
          {result === "draw" ? `Draw ${byReason(reason)}` : `${title.replace("!", "")} ${byReason(reason)}`}
        </div>
        <div className="result-card-buttons">
          <button className="primary" onClick={onRematch}>Rematch</button>
          <button onClick={onChangeSettings}>Change settings</button>
          <button onClick={onReview}>Game review</button>
          <button onClick={onAnalyse}>Analyse</button>
          <button onClick={onHome}>Home</button>
        </div>
        <button className="result-card-close" onClick={onClose}>
          Close and look at the board
        </button>
      </div>
    </div>
  );
}