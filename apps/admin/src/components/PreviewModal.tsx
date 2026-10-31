import React from 'react';
import { useApp } from '../context/AppContext.js';
import { X, Eye, Compass, Activity, Radio } from 'lucide-react';

export const PreviewModal: React.FC = () => {
  const { activePreview, devices, closeActivePreview } = useApp();

  if (!activePreview) return null;

  const device = devices.find((d) => d.id === activePreview.deviceId);
  const rotation = activePreview.rotation;

  // Convert quaternion to rough Euler angles for display
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  if (rotation) {
    const { x, y, z, w } = rotation;
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    roll = Math.round(Math.atan2(sinr_cosp, cosr_cosp) * (180 / Math.PI));

    const sinp = 2 * (w * y - z * x);
    pitch = Math.round(Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp) * (180 / Math.PI));

    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    yaw = Math.round(Math.atan2(siny_cosp, cosy_cosp) * (180 / Math.PI));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/60">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">
                  Live Headset View: {device?.name || 'Headset'}
                </h3>
                <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  <Radio className="w-3 h-3 animate-pulse" />
                  1 FPS Snapshot Stream
                </span>
              </div>
              <p className="text-xs text-slate-400">Real-time viewpoint monitoring for Meta Quest 2</p>
            </div>
          </div>
          <button
            onClick={closeActivePreview}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport content */}
        <div className="p-6 flex flex-col items-center">
          <div className="relative w-full aspect-video bg-black rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center shadow-inner">
            {activePreview.dataBase64 ? (
              <img
                src={`data:image/jpeg;base64,${activePreview.dataBase64}`}
                alt="Headset View"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center p-6 text-slate-500">
                <Activity className="w-8 h-8 animate-spin mx-auto mb-2 text-cyan-500" />
                <p className="text-sm">Connecting live stream from headset...</p>
              </div>
            )}

            {/* Overlaid timestamp watermark */}
            <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur px-2.5 py-1 rounded text-[11px] font-mono text-slate-300 border border-slate-800">
              Captured: {new Date(activePreview.capturedAt).toLocaleTimeString()}
            </div>
          </div>

          {/* Head Pose Attitude Telemetry */}
          <div className="w-full mt-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold text-slate-300">Headset Orientation:</span>
            </div>
            <div className="flex items-center gap-6 font-mono text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Pitch:</span>
                <span className="text-cyan-400 font-semibold">{pitch}°</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Yaw:</span>
                <span className="text-emerald-400 font-semibold">{yaw}°</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Roll:</span>
                <span className="text-amber-400 font-semibold">{roll}°</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Headset snapshots update every second while preview is open.</span>
          <button
            onClick={closeActivePreview}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            Close View
          </button>
        </div>
      </div>
    </div>
  );
};

