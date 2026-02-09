import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './SplashScreen.module.css';

export function SplashScreen() {
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();
  const { settings } = useTheme();

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

  const logoUrl = settings?.logo_main_url || '/logo.jpeg';
  const appName = settings?.app_name || 'MICHAEL CEZAR';
  const appDescription = settings?.app_description || 'NUTRICIONISTA';

  return (
    <div className={styles.container}>
      <img src={logoUrl} alt="Logo" className={styles.logo} />
      <h1 className={styles.title}>{appName.toUpperCase()}</h1>
      <p className={styles.subtitle}>{appDescription.toUpperCase()}</p>
    </div>
  );
}
