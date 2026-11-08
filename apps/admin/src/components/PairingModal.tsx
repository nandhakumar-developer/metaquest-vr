import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  X,
  KeyRound,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/25 p-5 backdrop-blur-2xl">
      <div className="flex max-h-[calc(100svh-40px)] w-full flex-col overflow-hidden rounded-[28px] border border-transparent bg-white/75 shadow-[0_32px_84px_rgba(0,0,0,0.16)] backdrop-blur-[40px] max-w-xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/60 px-[22px] py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-[#20D9A5]/15 text-[#08785D]">
              <img src="/meta.png" alt="" className="h-9 w-9 object-contain" />
            </div>
            <div>
              <h3 className="font-display text-[15.5px] font-bold tracking-[-0.025em]">Pair Meta Quest headset</h3>
              <p className="mt-[3px] text-[11.5px] text-[#64748B]">Connect a new headset over your local network</p>
            </div>
          </div>
          <button onClick={onClose} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-[30px] w-[30px] rounded-[9px] p-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="overflow-y-auto p-[22px] space-y-5">
            {error && (
              <div className="flex items-start gap-[11px] rounded-2xl border p-[13px] px-4 text-[12px] leading-[1.6] [&_svg]:mt-px [&_svg]:shrink-0 border-[#FF2525]/25 bg-[#FF2525]/10 text-[#B91C1C]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Player link + QR */}
            <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] p-4">
              <div className="flex items-start gap-4">
                <div className="shrink-0">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR code for the Quest browser player"
                      className="h-28 w-28 rounded-xl border border-white/70 bg-white shadow-sm"
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-[#E1E1E1] text-[#8A8A8A]">
                      <QrCode className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#111111]">
                    <Smartphone className="h-3.5 w-3.5 text-[#004CE4]" />
                    Open the player on each headset
                  </div>
                  <div className="flex items-center gap-2">
                    <code
                      className="min-w-0 flex-1 truncate rounded-lg border border-[#E1E1E1] bg-[#F5F5F5] px-2.5 py-1.5 font-mono text-[10.5px] text-[#555555]"
                      title={playerUrl}
                    >
                      {playerUrl || 'Generating link…'}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyPlayerUrl()}
                      disabled={!playerUrl}
                      className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-[27px] gap-[5px] px-[10px] text-[10.5px] shrink-0"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-[#20D9A5]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-[#8A8A8A]">
                    Scan the QR code or type this URL into{' '}
                    <strong className="font-semibold text-[#555555]">Meta Quest Browser</strong>. Open
                    the same URL on each headset and pair each one separately — every headset gets its
                    own single-use 6-digit code.
                  </p>
                  <p className="text-[10px] leading-relaxed text-[#8A8A8A]">
                    Immersive WebXR needs HTTPS. Over plain HTTP the player still streams and plays
                    flat 2D.
                  </p>
                  {linkError && (
                    <p className="flex items-center gap-1.5 text-[10.5px] text-[#003BB5]">
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
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#003BB5]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#004CE4]" />
                  Detected headsets awaiting pairing
                </div>
                <div className="space-y-2">
                  {pairingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#E1E1E1] bg-[#F5F5F5] px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[#111111]">
                          PIN
                          <span className="rounded-md border border-[#E1E1E1] bg-[#F5F5F5] px-2 py-0.5 font-mono text-[13px] tracking-[0.16em] text-[#555555]">
                            {req.code}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[10.5px] text-[#8A8A8A]">
                          {req.ipAddress || 'LAN'} · {req.deviceModel}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickPair(req.code)}
                          className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-[27px] gap-[5px] px-[10px] text-[10.5px]"
                        >
                          Select PIN
                        </button>
                        <button
                          type="button"
                          onClick={() => void cancelPairing(req.id)}
                          className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-[30px] w-[30px] rounded-[9px] p-0 text-[#8A8A8A] hover:text-[#B91C1C]"
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
              <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">6-digit pairing PIN</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8A8A]" />
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 849201"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45 font-mono tracking-[0.06em] min-h-[46px] pl-10 text-[15px] tracking-[0.28em]"
                />
              </div>
              <p className="mt-1.5 block text-[10.5px] leading-[1.55] text-[#64748B]">
                Enter the 6-digit code shown in the VR Control Center player in Meta Quest Browser.
              </p>
            </div>

            <div>
              <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Headset name / location</label>
              <input
                type="text"
                placeholder="e.g. Headset #1 (Booth A)"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-[14px] border-t border-white/60 bg-white/40 px-[22px] py-4">
            <button type="button" onClick={onClose} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-8 gap-1.5 px-[13px] text-[11.5px]">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)] h-8 gap-1.5 px-[13px] text-[11.5px]">
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
