import { useSyncExternalStore } from 'react';
import type { Quaternion } from '@vrcc/shared-types';

export interface ActivePreviewState {
  deviceId: string;
  dataBase64: string;
  capturedAt: string;
  rotation?: Quaternion;
  includesUserInterface?: boolean;
}

type PreviewListener = () => void;

let activePreview: ActivePreviewState | null = null;
const listeners = new Set<PreviewListener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function getActivePreview(): ActivePreviewState | null {
  return activePreview;
}

export function setActivePreview(next: ActivePreviewState | null): void {
  if (activePreview === next) return;
  activePreview = next;
  notify();
}

export function updateActivePreview(
  update: (current: ActivePreviewState | null) => ActivePreviewState | null,
): void {
  setActivePreview(update(activePreview));
}

function subscribe(listener: PreviewListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActivePreview(): ActivePreviewState | null {
  return useSyncExternalStore(subscribe, getActivePreview, getActivePreview);
}
