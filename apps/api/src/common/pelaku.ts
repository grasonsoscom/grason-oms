import type { Izin, Role, Scope, Sistem } from '@grason/shared';
import type { Request } from 'express';

export interface PelakuUser {
  tipe: 'user';
  userId: string;
  email: string;
  nama: string;
  role: Role;
  izin: readonly Izin[];
  sesiId: string;
}

export interface PelakuApiKey {
  tipe: 'api_key';
  apiKeyId: string;
  nama: string;
  sistem: Sistem;
  scopes: readonly Scope[];
}

export type Pelaku = PelakuUser | PelakuApiKey;

export interface RequestOms extends Request {
  pelaku?: Pelaku;
}

/** Kolom pelaku untuk audit_logs dan order_status_history. */
export function kolomPelaku(pelaku: Pelaku | undefined): {
  pelakuTipe: 'user' | 'api_key' | 'sistem';
  userId: string | null;
  apiKeyId: string | null;
} {
  if (!pelaku) return { pelakuTipe: 'sistem', userId: null, apiKeyId: null };
  if (pelaku.tipe === 'user') return { pelakuTipe: 'user', userId: pelaku.userId, apiKeyId: null };
  return { pelakuTipe: 'api_key', userId: null, apiKeyId: pelaku.apiKeyId };
}
