import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      if (isRegister) await register(name, email, password);
      else await login(email, password);
      const destination = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(destination, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-[65vh] max-w-6xl items-center gap-12 px-5 py-12 md:grid-cols-2 sm:px-8">
      <div className="hidden min-h-500px items-end bg-[#86a6de]/20 bg-cover bg-center p-9 md:flex" style={{ backgroundImage: "linear-gradient(0deg, rgba(50,69,123,.55), transparent 65%), url('https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1100&q=80')" }}>
        <p className="max-w-sm font-serif text-3xl leading-snug text-white">“The things we keep should make the everyday feel a little more special.”</p>
      </div>
      <div className="mx-auto w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">Welcome to form&field</p>
        <h1 className="mt-3 font-serif text-4xl">{isRegister ? 'Create your account' : 'Good to have you back.'}</h1>
        <p className="mt-3 text-sm leading-6 text-[#5067aa]">{isRegister ? 'Save your favorites and keep track of your orders.' : 'Sign in to pick up right where you left off.'}</p>
        <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          {isRegister && <label className="block text-sm font-medium" htmlFor="name">Full name<input id="name" autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal outline-none focus:border-[#5067aa]" /></label>}
          <label className="block text-sm font-medium" htmlFor="email">Email address<input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal outline-none focus:border-[#5067aa]" /></label>
          <label className="block text-sm font-medium" htmlFor="password">Password<input id="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal outline-none focus:border-[#5067aa]" /><span className="mt-1 block text-xs font-normal text-[#5067aa]">At least 8 characters</span></label>
          {errorMessage && <p role="alert" className="rounded bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>}
          <button disabled={isSubmitting} className="w-full rounded-full bg-[#32457b] px-6 py-3.5 text-sm font-medium text-white transition hover:bg-[#5067aa] disabled:cursor-wait disabled:opacity-60">
            {isSubmitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[#5067aa]">
          {isRegister ? 'Already have an account?' : 'New to form&field?'}{' '}
          <Link className="font-medium text-[#32457b] underline underline-offset-4" to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link>
        </p>
      </div>
    </main>
  );
}
