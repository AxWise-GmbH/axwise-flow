'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function UseCasesPage(): React.JSX.Element {
  useEffect(() => {
    window.location.replace('/#use-cases');
  }, []);

  return (
    <main className="min-h-[50vh] flex items-center justify-center px-6">
      <p className="text-sm text-stone-600">
        Opening the current <Link href="/#use-cases" className="font-semibold underline">AxWise use cases</Link>…
      </p>
    </main>
  );
}
