"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type JudgeStage = "idle" | "capturing" | "judging" | "pass" | "fail" | "error";

type JudgeState = {
  stage: JudgeStage;
  message?: string;
  score?: number;
};

type JudgeApiResponse = {
  status: "ok" | "error";
  verdict: "pass" | "fail";
  explanation?: string;
  confidence?: number;
  score?: number;
};

type EmojiPrompt = {
  id: string;
  symbol: string;
  name: string;
  description: string;
};

const EMOJI_PROMPTS: EmojiPrompt[] = [
  { id: "grinning", symbol: "😀", name: "Grinning Face", description: "Broad open smile showing upper teeth." },
  { id: "beaming", symbol: "😁", name: "Beaming Face", description: "Smiling eyes with a big toothy grin." },
  { id: "joy-tears", symbol: "😂", name: "Tears of Joy", description: "Laughing so hard that happy tears stream down." },
  { id: "smiling-eyes", symbol: "😃", name: "Smiling Face", description: "Open mouth grin with eager, excited eyes." },
  { id: "smile-open", symbol: "😄", name: "Smiling With Eyes", description: "Joyful grin with smiling eyes and rosy cheeks." },
  { id: "devilish", symbol: "😈", name: "Smiling Devil", description: "Mischievous grin with raised brows and horns." },
  { id: "warm-smile", symbol: "😊", name: "Smiling with Blush", description: "Closed mouth smile with soft, happy eyes." },
  { id: "relieved", symbol: "😌", name: "Relieved Face", description: "Contented smile with relaxed eyelids." },
  { id: "heart-eyes", symbol: "😍", name: "Heart Eyes", description: "Eyes replaced by hearts in total adoration." },
  { id: "unamused", symbol: "😒", name: "Unamused Face", description: "Flat-lidded stare and slight frown." },
  { id: "sleepy-sweat", symbol: "😓", name: "Downcast Sweat", description: "Sad eyes looking down with a sweat drop." },
  { id: "pensive", symbol: "😔", name: "Pensive Face", description: "Closed eyes, small frown, reflecting quietly." },
  { id: "confounded", symbol: "😖", name: "Confounded Face", description: "Scrunched eyes and mouth in discomfort." },
  { id: "kiss", symbol: "😘", name: "Face Blowing Kiss", description: "Winking face puckering lips with a heart." },
  { id: "closed-kiss", symbol: "😚", name: "Kissing Eyes Closed", description: "Closed smiling eyes with puckered lips." },
  { id: "zany", symbol: "🤪", name: "Zany Face", description: "Tilted head, one wide eye, and tongue out." },
  { id: "wacky", symbol: "😜", name: "Winking Tongue", description: "Wink and tongue-out playful expression." },
  { id: "squint-tongue", symbol: "😝", name: "Squinting Tongue", description: "Eyes shut tight with tongue out in silliness." },
  { id: "disappointed", symbol: "😞", name: "Disappointed Face", description: "Downturned eyes and mouth in quiet sadness." },
  { id: "pout", symbol: "😡", name: "Angry Pout", description: "Red face with knit brows and tight mouth." },
  { id: "crying", symbol: "😢", name: "Crying Face", description: "Single large tear with saddened mouth." },
  { id: "persevering", symbol: "😣", name: "Persevering Face", description: "Eyes clenched with determination or discomfort." },
  { id: "sad-sweat", symbol: "😥", name: "Sad but Relieved", description: "Tearful eyes with a single sweat drop." },
  { id: "fear", symbol: "😨", name: "Fearful Face", description: "Wide eyes and open mouth filled with dread." },
  { id: "sleepy", symbol: "😪", name: "Sleepy Face", description: "Closed eyes with bubble from the nose." },
  { id: "sob", symbol: "😭", name: "Loudly Crying", description: "Streams of tears and wailing mouth." },
  { id: "anxious", symbol: "😰", name: "Anxious Face", description: "Wide eyes and blue forehead with a bead of sweat." },
  { id: "astonished", symbol: "😲", name: "Astonished Face", description: "Round eyes and mouth in stunned surprise." },
  { id: "flushed", symbol: "😳", name: "Flushed Face", description: "Wide eyes and cheeks turning pink." },
  { id: "mask", symbol: "😷", name: "Face With Mask", description: "Eyes calm while wearing a medical mask." },
  { id: "upside", symbol: "🙃", name: "Upside-Down", description: "Upside smile conveying silliness or sarcasm." },
  { id: "yum", symbol: "😋", name: "Yum Face", description: "Tongue licking lips in delicious delight." },
  { id: "nerd", symbol: "🤓", name: "Nerd Face", description: "Big toothy grin behind thick glasses." },
  { id: "cool", symbol: "😎", name: "Cool Shades", description: "Relaxed smile behind sunglasses." },
  { id: "hug", symbol: "🤗", name: "Hugging Face", description: "Smiling face with open hands ready for a hug." },
  { id: "eye-roll", symbol: "🙄", name: "Eye Roll", description: "Eyes glancing up in exaggerated annoyance." },
  { id: "thinking", symbol: "🤔", name: "Thinking Face", description: "Hand on chin pondering the prompt." },
  { id: "zipper", symbol: "🤐", name: "Zipper Mouth", description: "Mouth zipped shut to keep quiet." },
  { id: "party", symbol: "🥳", name: "Party Face", description: "Party hat, confetti, and horn in celebration." },
  { id: "mind-blown", symbol: "🤯", name: "Mind Blown", description: "Shocked face with exploding top of head." },
  { id: "pleading", symbol: "🥺", name: "Pleading Eyes", description: "Big watery eyes begging sweetly." },
  { id: "cowboy", symbol: "🤠", name: "Cowboy", description: "Wide grin beneath a cowboy hat." },
  { id: "sick", symbol: "🤒", name: "Face With Thermometer", description: "Weary eyes while holding a thermometer." },
  { id: "mask-sneeze", symbol: "🤧", name: "Sneezing Face", description: "Squinting eyes with tissue over nose." },
  { id: "nauseated", symbol: "🤢", name: "Nauseated Face", description: "Green face about to feel ill." },
  { id: "woozy", symbol: "🥴", name: "Woozy Face", description: "Uneven eyes and wavy mouth in dizziness." },
  { id: "rofl", symbol: "🤣", name: "Rolling on Floor Laughing", description: "Tipped over laughing with tears flying." },
  { id: "shh", symbol: "🤫", name: "Shushing Face", description: "Finger over lips asking for quiet." },
  { id: "money-mouth", symbol: "🤑", name: "Money Mouth", description: "Dollar-sign eyes and tongue full of cash." },
  { id: "sly", symbol: "😼", name: "Grinning Cat", description: "Cat grin with playful slanted eyes." },
  { id: "demon", symbol: "👿", name: "Angry Devil", description: "Purple horns with furious scowl." },
];

