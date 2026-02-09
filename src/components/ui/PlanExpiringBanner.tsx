import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import styles from './PlanExpiringBanner.module.css';

interface PlanExpiringBannerProps {
  daysRemaining: number;
}

export function PlanExpiringBanner({ daysRemaining }: PlanExpiringBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [checkoutSlug, setCheckoutSlug] = useState<string | null>(null);

  // Try to find checkout link
  useEffect(() => {
    async function findCheckoutLink() {
      try {
        const { data } = await supabase
          .from('payment_settings')
          .select('checkout_slug')
          .neq('active_gateway', 'none')
          .not('checkout_slug', 'is', null)
          .limit(1)
          .maybeSingle();

        if (data?.checkout_slug) {
          setCheckoutSlug(data.checkout_slug);
        }
      } catch (err) {
        console.error('Error finding checkout:', err);
      }
    }
    findCheckoutLink();
  }, []);

  if (dismissed) return null;

  return (
    <div className={styles.banner}>
      <span className={styles.message}>
        Seu plano expira em {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}!
        {checkoutSlug ? (
          <a href={`/checkout/${checkoutSlug}`} className={styles.renewLink}>
            Renovar agora
          </a>
        ) : (
          ' Entre em contato para renovar.'
        )}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className={styles.closeButton}
        aria-label="Fechar"
      >
        <X size={16} />
      </button>
    </div>
  );
}
