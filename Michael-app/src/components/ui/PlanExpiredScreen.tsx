import { useNavigate } from 'react-router-dom';
import { Utensils, Dumbbell, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import styles from './PlanExpiredScreen.module.css';

// Retorna a data atual no fuso horário de Brasília
function getBrasiliaDate(): string {
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brasiliaTime = new Date(utc + (brasiliaOffset * 60000));
  return brasiliaTime.toISOString().split('T')[0];
}

interface PlanExpiredScreenProps {
  planEndDate: string;
  nutritionistWhatsapp?: string;
  startingWeight?: number | null;
  currentWeight?: number | null;
  goalWeight?: number | null;
}

function getProgressMessage(
  startingWeight?: number | null,
  currentWeight?: number | null,
  goalWeight?: number | null
): { message: string; emoji: string } | null {
  if (!startingWeight || !currentWeight) return null;

  const diff = startingWeight - currentWeight;
  const absDiff = Math.abs(diff);

  // Less than 0.5kg change - no significant progress
  if (absDiff < 0.5) {
    return {
      message: 'Você está no caminho certo! Continue sua jornada.',
      emoji: '\uD83D\uDCAA'
    };
  }

  // Lost weight
  if (diff > 0) {
    return {
      message: `Você já perdeu ${absDiff.toFixed(1).replace('.', ',')}kg! Continue sua jornada.`,
      emoji: '\uD83C\uDF89'
    };
  }

  // Gained weight - check if goal is to gain (goal > starting)
  if (diff < 0) {
    const isGainGoal = goalWeight && goalWeight > startingWeight;
    if (isGainGoal) {
      return {
        message: `Você já ganhou ${absDiff.toFixed(1).replace('.', ',')}kg de massa! Continue sua jornada.`,
        emoji: '\uD83D\uDCAA'
      };
    } else {
      // Gained but goal was to lose - still encourage
      return {
        message: 'Não desista! Renovar o plano é a chave para alcançar seus objetivos.',
        emoji: '\uD83D\uDE4C'
      };
    }
  }

  return null;
}

export function PlanExpiredScreen({ planEndDate, nutritionistWhatsapp, startingWeight, currentWeight, goalWeight }: PlanExpiredScreenProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const daysSinceExpired = Math.abs(
    Math.ceil(
      (new Date(getBrasiliaDate()).getTime() - new Date(planEndDate).getTime()) / (1000 * 60 * 60 * 24)
    )
  );

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const whatsappNumber = nutritionistWhatsapp || '5511965293803';
  const whatsappMessage = encodeURIComponent('Olá! Gostaria de renovar meu plano nutricional.');
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  const progressInfo = getProgressMessage(startingWeight, currentWeight, goalWeight);

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        {/* Custom Icon at Top */}
        <img src="/expired-icon.png" alt="" className={styles.expiredIcon} />

        {/* Title */}
        <h1 className={styles.title}>Seu Plano Expirou</h1>

        {/* Progress Message - Under the icon/title */}
        {progressInfo && (
          <div className={styles.progressBox}>
            <p className={styles.progressMessage}>{progressInfo.message}</p>
            {startingWeight && currentWeight && (
              <p className={styles.progressWeights}>
                {startingWeight.toFixed(1).replace('.', ',')}kg → {currentWeight.toFixed(1).replace('.', ',')}kg
              </p>
            )}
          </div>
        )}

        {/* Expiry Info */}
        <p className={styles.expiryInfo}>
          Seu plano terminou{' '}
          {daysSinceExpired === 1 ? 'há 1 dia' : `há ${daysSinceExpired} dias`}
          <br />
          <span className={styles.expiryDate}>
            ({new Date(planEndDate).toLocaleDateString('pt-BR')})
          </span>
        </p>

        {/* Warning Message */}
        <div className={styles.messageBox}>
          <p>
            Não perca seu progresso! Renove agora para continuar acompanhando sua evolução.
          </p>
        </div>

        {/* What's Blocked */}
        <div className={styles.blockedSection}>
          <p className={styles.blockedLabel}>Acesso bloqueado:</p>
          <div className={styles.blockedIcons}>
            <div className={styles.blockedItem}>
              <div className={styles.blockedIcon}>
                <Utensils size={20} />
              </div>
              <span>Dieta</span>
            </div>
            <div className={styles.blockedItem}>
              <div className={styles.blockedIcon}>
                <Dumbbell size={20} />
              </div>
              <span>Treino</span>
            </div>
            <div className={styles.blockedItem}>
              <div className={styles.blockedIcon}>
                <TrendingUp size={20} />
              </div>
              <span>Progresso</span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.whatsappButton}
        >
          Renovar Agora
        </a>

        {/* Secondary Text */}
        <p className={styles.secondaryText}>
          Não deixe todo seu esforço ir embora
        </p>

        {/* Logout Option */}
        <button onClick={handleLogout} className={styles.logoutButton}>
          Sair da conta
        </button>
      </div>
    </div>
  );
}
