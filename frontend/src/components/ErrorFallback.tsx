import type { FallbackProps } from 'react-error-boundary';

export function ErrorFallback({ resetErrorBoundary }: FallbackProps) {
  return <main role="alert" className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-5 text-center">
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5067aa]">A moment of pause</p>
    <h1 className="mt-3 font-serif text-4xl">This page ran into a problem.</h1>
    <p className="mt-3 text-sm text-[#5067aa]">Try the page again. Your account and order data remain safely stored.</p>
    <button onClick={resetErrorBoundary} className="mt-7 rounded-full bg-[#32457b] px-6 py-3 text-sm text-white">Try again</button>
  </main>;
}
