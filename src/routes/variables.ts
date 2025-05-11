import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// import { PrismaClient } from '@prisma/client'; // Removed as Prisma is handled by db services
import {
  // Global Variable Services (to keep)
  createGlobalVariable,
  getGlobalVariable,
  listGlobalVariables,
  updateGlobalVariable,
  deleteGlobalVariable,
  // New Local Variable Definition Services
  createLocalVariableDefinition,
  getLocalVariableDefinitionById,
  getLocalVariableDefinitionByName, // For potential use, though API might prefer ID
  listLocalVariableDefinitions,
  updateLocalVariableDefinition,
  deleteLocalVariableDefinition,
  // New Local Variable Instance Services
  listLocalVariableInstances,
  deleteLocalVariableInstance, // Added for deleting single instances
  updateLocalVariableInstanceValueById, // +++ Import for updating instance value +++
  // getLocalVariableInstanceById, // If needed for direct instance manipulation via API
} from '../db/variables';
import { ContextType, LocalVariableDefinition } from '@prisma/client'; // Removed PrismaClient import from here

// const prisma = new PrismaClient(); // PrismaClient should be managed globally or passed in

// Helper to log errors and send a generic 500 response
function handleServerError(reply: FastifyReply, error: any, message: string) {
  console.error(message, error);
  reply.status(500).send({ error: 'Internal Server Error', message: error.message });
}

