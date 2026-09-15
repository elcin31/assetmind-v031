import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import './LoginScreen.css';

type LoginMode = 'signin' | 'signup' | 'forgot';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AuthLoadingScreen() {
  return (
    <main className="login-shell login-loading-shell" aria-busy="true" aria-label="Checking session">
      <div className="login-loading-card" role="status" aria-live="polite">
        <span className="login-brand-mark" aria-hidden="true">
          <img src="/favicon.svg" alt="" width="28" height="28" />
        </span>
        <span className="login-brand-name">ASSETMIND</span>
        <span className="login-loader" aria-hidden="true" />
        <span className="login-loading-text">Securing your session…</span>
      </div>
    </main>
  );
}

export function LoginScreen() {
  const {
    recoveryMode,
    configurationError,
    startupError,
    signIn,
    signUp,
    resetPassword,
    updatePassword,
  } = useAuth();
  const [mode, setMode] = useState<LoginMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const normalizedEmail = email.trim();
  const activeMode = recoveryMode ? 'recovery' : mode;
  const disabled = busy || Boolean(configurationError);

  const resetFeedback = () => {
    setError(null);
    setNotice(null);
  };

  const switchMode = (nextMode: LoginMode) => {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    resetFeedback();
  };

  const validateEmail = () => {
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return false;
    }
    return true;
  };

  const validateNewPassword = () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    if (activeMode === 'recovery') {
      if (!validateNewPassword()) return;
      setBusy(true);
      try {
        await updatePassword(password);
      } catch (authError) {
        setError(messageFromError(authError, 'Could not update your password.'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!validateEmail()) return;

    if (activeMode === 'forgot') {
      setBusy(true);
      try {
        await resetPassword(normalizedEmail);
        setNotice('Check your email for a password reset link.');
      } catch (authError) {
        setError(messageFromError(authError, 'Could not send the recovery email.'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (activeMode === 'signup' && !validateNewPassword()) return;
    if (activeMode === 'signin' && !password) {
      setError('Enter your password.');
      return;
    }

    setBusy(true);
    try {
      if (activeMode === 'signup') {
        const result = await signUp(normalizedEmail, password);
        if (result.requiresEmailConfirmation) {
          setMode('signin');
          setPassword('');
          setConfirmPassword('');
          setNotice('Check your email to confirm your account.');
        }
      } else {
        await signIn(normalizedEmail, password);
      }
    } catch (authError) {
      setError(messageFromError(authError, activeMode === 'signup' ? 'Could not create the account.' : 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  };

  const heading = activeMode === 'signup'
    ? 'Create account'
    : activeMode === 'forgot'
      ? 'Reset password'
      : activeMode === 'recovery'
        ? 'Choose a new password'
        : 'Sign in';

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand" aria-label="AssetMind">
          <span className="login-brand-mark" aria-hidden="true">
            <img src="/favicon.svg" alt="" width="28" height="28" />
          </span>
          <span className="login-brand-name">ASSETMIND</span>
          <span className="login-brand-subtitle">Investment Intelligence</span>
        </div>

        <div className="login-panel login-panel-enter">
          <h1 id="login-title" className="login-heading">{heading}</h1>

          {activeMode === 'forgot' && (
            <p className="login-intro">Enter the email connected to your account.</p>
          )}
          {activeMode === 'recovery' && (
            <p className="login-intro">Set a new password for your AssetMind account.</p>
          )}

          <form className="login-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            {activeMode !== 'recovery' && (
              <div className="login-field">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className="login-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); resetFeedback(); }}
                  placeholder="Email"
                  disabled={disabled}
                  required
                />
              </div>
            )}

            {activeMode !== 'forgot' && (
              <div className="login-field">
                <label htmlFor="login-password">{activeMode === 'recovery' ? 'New password' : 'Password'}</label>
                <div className="login-password-wrap">
                  <input
                    id="login-password"
                    className="login-input login-password-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={activeMode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); resetFeedback(); }}
                    placeholder={activeMode === 'recovery' ? 'New password' : 'Password'}
                    disabled={disabled}
                    required
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    disabled={disabled}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}

            {(activeMode === 'signup' || activeMode === 'recovery') && (
              <div className="login-field">
                <label htmlFor="login-confirm-password">Confirm password</label>
                <input
                  id="login-confirm-password"
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => { setConfirmPassword(event.target.value); resetFeedback(); }}
                  placeholder="Confirm password"
                  disabled={disabled}
                  required
                />
              </div>
            )}

            <button type="submit" className="login-continue" disabled={disabled} aria-busy={busy}>
              {busy && <span className="login-spinner" aria-hidden="true" />}
              <span>{busy ? 'Please wait…' : activeMode === 'signup' ? 'Create account' : activeMode === 'forgot' ? 'Send reset link' : activeMode === 'recovery' ? 'Update password' : 'Continue'}</span>
            </button>
          </form>

          {activeMode === 'signin' && (
            <div className="login-secondary-actions">
              <button type="button" className="login-link" onClick={() => switchMode('forgot')} disabled={disabled}>Forgot password?</button>
              <p>New to AssetMind? <button type="button" className="login-link" onClick={() => switchMode('signup')} disabled={disabled}>Create account</button></p>
            </div>
          )}

          {activeMode === 'signup' && (
            <p className="login-secondary-actions">Already have an account? <button type="button" className="login-link" onClick={() => switchMode('signin')} disabled={disabled}>Sign in</button></p>
          )}

          {activeMode === 'forgot' && (
            <button type="button" className="login-back-link" onClick={() => switchMode('signin')} disabled={disabled}>Back to sign in</button>
          )}
        </div>

        {(configurationError || error || startupError) && (
          <p className="login-error" role="alert" aria-live="assertive">
            {configurationError ?? error ?? startupError}
          </p>
        )}
        {notice && <p className="login-notice" role="status" aria-live="polite">{notice}</p>}

        <p className="login-security">Private. Secure.</p>
      </section>
    </main>
  );
}
