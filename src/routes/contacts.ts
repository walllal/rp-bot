import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { getAllFriends, getAllGroups } from '../db/contacts'; // Import DB functions

async function contactsRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // GET /api/contacts/friends - Retrieve all friends
    fastify.get('/friends', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const friends = await getAllFriends();
            reply.send(friends);
        } catch (error) {
            request.log.error('获取好友列表时出错:', error);
            reply.status(500).send({ error: '获取好友列表失败' });
        }
    });

    // GET /api/contacts/groups - Retrieve all groups
    fastify.get('/groups', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const groups = await getAllGroups();
            reply.send(groups);
        } catch (error) {
            request.log.error('获取群组列表时出错:', error);
            reply.status(500).send({ error: '获取群组列表失败' });
        }
    });

}

export default contactsRoutes;