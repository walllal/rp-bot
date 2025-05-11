import { GlobalVariable, LocalVariableDefinition, LocalVariableInstance, ContextType } from '@prisma/client';
import { prisma } from './prismaClient'; // Import the shared Prisma instance

// const prisma = new PrismaClient(); // Removed

/**
 * 获取指定名称的全局变量。
 * @param name 全局变量的名称。
 * @returns 返回找到的全局变量，如果不存在则返回 null。
 */
export async function getGlobalVariable(name: string): Promise<GlobalVariable | null> {
  try {
    return await prisma.globalVariable.findUnique({
      where: { name },
    });
  } catch (error) {
    console.error(`Error fetching global variable '${name}':`, error);
    // 根据实际需求，这里可以抛出错误或返回 null
    // 为了指令处理的健壮性，暂时返回 null，并在调用处处理
    return null;
  }
}

/**
 * 更新已存在的全局变量的值。
 * 如果变量不存在，则不执行任何操作并返回 null。
 * @param name 全局变量的名称。
 * @param value 新的变量值。
 * @returns 返回更新后的全局变量，如果变量不存在则返回 null。
 */
export async function updateGlobalVariable(name: string, value: string): Promise<GlobalVariable | null> {
  try {
    // 首先检查变量是否存在，因为 update 如果记录不存在会抛出 P2025 错误
    const existingVar = await prisma.globalVariable.findUnique({
      where: { name },
    });

    if (!existingVar) {
      return null; // 变量不存在，不执行更新
    }

    return await prisma.globalVariable.update({
      where: { name },
      data: { value },
    });
  } catch (error) {
    console.error(`Error updating global variable '${name}':`, error);
    return null;
  }
}

// --- 阶段二新增函数 (全局变量部分，保留并整理) ---

/**
 * 创建新的全局变量。
 * @param name 全局变量的名称。
 * @param value 变量值。
 * @returns 返回创建的全局变量。
 * @throws 如果同名变量已存在，则抛出错误。
 */
export async function createGlobalVariable(name: string, value: string): Promise<GlobalVariable> {
  try {
    return await prisma.globalVariable.create({
      data: { name, value },
    });
  } catch (error: any) {
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      // Prisma unique constraint violation
      throw new Error(`Global variable with name '${name}' already exists.`);
    }
    console.error(`Error creating global variable '${name}':`, error);
    throw error; // Re-throw other errors
  }
}

/**
 * 获取全局变量列表，可选按名称搜索。
 * @param searchTerm 可选的搜索词，部分匹配变量名称。
 * @returns 返回全局变量数组。
 */
export async function listGlobalVariables(searchTerm?: string): Promise<GlobalVariable[]> {
  try {
    return await prisma.globalVariable.findMany({
      where: searchTerm ? {
        name: {
          contains: searchTerm,
          // mode: 'insensitive', // SQLite LIKE is case-insensitive by default for many DBs
        },
      } : undefined,
      orderBy: {
        name: 'asc',
      },
    });
  } catch (error) {
    console.error(`Error listing global variables (searchTerm: ${searchTerm}):`, error);
    return [];
  }
}

/**
 * 删除指定名称的全局变量。
 * @param name 全局变量的名称。
 * @returns 如果删除成功返回 true，否则返回 false。
 */
export async function deleteGlobalVariable(name: string): Promise<boolean> {
  try {
    const result = await prisma.globalVariable.delete({
      where: { name },
    });
    return !!result;
  } catch (error: any) {
    if (error.code === 'P2025') { // Record to delete does not exist
      console.warn(`Global variable '${name}' not found for deletion.`);
      return false;
    }
    console.error(`Error deleting global variable '${name}':`, error);
    return false;
  }
}


// --- LocalVariableDefinition Services (New) ---

/**
 * Creates a new local variable definition.
 * @param name The unique name of the variable definition.
 * @param defaultValue The default value for this variable.
 * @returns The created local variable definition.
 */
export async function createLocalVariableDefinition(name: string, defaultValue: string): Promise<LocalVariableDefinition> {
  return prisma.localVariableDefinition.create({
    data: {
      name,
      defaultValue,
    },
  });
}

/**
 * Retrieves a local variable definition by its unique name.
 * @param name The name of the definition.
 * @returns The found definition or null.
 */
export async function getLocalVariableDefinitionByName(name: string): Promise<LocalVariableDefinition | null> {
  return prisma.localVariableDefinition.findUnique({
    where: { name },
  });
}

/**
 * Retrieves a local variable definition by its ID.
 * @param id The ID of the definition.
 * @returns The found definition or null.
 */
export async function getLocalVariableDefinitionById(id: number): Promise<LocalVariableDefinition | null> {
  return prisma.localVariableDefinition.findUnique({
    where: { id },
  });
}

/**
 * Lists local variable definitions, optionally filtered by name.
 * @param filters Optional filters (e.g., for name).
 * @returns An array of local variable definitions.
 */
export async function listLocalVariableDefinitions(filters?: { name?: string }): Promise<LocalVariableDefinition[]> {
  return prisma.localVariableDefinition.findMany({
    where: filters?.name ? { name: { contains: filters.name } } : undefined,
    orderBy: { name: 'asc' },
  });
}

/**
 * Updates a local variable definition.
 * @param id The ID of the definition to update.
 * @param data The data to update (name and/or defaultValue).
 * @returns The updated definition or null if not found.
 */
