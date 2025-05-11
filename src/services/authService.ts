import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config(); // Ensure environment variables are loaded

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

if (AUTH_ENABLED) {
  if (!ADMIN_USERNAME) {
    console.error('Error: ADMIN_USERNAME is not defined in .env file.');
    process.exit(1);
  }
  if (!ADMIN_PASSWORD) {
    console.error('Error: ADMIN_PASSWORD is not defined in .env file.');
    process.exit(1);
  }
  if (!JWT_SECRET) {
    console.error('Error: JWT_SECRET is not defined in .env file. This is required for signing tokens.');
    process.exit(1);
  }
}

interface LoginResult {
  success: boolean;
  token?: string;
  message: string;
}

export const login = (username?: string, password?: string): LoginResult => {
  if (!AUTH_ENABLED) {
    // If auth is disabled, consider any attempt as successful for access, but don't issue a token.
    // Or, you might want to always issue a "guest" token or similar if your frontend expects one.
    // For now, let's assume no token is needed if auth is off.
    return { success: true, message: 'Authentication is disabled.' };
  }

  if (!username || !password) {
    return { success: false, message: 'Username and password are required.' };
  }

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    if (!JWT_SECRET) { // Should have been caught by the initial check, but good for safety
        console.error('CRITICAL: JWT_SECRET is not available for token signing.');
        return { success: false, message: 'Server configuration error for JWT.' };
    }
    // Credentials are correct, generate a JWT
    const payload = {
      username: ADMIN_USERNAME,
      // Add other relevant user information here if needed, e.g., roles
    };
    // Token expires in 1 day (you can adjust this)
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
    return { success: true, token, message: 'Login successful.' };
  } else {
    return { success: false, message: 'Invalid username or password.' };
  }
};

export const verifyToken = (token: string): { valid: boolean; decoded?: any; error?: string } => {
  if (!AUTH_ENABLED) {
    return { valid: true, decoded: { username: 'guest_or_disabled_auth_user' } }; // Assume valid if auth is off
  }
  if (!JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET is not available for token verification.');
    return { valid: false, error: 'Server configuration error for JWT verification.' };
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, decoded };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Invalid token' };
  }
};