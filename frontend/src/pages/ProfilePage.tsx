import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProfilePage() {
  const { user, isLoading, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { if (user) setName(user.name); }, [user]);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setErrorMessage(''); setNotice(''); setIsSaving(true);
    try { await updateProfile(name); setNotice('Your profile has been updated.'); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Your profile could not be updated.'); }
    finally { setIsSaving(false); }
  }

  if (isLoading) return <main role="status" className="mx-auto max-w-4xl px-5 py-20 text-center text-[#5067aa]">Loading your account…</main>;
  if (!user) return <main className="mx-auto max-w-3xl px-5 py-24 text-center"><h1 className="font-serif text-4xl">Sign in to view your account.</h1><Link to="/login" state={{ from: '/account' }} className="mt-7 inline-block underline">Sign in</Link></main>;
  return <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">Your form&field account</p><h1 className="mt-3 font-serif text-5xl">Your profile</h1><div className="mt-8 grid gap-12 md:grid-cols-[1fr_240px]"><form onSubmit={(event) => void save(event)} className="max-w-lg space-y-5"><label htmlFor="profile-name" className="block text-sm font-medium">Name<input id="profile-name" required minLength={1} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded border border-[#32457b]/20 bg-white px-4 py-3 font-normal" /></label><label htmlFor="profile-email" className="block text-sm font-medium">Email address<input id="profile-email" readOnly value={user.email} className="mt-2 w-full rounded border border-[#32457b]/10 bg-[#f8f8f8] px-4 py-3 font-normal text-[#5067aa]" /><span className="mt-1 block text-xs font-normal text-[#5067aa]">Contact support to change your email address.</span></label>{errorMessage && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{errorMessage}</p>}{notice && <p role="status" className="rounded bg-[#86a6de]/20] p-3 text-sm text-[#32457b]">{notice}</p>}<button disabled={isSaving} className="rounded-full bg-[#32457b] px-6 py-3 text-sm text-white disabled:opacity-50">{isSaving ? 'Saving…' : 'Save profile'}</button></form><aside className="h-fit border-t border-[#32457b]/10 pt-5 md:border-l md:border-t-0 md:pl-7 md:pt-0"><h2 className="font-serif text-2xl">Your orders</h2><p className="mt-2 text-sm leading-6 text-[#5067aa]">Keep up with purchases and check order status.</p><Link to="/orders" className="mt-4 inline-block text-sm underline underline-offset-4">View order history →</Link></aside></div></main>;
}
