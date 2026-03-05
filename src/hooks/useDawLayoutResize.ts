import { useCallback, useEffect, useState } from 'react';

const SIDEBAR_WIDTH_KEY = 'ace-step-daw-sidebar-width';
const MIXER_HEIGHT_KEY = 'ace-step-daw-mixer-height';

const DEFAULT_SIDEBAR_WIDTH = 148;
const MIN_SIDEBAR_WIDTH = 120;
const MAX_SIDEBAR_WIDTH = 360;

const DEFAULT_MIXER_HEIGHT = 256;
const MIN_MIXER_HEIGHT = 160;
const MAX_MIXER_HEIGHT = 520;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function useDawLayoutResize() {
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    loadNumber(SIDEBAR_WIDTH_KEY, DEFAULT_SIDEBAR_WIDTH),
  );
  const [mixerHeight, setMixerHeight] = useState<number>(() =>
    loadNumber(MIXER_HEIGHT_KEY, DEFAULT_MIXER_HEIGHT),
  );

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(MIXER_HEIGHT_KEY, String(mixerHeight));
  }, [mixerHeight]);

  const startSidebarResize = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebarWidth;

      const onMove = (moveEvent: MouseEvent) => {
        const next = clamp(
          startWidth + (moveEvent.clientX - startX),
          MIN_SIDEBAR_WIDTH,
          MAX_SIDEBAR_WIDTH,
        );
        setSidebarWidth(next);
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [sidebarWidth],
  );

  const startMixerResize = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = mixerHeight;

      const onMove = (moveEvent: MouseEvent) => {
        const rawHeight = startHeight - (moveEvent.clientY - startY);
        const maxByViewport = Math.max(
          MIN_MIXER_HEIGHT,
          Math.min(MAX_MIXER_HEIGHT, window.innerHeight * 0.65),
        );
        setMixerHeight(clamp(rawHeight, MIN_MIXER_HEIGHT, maxByViewport));
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [mixerHeight],
  );

  return {
    sidebarWidth,
    mixerHeight,
    startSidebarResize,
    startMixerResize,
  };
}
