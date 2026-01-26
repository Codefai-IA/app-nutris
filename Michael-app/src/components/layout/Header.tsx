import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styles from './Header.module.css';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: ReactNode;
  children?: ReactNode;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  rightAction,
  children,
}: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <div className={styles.left}>
          {showBack && (
            <button className={styles.backButton} onClick={() => navigate(-1)}>
              <ChevronLeft size={24} />
            </button>
          )}
          <div>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>
        <div className={styles.right}>
          {rightAction}
          <img
            src="/logo-icon.png"
            alt="Logo"
            className={styles.logo}
          />
        </div>
      </div>
      {children && <div className={styles.content}>{children}</div>}
    </header>
  );
}
