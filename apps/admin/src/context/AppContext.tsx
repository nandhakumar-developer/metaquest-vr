import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type {
  AdminIdentity,
  AppSettings,
  CloudStatus,
  CommandDto,
  CommandType,
  DeploymentDto,
  DeviceSnapshot,
  GatewayConfigResponse,
  GroupPlaybackState,
  PairingRequestDto,
  VideoDto,
} from '@vrcc/shared-types';
import type { AdminServerEvent } from '@vrcc/protocol';
import { apiRequest, setCsrfToken, setUnauthorizedHandler } from '../api/client.js';
import { GatewayWebSocketClient } from '../api/ws.js';
import {
  getActivePreview,
  setActivePreview,
  updateActivePreview,
} from './previewStore.js';

export interface GroupCommandResult {
  deviceId: string;
  command?: CommandDto;
  error?: string;
}

export interface DeployVideoResult {
  deployments: DeploymentDto[];
  errors: Array<{ deviceId: string; message: string }>;
}

interface AppContextValue {
  identity: AdminIdentity | null;
  isAuthenticated: boolean;
  needsBootstrap: boolean;
  loading: boolean;
  wsConnected: boolean;
  gatewayConfig: GatewayConfigResponse | null;
  devices: DeviceSnapshot[];
  videos: VideoDto[];
  deployments: DeploymentDto[];
  pairingRequests: PairingRequestDto[];
  commands: CommandDto[];
  settings: AppSettings | null;
  cloud: CloudStatus | null;
  group: GroupPlaybackState | null;

