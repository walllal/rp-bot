import { PrismaClient, Friend, Group } from '@prisma/client';
import { FastifyBaseLogger } from 'fastify';

const prisma = new PrismaClient();

// Define types for API responses (adjust based on actual OneBot implementation)
interface FriendFromApi {
    user_id: number; // Assuming user_id is number from API
    nickname: string;
    remark?: string; // Optional remark
}

interface GroupFromApi {
    group_id: number; // Assuming group_id is number from API
    group_name: string;
}

/**
 * Synchronizes the local Friend database with the list fetched from the OneBot API.
 * Implements a "delete-many, upsert-many" strategy.
 * @param friendsFromApi - Array of friend objects from the OneBot API.
 * @param log - Logger instance.
 */
export async function syncFriends(friendsFromApi: FriendFromApi[], log: FastifyBaseLogger): Promise<void> {
    log.info(`开始同步好友列表，从 API 获取到 ${friendsFromApi.length} 个好友...`);
    try {
        const apiUserIds = friendsFromApi.map(f => f.user_id.toString()); // Ensure string IDs for comparison
        log.trace('从 API 获取的好友 User IDs:', apiUserIds);

        // Get all existing friend user IDs from the database
        const existingFriends = await prisma.friend.findMany({
            select: { userId: true }
        });
        const existingUserIds = existingFriends.map(f => f.userId);
        log.trace('数据库中现存的好友 User IDs:', existingUserIds);

        // Find friends to delete (exist in DB but not in API list)
        const userIdsToDelete = existingUserIds.filter(id => !apiUserIds.includes(id));
        if (userIdsToDelete.length > 0) {
            log.debug(`准备删除 ${userIdsToDelete.length} 个数据库中不再存在的好友...`, userIdsToDelete);
            const deleteResult = await prisma.friend.deleteMany({
                where: { userId: { in: userIdsToDelete } }
            });
            log.info(`成功删除了 ${deleteResult.count} 个过时好友记录。`);
        } else {
            log.debug('没有需要删除的好友记录。');
        }

        // Upsert friends (add new ones, update existing ones)
        if (friendsFromApi.length > 0) {
            log.debug(`准备 Upsert ${friendsFromApi.length} 个好友记录...`);
            // Prisma's createMany doesn't support upsert logic directly in SQLite < 3.24 or without specific flags.
            // We'll loop and upsert individually. For large lists, consider batching or raw SQL if performance is critical.
            let createdCount = 0;
            let updatedCount = 0;
            for (const friend of friendsFromApi) {
                const userIdStr = friend.user_id.toString();
                try {
                    const result = await prisma.friend.upsert({
                        where: { userId: userIdStr },
                        update: {
                            nickname: friend.nickname,
                            remark: friend.remark || null, // Use null if remark is empty/undefined
                        },
                        create: {
                            userId: userIdStr,
                            nickname: friend.nickname,
                            remark: friend.remark || null,
                        }
                    });
                    // Check if it was created or updated (less straightforward without reading before)
                    // We can infer based on whether it existed before, but upsert handles it.
                    // Let's just log the attempt. A more precise count would require more queries.
                } catch (upsertError) {
                     log.error(`Upsert 好友 ${userIdStr} (${friend.nickname}) 失败:`, upsertError);
                     // Continue with the next friend
                }
            }
             // We can't easily get created/updated counts from individual upserts without extra checks.
             // Log overall success.
             log.info(`完成 ${friendsFromApi.length} 个好友记录的 Upsert 操作。`);

        } else {
            log.debug('API 返回的好友列表为空，无需执行 Upsert 操作。');
        }

        log.info('好友列表同步完成。');

    } catch (error) {
        log.error('同步好友列表时发生错误:', error);
        // Re-throw or handle as needed
        throw error;
    }
}


/**
 * Synchronizes the local Group database with the list fetched from the OneBot API.
 * Implements a "delete-many, upsert-many" strategy.
 * @param groupsFromApi - Array of group objects from the OneBot API.
 * @param log - Logger instance.
 */
