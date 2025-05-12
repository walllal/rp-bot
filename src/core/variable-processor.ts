import { VariableContext } from './types';
import {
  updateGlobalVariable,
  getLocalVariableDefinitionByName, // New import
  upsertLocalVariableInstance     // New import
} from '../db/variables';
import { ContextType as DbContextType } from '@prisma/client'; // Import DbContextType

// 假设日志功能已经或将要在应用中某处初始化，这里仅为示例
// import { logger } from '../logger'; // 假设的日志模块

/**
 * 处理 AI 响应文本中的 setvar 和 setglobalvar 指令。
 * 这些指令会被执行（更新数据库），然后从文本中移除。
 *
 * @param responseText AI 返回的原始文本。
 * @param context 当前消息的变量上下文。
 * @returns 清理了 set 指令后的文本。
 */
export async function processAndStripSetCommands(
  responseText: string,
  context: VariableContext,
  source: 'user' | 'ai' // Added source parameter
): Promise<string> {
  if (!responseText) {
    return '';
  }
  console.log(`[processAndStripSetCommands] Received context:`, JSON.stringify(context, null, 2)); // Log incoming context

  let processedText = responseText;

  // 正则表达式匹配 {{setvar::varName::value}}
  // varName 和 value 都可以包含除 }} 和 :: 之外的任何字符
  // 使用非贪婪匹配 .*?
  const setVarRegex = /\{\{setvar::(.*?)::(.*?)\}\}/g;
  // 正则表达式匹配 {{setglobalvar::varName::value}}
  const setGlobalVarRegex = /\{\{setglobalvar::(.*?)::(.*?)\}\}/g;
  // New regexes for AI-only commands
  const setVarAiOnlyRegex = /\[\[setvar::(.*?)::(.*?)\]\]/g;
  const setGlobalVarAiOnlyRegex = /\[\[setglobalvar::(.*?)::(.*?)\]\]/g;

  // --- 处理局部变量设置 ---
  // 为了避免在循环中修改字符串导致 exec 问题，我们先收集所有匹配项
  const localMatches = Array.from(processedText.matchAll(setVarRegex));
  for (const match of localMatches) {
    const fullMatchText = match[0];
    const varName = match[1];
    const varValue = match[2];

    // Determine contextType and contextId from VariableContext
    let dbContextType: DbContextType | undefined;
    let dbContextId: string | undefined;

    console.log(`[processAndStripSetCommands] Loop Debug: varName='${varName}', varValue='${varValue}'`); // Log varName and varValue from regex

    if (context.isGroupChat === 'yes' && context.groupId) {
        dbContextType = DbContextType.GROUP;
        dbContextId = context.groupId;
    } else if (context.isPrivateChat === 'yes' && context.userId) {
        dbContextType = DbContextType.PRIVATE;
        dbContextId = context.userId; // For private chat, contextId is userId
    }
    
    console.log(`[processAndStripSetCommands] Before IF condition check:
      varName: ${varName} (type: ${typeof varName})
      varValue: ${varValue} (type: ${typeof varValue})
      varValue !== undefined: ${varValue !== undefined}
      dbContextType: ${dbContextType} (type: ${typeof dbContextType})
      dbContextId: ${dbContextId} (type: ${typeof dbContextId})
      context.userId: ${context.userId} (type: ${typeof context.userId})
    `);

    if (varName && varValue !== undefined && dbContextType && dbContextId && context.userId) {
      try {
        const definition = await getLocalVariableDefinitionByName(varName);
        if (!definition) {
          console.warn(`Local variable definition '${varName}' not found. Cannot set variable via setvar command: ${fullMatchText}`);
          // logger?.warn(`Local variable definition '${varName}' not found. Cannot set variable via setvar command: ${fullMatchText}`);
        } else {
          await upsertLocalVariableInstance({
            definitionId: definition.id,
            value: varValue,
            contextType: dbContextType,
            contextId: dbContextId,
            userId: context.userId,
          });
          // console.log(`Successfully upserted local variable instance for definition '${varName}' (ID: ${definition.id}) for ${dbContextType}:${dbContextId}:${context.userId}`);
          // logger?.debug(`Successfully upserted local variable instance for definition '${varName}' (ID: ${definition.id}) for ${dbContextType}:${dbContextId}:${context.userId}`);
        }
      } catch (error) {
        console.error(`Error processing setvar command '${fullMatchText}':`, error);
        // logger?.error(`Error processing setvar command '${fullMatchText}':`, { error });
      }
    } else {
      console.warn(`Invalid setvar command or incomplete context: ${fullMatchText}`);
      // logger?.warn(`Invalid setvar command or incomplete context: ${fullMatchText}`);
    }
    // 无论成功与否，都从文本中移除该指令
    processedText = processedText.replace(fullMatchText, '');
  }

  // --- 处理全局变量设置 ---
  const globalMatches = Array.from(processedText.matchAll(setGlobalVarRegex));
  for (const match of globalMatches) {
    const fullMatchText = match[0];
    const varName = match[1];
    const varValue = match[2];

    if (varName && varValue !== undefined) {
      try {
        const updatedVar = await updateGlobalVariable(varName, varValue);
        if (updatedVar) {
          // console.log(`Successfully updated global variable '${varName}'`);
          // logger?.debug(`Successfully updated global variable '${varName}'`);
        } else {
          console.warn(`Global variable '${varName}' not found or not updated for setglobalvar command. Command: ${fullMatchText}`);
          // logger?.warn(`Global variable '${varName}' not found or not updated for setglobalvar command. Command: ${fullMatchText}`);
        }
      } catch (error) {
        console.error(`Error processing setglobalvar command '${fullMatchText}':`, error);
        // logger?.error(`Error processing setglobalvar command '${fullMatchText}':`, { error });
      }
    } else {
      console.warn(`Invalid setglobalvar command: ${fullMatchText}`);
      // logger?.warn(`Invalid setglobalvar command: ${fullMatchText}`);
    }
    // 无论成功与否，都从文本中移除该指令
    processedText = processedText.replace(fullMatchText, '');
  }

  // --- 处理 AI-Only 局部变量设置 ---
  // These commands are only processed if the source is 'ai'
  const localAiOnlyMatches = Array.from(processedText.matchAll(setVarAiOnlyRegex));
  for (const match of localAiOnlyMatches) {
    const fullMatchText = match[0];
    if (source === 'ai') {
      const varName = match[1];
      const varValue = match[2];

      // Determine contextType and contextId from VariableContext (Copied from {{setvar}} logic)
      let dbContextType: DbContextType | undefined;
      let dbContextId: string | undefined;

      if (context.isGroupChat === 'yes' && context.groupId) {
          dbContextType = DbContextType.GROUP;
          dbContextId = context.groupId;
      } else if (context.isPrivateChat === 'yes' && context.userId) {
          dbContextType = DbContextType.PRIVATE;
          dbContextId = context.userId;
      }

      if (varName && varValue !== undefined && dbContextType && dbContextId && context.userId) {
        try {
          const definition = await getLocalVariableDefinitionByName(varName);
          if (!definition) {
            console.warn(`AI-Only: Local variable definition '${varName}' not found. Cannot set variable via [[setvar]] command: ${fullMatchText}`);
            // logger?.warn(`AI-Only: Local variable definition '${varName}' not found. Cannot set variable via [[setvar]] command: ${fullMatchText}`);
          } else {
            await upsertLocalVariableInstance({
              definitionId: definition.id,
              value: varValue,
              contextType: dbContextType,
              contextId: dbContextId,
              userId: context.userId,
            });
            // console.log(`AI-Only: Successfully upserted local variable instance for definition '${varName}' (ID: ${definition.id}) for ${dbContextType}:${dbContextId}:${context.userId}`);
            // logger?.debug(`AI-Only: Successfully upserted local variable instance for definition '${varName}' (ID: ${definition.id}) for ${dbContextType}:${dbContextId}:${context.userId}`);
          }
        } catch (error) {
          console.error(`AI-Only: Error processing [[setvar]] command '${fullMatchText}':`, error);
          // logger?.error(`AI-Only: Error processing [[setvar]] command '${fullMatchText}':`, { error });
        }
      } else {
        console.warn(`AI-Only: Invalid [[setvar]] command or incomplete context: ${fullMatchText}`);
        // logger?.warn(`AI-Only: Invalid [[setvar]] command or incomplete context: ${fullMatchText}`);
      }
      // 仅当 source 是 'ai' 时才移除指令
      processedText = processedText.replace(fullMatchText, '');
    } else {
      // 如果 source 是 'user', 则不处理也不移除，指令保留在文本中
      console.log(`Skipping AI-only [[setvar]] command from user input: ${fullMatchText}`);
    }
  }

  // --- 处理 AI-Only 全局变量设置 ---
  // These commands are only processed if the source is 'ai'
  const globalAiOnlyMatches = Array.from(processedText.matchAll(setGlobalVarAiOnlyRegex));
  for (const match of globalAiOnlyMatches) {
    const fullMatchText = match[0];
    if (source === 'ai') {
      const varName = match[1];
      const varValue = match[2];

      if (varName && varValue !== undefined) {
        try {
          const updatedVar = await updateGlobalVariable(varName, varValue);
          if (updatedVar) {
            // console.log(`AI-Only: Successfully updated global variable '${varName}'`);
            // logger?.debug(`AI-Only: Successfully updated global variable '${varName}'`);
          } else {
            console.warn(`AI-Only: Global variable '${varName}' not found or not updated for [[setglobalvar]] command. Command: ${fullMatchText}`);
            // logger?.warn(`AI-Only: Global variable '${varName}' not found or not updated for [[setglobalvar]] command. Command: ${fullMatchText}`);
          }
        } catch (error) {
          console.error(`AI-Only: Error processing [[setglobalvar]] command '${fullMatchText}':`, error);
          // logger?.error(`AI-Only: Error processing [[setglobalvar]] command '${fullMatchText}':`, { error });
        }
      } else {
        console.warn(`AI-Only: Invalid [[setglobalvar]] command: ${fullMatchText}`);
        // logger?.warn(`AI-Only: Invalid [[setglobalvar]] command: ${fullMatchText}`);
      }
      // 仅当 source 是 'ai' 时才移除指令
      processedText = processedText.replace(fullMatchText, '');
    } else {
      // 如果 source 是 'user', 则不处理也不移除，指令保留在文本中
      console.log(`Skipping AI-only [[setglobalvar]] command from user input: ${fullMatchText}`);
    }
  }

  return processedText.trim();
}