  login: (email: string, password: string) => Promise<void>;
  bootstrap: (email: string, password: string, displayName: string, token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshVideos: () => Promise<void>;

  sendCommand: (deviceId: string, type: CommandType, payload?: Record<string, unknown>) => Promise<void>;
  sendGroupCommand: (
    deviceIds: string[],
    type: CommandType,
    payload?: Record<string, unknown>,
  ) => Promise<GroupCommandResult[]>;
  startGroupPlayback: (input: {
    assignments: Array<{ deviceId: string; videoId: string }>;
    leadMs?: number;
    positionSeconds?: number;
  }) => Promise<GroupPlaybackState>;
  stopGroupPlayback: () => Promise<void>;
  getPlayerLink: () => Promise<{ playerUrl: string; qrDataUrl: string }>;
  pairDevice: (code: string, name: string) => Promise<void>;
  cancelPairing: (pairingId: string) => Promise<void>;
  startPreview: (deviceId: string) => Promise<void>;
  stopPreview: (deviceId: string) => Promise<void>;
  renameDevice: (deviceId: string, name: string) => Promise<void>;
  unpairDevice: (deviceId: string) => Promise<void>;
  deleteDevice: (deviceId: string) => Promise<void>;
  deleteVideo: (videoId: string) => Promise<void>;
  deployVideo: (videoId: string, deviceIds: string[]) => Promise<DeployVideoResult>;
  cancelDeployment: (deploymentId: string) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  closeActivePreview: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfigResponse | null>(null);

  const [devices, setDevices] = useState<DeviceSnapshot[]>([]);
  const [videos, setVideos] = useState<VideoDto[]>([]);
  const [deployments, setDeployments] = useState<DeploymentDto[]>([]);
  const [pairingRequests, setPairingRequests] = useState<PairingRequestDto[]>([]);
  const [commands, setCommands] = useState<CommandDto[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [cloud, setCloud] = useState<CloudStatus | null>(null);
  const [group, setGroup] = useState<GroupPlaybackState | null>(null);

  const wsClientRef = useRef<GatewayWebSocketClient | null>(null);

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await apiRequest<GatewayConfigResponse>('/api/config');
      setGatewayConfig(cfg);
      setNeedsBootstrap(cfg.auth.needsBootstrap);
      if (cfg.settings) setSettings(cfg.settings);
    } catch (err) {
      console.warn('Failed to fetch gateway config', err);
    }
  }, []);

  const clearSessionState = useCallback(() => {
    setIdentity(null);
    setCsrfToken(null);
    setWsConnected(false);
    setDevices([]);
    setVideos([]);
    setDeployments([]);
    setPairingRequests([]);
    setCommands([]);
    setActivePreview(null);
    setGroup(null);
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const res = await apiRequest<{
        identity: AdminIdentity;
        csrfToken: string;
      }>('/api/auth/session');
      setIdentity(res.identity);
      setCsrfToken(res.csrfToken);
    } catch {
      clearSessionState();
    } finally {
      setLoading(false);
    }
  }, [clearSessionState]);

  useEffect(() => {
    void (async () => {
      await refreshConfig();
      await checkSession();
    })();
  }, [refreshConfig, checkSession]);

  useEffect(() => {
    setUnauthorizedHandler(clearSessionState);
    return () => setUnauthorizedHandler(null);
  }, [clearSessionState]);

  // Handle WebSocket events
  const handleWsEvent = useCallback((event: AdminServerEvent) => {
    switch (event.kind) {
      case 'hello':
        setDevices(event.snapshot.devices);
        setVideos(event.snapshot.videos);
        setDeployments(event.snapshot.deployments);
        setPairingRequests(event.snapshot.pairingRequests);
        setCommands(event.snapshot.commands);
        setSettings(event.snapshot.settings);
        setCloud(event.snapshot.cloud);
        setGroup(event.snapshot.group);
        break;

      case 'device.updated':
        setDevices((prev) => {
          const index = prev.findIndex((d) => d.id === event.device.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = event.device;
            return next;
          }
          return [event.device, ...prev];
        });
        break;

      case 'device.removed':
        setDevices((prev) => prev.filter((d) => d.id !== event.deviceId));
        break;

      case 'video.updated':
        setVideos((prev) => {
          const index = prev.findIndex((v) => v.id === event.video.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = event.video;
            return next;
          }
          return [event.video, ...prev];
        });
        break;

      case 'video.removed':
        setVideos((prev) => prev.filter((v) => v.id !== event.videoId));
        break;

      case 'deployment.updated':
        setDeployments((prev) => {
          const index = prev.findIndex((d) => d.id === event.deployment.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = event.deployment;
            return next;
          }
          return [event.deployment, ...prev];
        });
        break;

      case 'command.updated':
        setCommands((prev) => {
          const index = prev.findIndex((c) => c.id === event.command.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = event.command;
            return next;
          }
          return [event.command, ...prev.slice(0, 99)];
        });
        break;

      case 'pairing.pending':
        setPairingRequests((prev) => {
          if (prev.some((r) => r.id === event.request.id)) return prev;
          return [event.request, ...prev];
        });
        break;

      case 'pairing.resolved':
        setPairingRequests((prev) => prev.filter((r) => r.id !== event.requestId));
        break;

      case 'preview.frame':
        updateActivePreview((prev) => {
          if (prev && prev.deviceId === event.deviceId) {
            return {
              deviceId: event.deviceId,
              dataBase64: event.dataBase64,
              capturedAt: event.capturedAt,
              includesUserInterface: event.includesUserInterface,
              rotation: prev.rotation,
            };
          }
          return {
            deviceId: event.deviceId,
            dataBase64: event.dataBase64,
            capturedAt: event.capturedAt,
            includesUserInterface: event.includesUserInterface,
          };
        });
        break;

      case 'preview.headPose':
        updateActivePreview((prev) => {
          if (prev && prev.deviceId === event.deviceId) {
            return { ...prev, rotation: event.rotation };
          }
          return prev;
        });
        break;

      case 'preview.stopped':
        updateActivePreview((prev) => (prev?.deviceId === event.deviceId ? null : prev));
        break;

      case 'cloud.status':
        setCloud(event.cloud);
        break;

      case 'settings.updated':
        setSettings(event.settings);
        break;

      case 'group.updated':
        setGroup(event.group);
        break;
    }
  }, []);

  // Connect WebSocket when authenticated
  useEffect(() => {
    if (!identity) {
      if (wsClientRef.current) {
        wsClientRef.current.disconnect();
        wsClientRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    const client = new GatewayWebSocketClient(() => window.location.origin);
    wsClientRef.current = client;

    client.onStatusChange((connected) => {
      setWsConnected(connected);
    });

    const unsubscribe = client.subscribe(handleWsEvent);
    void client.connect();

    return () => {
      unsubscribe();
      client.disconnect();
      wsClientRef.current = null;
    };
  }, [identity, handleWsEvent]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest<{
      identity: AdminIdentity;
      csrfToken: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setIdentity(res.identity);
    setCsrfToken(res.csrfToken);
    await refreshConfig();
  };

  const refreshVideos = useCallback(async () => {
    if (!identity) return;
    const list = await apiRequest<VideoDto[]>('/api/videos');
    setVideos(list);
  }, [identity]);

  const bootstrap = async (
    email: string,
    password: string,
    displayName: string,
    token: string,
  ) => {
    const res = await apiRequest<{
      identity: AdminIdentity;
      csrfToken: string;
    }>('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName, token }),
    });
    setIdentity(res.identity);
    setCsrfToken(res.csrfToken);
    setNeedsBootstrap(false);
    await refreshConfig();
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      clearSessionState();
    }
  };

  const sendCommand = async (
    deviceId: string,
    type: CommandType,
    payload: Record<string, unknown> = {},
  ) => {
    await apiRequest<{ command: CommandDto }>(`/api/devices/${deviceId}/commands`, {
      method: 'POST',
      body: JSON.stringify({ type, payload }),
    });
  };

  const sendGroupCommand = async (
    deviceIds: string[],
    type: CommandType,
    payload: Record<string, unknown> = {},
  ): Promise<GroupCommandResult[]> => {
    const res = await apiRequest<{ results: GroupCommandResult[] }>('/api/commands/group', {
      method: 'POST',
      body: JSON.stringify({ deviceIds, type, payload }),
    });
    return res.results;
  };

  const startGroupPlayback = async (input: {
    assignments: Array<{ deviceId: string; videoId: string }>;
    leadMs?: number;
    positionSeconds?: number;
  }) => {
    const state = await apiRequest<GroupPlaybackState>('/api/playback/group/start', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setGroup(state);
    return state;
  };

  const stopGroupPlayback = async () => {
    const state = await apiRequest<GroupPlaybackState>('/api/playback/group/stop', {
      method: 'POST',
    });
    setGroup(state);
  };

  const getPlayerLink = () =>
    apiRequest<{ playerUrl: string; qrDataUrl: string }>('/api/player/link');

  const pairDevice = async (code: string, name: string) => {
    await apiRequest('/api/devices/pair', {
      method: 'POST',
      body: JSON.stringify({ code, name }),
    });
  };

  const cancelPairing = async (pairingId: string) => {
    await apiRequest(`/api/devices/pairing-sessions/${pairingId}`, {
      method: 'DELETE',
    });
  };

  const startPreview = async (deviceId: string) => {
    setActivePreview({
      deviceId,
      dataBase64: '',
      capturedAt: new Date().toISOString(),
    });
    await apiRequest(`/api/devices/${deviceId}/preview`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'snapshot' }),
    });
  };

  const stopPreview = async (deviceId: string) => {
    setActivePreview(null);
    await apiRequest(`/api/devices/${deviceId}/preview`, {
      method: 'DELETE',
    });
  };

  const closeActivePreview = () => {
    const activePreview = getActivePreview();
    if (activePreview) {
      void stopPreview(activePreview.deviceId);
    }
  };

  const renameDevice = async (deviceId: string, name: string) => {
    await apiRequest(`/api/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  };

  const unpairDevice = async (deviceId: string) => {
    await apiRequest(`/api/devices/${deviceId}/unpair`, {
      method: 'POST',
    });
  };

  const deleteDevice = async (deviceId: string) => {
    await apiRequest(`/api/devices/${deviceId}`, {
      method: 'DELETE',
    });
  };

  const deleteVideo = async (videoId: string) => {
    await apiRequest(`/api/videos/${videoId}`, {
      method: 'DELETE',
    });
  };

  const deployVideo = async (
    videoId: string,
    deviceIds: string[],
  ): Promise<DeployVideoResult> => {
    return apiRequest<DeployVideoResult>(`/api/videos/${videoId}/deployments`, {
      method: 'POST',
      body: JSON.stringify({ deviceIds }),
    });
  };

  const cancelDeployment = async (deploymentId: string) => {
    await apiRequest(`/api/deployments/${deploymentId}/cancel`, {
      method: 'POST',
    });
  };

  const updateSettings = async (patch: Partial<AppSettings>) => {
    const updated = await apiRequest<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setSettings(updated);
  };

  return (
    <AppContext.Provider
      value={{
        identity,
        isAuthenticated: Boolean(identity),
        needsBootstrap,
        loading,
        wsConnected,
        gatewayConfig,
        devices,
        videos,
        deployments,
        pairingRequests,
        commands,
        settings,
        cloud,
        group,
        login,
        bootstrap,
        logout,
        refreshConfig,
        refreshVideos,
        sendCommand,
        sendGroupCommand,
        startGroupPlayback,
        stopGroupPlayback,
        getPlayerLink,
        pairDevice,
        cancelPairing,
        startPreview,
        stopPreview,
        renameDevice,
        unpairDevice,
        deleteDevice,
        deleteVideo,
        deployVideo,
        cancelDeployment,
        updateSettings,
        closeActivePreview,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