export async function syncGroups(groupsFromApi: GroupFromApi[], log: FastifyBaseLogger): Promise<void> {
    log.info(`开始同步群组列表，从 API 获取到 ${groupsFromApi.length} 个群组...`);
     try {
        const apiGroupIds = groupsFromApi.map(g => g.group_id.toString()); // Ensure string IDs
        log.trace('从 API 获取的群组 Group IDs:', apiGroupIds);

        // Get all existing group IDs from the database
        const existingGroups = await prisma.group.findMany({
            select: { groupId: true }
        });
        const existingGroupIds = existingGroups.map(g => g.groupId);
        log.trace('数据库中现存的群组 Group IDs:', existingGroupIds);

        // Find groups to delete
        const groupIdsToDelete = existingGroupIds.filter(id => !apiGroupIds.includes(id));
        if (groupIdsToDelete.length > 0) {
            log.debug(`准备删除 ${groupIdsToDelete.length} 个数据库中不再存在的群组...`, groupIdsToDelete);
            const deleteResult = await prisma.group.deleteMany({
                where: { groupId: { in: groupIdsToDelete } }
            });
            log.info(`成功删除了 ${deleteResult.count} 个过时群组记录。`);
        } else {
            log.debug('没有需要删除的群组记录。');
        }

        // Upsert groups
        if (groupsFromApi.length > 0) {
             log.debug(`准备 Upsert ${groupsFromApi.length} 个群组记录...`);
             for (const group of groupsFromApi) {
                 const groupIdStr = group.group_id.toString();
                 try {
                     await prisma.group.upsert({
                         where: { groupId: groupIdStr },
                         update: {
                             groupName: group.group_name,
                         },
                         create: {
                             groupId: groupIdStr,
                             groupName: group.group_name,
                         }
                     });
                 } catch (upsertError) {
                     log.error(`Upsert 群组 ${groupIdStr} (${group.group_name}) 失败:`, upsertError);
                     // Continue with the next group
                 }
             }
             log.info(`完成 ${groupsFromApi.length} 个群组记录的 Upsert 操作。`);
        } else {
             log.debug('API 返回的群组列表为空，无需执行 Upsert 操作。');
        }

        log.info('群组列表同步完成。');

    } catch (error) {
        log.error('同步群组列表时发生错误:', error);
        throw error;
    }
}

/**
 * Gets the friend's display name (remark or nickname).
 * @param userId - The QQ user ID.
 * @returns The display name or the user ID if not found.
 */
export async function getFriendName(userId: string): Promise<string> {
    try {
        const friend = await prisma.friend.findUnique({
            where: { userId },
            select: { nickname: true, remark: true }
        });
        return friend?.remark || friend?.nickname || userId; // Prioritize remark, then nickname, fallback to ID
    } catch (error) {
        console.error(`Error fetching friend name for ${userId}:`, error);
        return userId; // Fallback to ID on error
    }
}

/**
 * Gets the group name.
 * @param groupId - The QQ group ID.
 * @returns The group name or the group ID if not found.
 */
export async function getGroupName(groupId: string): Promise<string> {
     try {
        const group = await prisma.group.findUnique({
            where: { groupId },
            select: { groupName: true }
        });
        return group?.groupName || groupId; // Fallback to ID if not found
    } catch (error) {
        console.error(`Error fetching group name for ${groupId}:`, error);
        return groupId; // Fallback to ID on error
    }
}
/**
 * Gets all friends from the database, ordered by nickname.
 * @returns A promise that resolves to an array of Friend objects.
 */
export async function getAllFriends(): Promise<Friend[]> {
    try {
        return await prisma.friend.findMany({
            orderBy: {
                // Consider ordering by remark or nickname based on preference
                nickname: 'asc' 
            }
        });
    } catch (error) {
        console.error('Error fetching all friends:', error);
        return []; // Return empty array on error
    }
}

/**
 * Gets all groups from the database, ordered by group name.
 * @returns A promise that resolves to an array of Group objects.
 */
export async function getAllGroups(): Promise<Group[]> {
     try {
        return await prisma.group.findMany({
            orderBy: {
                groupName: 'asc'
            }
        });
    } catch (error) {
        console.error('Error fetching all groups:', error);
        return []; // Return empty array on error
    }
}