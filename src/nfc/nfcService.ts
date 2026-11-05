
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

import type { Message } from '../types/Message';

import {
    encodeEnvelope,
    decodeEnvelope,
} from './nfcProtocol';

import {
    mergeMessages,
    removeExpiredMessages,
} from '../utils/messageUtils';

import {
    synchronizeWithApi,
} from '../services/apiService';

import {
    getDeliveredIds,
} from '../database/messageStorage';

export interface SyncResult {
    pointId: string;
    messages: Message[];
    storedOnTag: Message[];
    omittedCount: number;
    deliveredCount: number;
    expiredCount: number;
    apiAvailable: boolean;
    apiError?: string;
    tagWriteError?: string;
}

function selectMessagesForTag(
    messages: Message[],
    pointId: string,
    capacity: number,
    localIds: Set<string>
): Message[] {
    const sortedMessages = [...messages].sort((a, b) => {
        const aIsLocal = localIds.has(a.id);
        const bIsLocal = localIds.has(b.id);

        if (aIsLocal !== bIsLocal) {
            return aIsLocal ? -1 : 1;
        }

        return a.createdAt - b.createdAt;
    });

    const selected: Message[] = [];

    for (const message of sortedMessages) {
        const candidate = [...selected, message];
        const encoded = encodeEnvelope(pointId, candidate);

        if (encoded.length <= capacity) {
            selected.push(message);
        }
    }

    return selected.sort(
        (a, b) => a.createdAt - b.createdAt
    );
}

async function releaseNfc(): Promise<void> {
    try {
        await NfcManager.cancelTechnologyRequest();
    } catch (error) {
        console.warn('[NFC] Erro ao liberar conexão:', error);
    }
}

export async function synchronizeWithTag(
    localMessages: Message[],
    defaultPointId: string,
    deviceId: string
): Promise<SyncResult> {
    let pointId = defaultPointId;
    let merged: Message[] = [];
    let storedOnTag: Message[] = [];
    let omittedCount = 0;
    let expiredCount = 0;
    let tagWriteError: string | undefined;
    let apiError: string | undefined;
    let apiAvailable = false;
    let deliveredIds: string[] = [];

    const validLocalMessages = removeExpiredMessages(localMessages);

    let deliveredCache = await getDeliveredIds();

    const localPendingMessages = validLocalMessages.filter(
        message => !deliveredCache.has(message.id)
    );

    if (localPendingMessages.length > 0) {
        try {
            console.log(
                '[API] Enviando mensagens locais antes da leitura NFC:',
                localPendingMessages.length
            );

            const apiResult = await synchronizeWithApi(
                deviceId,
                localPendingMessages
            );

            deliveredIds = apiResult.delivered_ids;
            apiAvailable = true;

        } catch (error: any) {
            apiError =
                error?.message || 'API indisponível.';

            console.warn(
                '[API] Não foi possível enviar mensagens locais:',
                apiError
            );
        }
    }

    deliveredCache = await getDeliveredIds();

    let requestAttempted = false;

    try {
        await NfcManager.start();

        await NfcManager.requestTechnology(NfcTech.Ndef);
        requestAttempted = true;

        const tag = await NfcManager.getTag();

        if (!tag) {
            throw new Error('Nenhuma TAG NFC encontrada.');
        }

        const originalTagId = tag.id;
        const records = tag.ndefMessage ?? [];
        const envelope = decodeEnvelope(records);

        if (records.length > 0 && !envelope) {
            throw new Error(
                'A TAG contém dados de outro formato.'
            );
        }

        pointId = envelope?.pointId || defaultPointId.trim();

        if (!pointId) {
            throw new Error('Identificação do ponto inválida.');
        }

        const originalTagMessages = envelope?.messages ?? [];

        const validTagMessages = removeExpiredMessages(
            originalTagMessages
        );

        expiredCount =
            originalTagMessages.length - validTagMessages.length;

        merged = mergeMessages(
            validLocalMessages,
            validTagMessages
        );

        const messagesToKeep = merged.filter(
            message => !deliveredCache.has(message.id)
        );

        const localIds = new Set(
            validLocalMessages
                .filter(message => !deliveredCache.has(message.id))
                .map(message => message.id)
        );

        const status =
            await NfcManager.ndefHandler.getNdefStatus();

        const selected = selectMessagesForTag(
            messagesToKeep,
            pointId,
            status.capacity,
            localIds
        );

        const selectedIds = new Set(
            selected.map(message => message.id)
        );

        const omittedTagMessages = validTagMessages.filter(
            message =>
                !deliveredCache.has(message.id) &&
                !selectedIds.has(message.id)
        );

        if (omittedTagMessages.length > 0) {
            throw new Error(
                'A TAG não tem espaço para preservar todas as mensagens pendentes. Os dados existentes foram preservados.'
            );
        }

        const encoded = encodeEnvelope(
            pointId,
            selected
        );

        if (encoded.length > status.capacity) {
            throw new Error(
                `Dados excedem a capacidade: ${encoded.length}/${status.capacity} bytes.`
            );
        }

        const currentTag = await NfcManager.getTag();

        if (
            originalTagId &&
            currentTag?.id &&
            originalTagId !== currentTag.id
        ) {
            throw new Error(
                'A TAG foi trocada durante a sincronização. Gravação cancelada.'
            );
        }

        await NfcManager.ndefHandler.writeNdefMessage(encoded);

        storedOnTag = selected;
        omittedCount = messagesToKeep.length - selected.length;

        console.log('[NFC] Gravação concluída.');
        console.log('[NFC] Mensagens na TAG:', storedOnTag.length);
        console.log('[NFC] Mensagens removidas por entrega:',
            merged.length - messagesToKeep.length
        );

    } catch (error: any) {
        if (merged.length === 0 && !requestAttempted) {
            throw error;
        }

        tagWriteError =
            error?.message || 'Falha ao atualizar a TAG NFC.';

        omittedCount = Math.max(
            0,
            merged.filter(message => !deliveredCache.has(message.id)).length
        );

        console.error('[NFC] Erro ao atualizar TAG:', error);

    } finally {
        if (requestAttempted) {
            await releaseNfc();
        }
    }

    const messagesNotDelivered = merged.filter(
        message => !deliveredCache.has(message.id)
    );

    if (messagesNotDelivered.length > 0) {
        try {
            console.log(
                '[API] Enviando mensagens recebidas da TAG:',
                messagesNotDelivered.length
            );

            const apiResult = await synchronizeWithApi(
                deviceId,
                messagesNotDelivered
            );

            deliveredIds = Array.from(
                new Set([
                    ...deliveredIds,
                    ...apiResult.delivered_ids,
                ])
            );

            apiAvailable = true;

        } catch (error: any) {
            apiError =
                error?.message || 'API indisponível.';

            console.warn(
                '[API] Não foi possível enviar mensagens da TAG:',
                apiError
            );
        }
    }

    deliveredCache = await getDeliveredIds();

    const updatedMessages = merged.map(message => ({
        ...message,
        deliveredAt: deliveredCache.has(message.id)
            ? message.deliveredAt ?? Date.now()
            : null,
    }));

    return {
        pointId,
        messages: updatedMessages,
        storedOnTag,
        omittedCount,
        deliveredCount: deliveredIds.length,
        expiredCount,
        apiAvailable,
        apiError,
        tagWriteError,
    };
}
