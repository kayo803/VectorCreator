import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Info,
  MonitorDown,
  MoreVertical,
  QrCode,
  Share,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { isAndroidNativeApp } from '../utils/androidBridge';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'settings' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'apk'>('android');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const isNativeAndroid = isAndroidNativeApp();

  const getCleanAppUrl = (): string => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/`;
  };

  const appUrl = getCleanAppUrl();

  useEffect(() => {
    if (!appUrl) return;
    QRCode.toDataURL(appUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => {});
  }, [appUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = appUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleButtonClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  if (isNativeAndroid) {
    if (variant === 'settings') {
      return (
        <div className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-medium text-emerald-200">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>Als Android-App installiert</span>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {variant === 'settings' ? (
        <div className="space-y-2">
          {isInstalled ? (
            <div className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-medium text-emerald-200">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>App bereits auf diesem Gerät installiert</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleButtonClick}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-medium text-blue-200 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-lg transition-colors cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5 text-blue-400" />
              <span>App auf Smartphone / Desktop installieren</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-zinc-300 bg-[#111215] hover:bg-[#20232B] border border-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5 text-zinc-400" />
            <span>App-Link & QR-Code anzeigen</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleButtonClick}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-blue-200 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="App auf Smartphone oder Desktop installieren"
        >
          <Smartphone className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="hidden sm:inline">App installieren</span>
          <span className="sm:hidden">App</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            setShowGuide(false);
          }}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-[#1A1C22] border border-white/15 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm sm:text-base font-semibold text-white leading-tight">
                    Vector Creator als App installieren
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Vollbild ohne Browserleiste, Offline-Speicherung & eigenes Icon
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                title="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto studio-scroll">
              {/* Direct App Link Card with QR Code */}
              <div className="p-3.5 rounded-xl bg-[#111215] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    Offizieller App-Link
                  </span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Online & Bereit
                  </span>
                </div>

                <div className="flex items-center gap-2 p-1.5 rounded-lg bg-[#181A20] border border-white/[0.08]">
                  <input
                    type="text"
                    readOnly
                    value={appUrl}
                    className="flex-1 min-w-0 bg-transparent px-2 text-xs font-mono text-zinc-300 select-all outline-none truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors shrink-0"
                    title="Link in die Zwischenablage kopieren"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span className="text-emerald-200">Kopiert!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Kopieren</span>
                      </>
                    )}
                  </button>
                  <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                    title="In neuem Tab öffnen"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                {/* QR Code and Quick Scan Area */}
                {qrDataUrl && (
                  <div className="flex items-center gap-4 pt-1">
                    <div className="p-1.5 bg-white rounded-lg shadow-md shrink-0">
                      <img
                        src={qrDataUrl}
                        alt="QR-Code zum Öffnen der App"
                        className="w-24 h-24 sm:w-28 sm:h-28 block"
                      />
                    </div>
                    <div className="space-y-1 text-xs text-zinc-300 leading-relaxed min-w-0">
                      <p className="font-semibold text-white flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        Mit Smartphone scannen
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        Öffne die Kamera auf deinem Android-Handy oder Tablet und richte sie auf den QR-Code, um die App direkt auf deinem Smartphone zu starten.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* In-browser Install Prompt Button (if supported) */}
              {isInstallable && (
                <button
                  type="button"
                  onClick={async () => {
                    await install();
                    setShowGuide(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs sm:text-sm shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
                >
                  <MonitorDown className="w-4 h-4" />
                  <span>Jetzt auf diesem Gerät installieren</span>
                </button>
              )}

              {/* Instructions Tabs */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#111215] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('android')}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      activeTab === 'android'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Android (Empfohlen)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ios')}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      activeTab === 'ios'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    iOS / iPad
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('apk')}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      activeTab === 'apk'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    APK Datei / Build
                  </button>
                </div>

                {activeTab === 'android' && (
                  <div className="p-3.5 rounded-xl bg-[#161820] border border-white/[0.08] space-y-3 text-xs text-zinc-300 leading-relaxed">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>1-Klick Installation via WebAPK (Kein Sideloading nötig)</span>
                    </div>

                    <ol className="space-y-2 list-decimal list-inside pl-1 text-zinc-300">
                      <li>
                        Öffne den Link oben auf deinem Android-Gerät in <strong>Google Chrome</strong> (oder scanne den QR-Code).
                      </li>
                      <li>
                        Tippe oben rechts auf das Chrome-Menü (
                        <MoreVertical className="w-3.5 h-3.5 inline text-blue-400" />
                        ).
                      </li>
                      <li>
                        Wähle <strong>„App installieren“</strong> (oder <strong>„Zum Startbildschirm hinzufügen“</strong>).
                      </li>
                      <li>
                        Tippe auf <strong>Installieren</strong>.
                      </li>
                    </ol>

                    <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-200 space-y-1">
                      <p className="font-semibold text-blue-100">
                        Vorteil gegenüber einer manuellen APK:
                      </p>
                      <p>
                        Android und der Google Play Store erstellen daraus automatisch ein signiertes <strong>WebAPK</strong>. Es erscheint ganz normal in deiner App-Übersicht, hat ein hochauflösendes Vektor-Icon, startet sofort offline und benötigt keine unsicheren Warnmeldungen („Apps aus unbekannten Quellen zulassen“).
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'ios' && (
                  <div className="p-3.5 rounded-xl bg-[#161820] border border-white/[0.08] space-y-3 text-xs text-zinc-300 leading-relaxed">
                    <div className="flex items-center gap-2 text-blue-400 font-semibold">
                      <Share className="w-3.5 h-3.5 shrink-0" />
                      <span>Installation unter iOS (Safari)</span>
                    </div>

                    <ol className="space-y-2 list-decimal list-inside pl-1 text-zinc-300">
                      <li>
                        Öffne die App im <strong>Safari-Browser</strong> auf deinem iPhone oder iPad.
                      </li>
                      <li>
                        Tippe unten in der Leiste auf das <strong>Teilen-Symbol</strong> (
                        <Share className="w-3.5 h-3.5 inline text-blue-400" />
                        ).
                      </li>
                      <li>
                        Scrolle etwas nach unten und wähle <strong>„Zum Home-Bildschirm“</strong>.
                      </li>
                      <li>
                        Tippe oben rechts auf <strong>Hinzufügen</strong>.
                      </li>
                    </ol>

                    <p className="text-[11px] text-zinc-400">
                      Die App startet ab sofort direkt von deinem Home-Bildschirm im Vollbild ohne die Safari-Adressleiste.
                    </p>
                  </div>
                )}

                {activeTab === 'apk' && (
                  <div className="p-3.5 rounded-xl bg-[#161820] border border-white/[0.08] space-y-3 text-xs text-zinc-300 leading-relaxed">
                    <div className="flex items-center gap-2 text-amber-400 font-semibold">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      <span>Stand-alone APK & Quellcode für Entwickler</span>
                    </div>

                    <p className="text-[11px] text-zinc-300">
                      Warum kann die APK nicht per einfachem Klick heruntergeladen werden? Weil in einer reinen Web-Laufzeitumgebung kein Android-SDK/Java-Build-Server läuft, der 2 GB große Compiler-Dateien live ausliefert.
                    </p>

                    <div className="space-y-2 text-[11px]">
                      <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 space-y-1">
                        <span className="font-semibold text-white">1. Direktes APK via PWABuilder erstellen (Kostenlos & Online):</span>
                        <p className="text-zinc-400">
                          Gehe auf{' '}
                          <a
                            href="https://www.pwabuilder.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 underline font-medium"
                          >
                            pwabuilder.com
                          </a>
                          , füge deinen App-Link ein und klicke auf <strong>„Package for Android“</strong>. Du erhältst innerhalb von 30 Sekunden ein signiertes Android APK / AAB Bundle.
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 space-y-1">
                        <span className="font-semibold text-white">2. Mit Android Studio / Capacitor bauen:</span>
                        <p className="text-zinc-400">
                          Das vollständige native Android-Projekt ist bereits in diesem Ordner angelegt: <code className="text-blue-300">/android</code>. Du kannst es direkt in Android Studio öffnen oder mit <code className="text-blue-300">npm run android:apk</code> lokal kompilieren.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/[0.08] bg-[#14161C] flex items-center justify-between gap-3 shrink-0">
              <span className="text-[11px] text-zinc-400 truncate">
                Tipp: Link kopieren und per WhatsApp/Mail an dein Smartphone senden.
              </span>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-4 py-1.5 rounded-lg bg-[#2A2E37] hover:bg-[#353A46] text-xs font-medium text-white transition-colors cursor-pointer shrink-0"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
