import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Input } from '../../components/ui';
import styles from './AdminLogin.module.css';

export function AdminLogin() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email.trim() || !password.trim()) {
      setError('Preencha todos os campos');
      setLoading(false);
      return;
    }

    try {
      const { error: signInError, isAdmin } = await signIn(email, password);

      if (signInError) {
        setError('Email ou senha incorretos');
        setLoading(false);
        return;
      }

      // Verificar se é admin
      if (!isAdmin) {
        setError('Acesso restrito a administradores');
        setLoading(false);
        return;
      }

      // Admin - redirecionar para painel
      navigate('/admin', { replace: true });
    } catch {
      setError('Erro ao fazer login. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <Shield size={40} strokeWidth={2} />
        </div>
        <h1 className={styles.headerTitle}>Painel Administrativo</h1>
      </div>

      <div className={styles.formCard}>
        <h2 className={styles.title}>Acesso Admin</h2>
        <p className={styles.subtitle}>Entre com suas credenciais de administrador</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <Input
            type="email"
            placeholder="admin@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail size={20} />}
            autoComplete="email"
            required
          />

          <div className={styles.passwordWrapper}>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock size={20} />}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className={styles.togglePassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" fullWidth loading={loading}>
            Entrar como Admin
          </Button>
        </form>

        <div className={styles.footer}>
          <Link to="/login" className={styles.backLink}>
            Voltar para login de alunos
          </Link>
        </div>
      </div>
    </div>
  );
}
