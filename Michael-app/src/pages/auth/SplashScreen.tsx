import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './SplashScreen.module.css';

export function SplashScreen() {
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();

  useEffect(() => {
    // Só redireciona quando o loading terminar
    if (loading) return;

    // Pequeno delay para mostrar a splash
    const timer = setTimeout(() => {
      if (user) {
        if (isAdmin) {
          navigate('/admin', { replace: true });
        } else {
          navigate('/app', { replace: true });
        }
      } else {
        navigate('/login', { replace: true });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [user, loading, isAdmin, navigate]);

  return (
    <div className={styles.container}>
      <img src="/logo.jpeg" alt="Logo" className={styles.logo} />
      <h1 className={styles.title}>MICHAEL CEZAR</h1>
      <p className={styles.subtitle}>NUTRICIONISTA</p>
    </div>
  );
}
