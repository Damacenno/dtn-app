
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Message } from '../types/Message';

const MESSAGES_KEY = '@dtn:messages';
const DEVICE_ID_KEY = '@dtn:device_id';
const DELIVERED_IDS_KEY = '@dtn:delivered_ids';
const DELIVERED_CURSOR_KEY = '@dtn:delivered_cursor';

export async function getMessages(): Promise<Message[]> {
    try {
        const stored = await AsyncStorage.getItem(MESSAGES_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('[STORAGE] Erro ao carregar mensagens:', error);
        return [];
    }
}

export async function saveMessages(
    messages: Message[]
): Promise<void> {
    await AsyncStorage.setItem(
        MESSAGES_KEY,
        JSON.stringify(messages)
    );
}

export async function getDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

    if (!deviceId) {
        deviceId = `D${Date.now()}${Math.floor(
            Math.random() * 1000000
        )}`;

        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    return deviceId;
}

export async function getDeliveredIds(): Promise<Set<string>> {
    try {
        const stored = await AsyncStorage.getItem(DELIVERED_IDS_KEY);

        if (!stored) {
            return new Set<string>();
        }

        const ids: string[] = JSON.parse(stored);

        return new Set(ids);
    } catch (error) {
        console.error('[STORAGE] Erro ao carregar cache:', error);
        return new Set<string>();
    }
}

export async function addDeliveredIds(
    newIds: string[]
): Promise<void> {
    if (newIds.length === 0) {
        return;
    }

    const currentIds = await getDeliveredIds();

    newIds.forEach(id => currentIds.add(id));

    await AsyncStorage.setItem(
        DELIVERED_IDS_KEY,
        JSON.stringify(Array.from(currentIds))
    );

    console.log(
        '[CACHE] IDs entregues armazenados:',
        newIds.length
    );
}

export async function getDeliveredCursor(): Promise<number> {
    const stored = await AsyncStorage.getItem(
        DELIVERED_CURSOR_KEY
    );

    return stored ? Number(stored) : 0;
}

export async function saveDeliveredCursor(
    cursor: number
): Promise<void> {
    await AsyncStorage.setItem(
        DELIVERED_CURSOR_KEY,
        String(cursor)
    );
}
