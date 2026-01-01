import { useCallback, useEffect, useRef, useState } from "react";
import { UI_FEEDBACK_TIMEOUT_MS } from "../constants";

export type FeedbackTone = "good" | "bad" | "";

export type TimedFeedbackMessage = {
  text: string;
  tone: FeedbackTone;
};

type UseTimedFeedbackOptions = {
  timeoutMs?: number;
  stickyOnError?: boolean;
};

export const useTimedFeedback = ({
  timeoutMs = UI_FEEDBACK_TIMEOUT_MS,
  stickyOnError = true,
}: UseTimedFeedbackOptions = {}) => {
  const [message, setMessage] = useState<TimedFeedbackMessage | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    setMessage(null);
  }, []);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!message) return;
    if (message.tone === "bad" && stickyOnError) return;
    if (timeoutMs <= 0) return;

    timeoutRef.current = window.setTimeout(() => {
      setMessage(null);
      timeoutRef.current = null;
    }, timeoutMs);
  }, [message, stickyOnError, timeoutMs]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const showSuccess = useCallback((text: string) => {
    setMessage({ text, tone: "good" });
  }, []);

  const showError = useCallback((text: string) => {
    setMessage({ text, tone: "bad" });
  }, []);

  return {
    message,
    showSuccess,
    showError,
    clear,
  };
};
