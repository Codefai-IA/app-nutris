import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button, Input } from '../../components/ui';
import styles from './Login.module.css';

export function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
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

      // Se for admin, redireciona para login de admin
      if (isAdmin) {
        setError('Use o painel administrativo para fazer login');
        setLoading(false);
        return;
      }

      // Aluno - redirecionar para app
      navigate('/app', { replace: true });
    } catch {
      setError('Erro ao fazer login. Tente novamente.');
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError('');
    setSuccessMessage('');

    if (!email.trim()) {
      setError('Digite seu email para recuperar a senha');
      return;
    }

    setResetLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (resetError) {
        setError('Erro ao enviar email de recuperacao. Tente novamente.');
      } else {
        setSuccessMessage('Email de recuperacao enviado! Verifique sua caixa de entrada.');
      }
    } catch {
      setError('Erro ao enviar email de recuperacao. Tente novamente.');
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <img src="/logo-icon.png" alt="Logo" className={styles.logoText} />
        </div>
      </div>

      <div className={styles.formCard}>
        <h1 className={styles.title}>Bem-vindo</h1>
        <p className={styles.subtitle}>Entre com suas credenciais para continuar</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <Input
            type="email"
            placeholder="seu@email.com"
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
          {successMessage && <p className={styles.success}>{successMessage}</p>}

          <Button type="submit" fullWidth loading={loading}>
            Entrar
          </Button>

          <button
            type="button"
            className={styles.forgotPassword}
            onClick={handleForgotPassword}
            disabled={resetLoading}
          >
            {resetLoading ? 'Enviando...' : 'Esqueci minha senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
