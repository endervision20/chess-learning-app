import { useEffect, useState } from "react";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import "./App.css";

import { MainMenu } from "./screens/MainMenu";
import { ConfigPage } from "./screens/ConfigPage";
import { Game } from "./screens/Game";
import { Analysis } from "./screens/Analysis";
import { OpeningsGuide, type GuideNav } from "./screens/OpeningsGuide";
import { Flashcards } from "./screens/Flashcards";
import { Repertoires } from "./screens/Repertoires";
import { RepertoireEditor } from "./screens/RepertoireEditor";
import { Practice } from "./screens/Practice";
import { PracticeSetup } from "./screens/PracticeSetup";
import { AllGames } from "./screens/AllGames";
import { Stats } from "./screens/Stats";
import { Review } from "./screens/Review";
import { SettingsPage } from "./screens/SettingsPage";
import { applySettings, loadSettings, saveSettings } from "./settings";
import { loadGame } from "./storage/games";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  DEFAULT_CONFIG,
  TIME_CONTROLS,
  type AnalysisInit,
  type Color,
  type ForcedOpening,
  type GameConfig,
  type PausedGame,
  type ReviewInit,
} from "./types";

type Screen =
  | "menu"
  | "config"
  | "game"
  | "analysis"
  | "guide"
  | "review"
  | "settings"
  | "flashcards"
  | "practice"
  | "practicesetup"
  | "allgames"
  | "allpractice"
  | "stats"
  | "repertoires"
  | "repertoire";

