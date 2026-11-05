import { Message } from '../types/Message';
import { MessageCode } from '../constants/messageCatalog';

const MESSAGE_TTL = 24 * 60 * 60 * 1000;

export function createMessage(
    code: MessageCode,
    deviceId: string
): Message {
    const now = Date.now();

    return {
        id: `M${now}${Math.floor(Math.random() * 1000000)}`,
        originDevice: deviceId,
        createdAt: now,
        expiresAt: now + MESSAGE_TTL,
        code,
        deliveredAt: null,
    };
}

export function removeExpiredMessages(
    messages: Message[]
): Message[] {
    const now = Date.now();

    return messages.filter(
        message => message.expiresAt > now
    );
}

export function mergeMessages(
    localMessages: Message[],
    receivedMessages: Message[]
): Message[] {
    const uniqueMessages = new Map<string, Message>();

    for (const message of localMessages) {
        uniqueMessages.set(message.id, message);
    }

    for (const message of receivedMessages) {
        const existing = uniqueMessages.get(message.id);

        uniqueMessages.set(message.id, {
            ...message,
            deliveredAt:
                existing?.deliveredAt ??
                message.deliveredAt ??
                null,
        });
    }

    return removeExpiredMessages(
        Array.from(uniqueMessages.values())
    ).sort((a, b) => a.createdAt - b.createdAt);
}