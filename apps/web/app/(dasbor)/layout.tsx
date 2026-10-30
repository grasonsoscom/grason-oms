import type { ReactNode } from 'react';
import { Sesi } from '@/components/sesi';

export default function LayoutDasbor({ children }: { children: ReactNode }) {
  return <Sesi>{children}</Sesi>;
}
