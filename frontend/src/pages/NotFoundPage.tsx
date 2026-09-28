import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-5 text-center"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">404 · Page not found</p><h1 className="mt-3 font-serif text-5xl">This page wandered off.</h1><p className="mt-4 text-sm text-[#5067aa]">Let’s get you back to something useful.</p><Link to="/" className="mt-7 rounded-full bg-[#32457b] px-7 py-3 text-sm text-white">Back to home</Link></main>;
}