const CAPTURE_RETRY_DELAY = 1_200;
const CAMERA_INITIAL_DELAY = 800;
const MAX_CAPTURE_WIDTH = 640;
const MAX_CAPTURE_HEIGHT = 480;
const CAPTURE_IMAGE_QUALITY = 0.85;

export default function HomePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureTimeoutRef = useRef<number | null>(null);
  const captureLoopRef = useRef<() => Promise<void>>();
  const judgeInFlightRef = useRef(false);
  const celebrationActiveRef = useRef(false);
  const cameraEnabledRef = useRef(true);
  const autoCaptureRef = useRef(true);

  const [currentEmojiIndex, setCurrentEmojiIndex] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [judgeState, setJudgeState] = useState<JudgeState>({ stage: "idle" });
  const [lastScore, setLastScore] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [autoCapture, setAutoCapture] = useState(true);

  const currentEmoji = EMOJI_PROMPTS[currentEmojiIndex];
  const nextEmoji = useMemo(
    () => EMOJI_PROMPTS[(currentEmojiIndex + 1) % EMOJI_PROMPTS.length],
    [currentEmojiIndex],
  );

  const clearScheduledCapture = useCallback(() => {
    if (captureTimeoutRef.current !== null) {
      window.clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
  }, []);

  const scheduleCapture = useCallback(
    (delay: number) => {
      if (!cameraEnabled || !autoCaptureRef.current || celebrationActiveRef.current) {
        return;
      }

      clearScheduledCapture();
      captureTimeoutRef.current = window.setTimeout(() => {
        captureTimeoutRef.current = null;
        void captureLoopRef.current?.();
      }, delay);
    },
    [cameraEnabled, clearScheduledCapture],
  );

  const captureFrame = useCallback(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;

    if (!videoElement || !canvasElement) {
      return null;
    }

    const { videoWidth, videoHeight } = videoElement;
    const context = canvasElement.getContext("2d");

    if (!context || videoWidth === 0 || videoHeight === 0) {
      return null;
    }

    const aspectRatio = videoWidth / videoHeight;
    let targetWidth = videoWidth;
    let targetHeight = videoHeight;

    if (videoWidth > MAX_CAPTURE_WIDTH) {
      targetWidth = MAX_CAPTURE_WIDTH;
      targetHeight = Math.round(MAX_CAPTURE_WIDTH / aspectRatio);
    }

    if (targetHeight > MAX_CAPTURE_HEIGHT) {
      targetHeight = MAX_CAPTURE_HEIGHT;
      targetWidth = Math.round(MAX_CAPTURE_HEIGHT * aspectRatio);
    }

    canvasElement.width = targetWidth;
    canvasElement.height = targetHeight;
    context.drawImage(videoElement, 0, 0, targetWidth, targetHeight);

    return canvasElement.toDataURL("image/jpeg", CAPTURE_IMAGE_QUALITY);
  }, []);

  const callJudge = useCallback(async (image: string, emoji: EmojiPrompt, roundId: string): Promise<JudgeApiResponse> => {
    const response = await fetch("/api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roundId,
        emoji: emoji.symbol,
        description: `${emoji.name}: ${emoji.description}`,
        image,
      }),
    });

    const result = (await response.json()) as Partial<JudgeApiResponse> & { status?: string };

    const status = result.status === "error" ? "error" : "ok";
    const verdict = result.verdict === "pass" ? "pass" : "fail";
    const score =
      typeof result.score === "number"
        ? result.score
        : typeof result.confidence === "number"
          ? result.confidence
          : undefined;

    return {
      status,
      verdict,
      explanation: result.explanation,
      confidence: score,
      score,
    };
  }, []);

  const captureAndJudge = useCallback(async () => {
    if (!cameraEnabledRef.current || celebrationActiveRef.current || judgeInFlightRef.current) {
      return;
    }

    setJudgeState((prev) => {
      if (prev.stage === "judging" || prev.stage === "pass") {
        return prev;
      }
      return { stage: "capturing", message: prev.message };
    });

    const snapshot = captureFrame();

    if (!snapshot) {
      scheduleCapture(450);
      return;
    }

    const roundId = crypto.randomUUID();
    setCapturedImage(snapshot);
      setJudgeState((prev) => ({ stage: "judging", message: prev.message }));
    judgeInFlightRef.current = true;

    try {
      const result = await callJudge(snapshot, currentEmoji, roundId);
      if (!cameraEnabledRef.current) {
        return;
      }
      const message = result.explanation || (result.verdict === "pass" ? "Judge approved the impression!" : "Judge wants another attempt.");
      const score = result.score ?? result.confidence;

      if (typeof score === "number") {
        setLastScore(score);
      }

      if (result.status === "ok" && result.verdict === "pass") {
        setJudgeState({ stage: "pass", message, score });
        celebrationActiveRef.current = true;
        setShowCelebration(true);
        clearScheduledCapture();
      } else {
        const stage = result.status === "error" ? "error" : "fail";
        setJudgeState({ stage, message, score });
        scheduleCapture(stage === "error" ? CAPTURE_RETRY_DELAY * 1.5 : CAPTURE_RETRY_DELAY);
      }
    } catch (error) {
      console.error("Judge request failed", error);
      if (cameraEnabledRef.current) {
        setJudgeState({ stage: "error", message: "Gemini judge unreachable. Retrying..." });
        scheduleCapture(CAPTURE_RETRY_DELAY * 1.5);
      }
    } finally {
      judgeInFlightRef.current = false;
    }
  }, [callJudge, captureFrame, clearScheduledCapture, currentEmoji, scheduleCapture]);

  useEffect(() => {
    celebrationActiveRef.current = showCelebration;
  }, [showCelebration]);

  useEffect(() => {
    captureLoopRef.current = captureAndJudge;
  }, [captureAndJudge]);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      scheduleCapture(CAMERA_INITIAL_DELAY);
    } catch (error) {
      console.error("Could not start camera", error);
      setCameraError("Unable to access camera. Please check permissions.");
      setJudgeState({ stage: "error", message: "Camera access denied." });
    }
  }, [scheduleCapture]);

  const stopCamera = useCallback(() => {
    clearScheduledCapture();
    const videoElement = videoRef.current;
    const stream = videoElement?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }, [clearScheduledCapture]);

  useEffect(() => {
    cameraEnabledRef.current = cameraEnabled;
  }, [cameraEnabled]);

  useEffect(() => {
    autoCaptureRef.current = autoCapture;
    if (!cameraEnabledRef.current) {
      return;
    }

    if (autoCapture) {
      setJudgeState((prev) => {
        if (prev.stage === "pass") {
          return prev;
        }
        return { stage: "capturing", message: prev.message };
      });
      scheduleCapture(CAMERA_INITIAL_DELAY);
    } else {
      clearScheduledCapture();
      setJudgeState((prev) => {
        if (prev.stage === "pass") {
          return prev;
        }
        return { stage: "idle", message: "Auto capture paused. Tap to capture manually." };
      });
    }
  }, [autoCapture, clearScheduledCapture, scheduleCapture]);

  useEffect(() => {
    if (cameraEnabled) {
      setJudgeState((prev) => {
        if (prev.stage === "pass") {
          return prev;
        }
        return autoCaptureRef.current
          ? { stage: "capturing", message: prev.message }
          : { stage: "idle", message: "Auto capture paused. Tap to capture manually." };
      });
      void startCamera();
    } else {
      judgeInFlightRef.current = false;
      celebrationActiveRef.current = false;
      setShowCelebration(false);
      setCapturedImage(null);
      setCameraError(null);
      setJudgeState({ stage: "idle", message: "Camera paused." });
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [cameraEnabled, startCamera, stopCamera]);

  const updateEmoji = useCallback(
    (shift: number) => {
      const nextIndex = (currentEmojiIndex + shift + EMOJI_PROMPTS.length) % EMOJI_PROMPTS.length;
      setCurrentEmojiIndex(nextIndex);
      setCapturedImage(null);
      celebrationActiveRef.current = false;
      setShowCelebration(false);
      if (cameraEnabled) {
        if (autoCaptureRef.current) {
          setJudgeState((prev) => ({ stage: "capturing", message: prev.message }));
          scheduleCapture(CAMERA_INITIAL_DELAY);
        } else {
          setJudgeState({ stage: "idle", message: "Auto capture paused. Tap to capture manually." });
        }
      } else {
        setJudgeState({ stage: "idle", message: "Camera paused." });
      }
    },
    [cameraEnabled, currentEmojiIndex, scheduleCapture],
  );

  const handleCelebrateContinue = useCallback(() => {
    updateEmoji(1);
  }, [updateEmoji]);

  const handleAutoCaptureToggle = useCallback(() => {
    setAutoCapture((enabled) => !enabled);
  }, []);

  const handleManualCapture = useCallback(() => {
    if (!cameraEnabledRef.current || judgeInFlightRef.current) {
      return;
    }
    void captureAndJudge();
  }, [captureAndJudge]);

  const handleCameraToggle = useCallback(() => {
    setCameraEnabled((enabled) => !enabled);
  }, []);

  const scoreValue = Math.min(Math.max(judgeState.score ?? lastScore, 0), 1);
  const scorePercent = Math.round(scoreValue * 100);
  const isPositive = judgeState.stage === "pass";

  return (
    <main className="layout">
      <section className="camera-panel">
        <h1>Live Camera</h1>
        <div
          className="video-frame"
          onClick={autoCapture ? undefined : handleManualCapture}
          role={autoCapture ? undefined : "button"}
          tabIndex={autoCapture ? -1 : 0}
          aria-label={autoCapture ? undefined : "Capture snapshot"}
        >
          {cameraError ? (
            <div className="camera-error">{cameraError}</div>
          ) : cameraEnabled ? (
            <video ref={videoRef} className="video" autoPlay playsInline muted />
          ) : (
            <div className="camera-error">Camera is off.</div>
          )}
          {capturedImage && (
            <div className="floating-preview">
              {/* Using a data URL preview for realtime feedback. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capturedImage} alt="Latest snapshot" />
            </div>
          )}
        </div>
        <div className="camera-controls">
          <button type="button" onClick={handleCameraToggle} className="secondary-button">
            {cameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
          </button>
          <button type="button" onClick={handleAutoCaptureToggle} className="secondary-button" disabled={!cameraEnabled}>
            {autoCapture ? "Disable Auto Capture" : "Enable Auto Capture"}
          </button>
          {!autoCapture && (
            <button
              type="button"
              onClick={handleManualCapture}
              className="primary-button"
              disabled={!cameraEnabled || judgeState.stage === "judging"}
            >
              Capture Snapshot
            </button>
          )}
        </div>
        <div className={`score-meter ${judgeState.stage === "judging" ? "score-meter-pending" : ""}`}>
          <div className="score-bar">
            <div
              className={`score-fill ${isPositive ? "score-fill-pass" : "score-fill-fail"}`}
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <div className="score-meta">
            <span className="score-label">{scorePercent}%</span>
            {judgeState.stage === "judging" && <span className="spinner meter-spinner" aria-hidden="true" />}
          </div>
        </div>
        {judgeState.message && <p className="verdict-message">{judgeState.message}</p>}
      </section>

      <section className="emoji-panel">
        <h1>Emoji Prompt</h1>
        <div className="emoji-display" aria-label={currentEmoji.name} role="img">
          {currentEmoji.symbol}
        </div>
        <p className="emoji-instruction">{currentEmoji.description}</p>
        <div className="emoji-next">
          <span>Next up: {nextEmoji.symbol} {nextEmoji.name}</span>
        </div>
        <div className="emoji-controls">
          <button type="button" onClick={() => updateEmoji(-1)} className="secondary-button">
            Previous Emoji
          </button>
          <button type="button" onClick={() => updateEmoji(1)} className="secondary-button">
            Next Emoji
          </button>
        </div>
      </section>

      {showCelebration && (
        <div className="celebration-overlay" role="dialog" aria-live="assertive">
          <div className="celebration-card">
            <span className="celebration-emoji">🎉</span>
            <h2>Great match!</h2>
            <p>The judge loved that impression.</p>
            <button type="button" className="primary-button" onClick={handleCelebrateContinue}>
              Next Emoji
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true" />
    </main>
  );
}
