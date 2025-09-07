// Database types for MongoDB collections

export interface TraderDocument {
  _id: string; // email as id
  name: string;
  email: string;
  wallet: string;
  phone?: string | null;
  twitter?: string | null;
  discord?: string | null;
  role: 'trader';
  createdAt: Date;
  updatedAt: Date;
}

export interface InvestorDocument {
  _id: string; // email as id
  name: string;
  email: string;
  wallet: string;
  phone?: string | null;
  twitter?: string | null;
  discord?: string | null;
  role: 'investor';
  createdAt: Date;
  updatedAt: Date;
}

export type WaitlistDocument = TraderDocument | InvestorDocument;

export interface WaitlistRequest {
  email: string;
  role: 'trader' | 'investor';
}

export interface WaitlistResponse {
  success: boolean;
  message?: string;
  error?: string;
  id?: string;
}
