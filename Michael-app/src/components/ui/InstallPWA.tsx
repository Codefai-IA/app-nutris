import { useState, useEffect } from 'react';
import styles from './InstallPWA.module.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPWAProps {
  isAuthenticated: boolean;
}

export function InstallPWA({ isAuthenticated }: InstallPWAProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Check if iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    // Listen for install prompt (Android/Desktop)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // Show modal only after authentication
  useEffect(() => {
    if (!isAuthenticated) return;
    if (isStandalone) return;

    // Check if user already dismissed or installed
    const installStatus = localStorage.getItem('pwa-install-status');
    if (installStatus === 'installed' || installStatus === 'dismissed') {
      const dismissedAt = localStorage.getItem('pwa-install-dismissed-at');
      // Show again after 30 days if dismissed
      if (dismissedAt && Date.now() - parseInt(dismissedAt) < 30 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // Delay showing modal for better UX (let user see the app first)
    const timer = setTimeout(() => {
      if (installPrompt || isIOS) {
        setShowInstallModal(true);
      }
    }, 2000); // Show after 2 seconds

    return () => clearTimeout(timer);
  }, [isAuthenticated, installPrompt, isIOS, isStandalone]);

  const handleInstall = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      localStorage.setItem('pwa-install-status', 'installed');
      console.log('App installed successfully');
    }

    setInstallPrompt(null);
    setShowInstallModal(false);
  };

  const handleDismiss = () => {
    setShowInstallModal(false);
    localStorage.setItem('pwa-install-status', 'dismissed');
    localStorage.setItem('pwa-install-dismissed-at', Date.now().toString());
  };

  const handleLater = () => {
    setShowInstallModal(false);
    // Will show again next session
  };

  // Don't render if not authenticated, already installed, or modal not triggered
  if (!isAuthenticated || isStandalone || !showInstallModal) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>

        {/* App Icon */}
        <div className={styles.iconContainer}>
          <div className={styles.iconWrapper}>
            <img
              src="/logo.jpeg"
              alt="MC Nutri"
              className={styles.icon}
            />
          </div>
        </div>

        {/* Title */}
        <h2 className={styles.title}>
          Instalar MC Nutri
        </h2>

        {/* Description */}
        <p className={styles.description}>
          Instale o app no seu celular para uma experiência melhor com acesso rápido e notificações.
        </p>

        {/* Benefits */}
        <div className={styles.benefits}>
          <div className={styles.benefitItem}>
            <span className={styles.checkIcon}>✓</span>
            <span>Acesso rápido pela tela inicial</span>
          </div>
          <div className={styles.benefitItem}>
            <span className={styles.checkIcon}>✓</span>
            <span>Funciona mesmo offline</span>
          </div>
          <div className={styles.benefitItem}>
            <span className={styles.checkIcon}>✓</span>
            <span>Experiência de app nativo</span>
          </div>
        </div>

        {/* iOS Instructions */}
        {isIOS ? (
          <div className={styles.iosInstructions}>
            <p className={styles.iosTitle}>
              Para instalar no iPhone/iPad:
            </p>
            <div className={styles.iosStep}>
              <span>1. Toque em</span>
              <svg className={styles.shareIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>(Compartilhar)</span>
            </div>
            <p className={styles.iosStep2}>
              2. Role e toque em <strong>"Adicionar à Tela Inicial"</strong>
            </p>
          </div>
        ) : (
          /* Android/Desktop Install Button */
          <button
            onClick={handleInstall}
            className={styles.installButton}
          >
            Instalar Agora
          </button>
        )}

        {/* Secondary Actions */}
        <div className={styles.secondaryActions}>
          <button
            onClick={handleLater}
            className={styles.laterButton}
          >
            Depois
          </button>
          <button
            onClick={handleDismiss}
            className={styles.dismissButton}
          >
            Não mostrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default InstallPWA;
