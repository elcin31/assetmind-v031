import { useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import './LoginScreen.css';

type OAuthProvider = 'apple' | 'google';
type AuthPhase = 'email' | 'otp' | 'success';

export interface LoginScreenProps {
  onRequestOtp?: (email: string) => Promise<void>;
  onVerifyOtp?: (email: string, code: string) => Promise<void>;
  onResendOtp?: (email: string) => Promise<void>;
  onOAuth?: (provider: OAuthProvider) => Promise<void>;
  onSuccess?: () => void;
}

const OTP_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function providerLabel(provider: OAuthProvider) {
  return provider === 'apple' ? 'Apple' : 'Google';
}

export function LoginScreen({
  onRequestOtp,
  onVerifyOtp,
  onResendOtp,
  onOAuth,
  onSuccess,
}: LoginScreenProps) {
  const [phase, setPhase] = useState<AuthPhase>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(() => Array<string>(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [otpInvalid, setOtpInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const normalizedEmail = useMemo(() => email.trim(), [email]);
  const otpCode = useMemo(() => otp.join(''), [otp]);
  const busy = loading || resending || oauthLoading !== null;

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setEmailInvalid(false);

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setEmailInvalid(true);
      setError('Enter a valid email address.');
      return;
    }

    if (!onRequestOtp) {
      setError('Email sign-in is not connected yet.');
      return;
    }

    setLoading(true);
    try {
      await onRequestOtp(normalizedEmail);
      setOtp(Array<string>(OTP_LENGTH).fill(''));
      setOtpInvalid(false);
      setPhase('otp');
      requestAnimationFrame(() => otpRefs.current[0]?.focus());
    } catch {
      setError('We could not send a code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setError(null);

    if (!onOAuth) {
      setError(`${providerLabel(provider)} sign-in is not connected yet.`);
      return;
    }

    setOauthLoading(provider);
    try {
      await onOAuth(provider);
    } catch {
      setError(`${providerLabel(provider)} sign-in could not be started. Please try again.`);
    } finally {
      setOauthLoading(null);
    }
  };

  const writeOtpDigits = (startIndex: number, rawValue: string) => {
    const digits = rawValue.replace(/\D/g, '').slice(0, OTP_LENGTH - startIndex);
    if (!digits) {
      setOtp((current) => {
        const next = [...current];
        next[startIndex] = '';
        return next;
      });
      return;
    }

    setOtp((current) => {
      const next = [...current];
      digits.split('').forEach((digit, offset) => {
        next[startIndex + offset] = digit;
      });
      return next;
    });
    setOtpInvalid(false);
    setError(null);

    const nextIndex = Math.min(startIndex + digits.length, OTP_LENGTH - 1);
    otpRefs.current[nextIndex]?.focus();
  };

  const handleOtpKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      otpRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      event.preventDefault();
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setOtpInvalid(false);

    if (otpCode.length !== OTP_LENGTH) {
      setOtpInvalid(true);
      setError('Enter the 6-digit code.');
      return;
    }

    if (!onVerifyOtp) {
      setError('Code verification is not connected yet.');
      return;
    }

    setLoading(true);
    try {
      await onVerifyOtp(normalizedEmail, otpCode);
      setPhase('success');
      onSuccess?.();
    } catch {
      setOtpInvalid(true);
      setError('That code could not be verified. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setOtpInvalid(false);

    if (!onResendOtp) {
      setError('Resending is not connected yet.');
      return;
    }

    setResending(true);
    try {
      await onResendOtp(normalizedEmail);
      setOtp(Array<string>(OTP_LENGTH).fill(''));
      requestAnimationFrame(() => otpRefs.current[0]?.focus());
    } catch {
      setError('We could not resend the code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const backToEmail = () => {
    setPhase('email');
    setOtp(Array<string>(OTP_LENGTH).fill(''));
    setOtpInvalid(false);
    setError(null);
  };

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand" aria-label="AssetMind">
          <span className="login-brand-mark" aria-hidden="true">A</span>
          <span className="login-brand-name">ASSETMIND</span>
          <span className="login-brand-subtitle">Investment Intelligence</span>
        </div>

        {phase === 'email' && (
          <div className="login-panel login-panel-enter">
            <h1 id="login-title" className="login-heading">Sign in</h1>

            <div className="login-provider-stack" aria-label="Social sign in">
              <button
                type="button"
                className="login-provider login-provider-apple"
                onClick={() => void handleOAuth('apple')}
                disabled={busy}
                aria-busy={oauthLoading === 'apple'}
              >
                <span className="login-provider-icon login-provider-icon-apple" aria-hidden="true"></span>
                <span>{oauthLoading === 'apple' ? 'Connecting…' : 'Continue with Apple'}</span>
              </button>

              <button
                type="button"
                className="login-provider login-provider-google"
                onClick={() => void handleOAuth('google')}
                disabled={busy}
                aria-busy={oauthLoading === 'google'}
              >
                <span className="login-provider-icon login-provider-icon-google" aria-hidden="true">G</span>
                <span>{oauthLoading === 'google' ? 'Connecting…' : 'Continue with Google'}</span>
              </button>
            </div>

            <div className="login-divider" aria-hidden="true"><span>or</span></div>

            <form className="login-form" onSubmit={(event) => void handleEmailSubmit(event)} noValidate>
              <div className="login-field">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className={`login-input${emailInvalid ? ' login-input-invalid' : ''}`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailInvalid(false);
                    setError(null);
                  }}
                  aria-invalid={emailInvalid}
                  aria-describedby={error ? 'login-error' : undefined}
                  placeholder="Email"
                  disabled={busy}
                />
              </div>

              <button
                type="submit"
                className="login-continue"
                disabled={busy || !normalizedEmail}
                aria-busy={loading}
              >
                {loading ? <span className="login-spinner" aria-hidden="true" /> : null}
                <span>{loading ? 'Sending code…' : 'Continue'}</span>
              </button>
            </form>

            <p className="login-password-note">No passwords.</p>
          </div>
        )}

        {phase === 'otp' && (
          <div className="login-panel login-panel-enter">
            <button type="button" className="login-back" onClick={backToEmail} disabled={busy} aria-label="Back to email">
              <span aria-hidden="true">‹</span>
              <span>Back</span>
            </button>

            <div className="login-otp-copy">
              <h1 id="login-title" className="login-heading">Check your email</h1>
              <p>Code sent to:</p>
              <strong>{normalizedEmail}</strong>
            </div>

            <form className="login-form" onSubmit={(event) => void handleVerify(event)}>
              <div className={`login-otp${otpInvalid ? ' login-otp-invalid' : ''}`} role="group" aria-label="6-digit verification code">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(node) => { otpRefs.current[index] = node; }}
                    className="login-otp-cell"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    value={digit}
                    onChange={(event) => writeOtpDigits(index, event.target.value)}
                    onKeyDown={(event) => handleOtpKeyDown(event, index)}
                    onPaste={(event) => {
                      event.preventDefault();
                      writeOtpDigits(index, event.clipboardData.getData('text'));
                    }}
                    aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                    aria-invalid={otpInvalid}
                    disabled={busy}
                  />
                ))}
              </div>

              <button
                type="submit"
                className="login-continue"
                disabled={busy || otpCode.length !== OTP_LENGTH}
                aria-busy={loading}
              >
                {loading ? <span className="login-spinner" aria-hidden="true" /> : null}
                <span>{loading ? 'Verifying…' : 'Continue'}</span>
              </button>
            </form>

            <button type="button" className="login-resend" onClick={() => void handleResend()} disabled={busy}>
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          </div>
        )}

        {phase === 'success' && (
          <div className="login-panel login-panel-enter login-success" role="status" aria-live="polite">
            <span className="login-success-icon" aria-hidden="true">✓</span>
            <h1 id="login-title" className="login-heading">Signed in</h1>
            <p>Opening AssetMind…</p>
          </div>
        )}

        {error && (
          <p id="login-error" className="login-error" role="alert" aria-live="assertive">
            {error}
          </p>
        )}

        <p className="login-security">Private. Secure.</p>
      </section>
    </main>
  );
}