export default async function variableRoutes(fastify: FastifyInstance) {
  // --- Global Variable Routes ---

  // Create a new global variable
  fastify.post('/global', async (request: FastifyRequest<{ Body: { name: string; value: string } }>, reply: FastifyReply) => {
    try {
      const { name, value } = request.body;
      if (!name || value === undefined) {
        return reply.status(400).send({ error: 'Name and value are required for global variable.' });
      }
      const newVar = await createGlobalVariable(name, value);
      reply.status(201).send(newVar);
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        return reply.status(409).send({ error: error.message });
      }
      handleServerError(reply, error, 'Error creating global variable');
    }
  });

  // List global variables (with optional search)
  fastify.get('/global', async (request: FastifyRequest<{ Querystring: { search?: string } }>, reply: FastifyReply) => {
    try {
      const { search } = request.query;
      const vars = await listGlobalVariables(search);
      reply.send(vars);
    } catch (error: any) {
      handleServerError(reply, error, 'Error listing global variables');
    }
  });

  // Get a specific global variable by name
  fastify.get('/global/:name', async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    try {
      const { name } = request.params;
      const variable = await getGlobalVariable(name);
      if (!variable) {
        return reply.status(404).send({ error: 'Global variable not found.' });
      }
      reply.send(variable);
    } catch (error: any) {
      handleServerError(reply, error, 'Error fetching global variable');
    }
  });

  // Update a global variable by name
  fastify.put('/global/:name', async (request: FastifyRequest<{ Params: { name: string }; Body: { value: string } }>, reply: FastifyReply) => {
    try {
      const { name } = request.params;
      const { value } = request.body;
      if (value === undefined) {
        return reply.status(400).send({ error: 'Value is required for updating global variable.' });
      }
      const updatedVar = await updateGlobalVariable(name, value);
      if (!updatedVar) {
        return reply.status(404).send({ error: 'Global variable not found for update.' });
      }
      reply.send(updatedVar);
    } catch (error: any) {
      handleServerError(reply, error, 'Error updating global variable');
    }
  });

  // Delete a global variable by name
  fastify.delete('/global/:name', async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    try {
      const { name } = request.params;
      const success = await deleteGlobalVariable(name);
      if (!success) {
        return reply.status(404).send({ error: 'Global variable not found for deletion or delete failed.' });
      }
      reply.status(204).send(); // No content
    } catch (error: any) {
      handleServerError(reply, error, 'Error deleting global variable');
    }
  });


  // --- LocalVariableDefinition Routes (New) ---
  // These routes will operate under the /api/variables prefix, e.g., /api/variables/local-definitions

  fastify.post('/local-definitions', async (request: FastifyRequest<{ Body: { name: string; defaultValue: string } }>, reply: FastifyReply) => {
    try {
      const { name, defaultValue } = request.body;
      if (!name || defaultValue === undefined) {
        return reply.status(400).send({ error: 'Name and defaultValue are required for local variable definition.' });
      }
      const newDef = await createLocalVariableDefinition(name, defaultValue);
      reply.status(201).send(newDef);
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('name')) { // Prisma unique constraint violation for name
        return reply.status(409).send({ error: `Local variable definition with name '${name}' already exists.` });
      }
      handleServerError(reply, error, 'Error creating local variable definition');
    }
  });

  fastify.get('/local-definitions', async (request: FastifyRequest<{ Querystring: { name?: string } }>, reply: FastifyReply) => {
    try {
      const { name } = request.query;
      const definitions = await listLocalVariableDefinitions({ name });
      reply.send(definitions);
    } catch (error: any) {
      handleServerError(reply, error, 'Error listing local variable definitions');
    }
  });

  fastify.get('/local-definitions/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ error: 'Invalid ID for local variable definition.' });
      }
      const definition = await getLocalVariableDefinitionById(id);
      if (!definition) {
        return reply.status(404).send({ error: 'Local variable definition not found.' });
      }
      reply.send(definition);
    } catch (error: any) {
      handleServerError(reply, error, 'Error fetching local variable definition');
    }
  });

  fastify.put('/local-definitions/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; defaultValue?: string } }>, reply: FastifyReply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ error: 'Invalid ID for local variable definition.' });
      }
      const { name, defaultValue } = request.body;
      if (name === undefined && defaultValue === undefined) {
        return reply.status(400).send({ error: 'Either name or defaultValue must be provided for update.' });
      }
      
      const dataToUpdate: { name?: string; defaultValue?: string } = {};
      if (name !== undefined) dataToUpdate.name = name;
      if (defaultValue !== undefined) dataToUpdate.defaultValue = defaultValue;

      const updatedDef = await updateLocalVariableDefinition(id, dataToUpdate);
      if (!updatedDef) {
        return reply.status(404).send({ error: 'Local variable definition not found for update.' });
      }
      reply.send(updatedDef);
    } catch (error: any) {
      if (error.message?.includes('already exists')) { // Catch error from service layer for unique name constraint
        return reply.status(409).send({ error: error.message });
      }
      handleServerError(reply, error, 'Error updating local variable definition');
    }
  });

  fastify.delete('/local-definitions/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ error: 'Invalid ID for local variable definition.' });
      }
      const deletedDef = await deleteLocalVariableDefinition(id);
      if (!deletedDef) {
        return reply.status(404).send({ error: 'Local variable definition not found for deletion.' });
      }
      reply.status(204).send(); // No content
    } catch (error: any) {
      handleServerError(reply, error, 'Error deleting local variable definition');
    }
  });

  // --- LocalVariableInstance Routes (New - primarily for querying) ---
  // These routes will operate under the /api/variables prefix, e.g., /api/variables/local-instances
  
  fastify.get('/local-instances', async (request: FastifyRequest<{ Querystring: { definitionName?: string; contextType?: string; contextId?: string; userId?: string; value?: string } }>, reply: FastifyReply) => {
    try {
      const filters: {
        definitionName?: string;
        contextType?: ContextType;
        contextId?: string;
        userId?: string;
        value?: string;
      } = {};

      if (request.query.definitionName) filters.definitionName = request.query.definitionName;
      if (request.query.contextType) {
        if (!Object.values(ContextType).includes(request.query.contextType as ContextType)) {
          return reply.status(400).send({ error: `Invalid contextType filter. Must be one of: ${Object.values(ContextType).join(', ')}` });
        }
        filters.contextType = request.query.contextType as ContextType;
      }
      if (request.query.contextId) filters.contextId = request.query.contextId;
      if (request.query.userId) filters.userId = request.query.userId;
      if (request.query.value) filters.value = request.query.value;

      const instances = await listLocalVariableInstances(filters);
      reply.send(instances);
    } catch (error: any) {
      handleServerError(reply, error, 'Error listing local variable instances');
    }
  });

  fastify.delete('/local-instances/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ error: 'Invalid ID for local variable instance.' });
      }
      const deletedInstance = await deleteLocalVariableInstance(id);
      if (!deletedInstance) {
        return reply.status(404).send({ error: 'Local variable instance not found for deletion.' });
      }
      reply.status(204).send(); // No content
    } catch (error: any) {
      handleServerError(reply, error, 'Error deleting local variable instance');
    }
  });

  // Update a specific local variable instance by its ID
  fastify.put('/local-instances/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: { value: string } }>, reply: FastifyReply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ error: 'Invalid ID for local variable instance.' });
      }
      const { value } = request.body;
      if (value === undefined) { // Note: empty string for value is allowed
        return reply.status(400).send({ error: 'Value is required for updating local variable instance.' });
      }
      
      const updatedInstance = await updateLocalVariableInstanceValueById(id, value);
      
      if (!updatedInstance) {
        return reply.status(404).send({ error: 'Local variable instance not found for update.' });
      }
      reply.send(updatedInstance);
    } catch (error: any) {
      handleServerError(reply, error, 'Error updating local variable instance');
    }
  });
 
  fastify.log.trace('变量路由已注册 (全局, 局部定义, 局部实例)');
}

// Helper prisma client instance (should be managed globally in a real app)
// const prisma = new PrismaClient(); // --- Ensure this is not re-declared if managed globally