export async function updateLocalVariableDefinition(id: number, data: { name?: string; defaultValue?: string }): Promise<LocalVariableDefinition | null> {
  try {
    return await prisma.localVariableDefinition.update({
      where: { id },
      data,
    });
  } catch (error: any) {
    if (error.code === 'P2025') { // Record to update does not exist.
      return null;
    }
    // Handle P2002 for unique constraint violation on 'name' if name is being updated
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      throw new Error(`A local variable definition with the name '${data.name}' already exists.`);
    }
    throw error;
  }
}

/**
 * Deletes a local variable definition by its ID.
 * Associated instances will be deleted due to onDelete: Cascade.
 * @param id The ID of the definition to delete.
 * @returns The deleted definition or null if not found.
 */
export async function deleteLocalVariableDefinition(id: number): Promise<LocalVariableDefinition | null> {
  try {
    return await prisma.localVariableDefinition.delete({
      where: { id },
    });
  } catch (error: any) {
    if (error.code === 'P2025') { // Record to delete does not exist.
      return null;
    }
    throw error;
  }
}


// --- LocalVariableInstance Services (New) ---

/**
 * Upserts (creates or updates) a local variable instance.
 * @param data Object containing definitionId, value, contextType, contextId, and userId.
 * @returns The created or updated local variable instance.
 */
export async function upsertLocalVariableInstance(data: {
  definitionId: number;
  value: string;
  contextType: ContextType;
  contextId: string;
  userId: string;
}): Promise<LocalVariableInstance> {
  return prisma.localVariableInstance.upsert({
    where: {
      definitionId_contextType_contextId_userId: {
        definitionId: data.definitionId,
        contextType: data.contextType,
        contextId: data.contextId,
        userId: data.userId,
      },
    },
    update: {
      value: data.value,
    },
    create: {
      definitionId: data.definitionId,
      value: data.value,
      contextType: data.contextType,
      contextId: data.contextId,
      userId: data.userId,
    },
  });
}

/**
 * Retrieves a specific local variable instance by definition ID and context.
 * @param definitionId The ID of the parent definition.
 * @param contextType The context type.
 * @param contextId The context ID.
 * @param userId The user ID.
 * @returns The found instance or null.
 */
export async function getLocalVariableInstance(
  definitionId: number,
  contextType: ContextType,
  contextId: string,
  userId: string
): Promise<LocalVariableInstance | null> {
  return prisma.localVariableInstance.findUnique({
    where: {
      definitionId_contextType_contextId_userId: {
        definitionId,
        contextType,
        contextId,
        userId,
      },
    },
  });
}

/**
 * Lists local variable instances with filtering, including their definition.
 * @param filters Filters for definitionName, contextType, contextId, userId, and instance value.
 * @returns An array of local variable instances with their definitions.
 */
export async function listLocalVariableInstances(filters: {
  definitionName?: string;
  contextType?: ContextType;
  contextId?: string;
  userId?: string;
  value?: string;
}): Promise<(LocalVariableInstance & { definition: LocalVariableDefinition })[]> {
  const whereClause: any = {};
  if (filters.contextType) whereClause.contextType = filters.contextType;
  if (filters.contextId) whereClause.contextId = filters.contextId;
  if (filters.userId) whereClause.userId = filters.userId;
  if (filters.value) whereClause.value = { contains: filters.value }; // Removed mode: 'insensitive'
  
  if (filters.definitionName) {
    whereClause.definition = {
      name: { contains: filters.definitionName }, // Removed mode: 'insensitive'
    };
  }

  return prisma.localVariableInstance.findMany({
    where: whereClause,
    include: {
      definition: true,
    },
    orderBy: [
      { definition: { name: 'asc' } },
      { updatedAt: 'desc' },
    ],
  });
}

/**
 * Deletes a local variable instance by its ID.
 * @param id The ID of the instance to delete.
 * @returns The deleted instance or null if not found.
 */
export async function deleteLocalVariableInstance(id: number): Promise<LocalVariableInstance | null> {
  try {
    return await prisma.localVariableInstance.delete({
      where: { id },
    });
  } catch (error: any) {
    if (error.code === 'P2025') { // Record to delete does not exist.
      return null;
    }
    throw error;
  }
}

/**
 * Retrieves a local variable instance by its ID, including its definition.
 * @param id The ID of the instance.
 * @returns The found instance with its definition, or null.
 */
export async function getLocalVariableInstanceById(id: number): Promise<(LocalVariableInstance & { definition: LocalVariableDefinition }) | null> {
    return prisma.localVariableInstance.findUnique({
        where: { id },
        include: { definition: true }
    });
}

/**
 * Updates the value of a specific local variable instance by its ID.
 * @param id The ID of the local variable instance to update.
 * @param value The new value for the instance.
 * @returns The updated local variable instance, or null if not found.
 */
export async function updateLocalVariableInstanceValueById(id: number, value: string): Promise<LocalVariableInstance | null> {
  try {
    return await prisma.localVariableInstance.update({
      where: { id },
      data: { value },
    });
  } catch (error: any) {
    if (error.code === 'P2025') { // Record to update does not exist.
      console.warn(`Local variable instance with ID '${id}' not found for update.`);
      return null;
    }
    console.error(`Error updating local variable instance with ID '${id}':`, error);
    throw error; // Re-throw other errors
  }
}