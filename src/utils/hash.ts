/**
 * Password hashing utilities using bcryptjs
 */

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password
 */
export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, SALT_ROUNDS);

/**
 * Compare a plaintext password with a hash
 */
export const comparePassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);
