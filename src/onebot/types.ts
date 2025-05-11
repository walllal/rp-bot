/**
 * OneBot v11 事件基础结构
 */
export interface OneBotBaseEvent {
  time: number;
  self_id: number; // 机器人 QQ 号
  post_type: 'message' | 'notice' | 'request' | 'meta_event';
}

/**
 * OneBot v11 元事件基础结构
 */
export interface OneBotMetaEvent extends OneBotBaseEvent {
    post_type: 'meta_event';
    meta_event_type: 'lifecycle' | 'heartbeat';
}

/**
 * OneBot v11 心跳事件
 */
export interface OneBotHeartbeatEvent extends OneBotMetaEvent {
    meta_event_type: 'heartbeat';
    status: { // 根据 OneBot v11 文档定义 status 结构
        online: boolean;
        good: boolean;
    };
    interval: number; // 心跳间隔，单位毫秒
}

/**
 * OneBot v11 生命周期事件
 */
export interface OneBotLifecycleEvent extends OneBotMetaEvent {
    meta_event_type: 'lifecycle';
    sub_type: 'enable' | 'disable' | 'connect'; // 可能的子类型
}


/**
 * OneBot v11 消息事件基础结构
 */
export interface OneBotMessageEvent extends OneBotBaseEvent {
  post_type: 'message';
  message_type: 'private' | 'group';
  sub_type: string; // 例如 'friend', 'normal', 'anonymous' 等
  message_id: number;
  user_id: number; // 发送者 QQ 号
  message: string | OneBotMessageSegment[]; // 消息内容，可以是纯文本或消息段数组
  raw_message: string; // CQ 码格式的消息
  font: number;
  sender: OneBotSenderInfo;
}

/**
 * OneBot v11 私聊消息事件
 */
export interface OneBotPrivateMessageEvent extends OneBotMessageEvent {
  message_type: 'private';
  sender: OneBotPrivateSenderInfo;
}

/**
 * OneBot v11 群聊消息事件
 */
export interface OneBotGroupMessageEvent extends OneBotMessageEvent {
  message_type: 'group';
  group_id: number; // 群号
  sender: OneBotGroupSenderInfo;
  anonymous?: OneBotAnonymousInfo; // 匿名信息
}

/**
 * OneBot v11 消息段 (简化定义，只包含 text 类型)
 */
export interface OneBotMessageSegment {
  type: string; // 例如 'text', 'image', 'at' 等
  data: Record<string, any>;
}

/**
 * 发送者信息基础结构
 */
export interface OneBotSenderInfo {
  user_id: number;
  nickname: string;
  sex: 'male' | 'female' | 'unknown';
  age: number;
}

/**
 * 私聊发送者信息
 */
export interface OneBotPrivateSenderInfo extends OneBotSenderInfo {}

/**
 * 群聊发送者信息
 */
export interface OneBotGroupSenderInfo extends OneBotSenderInfo {
  card: string; // 群名片/备注
  area?: string; // 地区
  level?: string; // 等级
  role: 'owner' | 'admin' | 'member'; // 角色
  title?: string; // 专属头衔
}

/**
 * 匿名信息
 */
export interface OneBotAnonymousInfo {
  id: number;
  name: string;
  flag: string; // 匿名用户 flag
}

/**
 * OneBot v11 Action 基础请求结构
 */
export interface OneBotActionRequest {
  action: string; // 例如 'send_private_msg', 'send_group_msg'
  params: Record<string, any>;
  echo?: string; // 可选，用于匹配响应
}

/**
 * OneBot v11 Action 响应基础结构
 */
export interface OneBotActionResponse {
  status: 'ok' | 'failed';
  retcode: number; // 返回码
  data: any; // 响应数据
  message?: string; // 错误信息 (v12)
  echo?: string; // 对应请求的 echo
}
