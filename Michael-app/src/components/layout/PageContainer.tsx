import type { ReactNode } from 'react';
import styles from './PageContainer.module.css';

interface PageContainerProps {
  children: ReactNode;
  hasBottomNav?: boolean;
  className?: string;
}

export function PageContainer({
  children,
  hasBottomNav = true,
  className = '',
}: PageContainerProps) {
  return (
    <div
      className={`${styles.container} ${hasBottomNav ? styles.withNav : ''} ${className}`}
    >
      {children}
    </div>
  );
}
