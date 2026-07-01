// AUTO-GENERATED owner directory + credentials (seed). Editable at runtime via localStorage overrides.
// One source of truth for all owner IDs and passwords.
export interface Owner {
  id: string;
  name: string;
  phone: string;
  role: 'Owner' | 'Manager' | 'Unassigned';
  username: string;
  password: string;
  propertyIds: string[];
  email?: string;
  notes?: string;
}

export const OWNERS_SEED: Owner[] = [];
