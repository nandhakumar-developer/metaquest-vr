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
    <div className="modal-backdrop">
      <div className="modal max-w-xl">
        <div className="modal-head">
          <div className="flex items-center gap-3">
            <div className="modal-icon tint-mint">
              <Glasses className="h-5 w-5" />
            </div>
            <div>
              <h3 className="modal-title">Pair Meta Quest headset</h3>
              <p className="modal-sub">Connect a new headset over your local network</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon-sm" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="modal-body space-y-5">
            {error && (
              <div className="alert alert-danger">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Player link + QR */}
            <div className="panel-inset p-4">
              <div className="flex items-start gap-4">
                <div className="shrink-0">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR code for the Quest browser player"
                      className="h-28 w-28 rounded-xl border border-white/70 bg-white shadow-sm"
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-[#4a3e35]/20 text-[#a99a90]">
                      <QrCode className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#2a2320]">
                    <Smartphone className="h-3.5 w-3.5 text-[#6c56a8]" />
                    Open the player on each headset
                  </div>
                  <div className="flex items-center gap-2">
                    <code
                      className="min-w-0 flex-1 truncate rounded-lg border border-[#4a3e35]/10 bg-white/60 px-2.5 py-1.5 font-mono text-[10.5px] text-[#c34c37]"
                      title={playerUrl}
                    >
                      {playerUrl || 'Generating link…'}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyPlayerUrl()}
                      disabled={!playerUrl}
                      className="btn btn-secondary btn-xs shrink-0"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-[#4e9e7e]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-[#8b7d72]">
                    Scan the QR code or type this URL into{' '}
                    <strong className="font-semibold text-[#5c4f46]">Meta Quest Browser</strong>. Open
                    the same URL on each headset and pair each one separately — every headset gets its
                    own single-use 6-digit code.
                  </p>
                  <p className="text-[10px] leading-relaxed text-[#a99a90]">
                    Immersive WebXR needs HTTPS. Over plain HTTP the player still streams and plays
                    flat 2D.
                  </p>
                  {linkError && (
                    <p className="flex items-center gap-1.5 text-[10.5px] text-[#92601a]">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{linkError}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Pending requests */}
            {pairingRequests.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#92601a]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#c98a2e]" />
                  Detected headsets awaiting pairing
                </div>
                <div className="space-y-2">
                  {pairingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#4a3e35]/10 bg-white/45 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[#2a2320]">
                          PIN
                          <span className="rounded-md border border-[#4a3e35]/10 bg-white/70 px-2 py-0.5 font-mono text-[13px] tracking-[0.16em] text-[#c34c37]">
                            {req.code}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[10.5px] text-[#8b7d72]">
                          {req.ipAddress || 'LAN'} · {req.deviceModel}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickPair(req.code)}
                          className="btn btn-dark btn-xs"
                        >
                          Select PIN
                        </button>
                        <button
                          type="button"
                          onClick={() => void cancelPairing(req.id)}
                          className="btn btn-ghost btn-icon-sm text-[#8b7d72] hover:text-[#a23f36]"
                          title="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="field-label">6-digit pairing PIN</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a99a90]" />
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 849201"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  className="input input-mono min-h-[46px] pl-10 text-[15px] tracking-[0.28em]"
                />
              </div>
              <p className="field-hint">
                Enter the 6-digit code shown in the VR Control Center player in Meta Quest Browser.
              </p>
            </div>

            <div>
              <label className="field-label">Headset name / location</label>
              <input
                type="text"
                placeholder="e.g. Headset #1 (Booth A)"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div className="modal-foot">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary btn-sm">
              {loading ? (
                'Pairing…'
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" /> Pair headset
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
