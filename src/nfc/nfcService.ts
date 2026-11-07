
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

    const localIds = new Set(
        validLocalMessages.map(message => message.id)
    );

    let requestAttempted = false;

    try {
        console.log('[NFC] Iniciando leitura da TAG.');

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

        const tagIds = new Set(
            validTagMessages.map(message => message.id)
        );

        merged = mergeMessages(
            validLocalMessages,
            validTagMessages
        );

        const messagesToKeep = merged.filter(message => {
            const isLocal = localIds.has(message.id);
            const cameFromTag = tagIds.has(message.id);
            const wasDelivered = deliveredCache.has(message.id);

            if (isLocal) {
                return true;
            }

            if (cameFromTag && wasDelivered) {
                return false;
            }

            return true;
        });

        const selected = selectMessagesForTag(
            messagesToKeep,
            pointId,
            (await NfcManager.ndefHandler.getNdefStatus()).capacity,
            localIds
        );

        const selectedIds = new Set(
            selected.map(message => message.id)
        );

        const omittedLocalMessages = validLocalMessages.filter(
            message => !selectedIds.has(message.id)
        );

        if (omittedLocalMessages.length > 0) {
            throw new Error(
                'A TAG não tem espaço para armazenar todas as mensagens locais. Os dados existentes foram preservados.'
            );
        }

        const omittedTagMessages = validTagMessages.filter(
            message =>
                !localIds.has(message.id) &&
                !deliveredCache.has(message.id) &&
                !selectedIds.has(message.id)
        );

        if (omittedTagMessages.length > 0) {
            throw new Error(
                'A TAG não tem espaço para preservar todas as mensagens pendentes. Os dados existentes foram preservados.'
            );
        }

        const status =
            await NfcManager.ndefHandler.getNdefStatus();

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
        console.log(
            '[NFC] Mensagens removidas por entrega:',
            merged.length - messagesToKeep.length
        );

    } catch (error: any) {
        if (!requestAttempted) {
            throw error;
        }

        tagWriteError =
            error?.message || 'Falha ao atualizar a TAG NFC.';

        omittedCount = Math.max(
            0,
            merged.filter(message => {
                return (
                    localIds.has(message.id) ||
                    !deliveredCache.has(message.id)
                );
            }).length
        );

        console.error('[NFC] Erro ao atualizar TAG:', error);

    } finally {
        if (requestAttempted) {
            await releaseNfc();
        }
    }

    const messagesToSync = merged.filter(
        message => !deliveredCache.has(message.id)
    );

    console.log('[API] Mensagens disponíveis para envio:', merged.length);
    console.log('[API] Mensagens pendentes:', messagesToSync.length);
    console.log('[API] IDs pendentes:', messagesToSync.map(message => message.id));

    if (messagesToSync.length > 0) {
        try {
            console.log(
                '[API] Enviando mensagens após sincronização NFC:',
                messagesToSync.length
            );
            console.log('[API] Iniciando POST /dtn/sync');
            const apiResult = await synchronizeWithApi(
                deviceId,
                messagesToSync
            );

            deliveredIds = apiResult.delivered_ids;
            apiAvailable = true;

        } catch (error: any) {
            apiError =
                error?.message || 'API indisponível.';

            console.warn(
                '[API] Não foi possível sincronizar:',
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
