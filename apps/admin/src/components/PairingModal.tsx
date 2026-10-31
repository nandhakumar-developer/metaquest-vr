import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  X,
  KeyRound,
  Glasses,
  Check,
  AlertCircle,
  Copy,
  QrCode,
  Smartphone,
} from 'lucide-react';

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PairingModal: React.FC<PairingModalProps> = ({ isOpen, onClose }) => {
  const { pairingRequests, pairDevice, cancelPairing, getPlayerLink, gatewayConfig } = useApp();
  const [pinCode, setPinCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerUrl, setPlayerUrl] = useState(gatewayConfig?.playerUrl ?? '');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLinkError(null);
    setCopied(false);
    getPlayerLink()
      .then((link) => {
        if (cancelled) return;
        setPlayerUrl(link.playerUrl);
        setQrDataUrl(link.qrDataUrl);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setPlayerUrl(gatewayConfig?.playerUrl ?? '');
        setLinkError(err?.message || 'Could not generate the player QR code.');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const copyPlayerUrl = async () => {
    if (!playerUrl) return;
    try {
      await navigator.clipboard.writeText(playerUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setLinkError('Clipboard access was blocked. Select the URL and copy it manually.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(pinCode.trim())) {
      setError('Please enter a 6-digit numeric pairing code.');
      return;
    }
    if (!deviceName.trim()) {
      setError('Please provide a name for this headset.');
      return;
    }

    try {
      setLoading(true);
      await pairDevice(pinCode.trim(), deviceName.trim());
      setPinCode('');
      setDeviceName('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to pair device. Verify the PIN is active.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPair = (code: string) => {
    setPinCode(code);
    if (!deviceName) {
      setDeviceName(`Quest 2 (${code.slice(-3)})`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
              <Glasses className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Pair Meta Quest Headset</h3>
              <p className="text-xs text-slate-400">Connect a new headset over local LAN</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Player link + QR: the headset runs this page in Meta Quest Browser */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4">
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR code for the Quest browser player"
                    className="w-28 h-28 rounded-lg border border-slate-700 bg-slate-900"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-600">
                    <QrCode className="w-8 h-8" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  Open the player on each headset
                </div>
                <div className="flex items-center gap-2">
                  <code
                    className="min-w-0 flex-1 truncate rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 text-[11px] font-mono text-cyan-300"
                    title={playerUrl}
                  >
                    {playerUrl || 'Generating link…'}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyPlayerUrl()}
                    disabled={!playerUrl}
                    className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold transition disabled:opacity-40"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Scan the QR code or type this URL into <strong className="text-slate-300">Meta Quest Browser</strong>.
                  Open the <strong className="text-slate-300">same URL on each headset</strong> and pair each one
                  separately — every headset gets its own single-use 6-digit code.
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Immersive WebXR needs HTTPS. Over plain HTTP the player still streams and plays flat 2D.
                </p>
                {linkError && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{linkError}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Pending Headsets Detected */}
          {pairingRequests.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                Detected Headsets Awaiting Pairing:
              </div>
              <div className="space-y-2">
                {pairingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>PIN:</span>
                        <span className="font-mono text-cyan-400 tracking-wider text-base bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                          {req.code}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        IP: {req.ipAddress || 'LAN'} • Model: {req.deviceModel}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickPair(req.code)}
                        className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition"
                      >
                        Select PIN
                      </button>
                      <button
                        type="button"
                        onClick={() => void cancelPairing(req.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition"
                        title="Dismiss"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual Entry Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                6-Digit Pairing PIN
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 849201"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-sm font-mono text-cyan-400 placeholder-slate-500 outline-none focus:border-cyan-500 transition tracking-widest"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Enter the 6-digit code shown in the VR Control Center player in Meta Quest Browser.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Headset Name / Location
              </label>
              <input
                type="text"
                placeholder="e.g. Headset #1 (Booth A)"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? 'Pairing...' : <><Check className="w-4 h-4" /> Pair Headset</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

