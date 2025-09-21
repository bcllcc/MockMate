"use client";

import { useEffect, useRef, useState } from "react";

interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  onStreamComplete?: () => void;
  speed?: number;
  className?: string;
}

export function StreamingMessage({
  content,
  isStreaming,
  onStreamComplete,
  speed = 50,
  className,
}: StreamingMessageProps) {
  const [displayed, setDisplayed] = useState("");
  const [showCursor, setShowCursor] = useState(false);

  const contentRef = useRef(content);
  const charIndexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    contentRef.current = content;

    if (isStreaming) {
      if (content.length < charIndexRef.current) {
        charIndexRef.current = 0;
        setDisplayed("");
      }
      return;
    }

    charIndexRef.current = content.length;
    setDisplayed(content);
  }, [content, isStreaming]);

  useEffect(() => {
    if (!isStreaming) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const step = () => {
      const target = contentRef.current;
      if (charIndexRef.current >= target.length) {
        return;
      }

      charIndexRef.current += 1;
      setDisplayed(target.slice(0, charIndexRef.current));
    };

    step();

    const intervalId = setInterval(step, Math.max(10, speed));
    intervalRef.current = intervalId;

    return () => {
      clearInterval(intervalId);
      intervalRef.current = null;
    };
  }, [isStreaming, speed]);

  useEffect(() => {
    if (isStreaming) {
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
        cursorTimeoutRef.current = null;
      }
      setShowCursor(true);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      charIndexRef.current = content.length;
      setDisplayed(content);

      if (wasStreamingRef.current) {
        onStreamComplete?.();
      }

      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
      setShowCursor(true);
      cursorTimeoutRef.current = setTimeout(() => {
        setShowCursor(false);
        cursorTimeoutRef.current = null;
      }, 600);
    }

    wasStreamingRef.current = isStreaming;
  }, [isStreaming, content, onStreamComplete]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
    };
  }, []);

  const baseClasses = "relative flex items-start whitespace-pre-wrap text-sm leading-relaxed text-current";
  const containerClass = className ? `${baseClasses} ${className}` : baseClasses;

  return (
    <div className={containerClass}>
      <span aria-live="polite">{displayed}</span>
      {showCursor ? (
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-5 w-[2px] bg-primary-400 align-middle animate-pulse"
        />
      ) : null}
    </div>
  );
}