import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { login } from '../services/authService';
import dotenv from 'dotenv';

dotenv.config();

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

interface LoginRequestBody {
  username?: string;
  password?: string;
}

async function authRoutes(fastify: FastifyInstance) {
  // Login route
  fastify.post('/login', async (request: FastifyRequest<{ Body: LoginRequestBody }>, reply: FastifyReply) => {
    const { username, password } = request.body;

    if (!AUTH_ENABLED) {
      // If auth is disabled, allow access without checking credentials.
      // You might want to return a specific status or message.
      // For now, let's simulate a successful login without a token.
      return reply.send({ success: true, message: 'Authentication is disabled. Access granted.', authDisabled: true });
    }
    
    if (!username || !password) {
      return reply.status(400).send({ success: false, message: 'Username and password are required.' });
    }

    const result = login(username, password);

    if (result.success && result.token) {
      reply.send({ success: true, token: result.token, message: result.message });
    } else {
      reply.status(401).send({ success: false, message: result.message || 'Login failed.' });
    }
  });

  // Optional: A route to check token validity (useful for frontend)
  // This route itself would be protected by the auth middleware if AUTH_ENABLED is true.
  fastify.get('/verify-token', {
    // This onRequest hook is specific to this route if you want to protect it individually
    // However, a global onRequest hook in server.ts is generally better for protecting multiple routes.
    // onRequest: [async (request, reply) => { /* auth check logic here if not global */ }]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // If a global auth hook is in place and this route is protected,
    // reaching this point means the token is valid.
    // The user object (e.g., request.user) would be populated by the global hook.
    // @ts-ignore
    if (request.user) {
      // @ts-ignore
      return reply.send({ success: true, message: 'Token is valid.', user: request.user });
    }
    // If AUTH_ENABLED is false, this route might behave differently or not be needed.
    if (!AUTH_ENABLED) {
        return reply.send({ success: true, message: 'Authentication is disabled. Token verification not applicable.' });
    }
    // This part would typically not be reached if a global auth hook correctly denies access for invalid tokens.
    return reply.status(401).send({ success: false, message: 'Token is invalid or not provided.' });
  });

  // Route to get current authentication status
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ authEnabled: AUTH_ENABLED });
  });
}

export default authRoutes;