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
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ success: false, message: 'Unauthorized: No token provided.' });
      return; // Important: stop further processing
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
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