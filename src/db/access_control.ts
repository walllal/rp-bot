import { AccessControlType, AppSettings } from '@prisma/client'; // Import AppSettings if needed, or rely on inferred type
import { getAppSettings } from './configStore'; // Import the new settings function
import { prisma } from '../server';
import { FastifyBaseLogger } from 'fastify'; // Import logger type

// const prisma = new PrismaClient();

/**
 * 获取指定类型的访问控制列表
 * @param type 列表类型
 * @returns ID 列表 (字符串数组)
 */
export async function getAccessControlList(type: AccessControlType): Promise<string[]> {
    try {
        const entries = await prisma.accessControl.findMany({ // Lowercase c
            where: { type },
            select: { contextId: true },
        });
        return entries.map(entry => entry.contextId);
    } catch (error) {
        console.error(`获取访问控制列表 ${type} 失败:`, error);
        return [];
    }
}

/**
 * 向访问控制列表添加条目
 * @param type 列表类型
 * @param contextId 要添加的 QQ 号或群号
 * @returns 添加的条目或 null (如果已存在或出错)
 */
export async function addAccessControlEntry(type: AccessControlType, contextId: string): Promise<{ id: number; type: AccessControlType; contextId: string; createdAt: Date } | null> {
    if (!contextId || !/^\d+$/.test(contextId)) {
        console.warn(`尝试添加无效的 contextId 到 ${type}: ${contextId}`);
        return null; // 简单验证 ID 格式
    }
    try {
        // 使用 upsert 来避免重复添加，如果已存在则不执行任何操作 (但返回 null 表示未新增)
        const result = await prisma.accessControl.upsert({ // Lowercase c
            where: { type_contextId: { type, contextId } },
            update: {}, // 如果存在，则不更新
            create: { type, contextId },
        });
        // 检查是否是新建的 (通过比较 createdAt 和 updatedAt，或者直接查询一次)
        // 这里简化处理：如果 upsert 成功，我们假设是添加或已存在n'g
        // 为了明确返回是否是"新增"，可以先 findUnique 再 create
        const createdEntry = await prisma.accessControl.findUnique({ // Lowercase c
             where: { type_contextId: { type, contextId } }
        });
        console.trace(`已添加/确认条目到 ${type}: ${contextId}`);
        return createdEntry;
    } catch (error) {
        console.error(`添加条目到 ${type} (${contextId}) 失败:`, error);
        return null;
    }
}

/**
 * 从访问控制列表删除条目
 * @param type 列表类型
 * @param contextId 要删除的 QQ 号或群号
 * @returns 是否成功删除
 */
export async function removeAccessControlEntry(type: AccessControlType, contextId: string): Promise<boolean> {
    try {
        const deleteResult = await prisma.accessControl.deleteMany({ // Lowercase c
            where: { type, contextId },
        });
        if (deleteResult.count > 0) {
            console.trace(`已从 ${type} 删除条目: ${contextId}`);
            return true;
        } else {
            console.warn(`尝试从 ${type} 删除不存在的条目: ${contextId}`);
            return false;
        }
    } catch (error) {
        console.error(`从 ${type} 删除条目 (${contextId}) 失败:`, error);
        return false;
    }
}

/**
 * 检查给定的消息上下文是否允许访问
 * @param messageType 消息类型 ('private' 或 'group')
 * @param contextId QQ 号或群号
 * @param logger A logger instance (e.g., from Fastify)
 * @returns true 如果允许访问, false 如果被阻止
 */
export async function checkAccess(messageType: 'private' | 'group', contextId: string, logger: FastifyBaseLogger): Promise<boolean> {
    try {
        // Get relevant settings first using the new function
        const settings = await getAppSettings(logger);
        if (!settings) {
            logger.error("[访问控制] 无法获取应用设置，默认拒绝访问。");
            return false; // Cannot proceed without settings
        }

        // Access settings directly from the object (they are already boolean)
        const {
            privateWhitelistEnabled,
            privateBlacklistEnabled,
            groupWhitelistEnabled,
            groupBlacklistEnabled
        } = settings;

        // 移除设置日志

        const privateWhitelistType = AccessControlType.PRIVATE_WHITELIST;
        const privateBlacklistType = AccessControlType.PRIVATE_BLACKLIST;
        const groupWhitelistType = AccessControlType.GROUP_WHITELIST;
        const groupBlacklistType = AccessControlType.GROUP_BLACKLIST;

        let isWhitelisted = false; // Keep only one declaration
        // let isBlacklisted = false; // No need for this variable
        let checkWhitelist = false; // Flag to indicate if whitelist check is needed

        if (messageType === 'private') {
            // 1. Check Private Blacklist (if enabled)
            if (privateBlacklistEnabled) {
                const blacklisted = await prisma.accessControl.findUnique({ // Lowercase c
                    where: { type_contextId: { type: privateBlacklistType, contextId } },
                    select: { id: true } // Only need to check existence
                });
                // 移除黑名单检查结果日志
                if (blacklisted) {
                    logger.trace(`[访问控制] 拒绝: ${messageType}:${contextId} (黑名单)`); // Change to trace
                    return false; // Blacklist takes priority
                }
            } // 移除跳过日志

            // 2. Check Private Whitelist (if enabled)
            if (privateWhitelistEnabled) {
                checkWhitelist = true; // Mark that whitelist needs checking
                const whitelisted = await prisma.accessControl.findUnique({ // Lowercase c
                    where: { type_contextId: { type: privateWhitelistType, contextId } },
                    select: { id: true }
                });
                isWhitelisted = !!whitelisted;
                 // 移除白名单检查结果日志
            } // 移除跳过日志

        } else if (messageType === 'group') {
            // 1. Check Group Blacklist (if enabled)
            if (groupBlacklistEnabled) {
                const blacklisted = await prisma.accessControl.findUnique({ // Lowercase c
                    where: { type_contextId: { type: groupBlacklistType, contextId } },
                    select: { id: true }
                });
                // 移除黑名单检查结果日志
                if (blacklisted) {
                    logger.trace(`[访问控制] 拒绝: ${messageType}:${contextId} (黑名单)`); // Change to trace
                    return false; // Blacklist takes priority
                }
            } // 移除跳过日志

            // 2. Check Group Whitelist (if enabled)
            if (groupWhitelistEnabled) {
                 checkWhitelist = true; // Mark that whitelist needs checking
                 const whitelisted = await prisma.accessControl.findUnique({ // Lowercase c
                    where: { type_contextId: { type: groupWhitelistType, contextId } },
                    select: { id: true }
                });
                isWhitelisted = !!whitelisted;
                 // 移除白名单检查结果日志
            } // 移除跳过日志
        }

        // 3. Final Decision based on whitelist check
        // If whitelist check was required (meaning the corresponding whitelist was enabled)
        // AND the user is NOT in that whitelist, then deny access.
        if (checkWhitelist && !isWhitelisted) {
             logger.trace(`[访问控制] 拒绝: ${messageType}:${contextId} (白名单已启用但未找到该 ID)`); // Change to trace
            return false;
        }

        // If we passed the blacklist check (if enabled)
        // AND we passed the whitelist check (if enabled and user was in it, or if whitelist was disabled)
        // then allow access.

        // 如果通过了黑名单检查，并且（不存在白名单 或 在白名单中），则允许访问
         logger.trace(`[访问控制] 允许: ${messageType}:${contextId}`); // Change to trace
        return true;

    } catch (error) {
        console.error(`检查访问权限时出错 (${messageType}:${contextId}):`, error);
        return false; // 默认阻止访问以防出错
    }
}
