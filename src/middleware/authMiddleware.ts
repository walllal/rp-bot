import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { verifyToken } from '../services/authService';
import dotenv from 'dotenv';

dotenv.config();

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

// Define a type for the user object that will be attached to the request
export interface AuthenticatedUser {
  username: string;
  // Add other properties from your JWT payload if needed
}

// Extend FastifyRequest to include the user property
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export const authMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
) => {
  if (!AUTH_ENABLED) {
    // If authentication is disabled, skip all checks
    return done();
  }

  // Allow access to login and static files without a token
  // The login route itself should not be protected by this middleware.
  // Static files are typically served before hooks like onRequest run for them,
  // or their paths can be explicitly excluded.
  // We will exclude /api/auth/login and the new /login.html page.
  // Other public assets under / are handled by fastify-static.
  if (request.url.startsWith('/api/auth/login') || request.url === '/login') {
    return done();
  }
  
  // For all other /api/ routes, require authentication
  if (request.url.startsWith('/api/')) {
    let token: string | undefined = undefined;
    const authHeader = request.headers.authorization;

    // 1. Try getting token from Authorization header
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove "Bearer " prefix
    }

    // 2. If not in header, try getting token from query parameter (for SSE etc.)
    // Ensure request.query is treated as an object
    const query = request.query as { [key: string]: string };
    if (!token && query && query.token) {
      token = query.token;
    }

    // 3. If token is still not found, deny access
    if (!token) {
      reply.status(401).send({ success: false, message: 'Unauthorized: No token provided.' });
      return; // Important: stop further processing
    }

    // 4. Verify the found token
    const verificationResult = verifyToken(token);

    if (verificationResult.valid && verificationResult.decoded) {
      request.user = verificationResult.decoded as AuthenticatedUser; // Attach user to request
      done(); // Token is valid, proceed
    } else {
      reply.status(401).send({ success: false, message: verificationResult.error || 'Unauthorized: Invalid token.' });
      return; // Important: stop further processing
    }
  } else {
    // For non-/api/ routes (e.g. serving index.html, other static assets), allow access
    // This middleware primarily targets API protection.
    // Frontend routing/redirection will handle UI access control.
    done();
  }
};