function AppBody() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [settings, setSettings] = useState(loadSettings);
  const [config, setConfig] = useState<GameConfig>(() => ({
    ...DEFAULT_CONFIG,
    colorChoice: settings.defaultColor,
    elo: settings.defaultElo,
    timeControl:
      TIME_CONTROLS.find((t) => t.label === settings.defaultTimeControl) ?? DEFAULT_CONFIG.timeControl,
    showEval: settings.defaultShowEval,
    helped: settings.defaultHelped,
  }));
  const [playerColor, setPlayerColor] = useState<Color>("white");
  const [gameId, setGameId] = useState(0);
  const [analysisInit, setAnalysisInit] = useState<AnalysisInit | undefined>();
  const [analysisId, setAnalysisId] = useState(0);
  const [analysisFrom, setAnalysisFrom] = useState<Screen>("menu");
  const [reviewInit, setReviewInit] = useState<ReviewInit | undefined>();
  const [reviewId, setReviewId] = useState(0);
  const [reviewFrom, setReviewFrom] = useState<Screen>("menu");
  const [resume, setResume] = useState<PausedGame | undefined>();
  const [guideNav, setGuideNav] = useState<GuideNav>({ selected: null, section: null });
  const [repId, setRepId] = useState<string | null>(null);

  useEffect(() => {
    applySettings(settings);
    saveSettings(settings);
  }, [settings]);

  // Where "Back" goes after a game has been left
  const afterGame = (): Screen => (config.practice ? "practice" : "menu");
  // A game screen can't be returned to once it is closed
  const returnPoint = (from: Screen): Screen => (from === "game" ? afterGame() : from);

  const startGame = (cfg: GameConfig) => {
    setResume(undefined);
    setConfig(cfg);
    setPlayerColor(
      cfg.colorChoice === "random"
        ? Math.random() < 0.5 ? "white" : "black"
        : cfg.colorChoice
    );
    setGameId((n) => n + 1); // a new key gives a fresh Game
    setScreen("game");
  };
  // Pick a paused game back up (it is removed from the list once it ends or is paused again)
  const resumeGame = (paused: PausedGame) => {
    setResume(paused);
    setConfig(paused.config);
    setPlayerColor(paused.playerColor);
    setGameId((n) => n + 1);
    setScreen("game");
  };

  // Analysis and Review remember where they were opened from, and Back goes there
  const openAnalysis = (init?: AnalysisInit) => {
    setAnalysisFrom(returnPoint(screen));
    setAnalysisInit(init);
    setAnalysisId((n) => n + 1);
    setScreen("analysis");
  };

  const openReview = (init: ReviewInit) => {
    setReviewFrom(returnPoint(screen));
    setReviewInit(init);
    setReviewId((n) => n + 1);
    setScreen("review");
  };

  const openSaved = async (fileName: string) => {
    try {
      const game = await loadGame(fileName);
      openAnalysis({ moves: game.moves, game, fileName });
    } catch (e) {
      console.error("Couldn't open game:", e);
    }
  };

  const reviewSaved = async (fileName: string) => {
    try {
      const game = await loadGame(fileName);
      openReview({ game, fileName });
    } catch (e) {
      console.error("Couldn't open game for review:", e);
    }
  };

  // Game setup for a normal game (forget any practice position from before)
  const openConfig = () => {
    setConfig((c) => ({ ...c, startFen: undefined, practice: undefined }));
    setScreen("config");
  };

  // From the guide: go to game setup with this line already chosen
  const practiseOpening = (opening: ForcedOpening, side?: Color) => {
    setConfig((c) => ({
      ...c,
      opening,
      colorChoice: side ?? c.colorChoice,
      startFen: undefined,
      practice: undefined,
    }));
    setScreen("config");
  };

  if (screen === "config") {
    return (
      <ConfigPage
        initial={config}
        onBack={() => setScreen("menu")}
        onStart={startGame}
      />
    );
  }

  if (screen === "game") {
    return (
      <Game
        key={gameId}
        config={config}
        playerColor={playerColor}
        resume={resume}
        maxPaused={settings.maxPaused}
        onHome={() => setScreen(afterGame())}
        onChangeSettings={() => (config.practice ? setScreen("practicesetup") : openConfig())}
        onRematch={() => startGame(config)}
        onAnalyse={openAnalysis}
        onReview={openReview}
      />
    );
  }

  if (screen === "analysis") {
    return (
      <Analysis
        key={analysisId}
        initial={analysisInit}
        onHome={() => setScreen(analysisFrom)}
      />
    );
  }

  if (screen === "review" && reviewInit) {
    return (
      <Review
        key={reviewId}
        init={reviewInit}
        onHome={() => setScreen(reviewFrom)}
        onAnalyse={openAnalysis}
      />
    );
  }

  if (screen === "guide") {
    return (
      <OpeningsGuide
        nav={guideNav}
        onNav={setGuideNav}
        onHome={() => setScreen("menu")}
        onPractise={practiseOpening}
        onAnalyse={openAnalysis}
      />
    );
  }

  if (screen === "repertoires") {
    return (
      <Repertoires
        onBack={() => setScreen("menu")}
        onOpen={(id) => {
          setRepId(id);
          setScreen("repertoire");
        }}
      />
    );
  }

  if (screen === "repertoire" && repId) {
    return (
      <RepertoireEditor
        key={repId}
        id={repId}
        onBack={() => setScreen("repertoires")}
        onOpen={setRepId}
        onPractise={practiseOpening}
      />
    );
  }

  if (screen === "flashcards") {
    return <Flashcards onHome={() => setScreen("menu")} />;
  }

  if (screen === "practice") {
    return (
      <Practice
        onHome={() => setScreen("menu")}
        onPlay={() => setScreen("practicesetup")}
        onOpenGame={openSaved}
        onReviewGame={reviewSaved}
        onViewAll={() => setScreen("allpractice")}
      />
    );
  }

  if (screen === "practicesetup") {
    return <PracticeSetup onBack={() => setScreen("practice")} onStart={startGame} />;
  }

  if (screen === "allgames") {
    return (
      <AllGames
        onBack={() => setScreen("menu")}
        onOpenGame={openSaved}
        onReviewGame={reviewSaved}
      />
    );
  }

  if (screen === "allpractice") {
    return (
      <AllGames
        practice
        onBack={() => setScreen("practice")}
        onOpenGame={openSaved}
        onReviewGame={reviewSaved}
      />
    );
  }

  if (screen === "stats") {
    return <Stats onHome={() => setScreen("menu")} />;
  }

  if (screen === "settings") {
    return (
      <SettingsPage
        settings={settings}
        onChange={setSettings}
        onBack={() => setScreen("menu")}
      />
    );
  }

  return (
    <MainMenu
      onPlay={openConfig}
      onAnalysis={() => openAnalysis()}
      onGuide={() => setScreen("guide")}
      onFlashcards={() => setScreen("flashcards")}
      onRepertoires={() => setScreen("repertoires")}
      onPractice={() => setScreen("practice")}
      onSettings={() => setScreen("settings")}
      onStats={() => setScreen("stats")}
      onOpenGame={openSaved}
      onReviewGame={reviewSaved}
      onResume={resumeGame}
      onViewAllGames={() => setScreen("allgames")}
    />
  );
}
export default function App() {
  const [attempt, setAttempt] = useState(0);
  return (
    <ErrorBoundary onReset={() => setAttempt((n) => n + 1)}>
      <AppBody key={attempt} />
    </ErrorBoundary>
  );
}
