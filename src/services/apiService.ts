
import type { Message } from '../types/Message';

import {
    addDeliveredIds,
    getDeliveredCursor,
    saveDeliveredCursor,
} from '../database/messageStorage';

const API_BASE_URL = 'http://192.168.1.2:8000/api';

interface ApiSyncResponse {
    success: boolean;
    delivered_ids: string[];
    server_time: number;
}

interface DeliveredIdsResponse {
    success: boolean;
    delivered_ids: string[];
    next_cursor: number;
    has_more: boolean;
}

function getMessagePayload(message: Message) {
    return {
        id: message.id,
        originDevice: message.originDevice,
        code: message.code,
        createdAt: message.createdAt,
        expiresAt: message.expiresAt,
    };
}

export async function synchronizeWithApi(
    deviceId: string,
    messages: Message[]
): Promise<ApiSyncResponse> {
    console.log('[API] Iniciando sincronização');
    console.log('[API] Device:', deviceId);
    console.log('[API] Mensagens para enviar:', messages.length);
    console.log('[API] URL:', `${API_BASE_URL}/dtn/sync`);

    const response = await fetch(`${API_BASE_URL}/dtn/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            device_id: deviceId,
            messages: messages.map(getMessagePayload),
            known_ids: messages.map(message => message.id),
        }),
    });

    console.log('[API] Status HTTP:', response.status);

    const data = await response.json();

    console.log('[API] Resposta:', data);

    if (!response.ok) {
        throw new Error(
            data.message || 'Falha ao sincronizar com a API.'
        );
    }

    await addDeliveredIds(data.delivered_ids ?? []);

    return data as ApiSyncResponse;
}

export async function refreshDeliveredCacheFromApi(): Promise<number> {
    let cursor = await getDeliveredCursor();
    let totalReceived = 0;
    let hasMore = true;

    while (hasMore) {
        const url =
            `${API_BASE_URL}/dtn/delivered-ids?after_id=${cursor}`;

        console.log('[CACHE] Atualizando cache:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(
                'Não foi possível atualizar o cache de mensagens.'
            );
        }

        const data =
            await response.json() as DeliveredIdsResponse;

        await addDeliveredIds(data.delivered_ids ?? []);

        cursor = data.next_cursor;
        await saveDeliveredCursor(cursor);

        totalReceived += data.delivered_ids?.length ?? 0;
        hasMore = data.has_more;
    }

    console.log('[CACHE] Atualização concluída:', totalReceived);

    return totalReceived;
}
