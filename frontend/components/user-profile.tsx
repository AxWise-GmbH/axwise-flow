'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function UserProfile(): JSX.Element {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-yellow-600 dark:text-yellow-400">OSS Mode</span>
      <Link href="/unified-dashboard">
        <Button variant="outline" size="sm">
          Dashboard
        </Button>
      </Link>
    </div>
  );
}
