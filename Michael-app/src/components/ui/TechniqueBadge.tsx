import { useState } from 'react';
import { X } from 'lucide-react';
import { getTechniqueById, type TrainingTechnique } from '../../constants/trainingTechniques';
import styles from './TechniqueBadge.module.css';

interface TechniqueBadgeProps {
  techniqueId: string | null;
  effortParameterId: string | null;
}

interface TechniquePopupProps {
  technique: TrainingTechnique;
  onClose: () => void;
}

function TechniquePopup({ technique, onClose }: TechniquePopupProps) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <span className={styles.modalIcon}>
              {technique.category === 'tecnica' ? '🎯' : '💪'}
            </span>
            <h3>{technique.name}</h3>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.categoryBadge}>
          <span className={technique.category === 'tecnica' ? styles.techCategory : styles.effortCategory}>
            {technique.category === 'tecnica' ? 'Tecnica de Treino' : 'Parametro de Esforco'}
          </span>
        </div>

        <div className={styles.descriptionBox}>
          <p>{technique.description}</p>
        </div>

        <button className={styles.confirmButton} onClick={onClose}>
          Entendi
        </button>
      </div>
    </div>
  );
}

export function TechniqueBadge({ techniqueId, effortParameterId }: TechniqueBadgeProps) {
  const [showPopup, setShowPopup] = useState(false);
  const [selectedTechnique, setSelectedTechnique] = useState<TrainingTechnique | null>(null);

  const technique = techniqueId ? getTechniqueById(techniqueId) : null;
  const effort = effortParameterId ? getTechniqueById(effortParameterId) : null;

  const handleBadgeClick = (tech: TrainingTechnique) => {
    setSelectedTechnique(tech);
    setShowPopup(true);
  };

  const handleClose = () => {
    setShowPopup(false);
    setSelectedTechnique(null);
  };

  if (!technique && !effort) return null;

  return (
    <>
      <div className={styles.badgeContainer}>
        {technique && (
          <button
            className={styles.techBadge}
            onClick={(e) => {
              e.stopPropagation();
              handleBadgeClick(technique);
            }}
          >
            🎯 {technique.name}
          </button>
        )}
        {effort && (
          <button
            className={styles.effortBadge}
            onClick={(e) => {
              e.stopPropagation();
              handleBadgeClick(effort);
            }}
          >
            💪 {effort.name}
          </button>
        )}
      </div>

      {showPopup && selectedTechnique && (
        <TechniquePopup technique={selectedTechnique} onClose={handleClose} />
      )}
    </>
  );
}
