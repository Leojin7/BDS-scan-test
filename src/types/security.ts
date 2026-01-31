// src/types/security.ts
export interface Vulnerability {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  // Add other relevant fields
}

export interface ScanResult {
  vulnerabilities: Vulnerability[];
  // Add other scan result fields
}